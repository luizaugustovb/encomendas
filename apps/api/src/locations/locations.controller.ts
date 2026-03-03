import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLocationDto {
  @IsString() @IsNotEmpty() code: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() tenantId?: string;
}

export class UpdateLocationDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
}

@Controller('locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findAll(@TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.locationsService.findAll(tenantId, user.role);
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findOne(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.locationsService.findOne(id, tenantId, user.role);
  }

  @Post()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  create(@Body() dto: CreateLocationDto, @TenantId() tenantId: string, @CurrentUser() user: any) {
    const finalTenantId = user.role === 'ADMIN' && dto.tenantId ? dto.tenantId : tenantId;
    return this.locationsService.create({ ...dto, tenantId: finalTenantId });
  }

  @Put(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  update(@Param('id') id: string, @Body() dto: UpdateLocationDto, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.locationsService.update(id, tenantId, dto, user.role);
  }

  @Delete(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  remove(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.locationsService.remove(id, tenantId, user.role);
  }
}
