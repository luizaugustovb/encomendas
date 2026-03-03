import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { HikvisionService } from './hikvision.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';

// ── Controller público para receber callbacks do equipamento ─────────────

@Controller('hikvision')
export class HikvisionCallbackController {
  constructor(private hikvisionService: HikvisionService) { }

  /**
   * Endpoint público para receber eventos do equipamento Hikvision.
   * Configurar no equipamento:
   *   URL: http://SERVIDOR:3001/api/hikvision/event/{tenantId}
   *   Método: POST
   *
   * NÃO requer autenticação JWT (é chamado pelo equipamento).
   */
  @Post('event/:tenantId')
  async receiveEvent(
    @Param('tenantId') tenantId: string,
    @Body() eventData: any,
  ) {
    return this.hikvisionService.processEvent(tenantId, eventData);
  }
}

// ── Controller autenticado para gerenciamento ────────────────────────────

@Controller('hikvision/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HikvisionAdminController {
  constructor(private hikvisionService: HikvisionService) { }

  // ─── Conexão / Device Info ─────────────────────────────────────────

  /** Testa conexão com o equipamento Hikvision do tenant */
  @Post('test-connection')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async testConnection(@TenantId() tenantId: string) {
    try {
      const config = await (this.hikvisionService as any).getConfigOrFail(tenantId);
      return this.hikvisionService.testConnection(config);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** Retorna capacidades do equipamento */
  @Get('capabilities')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async getCapabilities(@TenantId() tenantId: string) {
    try {
      return await this.hikvisionService.getDeviceCapabilities(tenantId);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ─── Controle de Porta ─────────────────────────────────────────────

  /** Abre uma porta remotamente */
  @Post('door/open')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async openDoor(
    @TenantId() tenantId: string,
    @Body() body: { doorNo?: number },
  ) {
    return this.hikvisionService.openDoor(tenantId, body.doorNo || 1);
  }

  /** Fecha uma porta remotamente */
  @Post('door/close')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async closeDoor(
    @TenantId() tenantId: string,
    @Body() body: { doorNo?: number },
  ) {
    return this.hikvisionService.closeDoor(tenantId, body.doorNo || 1);
  }

  /** Mantém porta permanentemente aberta */
  @Post('door/keep-open')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async keepDoorOpen(
    @TenantId() tenantId: string,
    @Body() body: { doorNo?: number },
  ) {
    return this.hikvisionService.keepDoorOpen(tenantId, body.doorNo || 1);
  }

  // ─── Sincronização de Usuários ─────────────────────────────────────

  /** Sincroniza todos os moradores com o equipamento */
  @Post('sync/all')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async syncAllUsers(@TenantId() tenantId: string) {
    return this.hikvisionService.syncAllUsers(tenantId);
  }

  /** Sincroniza um único morador com o equipamento */
  @Post('sync/user/:userId')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async syncUser(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @Query('tenantId') queryTenantId?: string,
    @CurrentUser() user?: any,
  ) {
    const finalTenantId = user?.role === 'ADMIN' && queryTenantId ? queryTenantId : tenantId;
    return this.hikvisionService.syncSingleUser(finalTenantId, userId);
  }

  /** Remove um morador do equipamento */
  @Delete('sync/user/:userId')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async unsyncUser(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
  ) {
    return this.hikvisionService.unsyncUser(tenantId, userId);
  }

  /** Upload de face para um morador específico */
  @Post('sync/user/:userId/face')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/photos',
        filename: (req, file, cb) => {
          const uniqueName = `face-${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/\/(jpg|jpeg|png|webp)$/)) {
          return cb(new Error('Apenas imagens JPG/PNG são permitidas'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async uploadFace(
    @TenantId() tenantId: string,
    @Param('userId') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      return { success: false, message: 'Foto não enviada' };
    }

    // Salva a foto no perfil do usuário
    const photoUrl = `/uploads/photos/${file.filename}`;
    await (this.hikvisionService as any).prisma.user.update({
      where: { id: userId },
      data: { photoUrl },
    });

    // Sincroniza com o equipamento
    return this.hikvisionService.syncSingleUser(tenantId, userId);
  }

  // ─── Usuários no Equipamento ───────────────────────────────────────

  /** Lista usuários cadastrados no equipamento Hikvision */
  @Get('device/users')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async getDeviceUsers(
    @TenantId() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      const config = await (this.hikvisionService as any).getConfigOrFail(tenantId);
      const position = ((parseInt(page || '1', 10) - 1) * parseInt(limit || '30', 10));
      return this.hikvisionService.searchDeviceUsers(config, {
        searchPosition: position,
        maxResults: parseInt(limit || '30', 10),
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ─── Eventos de Acesso ─────────────────────────────────────────────

  /** Busca logs de acesso do equipamento */
  @Get('events')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async getAccessEvents(
    @TenantId() tenantId: string,
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
    @Query('employeeNo') employeeNo?: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.hikvisionService.getAccessEvents(tenantId, {
        startTime,
        endTime,
        employeeNo,
        maxResults: parseInt(limit || '50', 10),
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ─── AlertStream (Tempo Real) ──────────────────────────────────────

  /** Inicia escuta de eventos em tempo real */
  @Post('stream/start')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async startStream(@TenantId() tenantId: string) {
    return this.hikvisionService.startEventStream(tenantId);
  }

  /** Para escuta de eventos em tempo real */
  @Post('stream/stop')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async stopStream(@TenantId() tenantId: string) {
    return this.hikvisionService.stopEventStream(tenantId);
  }

  /** Lista streams ativos */
  @Get('stream/status')
  @Roles('ADMIN')
  getStreamStatus() {
    return this.hikvisionService.getActiveStreams();
  }

  // ─── Biblioteca Facial ─────────────────────────────────────────────

  /** Lista bibliotecas faciais do equipamento */
  @Get('face-libraries')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async listFaceLibraries(@TenantId() tenantId: string) {
    try {
      return await this.hikvisionService.listFaceLibraries(tenantId);
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /** Busca faces em uma biblioteca */
  @Get('face-libraries/:fdid/faces')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async searchFaces(
    @TenantId() tenantId: string,
    @Param('fdid') fdid: string,
    @Query('limit') limit?: string,
  ) {
    try {
      return await this.hikvisionService.searchFaces(tenantId, fdid, {
        maxResults: parseInt(limit || '30', 10),
      });
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  // ─── Autorização ───────────────────────────────────────────────────

  /** Verifica se um morador tem encomendas pendentes */
  @Post('authorize')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async authorize(@Body() body: { userId: string }) {
    return this.hikvisionService.authorizeAccess(body.userId);
  }

  /** Verifica por employeeNo (uso do equipamento) */
  @Post('authorize/employee')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async authorizeByEmployee(
    @TenantId() tenantId: string,
    @Body() body: { employeeNo: string },
  ) {
    return this.hikvisionService.authorizeByEmployeeNo(tenantId, body.employeeNo);
  }
}
