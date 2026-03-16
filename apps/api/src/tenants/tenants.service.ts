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
    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Delete delivery events associated with deliveries of this tenant
        await tx.deliveryEvent.deleteMany({
          where: { delivery: { tenantId: id } },
        });

        // 2. Delete delivery events associated with users of this tenant (audit logs)
        await tx.deliveryEvent.deleteMany({
          where: { user: { tenantId: id } },
        });

        // 3. Delete deliveries
        await tx.delivery.deleteMany({ where: { tenantId: id } });

        // 4. Delete users (this handles their relations to units)
        await tx.user.deleteMany({ where: { tenantId: id } });

        // 5. Delete units
        await tx.unit.deleteMany({ where: { tenantId: id } });

        // 6. Delete locations
        await tx.location.deleteMany({ where: { tenantId: id } });

        // 7. Delete equipment
        await tx.equipment.deleteMany({ where: { tenantId: id } });

        // 8. Delete tenant config
        await tx.tenantConfig.deleteMany({ where: { tenantId: id } });

        // 9. Delete tenant
        await tx.tenant.delete({ where: { id } });
      });

      return { message: 'Condomínio e todos os dados relacionados foram excluídos permanentemente.' };
    } catch (error: any) {
      console.error('[TenantsService] Erro ao excluir condomínio permanentemente:', error);
      throw new BadRequestException(`Erro ao excluir condomínio: ${error?.message || 'Erro desconhecido'}`);
    }
  }
}
