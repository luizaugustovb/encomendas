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
    rtspCameraUrl?: string;
  }) {
    return this.prisma.tenantConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  /** Codifica credenciais da URL RTSP para evitar problemas com @ na senha */
  sanitizeRtspUrl(url: string): string {
    const match = url.match(/^(rtsp:\/\/)(.*)/i);
    if (!match) return url;
    const [, scheme, rest] = match;
    const lastAtIdx = rest.lastIndexOf('@');
    if (lastAtIdx === -1) return url; // sem credenciais
    const credsPart = rest.substring(0, lastAtIdx);
    const hostPart = rest.substring(lastAtIdx + 1);
    const colonIdx = credsPart.indexOf(':');
    if (colonIdx === -1) {
      return `${scheme}${encodeURIComponent(credsPart)}@${hostPart}`;
    }
    const user = credsPart.substring(0, colonIdx);
    const pass = credsPart.substring(colonIdx + 1);
    return `${scheme}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hostPart}`;
  }

  async getRtspCameraUrl(tenantId: string): Promise<string | null> {
    const config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
      select: { rtspCameraUrl: true },
    });
    const url = config?.rtspCameraUrl || null;
    return url ? this.sanitizeRtspUrl(url) : null;
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
