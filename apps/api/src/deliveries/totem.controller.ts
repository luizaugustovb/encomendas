import {
  Controller, Get, Post, Body, Param, Res, Query,
  UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DeliveriesService } from './deliveries.service';
import { TenantConfigService } from '../tenant-config/tenant-config.service';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { Response } from 'express';
import axios from 'axios';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile as fsReadFile, unlink } from 'fs';

export class TotemWithdrawDto {
  @IsString() @IsNotEmpty() code: string;
  @IsOptional() @IsString() withdrawnById?: string;
}

/**
 * Controller público para o totem de retirada de encomendas.
 * Não requer autenticação JWT.
 */
@Controller('totem')
export class TotemController {
  constructor(
    private deliveriesService: DeliveriesService,
    private tenantConfigService: TenantConfigService,
  ) {}

  /**
   * Retorna a URL da câmera RTSP configurada para o condomínio (público)
   */
  @Get('config/:tenantId/rtsp')
  async getRtspConfig(@Param('tenantId') tenantId: string) {
    const rtspCameraUrl = await this.tenantConfigService.getRtspCameraUrl(tenantId);
    return { rtspCameraUrl };
  }

  /**
   * Proxy da câmera RTSP - evita problemas de CORS e mixed content (HTTP/HTTPS)
   * Retorna a imagem/stream da câmera diretamente
   */
  @Get('config/:tenantId/rtsp-proxy')
  async rtspProxy(
    @Param('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const rtspCameraUrl = await this.tenantConfigService.getRtspCameraUrl(tenantId);
    if (!rtspCameraUrl) {
      res.status(404).json({ message: 'Câmera não configurada' });
      return;
    }

    try {
      // Se for URL RTSP, capturar frame com ffmpeg
      if (rtspCameraUrl.startsWith('rtsp://')) {
        const tmpFile = join(tmpdir(), `rtsp-snap-${Date.now()}.jpg`);
        await new Promise<void>((resolve, reject) => {
          const proc = execFile('ffmpeg', [
            '-rtsp_transport', 'tcp',
            '-i', rtspCameraUrl,
            '-frames:v', '1',
            '-q:v', '5',
            '-y', tmpFile,
          ], { timeout: 10000 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        fsReadFile(tmpFile, (err, data) => {
          unlink(tmpFile, () => {});
          if (err) { res.status(502).json({ message: 'Falha ao ler snapshot' }); return; }
          res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
          res.send(data);
        });
        return;
      }

      // Se for HTTP, fazer proxy direto
      const response = await axios.get(rtspCameraUrl, {
        responseType: 'stream',
        timeout: 10000,
        headers: { 'Accept': 'image/jpeg, multipart/x-mixed-replace, */*' },
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });

      response.data.pipe(res);
    } catch (err: any) {
      res.status(502).json({ message: `Falha ao conectar na câmera: ${err.message}` });
    }
  }

  /**
   * Busca encomenda por código (QR ou manual)
   */
  @Get('delivery/:code')
  async findByCode(@Param('code') code: string) {
    return this.deliveriesService.findByCode(code);
  }

  /**
   * Lista moradores da mesma unidade da encomenda (para seleção "não sou eu")
   */
  @Get('delivery/:code/residents')
  async getUnitResidents(@Param('code') code: string) {
    return this.deliveriesService.getUnitResidentsByCode(code);
  }

  /**
   * Confirma retirada via totem com fotos (rosto + encomenda)
   * Aceita até 3 fotos: photo_face, photo_package, photo_full
   */
  @Post('withdraw')
  @UseInterceptors(
    FilesInterceptor('photos', 3, {
      storage: diskStorage({
        destination: './uploads/withdrawals',
        filename: (req, file, cb) => {
          const uniqueName = `totem-${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new Error('Apenas imagens são permitidas'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async withdraw(
    @Body() dto: TotemWithdrawDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    const photoUrls: string[] = (files || []).map(f => `/uploads/withdrawals/${f.filename}`);
    return this.deliveriesService.withdrawFromTotem(
      dto.code,
      photoUrls,
      dto.withdrawnById,
    );
  }
}
