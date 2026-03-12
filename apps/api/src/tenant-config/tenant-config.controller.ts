import {
  Controller, Get, Put, Body, Param, Post, Res, Query,
  UseGuards,
} from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { HikvisionService } from '../hikvision/hikvision.service';
import axios from 'axios';
import { Response } from 'express';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlink } from 'fs';
import { readFile as fsReadFile } from 'fs/promises';

export class UpdateTenantConfigDto {
  @IsOptional() @IsString() whatsappToken?: string;
  @IsOptional() @IsString() hikvisionIp?: string;
  @IsOptional() @IsNumber() hikvisionPort?: number;
  @IsOptional() @IsString() hikvisionUser?: string;
  @IsOptional() @IsString() hikvisionPassword?: string;
  @IsOptional() @IsBoolean() hikvisionEnabled?: boolean;
  @IsOptional() @IsString() rtspCameraUrl?: string;
}

@Controller('tenant-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TenantConfigController {
  constructor(
    private configService: TenantConfigService,
    private whatsappService: WhatsappService,
    private hikvisionService: HikvisionService,
  ) {}

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  getConfig(@TenantId() tenantId: string, @CurrentUser() user: any) {
    const effectiveTenantId = user.role === 'ADMIN' ? tenantId : tenantId;
    return this.configService.findByTenantId(effectiveTenantId);
  }

  @Get(':tenantId')
  @Roles('ADMIN')
  getConfigByTenant(@Param('tenantId') tenantId: string) {
    return this.configService.findByTenantId(tenantId);
  }

  @Put()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  updateConfig(
    @Body() dto: UpdateTenantConfigDto,
    @TenantId() tenantId: string,
  ) {
    return this.configService.upsert(tenantId, dto);
  }

  @Put(':tenantId')
  @Roles('ADMIN')
  updateConfigByTenant(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdateTenantConfigDto,
  ) {
    return this.configService.upsert(tenantId, dto);
  }

  // Test WhatsApp
  @Post('test/whatsapp')
  @Roles('ADMIN')
  async testWhatsapp(@Body() body: { phone: string; tenantId?: string }) {
    const token = body.tenantId
      ? await this.configService.getWhatsappToken(body.tenantId)
      : process.env.WHATSAPP_API_TOKEN || '';

    const result = await this.whatsappService.sendMessageWithToken(
      body.phone,
      '🔔 *Teste de WhatsApp*\n\nEsta é uma mensagem de teste do sistema de encomendas.\n\nSe você recebeu esta mensagem, a integração está funcionando corretamente! ✅',
      token,
    );

    return { success: result, message: result ? 'WhatsApp enviado com sucesso!' : 'Falha ao enviar WhatsApp' };
  }

  // Test Hikvision
  @Post('test/hikvision')
  @Roles('ADMIN')
  async testHikvision(@Body() body: { tenantId: string }) {
    const config = await this.configService.getHikvisionConfig(body.tenantId);
    if (!config || !config.ip) {
      return { success: false, message: 'Hikvision não configurado para este condomínio' };
    }

    const result = await this.hikvisionService.testConnection({
      ip: config.ip,
      port: config.port,
      user: config.user || 'admin',
      password: config.password || '',
    });
    return result;
  }

  // Test RTSP Camera
  @Post('test/rtsp')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async testRtsp(@TenantId() jwtTenantId: string, @CurrentUser() user: any, @Body() body?: { tenantId?: string }) {
    const tenantId = (user.role === 'ADMIN' && body?.tenantId) ? body.tenantId : jwtTenantId;
    const config = await this.configService.findByTenantId(tenantId);
    if (!config?.rtspCameraUrl) {
      return { success: false, message: 'URL da câmera RTSP não configurada', ping: null, hasImage: false };
    }

    const url = this.configService.sanitizeRtspUrl(config.rtspCameraUrl);
    let ping: number | null = null;
    let hasImage = false;
    let contentType = '';
    let errorMsg = '';

    try {
      const start = Date.now();

      if (url.startsWith('rtsp://')) {
        // Para RTSP, testar capturando um frame com ffmpeg
        const tmpFile = join(tmpdir(), `rtsp-test-${Date.now()}.jpg`);
        await new Promise<void>((resolve, reject) => {
          execFile('ffmpeg', [
            '-rtsp_transport', 'tcp',
            '-i', url,
            '-frames:v', '1',
            '-q:v', '5',
            '-y', tmpFile,
          ], { timeout: 15000 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        ping = Date.now() - start;
        // Verificar se o arquivo foi criado
        const { statSync } = require('fs');
        try {
          const stat = statSync(tmpFile);
          hasImage = stat.size > 0;
          contentType = 'image/jpeg (via ffmpeg)';
        } catch { hasImage = false; }
        unlink(tmpFile, () => {});
      } else {
        // Para HTTP, testar com axios
        const response = await axios.get(url, {
          timeout: 10000,
          responseType: 'arraybuffer',
          maxContentLength: 5 * 1024 * 1024,
          headers: { 'Accept': 'image/jpeg, multipart/x-mixed-replace, */*' },
        });
        ping = Date.now() - start;
        contentType = response.headers['content-type'] || '';
        hasImage = response.status === 200 && response.data?.length > 0;
      }
    } catch (err: any) {
      const isLocalIp = /172\.16\.|192\.168\.|10\./.test(url);
      if (err.code === 'ECONNREFUSED') {
        errorMsg = 'Conexão recusada - verifique o IP e a porta';
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
        errorMsg = isLocalIp
          ? 'Timeout - câmera em IP local (192.168.x/10.x). O servidor na nuvem não consegue acessar IPs de rede local. Use um IP público ou DDNS.'
          : 'Timeout - câmera não respondeu em 10s';
      } else if (err.code === 'ENOTFOUND') {
        errorMsg = 'Host não encontrado - verifique a URL';
      } else if (err.message?.includes('Host is unreachable') || err.message?.includes('Network is unreachable')) {
        errorMsg = isLocalIp
          ? 'Host inacessível - câmera em IP local (192.168.x/10.x). O servidor na nuvem não consegue acessar IPs de rede local. Use um IP público, DDNS ou VPN.'
          : 'Host inacessível - verifique se a câmera está online';
      } else {
        errorMsg = err.message || 'Erro desconhecido';
      }
    }

    return {
      success: hasImage,
      message: hasImage ? `Câmera acessível (${ping}ms)` : (errorMsg || 'Câmera não retornou imagem'),
      ping,
      hasImage,
      contentType,
      url,
    };
  }

  // Proxy RTSP autenticado (para preview na tela de configurações)
  @Get('rtsp-proxy')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async rtspProxyAuth(
    @TenantId() jwtTenantId: string,
    @CurrentUser() user: any,
    @Res() res: Response,
    @Query('tenantId') queryTenantId?: string,
  ) {
    const tenantId = (user.role === 'ADMIN' && queryTenantId) ? queryTenantId : jwtTenantId;
    const config = await this.configService.findByTenantId(tenantId);
    if (!config?.rtspCameraUrl) {
      res.status(404).json({ message: 'Câmera não configurada' });
      return;
    }

    try {
      const cameraUrl = this.configService.sanitizeRtspUrl(config.rtspCameraUrl);

      // Se for URL RTSP, capturar frame com ffmpeg
      if (cameraUrl.startsWith('rtsp://')) {
        const tmpFile = join(tmpdir(), `rtsp-snap-proxy-${Date.now()}.jpg`);
        await new Promise<void>((resolve, reject) => {
          execFile('ffmpeg', [
            '-rtsp_transport', 'tcp',
            '-i', cameraUrl,
            '-frames:v', '1',
            '-q:v', '5',
            '-y', tmpFile,
          ], { timeout: 15000 }, (err) => {
            if (err) reject(err); else resolve();
          });
        });
        const data = await fsReadFile(tmpFile);
        unlink(tmpFile, () => {});
        res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache, no-store, must-revalidate' });
        res.send(data);
        return;
      }

      // Se for HTTP, fazer proxy direto
      const response = await axios.get(cameraUrl, {
        responseType: 'stream',
        timeout: 10000,
        headers: { 'Accept': 'image/jpeg, multipart/x-mixed-replace, */*' },
      });

      const contentType = response.headers['content-type'] || 'image/jpeg';
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      });

      response.data.pipe(res);
    } catch (err: any) {
      res.status(502).json({ message: `Falha ao conectar na câmera: ${err.message}` });
    }
  }
}
