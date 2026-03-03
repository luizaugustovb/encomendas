import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, UseGuards, UseInterceptors,
  UploadedFile, Request, Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from './users.service';
import { HikvisionService } from '../hikvision/hikvision.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import { TenantId, CurrentUser } from '../auth/decorators';
import { IsNotEmpty, IsOptional, IsString, IsEmail, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString() @IsNotEmpty() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() unitId?: string;
  @IsOptional() @IsString() tenantId?: string;
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() unitId?: string;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(
    private usersService: UsersService,
    private hikvisionService: HikvisionService,
  ) { }

  @Get()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  findAll(@TenantId() tenantId: string, @CurrentUser() user: any, @Request() req: any) {
    const filterTenantId = user.role === 'ADMIN' && req.query.tenantId ? req.query.tenantId : undefined;
    return this.usersService.findAll(tenantId, user.role, filterTenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  findOne(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    return this.usersService.findOne(id, tenantId, user.role);
  }

  @Post()
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async create(@Body() dto: CreateUserDto, @TenantId() tenantId: string, @CurrentUser() user: any) {
    const finalTenantId = user.role === 'ADMIN' && dto.tenantId ? dto.tenantId : tenantId;
    const created = await this.usersService.create({ ...dto, tenantId: finalTenantId });

    // Sincroniza automaticamente com o equipamento Hikvision (em background)
    this.hikvisionService.syncSingleUser(finalTenantId, created.id).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao sincronizar usuário ${created.name}: ${err.message}`);
    });

    return created;
  }

  @Put(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @TenantId() tenantId: string,
    @CurrentUser() user: any,
  ) {
    return this.usersService.update(id, tenantId, dto, user.role).then((updated) => {
      // Sincroniza atualização no dispositivo Hikvision (com o tenantId real do usuário)
      this.hikvisionService.syncSingleUser(updated.tenantId, id).catch((err) => {
        this.logger.warn(`[Hikvision] Falha ao sincronizar atualização do usuário: ${err.message}`);
      });
      return updated;
    });
  }

  @Delete(':id')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async remove(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    const removed = await this.usersService.remove(id, tenantId, user.role);

    // Remove do dispositivo Hikvision (usa o tenantId do usuário removido)
    this.hikvisionService.unsyncUser(removed.tenantId, id).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao remover usuário do dispositivo: ${err.message}`);
    });

    return removed;
  }

  @Patch(':id/reactivate')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async reactivate(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    const reactivated = await this.usersService.reactivate(id, tenantId, user.role);

    // Sincroniza novamente com o equipamento Hikvision ao reativar
    this.hikvisionService.syncSingleUser(tenantId, id).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao re-sincronizar usuário reativado: ${err.message}`);
    });

    return reactivated;
  }

  @Delete(':id/permanent')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO')
  async permanentRemove(@Param('id') id: string, @TenantId() tenantId: string, @CurrentUser() user: any) {
    // Busca o usuário primeiro para saber o tenantId antes de deletar
    const userToDelete = await this.usersService.findOne(id, tenantId, user.role);
    if (userToDelete) {
      this.hikvisionService.unsyncUser(userToDelete.tenantId, id).catch((err) => {
        this.logger.warn(`[Hikvision] Falha ao remover usuário do dispositivo: ${err.message}`);
      });
    }

    return this.usersService.permanentRemove(id, tenantId, user.role);
  }

  @Post(':id/photo')
  @Roles('ADMIN', 'ADMIN_CONDOMINIO', 'PORTEIRO')
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: diskStorage({
        destination: './uploads/photos',
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
  async uploadPhoto(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const photoUrl = `/uploads/photos/${file.filename}`;
    const updated = await this.usersService.updatePhoto(id, photoUrl);

    // Sincroniza automaticamente a foto com o equipamento Hikvision usando o tenantId do usuário
    this.hikvisionService.syncSingleUser(updated.tenantId, id).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao sincronizar foto do usuário: ${err.message}`);
    });

    return updated;
  }
}

