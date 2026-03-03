import {
  Controller, Get, Post, Body, Param,
  UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { DeliveriesService } from './deliveries.service';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class TotemWithdrawDto {
  @IsString() @IsNotEmpty() code: string;
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
   * Confirma retirada via totem com foto da pessoa
   */
  @Post('withdraw')
  @UseInterceptors(
    FileInterceptor('photo', {
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
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const withdrawPhotoUrl = file ? `/uploads/withdrawals/${file.filename}` : undefined;
    return this.deliveriesService.withdrawFromTotem(dto.code, withdrawPhotoUrl);
  }
}
