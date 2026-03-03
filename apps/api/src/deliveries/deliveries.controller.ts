import {
  Controller, Get, Post, Body, Param, Res, Query,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Response } from 'express';
import { DeliveriesService } from './deliveries.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDeliveryDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsOptional() @IsString() unitId?: string;
  @IsString() @IsNotEmpty() locationId: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() tenantId?: string;
}

export class WithdrawDto {
  @IsString() @IsNotEmpty() userId: string;
  @IsString() @IsNotEmpty() qrcode: string;
}

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveriesController {
  constructor(private deliveriesService: DeliveriesService) {}

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  findAll(@TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.deliveriesService.findAll(tenantId, user.role);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR')
  getDashboardStats(@TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.deliveriesService.getDashboardStats(tenantId, user.role);
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'ZELADOR', 'MORADOR')
  findOne(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.deliveriesService.findOne(id, tenantId, user.role);
  }

  @Post()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/deliveries',
        filename: (req, file, cb) => {
          const uniqueName = uuidv4() + extname(file.originalname);
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
  async create(
    @Body() dto: CreateDeliveryDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const finalTenantId = user.role === 'ADMIN' && dto.tenantId ? dto.tenantId : tenantId;
    const photoUrl = file ? `/uploads/deliveries/${file.filename}` : undefined;
    return this.deliveriesService.create({
      ...dto,
      tenantId: finalTenantId,
      receivedById: user.sub,
      photoUrl,
    });
  }

  @Post('withdraw')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO', 'MORADOR')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/withdrawals',
        filename: (req, file, cb) => {
          const uniqueName = uuidv4() + extname(file.originalname);
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
  withdraw(
    @Body() dto: WithdrawDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const withdrawPhotoUrl = file ? `/uploads/withdrawals/${file.filename}` : undefined;
    return this.deliveriesService.withdraw(dto.userId, dto.qrcode, withdrawPhotoUrl);
  }

  @Get(':id/label')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  async generateLabel(
    @Param('id') id: string,
    @Query('format') format: 'a4' | 'thermal' = 'a4',
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.deliveriesService.generateLabel(id, format);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename=etiqueta-${id}.pdf`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Post(':id/whatsapp')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  sendWhatsapp(@Param('id') id: string) {
    return this.deliveriesService.sendWhatsapp(id);
  }
}
