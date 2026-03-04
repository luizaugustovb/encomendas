import {
  Controller, Get, Post, Body, Param,
  UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DeliveriesService } from './deliveries.service';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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
  constructor(private deliveriesService: DeliveriesService) {}

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
