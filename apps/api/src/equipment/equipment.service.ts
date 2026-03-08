import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HikvisionService } from '../hikvision/hikvision.service';
import * as net from 'net';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class EquipmentService {
  private readonly logger = new Logger(EquipmentService.name);

  constructor(
    private prisma: PrismaService,
    private hikvisionService: HikvisionService,
  ) {}

  // ─── CRUD ──────────────────────────────────────────────────────────

  /**
   * Migra automaticamente o TenantConfig Hikvision para a tabela Equipment
   * se o tenant tem hikvisionEnabled mas nenhum Equipment cadastrado.
   */
  private async autoMigrateFromTenantConfig(tenantId: string): Promise<void> {
    // Conta QUALQUER equipment (ativo ou inativo) para não re-migrar após exclusão
    const existing = await this.prisma.equipment.count({
      where: { tenantId },
    });
    if (existing > 0) return;

    const config = await this.prisma.tenantConfig.findUnique({
      where: { tenantId },
    });
    if (!config || !config.hikvisionEnabled || !config.hikvisionIp) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    await this.prisma.equipment.create({
      data: {
        tenantId,
        name: `Hikvision - ${tenant?.name || 'Principal'}`,
        type: 'HIKVISION',
        hikvisionIp: config.hikvisionIp,
        hikvisionPort: config.hikvisionPort || 80,
        hikvisionUser: config.hikvisionUser || 'admin',
        hikvisionPassword: config.hikvisionPassword || '',
        doorCount: 1,
        enabled: true,
      },
    });

    this.logger.log(`Auto-migrado equipamento do TenantConfig para tenant ${tenantId}`);
  }

  async findAll(userTenantId: string, role: string) {
    if (role === 'ADMIN') {
      // Auto-migrar para todos os tenants que têm config mas não têm equipment
      const tenants = await this.prisma.tenant.findMany({
        where: { active: true },
        select: { id: true },
      });
      await Promise.all(tenants.map((t) => this.autoMigrateFromTenantConfig(t.id)));

      return this.prisma.equipment.findMany({
        where: { active: true },
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
      });
    }

    // Auto-migrar para o tenant do usuário
    await this.autoMigrateFromTenantConfig(userTenantId);

    return this.prisma.equipment.findMany({
      where: { tenantId: userTenantId, active: true },
      include: { tenant: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const eq = await this.prisma.equipment.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!eq) throw new NotFoundException('Equipamento não encontrado');
    return eq;
  }

  async create(data: {
    tenantId: string;
    name: string;
    type?: string;
    hikvisionIp?: string;
    hikvisionPort?: number;
    hikvisionUser?: string;
    hikvisionPassword?: string;
    doorCount?: number;
    wireguardIp?: string;
    enabled?: boolean;
  }) {
    return this.prisma.equipment.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        type: data.type || 'HIKVISION',
        hikvisionIp: data.hikvisionIp,
        hikvisionPort: data.hikvisionPort || 80,
        hikvisionUser: data.hikvisionUser || 'admin',
        hikvisionPassword: data.hikvisionPassword,
        doorCount: data.doorCount || 1,
        wireguardIp: data.wireguardIp,
        enabled: data.enabled ?? true,
      },
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, data: {
    name?: string;
    type?: string;
    hikvisionIp?: string;
    hikvisionPort?: number;
    hikvisionUser?: string;
    hikvisionPassword?: string;
    doorCount?: number;
    wireguardIp?: string;
    enabled?: boolean;
  }) {
    await this.findOne(id); // garante que existe
    return this.prisma.equipment.update({
      where: { id },
      data,
      include: { tenant: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.equipment.update({
      where: { id },
      data: { active: false },
    });
  }

  // ─── Status Check ─────────────────────────────────────────────────

  /** Verifica se o equipamento está online (TCP connect) */
  async checkOnline(id: string): Promise<{ online: boolean; latencyMs?: number }> {
    const eq = await this.findOne(id);
    if (!eq.hikvisionIp) return { online: false };

    const ip = eq.hikvisionIp.replace(/^https?:\/\//, '');
    const port = eq.hikvisionPort || 80;

    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        const latencyMs = Date.now() - start;
        socket.destroy();
        resolve({ online: true, latencyMs });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ online: false });
      });

      socket.on('error', () => {
        socket.destroy();
        resolve({ online: false });
      });

      socket.connect(port, ip);
    });
  }

  /** Verifica status de múltiplos equipamentos em lote */
  async checkAllStatus(userTenantId: string, role: string): Promise<
    Array<{ id: string; online: boolean; latencyMs?: number; wireguardOnline?: boolean }>
  > {
    const equipments = await this.findAll(userTenantId, role);
    const results = await Promise.allSettled(
      equipments.map(async (eq) => {
        const status = await this.checkOnline(eq.id);
        let wireguardOnline: boolean | undefined;
        if (role === 'ADMIN' && eq.wireguardIp) {
          wireguardOnline = await this.checkWireguard(eq.wireguardIp);
        }
        return { id: eq.id, ...status, wireguardOnline };
      }),
    );

    return results.map((r, i) =>
      r.status === 'fulfilled'
        ? r.value
        : { id: equipments[i].id, online: false },
    );
  }

  /** Verifica se o WireGuard está conectado via ping */
  async checkWireguard(wireguardIp: string): Promise<boolean> {
    try {
      const isWindows = process.platform === 'win32';
      const cmd = isWindows
        ? `ping -n 1 -w 3000 ${wireguardIp}`
        : `ping -c 1 -W 3 ${wireguardIp}`;
      await execAsync(cmd);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Controle de Porta por Equipamento ─────────────────────────────

  async openDoor(
    equipmentId: string,
    doorNo: number = 1,
    userTenantId: string,
    userRole: string,
  ): Promise<{ success: boolean; message: string }> {
    const eq = await this.findOne(equipmentId);

    // Permissão: admin pode abrir qualquer, outros apenas do seu tenant
    if (userRole !== 'ADMIN' && eq.tenantId !== userTenantId) {
      throw new ForbiddenException('Sem permissão para este equipamento');
    }

    if (!eq.enabled) {
      return { success: false, message: 'Equipamento desabilitado' };
    }

    if (!eq.hikvisionIp) {
      return { success: false, message: 'IP do equipamento não configurado' };
    }

    const config = {
      ip: eq.hikvisionIp,
      port: eq.hikvisionPort || 80,
      user: eq.hikvisionUser || 'admin',
      password: eq.hikvisionPassword || '',
      tenantId: eq.tenantId,
    };

    return this.hikvisionService.openDoorWithConfig(String(doorNo), config as any);
  }

  /** Testa conexão com equipamento */
  async testConnection(id: string): Promise<{ success: boolean; message: string; deviceInfo?: any }> {
    const eq = await this.findOne(id);
    if (!eq.hikvisionIp) {
      return { success: false, message: 'IP do equipamento não configurado' };
    }

    const config = {
      ip: eq.hikvisionIp,
      port: eq.hikvisionPort || 80,
      user: eq.hikvisionUser || 'admin',
      password: eq.hikvisionPassword || '',
      tenantId: eq.tenantId,
    };

    return this.hikvisionService.testConnection(config as any);
  }
}
