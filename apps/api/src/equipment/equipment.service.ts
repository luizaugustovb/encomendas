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

  async findAll(userTenantId: string, role: string) {
    if (role === 'ADMIN') {
      // Admin master vê todos os equipamentos agrupados por condomínio
      return this.prisma.equipment.findMany({
        where: { active: true },
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: [{ tenant: { name: 'asc' } }, { name: 'asc' }],
      });
    }
    // Outros roles vêem apenas do seu condomínio
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
