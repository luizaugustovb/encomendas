import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Query, Request } from '@nestjs/common';
import { UnitsService } from './units.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateUnitDto {
  @IsString() @IsNotEmpty() number: string;
  @IsOptional() @IsString() block?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() tenantId?: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() number?: string;
  @IsOptional() @IsString() block?: string;
  @IsOptional() @IsString() type?: string;
}

@Controller('units')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UnitsController {
  constructor(private unitsService: UnitsService) {}

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findAll(@TenantId() tenantId: string, @CurrentUser() user: any, @Request() req: any) {
    const filterTenantId = user.role === 'ADMIN' && req.query.tenantId ? req.query.tenantId : tenantId;
    return this.unitsService.findAll(filterTenantId, user.role);
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findOne(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.unitsService.findOne(id, tenantId, user.role);
  }

  @Post()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  create(@Body() dto: CreateUnitDto, @TenantId() tenantId: string, @CurrentUser() user: any) {
    const finalTenantId = user.role === 'ADMIN' && dto.tenantId ? dto.tenantId : tenantId;
    return this.unitsService.create({ ...dto, tenantId: finalTenantId });
  }

  @Put(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  update(@Param('id') id: string, @Body() dto: UpdateUnitDto, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.unitsService.update(id, tenantId, dto, user.role);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.unitsService.remove(id, tenantId, user.role);
  }
}
