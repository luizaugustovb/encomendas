import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger, forwardRef, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HikvisionService } from '../hikvision/hikvision.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

/** Roles que sempre ficam no equipamento (acesso permanente) */
const ROLES_ALWAYS_SYNCED = ['SINDICO', 'ZELADOR', 'PORTEIRO', 'ADMIN_CONDOMINIO'];

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => HikvisionService))
    private hikvisionService: HikvisionService,
  ) {}

  async findAll(tenantId: string, role?: string, filterTenantId?: string) {
    const isAdmin = role === 'ADMIN';
    const where: any = {};
    if (isAdmin && filterTenantId) {
      where.tenantId = filterTenantId;
      where.role = { not: 'ADMIN' };
    } else if (!isAdmin) {
      where.tenantId = tenantId;
      where.role = { not: 'ADMIN' };
    }
    return this.prisma.user.findMany({
      where,
      include: { unit: true, tenant: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
      include: { unit: true, tenant: true },
    });
  }

  async create(data: {
    tenantId: string;
    name: string;
    email: string;
    password: string;
    phone?: string;
    role?: string;
    unitId?: string;
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);
    try {
      const user = await this.prisma.user.create({
        data: {
          ...data,
          password: hashedPassword,
          role: (data.role as any) || 'MORADOR',
        },
        include: { unit: true, tenant: true },
      });

      // Sincroniza automaticamente para equipamento se role tiver acesso permanente
      // MORADOR só é sincronizado quando tiver encomendas (via syncUnitResidents)
      const role = (user.role as string);
      if (ROLES_ALWAYS_SYNCED.includes(role)) {
        this.logger.log(`[AutoSync] Disparando sync para novo usuário ${user.name} (${role})`);
        // Fire & forget — não bloqueia a resposta
        this.hikvisionService.syncUserToEquipments(user.id, user.tenantId).catch((err) =>
          this.logger.error(`[AutoSync] Erro no sync pós-criação de ${user.name}: ${err.message}`)
        );
      }

      return user;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          const target = (error.meta?.target as string[]) || [];
          if (target.includes('email')) {
            throw new ConflictException('Este e-mail já está cadastrado no sistema');
          }
          throw new ConflictException('Já existe um registro com esses dados');
        }
      }
      throw error;
    }
  }

  async update(id: string, tenantId: string, data: any, role?: string) {
    const isAdmin = role === 'ADMIN';
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const existing = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!existing) throw new NotFoundException('Usuário não encontrado');

    try {
      const updated = await this.prisma.user.update({
        where: { id },
        data,
        include: { unit: true, tenant: true },
      });

      // Se a role mudou para permanente e usuário não está sincronizado, sincroniza
      const newRole = (updated.role as string);
      if (
        data.role &&
        ROLES_ALWAYS_SYNCED.includes(newRole) &&
        !existing.hikvisionSynced
      ) {
        this.hikvisionService.syncUserToEquipments(id, updated.tenantId).catch((err) =>
          this.logger.error(`[AutoSync] Erro no sync pós-update de role ${updated.name}: ${err.message}`)
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Este e-mail já está cadastrado no sistema');
      }
      throw error;
    }
  }

  async remove(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const result = await this.prisma.user.update({
      where: { id },
      data: { active: false },
    });

    // Remove do equipamento se estava sincronizado
    if (user.hikvisionSynced) {
      this.hikvisionService.unsyncUserFromEquipments(id, user.tenantId).catch((err) =>
        this.logger.error(`[AutoSync] Erro ao remover ${user.name} do equipamento: ${err.message}`)
      );
    }

    return result;
  }

  async reactivate(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.active) throw new BadRequestException('Usuário já está ativo');

    const result = await this.prisma.user.update({
      where: { id },
      data: { active: true },
      include: { unit: true, tenant: true },
    });

    // Re-sincroniza ao reativar se role tiver acesso permanente
    const userRole = (user.role as string);
    if (ROLES_ALWAYS_SYNCED.includes(userRole)) {
      this.hikvisionService.syncUserToEquipments(id, user.tenantId).catch((err) =>
        this.logger.error(`[AutoSync] Erro ao re-sincronizar ${user.name} após reativação: ${err.message}`)
      );
    }

    return result;
  }

  async permanentRemove(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.active) throw new BadRequestException('Desative o usuário antes de excluir permanentemente');

    // Remove do equipamento antes de excluir do banco
    if (user.hikvisionSynced || user.hikvisionEmployeeNo) {
      try {
        await this.hikvisionService.unsyncUserFromEquipments(id, user.tenantId);
      } catch (err) {
        this.logger.warn(`[AutoSync] Falha ao remover ${user.name} do equipamento antes de exclusão: ${err.message}`);
      }
    }

    // Exclui em transação
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryEvent.deleteMany({ where: { userId: id } });

      const ownedDeliveries = await tx.delivery.findMany({ where: { userId: id }, select: { id: true } });
      if (ownedDeliveries.length > 0) {
        await tx.deliveryEvent.deleteMany({ where: { deliveryId: { in: ownedDeliveries.map(d => d.id) } } });
        await tx.delivery.deleteMany({ where: { userId: id } });
      }

      const receivedDeliveries = await tx.delivery.findMany({ where: { receivedById: id }, select: { id: true } });
      if (receivedDeliveries.length > 0) {
        await tx.deliveryEvent.deleteMany({ where: { deliveryId: { in: receivedDeliveries.map(d => d.id) } } });
        await tx.delivery.deleteMany({ where: { receivedById: id } });
      }

      await tx.user.delete({ where: { id } });
    });

    return { message: 'Usuário excluído permanentemente' };
  }

  async updatePhoto(id: string, photoUrl: string) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { photoUrl },
    });

    // Re-envia a face ao equipamento sempre que a foto for atualizada
    const user = await this.prisma.user.findUnique({ where: { id } });
    const userRole = (user?.role as string) ?? '';
    if (user && (user.hikvisionSynced || ROLES_ALWAYS_SYNCED.includes(userRole))) {
      this.hikvisionService.resyncFaceToEquipments(id, user.tenantId).catch((err) =>
        this.logger.error(`[AutoSync] Erro ao re-enviar face de ${user.name}: ${err.message}`)
      );
    }

    return updated;
  }
}
