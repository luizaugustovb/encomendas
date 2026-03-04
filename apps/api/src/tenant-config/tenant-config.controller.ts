import {
  Controller, Get, Put, Body, Param, Post,
  UseGuards,
} from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsOptional, IsString, IsNumber, IsBoolean } from 'class-validator';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { HikvisionService } from '../hikvision/hikvision.service';

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
}
