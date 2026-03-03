import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TenantConfigService {
  constructor(private prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    let config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
    });
    if (!config) {
      config = await this.prisma.tenantConfig.create({
        data: { tenantId },
      });
    }
    return config;
  }

  async upsert(tenantId: string, data: {
    whatsappToken?: string;
    hikvisionIp?: string;
    hikvisionPort?: number;
    hikvisionUser?: string;
    hikvisionPassword?: string;
    hikvisionEnabled?: boolean;
  }) {
    return this.prisma.tenantConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  async getWhatsappToken(tenantId: string): Promise<string> {
    const config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
      select: { whatsappToken: true },
    });
    // Fallback to environment variable (main token)
    return config?.whatsappToken || process.env.WHATSAPP_API_TOKEN || '';
  }

  async getHikvisionConfig(tenantId: string) {
    const config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
    });
    if (!config || !config.hikvisionEnabled) return null;
    return {
      ip: config.hikvisionIp,
      port: config.hikvisionPort || 80,
      user: config.hikvisionUser,
      password: config.hikvisionPassword,
    };
  }
}
