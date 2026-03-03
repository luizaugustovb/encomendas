import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.location.findMany({
      where: isAdmin ? { active: true } : { tenantId, active: true },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.location.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async create(data: { tenantId: string; code: string; description?: string }) {
    return this.prisma.location.create({
      data,
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, tenantId: string, data: any, role?: string) {
    const isAdmin = role === 'ADMIN';
    const loc = await this.prisma.location.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!loc) throw new NotFoundException('Localização não encontrada');
    return this.prisma.location.update({
      where: { id },
      data,
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const loc = await this.prisma.location.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
    });
    if (!loc) throw new NotFoundException('Localização não encontrada');
    return this.prisma.location.update({ where: { id }, data: { active: false } });
  }
}
