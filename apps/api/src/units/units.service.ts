import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.unit.findMany({
      where: isAdmin ? { active: true } : { tenantId, active: true },
      include: {
        users: { select: { id: true, name: true, phone: true } },
        tenant: { select: { id: true, name: true } },
      },
      orderBy: [{ block: 'asc' }, { number: 'asc' }],
    });
  }

  async findOne(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.unit.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
      include: { users: true, tenant: { select: { id: true, name: true } } },
    });
  }

  async create(data: { tenantId: string; number: string; block?: string; type?: string }) {
    return this.prisma.unit.create({
      data: { ...data, type: data.type || 'APARTAMENTO' },
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, tenantId: string, data: any, role?: string) {
    const isAdmin = role === 'ADMIN';
    const unit = await this.prisma.unit.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return this.prisma.unit.update({
      where: { id },
      data,
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const unit = await this.prisma.unit.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return this.prisma.unit.update({ where: { id }, data: { active: false } });
  }
}
