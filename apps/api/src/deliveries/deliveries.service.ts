import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { TenantConfigService } from '../tenant-config/tenant-config.service';
import { v4 as uuidv4 } from 'uuid';
import * as QRCode from 'qrcode';
import PDFDocument from 'pdfkit';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    private tenantConfigService: TenantConfigService,
  ) {}

  async findAll(tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.delivery.findMany({
      where: isAdmin ? {} : { tenantId },
      include: {
        user: { select: { id: true, name: true, phone: true } },
        unit: true,
        location: true,
        receivedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    return this.prisma.delivery.findFirst({
      where: { id, ...(isAdmin ? {} : { tenantId }) },
      include: {
        user: true,
        unit: true,
        location: true,
        receivedBy: true,
        events: { orderBy: { createdAt: 'desc' } },
      },
    });
  }

  async create(data: {
    tenantId: string;
    userId: string;
    unitId?: string;
    locationId: string;
    receivedById: string;
    description?: string;
    photoUrl?: string;
  }) {
    // Auto-derive unitId from user if not provided
    let unitId = data.unitId;
    if (!unitId) {
      const user = await this.prisma.user.findUnique({ where: { id: data.userId }, select: { unitId: true } });
      if (!user || !user.unitId) {
        throw new BadRequestException('Morador não possui unidade vinculada');
      }
      unitId = user.unitId;
    }

    const code = `ENC-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;
    const qrcode = await QRCode.toDataURL(code);

    const delivery = await this.prisma.delivery.create({
      data: {
        tenantId: data.tenantId,
        userId: data.userId,
        unitId,
        locationId: data.locationId,
        receivedById: data.receivedById,
        description: data.description,
        photoUrl: data.photoUrl,
        code,
        qrcode,
        status: 'PENDING',
      },
      include: {
        user: true,
        unit: true,
        location: true,
        receivedBy: true,
      },
    });

    // Create event
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        userId: data.receivedById,
        type: 'CREATED',
        metadata: JSON.stringify({ code }),
      },
    });

    // Envio automático via WhatsApp (com token do tenant)
    if (delivery.user.phone) {
      try {
        const whatsappToken = await this.tenantConfigService.getWhatsappToken(data.tenantId);
        const unitLabel = delivery.unit.block
          ? `${delivery.unit.type} ${delivery.unit.number}, Bloco ${delivery.unit.block}`
          : `${delivery.unit.type} ${delivery.unit.number}`;

        const message = `📦 *Encomenda Recebida!*\n\nOlá ${delivery.user.name},\nSua encomenda chegou!\n\n📍 Localização: ${delivery.location.code}\n🏠 Unidade: ${unitLabel}\n🔑 Código: ${code}\n\nRetire na portaria apresentando o QR Code.`;

        // Se tem foto do produto, envia com mídia
        if (data.photoUrl) {
          const baseUrl = process.env.APP_URL || 'http://localhost:3001';
          await this.whatsappService.sendMediaWithToken(
            delivery.user.phone,
            message,
            `${baseUrl}${data.photoUrl}`,
            whatsappToken,
          );
        } else {
          await this.whatsappService.sendMessageWithToken(delivery.user.phone, message, whatsappToken);
        }

        await this.prisma.deliveryEvent.create({
          data: {
            deliveryId: delivery.id,
            type: 'WHATSAPP_SENT',
            metadata: JSON.stringify({ phone: delivery.user.phone, auto: true }),
          },
        });
        this.logger.log(`WhatsApp enviado automaticamente para ${delivery.user.phone} - Encomenda ${code}`);
      } catch (error) {
        this.logger.error(`Erro ao enviar WhatsApp automaticamente: ${error.message}`);
      }
    }

    return delivery;
  }

  async withdraw(userId: string, qrcodeOrCode: string, withdrawPhotoUrl?: string) {
    // Find delivery by code
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        OR: [{ code: qrcodeOrCode }, { qrcode: qrcodeOrCode }],
      },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) {
      throw new NotFoundException('Encomenda não encontrada');
    }

    if (delivery.status === 'WITHDRAWN') {
      throw new BadRequestException('Encomenda já foi retirada');
    }

    if (delivery.userId !== userId) {
      // Check if user belongs to same unit
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user || user.unitId !== delivery.unitId) {
        throw new BadRequestException('Esta encomenda não pertence a você');
      }
    }

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        ...(withdrawPhotoUrl ? { withdrawPhotoUrl } : {}),
      },
      include: { user: true, unit: true },
    });

    // Create event
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        userId,
        type: 'WITHDRAWN',
        metadata: JSON.stringify({ withdrawnAt: new Date() }),
      },
    });

    // Send WhatsApp com token do tenant
    if (delivery.user.phone) {
      try {
        const whatsappToken = await this.tenantConfigService.getWhatsappToken(delivery.tenantId);
        await this.whatsappService.sendMessageWithToken(
          delivery.user.phone,
          `✅ *Encomenda Retirada!*\n\nOlá ${delivery.user.name},\nSua encomenda (${delivery.code}) foi retirada com sucesso.\n\nData: ${new Date().toLocaleString('pt-BR')}`,
          whatsappToken,
        );
      } catch (error) {
        this.logger.error(`Erro ao enviar WhatsApp de retirada: ${error.message}`);
      }
    }

    return updated;
  }

  async generateLabel(id: string, format: 'a4' | 'thermal' = 'a4'): Promise<Buffer> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');

    if (format === 'thermal') {
      return this.generateThermalLabel(delivery);
    }

    const qrBuffer = await QRCode.toBuffer(delivery.code, { width: 300 });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(24).font('Helvetica-Bold').text('ENCOMENDA', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(`Código: ${delivery.code}`, { align: 'center' });
      doc.moveDown(1);

      // QR Code
      doc.image(qrBuffer, (doc.page.width - 200) / 2, doc.y, { width: 200, height: 200 });
      doc.moveDown(12);

      // Info
      const unitLabel = delivery.unit.block
        ? `${delivery.unit.type} ${delivery.unit.number} - Bloco ${delivery.unit.block}`
        : `${delivery.unit.type} ${delivery.unit.number}`;

      doc.fontSize(16).font('Helvetica-Bold');
      doc.text(`Morador: ${delivery.user.name}`, 50);
      doc.moveDown(0.3);
      doc.text(`Unidade: ${unitLabel}`);
      doc.moveDown(0.3);
      doc.text(`Localização: ${delivery.location.code} - ${delivery.location.description || ''}`);
      doc.moveDown(0.3);
      doc.text(`Data: ${delivery.createdAt.toLocaleString('pt-BR')}`);
      doc.moveDown(0.3);
      doc.text(`Status: ${delivery.status === 'PENDING' ? 'PENDENTE' : 'RETIRADA'}`);

      doc.end();
    });
  }

  /**
   * Gera etiqueta para impressora térmica 80mm (~226 pontos de largura)
   */
  private async generateThermalLabel(delivery: any): Promise<Buffer> {
    // 80mm = ~226 pontos (72 DPI), altura variável
    const qrBuffer = await QRCode.toBuffer(delivery.code, { width: 160 });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [226, 400],
        margin: 10,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(14).font('Helvetica-Bold').text('ENCOMENDA', { align: 'center' });
      doc.moveDown(0.3);

      // QR Code centered
      doc.image(qrBuffer, (226 - 140) / 2, doc.y, { width: 140, height: 140 });
      doc.moveDown(8.5);

      // Code
      doc.fontSize(8).font('Helvetica').text(delivery.code, { align: 'center' });
      doc.moveDown(0.3);

      // Separator
      doc.moveTo(10, doc.y).lineTo(216, doc.y).dash(2, { space: 2 }).stroke();
      doc.moveDown(0.3);

      // Info
      const unitLabel = delivery.unit.block
        ? `${delivery.unit.type} ${delivery.unit.number} - Bl ${delivery.unit.block}`
        : `${delivery.unit.type} ${delivery.unit.number}`;

      doc.fontSize(9).font('Helvetica-Bold');
      doc.text(delivery.user.name, 10, doc.y, { width: 206 });
      doc.moveDown(0.2);
      doc.fontSize(8).font('Helvetica');
      doc.text(`Un: ${unitLabel}`, 10);
      doc.moveDown(0.2);
      doc.text(`Loc: ${delivery.location.code}`, 10);
      doc.moveDown(0.2);
      doc.text(delivery.createdAt.toLocaleString('pt-BR'), 10);

      doc.end();
    });
  }

  async sendWhatsapp(id: string) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');
    if (!delivery.user.phone) throw new BadRequestException('Morador sem telefone cadastrado');

    const whatsappToken = await this.tenantConfigService.getWhatsappToken(delivery.tenantId);
    const unitLabel = delivery.unit.block
      ? `${delivery.unit.type} ${delivery.unit.number}, Bloco ${delivery.unit.block}`
      : `${delivery.unit.type} ${delivery.unit.number}`;

    await this.whatsappService.sendMessageWithToken(
      delivery.user.phone,
      `📦 *Lembrete: Encomenda Pendente*\n\nOlá ${delivery.user.name},\nVocê possui uma encomenda pendente de retirada.\n\n📍 Localização: ${delivery.location.code}\n🏠 Unidade: ${unitLabel}\n🔑 Código: ${delivery.code}\n\nRetire na portaria.`,
      whatsappToken,
    );

    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        type: 'WHATSAPP_SENT',
        metadata: JSON.stringify({ phone: delivery.user.phone, type: 'reminder' }),
      },
    });

    return { message: 'WhatsApp enviado com sucesso' };
  }

  /**
   * Busca encomenda por código ou QR Code (para uso do totem)
   */
  async findByCode(code: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        OR: [{ code }, { qrcode: code }],
      },
      include: {
        user: { select: { id: true, name: true, phone: true, photoUrl: true } },
        unit: true,
        location: true,
      },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');
    return delivery;
  }

  /**
   * Retirada via totem (sem autenticação JWT, usa código da encomenda)
   */
  async withdrawFromTotem(code: string, withdrawPhotoUrl?: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        OR: [{ code }, { qrcode: code }],
      },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');
    if (delivery.status === 'WITHDRAWN') throw new BadRequestException('Encomenda já foi retirada');

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        ...(withdrawPhotoUrl ? { withdrawPhotoUrl } : {}),
      },
      include: { user: true, unit: true },
    });

    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        userId: delivery.userId,
        type: 'WITHDRAWN',
        metadata: JSON.stringify({ withdrawnAt: new Date(), source: 'TOTEM', withdrawPhotoUrl }),
      },
    });

    if (delivery.user.phone) {
      try {
        const whatsappToken = await this.tenantConfigService.getWhatsappToken(delivery.tenantId);
        await this.whatsappService.sendMessageWithToken(
          delivery.user.phone,
          `✅ *Encomenda Retirada (Totem)*\n\nOlá ${delivery.user.name},\nSua encomenda (${delivery.code}) foi retirada via totem.\n\nData: ${new Date().toLocaleString('pt-BR')}`,
          whatsappToken,
        );
      } catch (error) {
        this.logger.error(`Erro ao enviar WhatsApp de retirada (totem): ${error.message}`);
      }
    }

    return updated;
  }

  async getDashboardStats(tenantId: string, role?: string) {
    const isAdmin = role === 'ADMIN';
    const where = isAdmin ? {} : { tenantId };

    const [total, pending, withdrawn, todayCount] = await Promise.all([
      this.prisma.delivery.count({ where }),
      this.prisma.delivery.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.delivery.count({ where: { ...where, status: 'WITHDRAWN' } }),
      this.prisma.delivery.count({
        where: {
          ...where,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
        },
      }),
    ]);

    const usersCount = await this.prisma.user.count({ where: isAdmin ? {} : { tenantId } });
    const unitsCount = await this.prisma.unit.count({ where: isAdmin ? {} : { tenantId } });

    return { total, pending, withdrawn, todayCount, usersCount, unitsCount };
  }
}
