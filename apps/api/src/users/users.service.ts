import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
      return await this.prisma.user.create({
        data: {
          ...data,
          password: hashedPassword,
          role: (data.role as any) || 'MORADOR',
        },
        include: { unit: true, tenant: true },
      });
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

    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        include: { unit: true, tenant: true },
      });
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

    return this.prisma.user.update({
      where: { id },
      data: { active: false },
    });
  }

  async reactivate(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.active) throw new BadRequestException('Usuário já está ativo');

    return this.prisma.user.update({
      where: { id },
      data: { active: true },
      include: { unit: true, tenant: true },
    });
  }

  async permanentRemove(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const user = await this.prisma.user.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    if (user.active) throw new BadRequestException('Desative o usuário antes de excluir permanentemente');

    // Delete in transaction - events, deliveries received, deliveries owned, then user
    await this.prisma.$transaction(async (tx) => {
      // Delete delivery events by user
      await tx.deliveryEvent.deleteMany({ where: { userId: id } });
      // Delete events from deliveries owned by this user
      const ownedDeliveries = await tx.delivery.findMany({ where: { userId: id }, select: { id: true } });
      if (ownedDeliveries.length > 0) {
        await tx.deliveryEvent.deleteMany({ where: { deliveryId: { in: ownedDeliveries.map(d => d.id) } } });
        await tx.delivery.deleteMany({ where: { userId: id } });
      }
      // Delete deliveries received by this user
      const receivedDeliveries = await tx.delivery.findMany({ where: { receivedById: id }, select: { id: true } });
      if (receivedDeliveries.length > 0) {
        await tx.deliveryEvent.deleteMany({ where: { deliveryId: { in: receivedDeliveries.map(d => d.id) } } });
        await tx.delivery.deleteMany({ where: { receivedById: id } });
      }
      // Delete the user
      await tx.user.delete({ where: { id } });
    });

    return { message: 'Usuário excluído permanentemente' };
  }

  async updatePhoto(id: string, photoUrl: string) {
    return this.prisma.user.update({
      where: { id },
      data: { photoUrl },
    });
  }
}
