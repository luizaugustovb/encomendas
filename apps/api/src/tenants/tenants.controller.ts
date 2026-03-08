import { Controller, Get, Post, Put, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTenantDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() sindico?: string;
  @IsOptional() @IsString() sindicoPhone?: string;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() document?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() sindico?: string;
  @IsOptional() @IsString() sindicoPhone?: string;
}

@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.tenantsService.reactivate(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }

  @Delete(':id/permanent')
  permanentRemove(@Param('id') id: string) {
    return this.tenantsService.permanentRemove(id);
  }
}
