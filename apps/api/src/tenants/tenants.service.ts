import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.tenant.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async create(data: { name: string; document?: string; address?: string; phone?: string; sindico?: string; sindicoPhone?: string }) {
    return this.prisma.tenant.create({ data });
  }

  async update(id: string, data: { name?: string; document?: string; address?: string; phone?: string; sindico?: string; sindicoPhone?: string; active?: boolean }) {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.tenant.update({ where: { id }, data: { active: false } });
  }

  async reactivate(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    return this.prisma.tenant.update({ where: { id }, data: { active: true } });
  }

  async permanentRemove(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Condomínio não encontrado');
    if (tenant.active) {
      throw new BadRequestException('O condomínio precisa estar desativado antes de ser excluído permanentemente.');
    }

    // Cascade delete all related records in correct order
    await this.prisma.$transaction(async (tx) => {
      // 1. Delete delivery events from deliveries of this tenant
      await tx.deliveryEvent.deleteMany({
        where: { delivery: { tenantId: id } },
      });
      // 2. Delete deliveries
      await tx.delivery.deleteMany({ where: { tenantId: id } });
      // 3. Delete users (removes unit relations)
      await tx.user.deleteMany({ where: { tenantId: id } });
      // 4. Delete units
      await tx.unit.deleteMany({ where: { tenantId: id } });
      // 5. Delete locations
      await tx.location.deleteMany({ where: { tenantId: id } });
      // 6. Delete equipment
      await tx.equipment.deleteMany({ where: { tenantId: id } });
      // 7. Delete tenant config
      await tx.tenantConfig.deleteMany({ where: { tenantId: id } });
      // 8. Delete tenant
      await tx.tenant.delete({ where: { id } });
    });

    return { message: 'Condomínio e todos os dados relacionados foram excluídos permanentemente.' };
  }
}
