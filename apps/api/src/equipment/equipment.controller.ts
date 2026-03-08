import {
  Controller, Get, Post, Put, Delete,
  Body, Param, UseGuards,
} from '@nestjs/common';
import { EquipmentService } from './equipment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';

@Controller('equipment')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EquipmentController {
  constructor(private equipmentService: EquipmentService) {}

  // ─── Listagem ──────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findAll(@TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.equipmentService.findAll(tenantId, user.role);
  }

  @Get('status')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  checkAllStatus(@TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.equipmentService.checkAllStatus(tenantId, user.role);
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  findOne(@Param('id') id: string) {
    return this.equipmentService.findOne(id);
  }

  // ─── CRUD ──────────────────────────────────────────────────────────

  @Post()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: {
      tenantId?: string;
      name: string;
      type?: string;
      hikvisionIp?: string;
      hikvisionPort?: number;
      hikvisionUser?: string;
      hikvisionPassword?: string;
      doorCount?: number;
      wireguardIp?: string;
      enabled?: boolean;
    },
  ) {
    // Admin master pode especificar tenantId, outros usam o próprio
    const finalTenantId = user.role === 'ADMIN' && body.tenantId ? body.tenantId : tenantId;
    return this.equipmentService.create({ ...body, tenantId: finalTenantId });
  }

  @Put(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  update(@Param('id') id: string, @Body() body: any) {
    return this.equipmentService.update(id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  remove(@Param('id') id: string) {
    return this.equipmentService.remove(id);
  }

  // ─── Ações ─────────────────────────────────────────────────────────

  @Get(':id/status')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  checkStatus(@Param('id') id: string) {
    return this.equipmentService.checkOnline(id);
  }

  @Post(':id/door/open')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  openDoor(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @Body() body: { doorNo?: number },
  ) {
    return this.equipmentService.openDoor(id, body.doorNo || 1, tenantId, user.role);
  }

  @Post(':id/test')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  testConnection(@Param('id') id: string) {
    return this.equipmentService.testConnection(id);
  }
}
