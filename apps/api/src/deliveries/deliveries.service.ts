import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { TenantConfigService } from '../tenant-config/tenant-config.service';
import { HikvisionService } from '../hikvision/hikvision.service';
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
    private hikvisionService: HikvisionService,
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
    // Busca o morador completo para derivar unitId e tenantId
    const morador = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { unitId: true, tenantId: true },
    });
    if (!morador) {
      throw new BadRequestException('Morador não encontrado');
    }

    // Auto-derive unitId from morador if not provided
    let unitId = data.unitId;
    if (!unitId) {
      if (!morador.unitId) {
        throw new BadRequestException('Morador não possui unidade vinculada');
      }
      unitId = morador.unitId;
    }

    // Sempre usa o tenantId do morador (evita que admin master crie delivery no tenant errado)
    const tenantId = morador.tenantId;

    // Verifica se o receivedById existe. Se não existir (ex: token JWT expirado/usuário recriado),
    // utiliza o primeiro porteiro ativo do tenant como fallback
    let receivedById = data.receivedById;
    const receiverExists = await this.prisma.user.findUnique({
      where: { id: receivedById },
      select: { id: true },
    });
    if (!receiverExists) {
      this.logger.warn(`[Delivery] receivedById ${receivedById} não encontrado. Buscando porteiro do tenant...`);
      const fallbackUser = await this.prisma.user.findFirst({
        where: { tenantId, active: true, role: { in: ['PORTEIRO', 'ADMIN_CONDOMINIO', 'ADMIN'] } },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      });
      if (fallbackUser) {
        receivedById = fallbackUser.id;
        this.logger.log(`[Delivery] Usando fallback receivedById: ${receivedById}`);
      } else {
        throw new BadRequestException('Nenhum responsável encontrado para registrar a encomenda. Faça login novamente.');
      }
    }

    const code = `ENC-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 4).toUpperCase()}`;
    const qrcode = await QRCode.toDataURL(code);

    const delivery = await this.prisma.delivery.create({
      data: {
        tenantId,
        userId: data.userId,
        unitId,
        locationId: data.locationId,
        receivedById,
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
        userId: receivedById,
        type: 'CREATED',
        metadata: JSON.stringify({ code }),
      },
    });

    // Envio automático via WhatsApp (com token do tenant)
    if (delivery.user.phone) {
      try {
        const whatsappToken = await this.tenantConfigService.getWhatsappToken(tenantId);
        const unitLabel = delivery.unit.block
          ? `${delivery.unit.type} ${delivery.unit.number}, Bloco ${delivery.unit.block}`
          : `${delivery.unit.type} ${delivery.unit.number}`;

        const message = `📦 *Encomenda Recebida!*\n\nOlá ${delivery.user.name},\nSua encomenda chegou!\n\n📍 Localização: ${delivery.location.code}\n🏠 Unidade: ${unitLabel}\n🔑 Código: ${code}\n\nDirija-se à sala de encomendas para retirar sua encomenda.`;

        // Se tem foto e APP_URL público, envia com mídia; senão envia texto
        const baseUrl = process.env.APP_URL || '';
        const isPublicUrl = baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');

        if (data.photoUrl && isPublicUrl) {
          try {
            await this.whatsappService.sendMediaWithToken(
              delivery.user.phone,
              message,
              `${baseUrl}${data.photoUrl}`,
              whatsappToken,
            );
          } catch (mediaError) {
            this.logger.warn(`Falha ao enviar mídia WhatsApp, tentando texto: ${mediaError.message}`);
            await this.whatsappService.sendMessageWithToken(delivery.user.phone, message, whatsappToken);
          }
        } else {
          if (data.photoUrl && !isPublicUrl) {
            this.logger.warn(`APP_URL não é público (${baseUrl || 'não definido'}). Enviando WhatsApp somente texto.`);
          }
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

    // Sincroniza moradores da unidade com o equipamento Hikvision
    // (moradores só são cadastrados no equipamento quando recebem encomenda)
    this.hikvisionService.syncUnitResidents(tenantId, unitId).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao sincronizar moradores da unidade: ${err.message}`);
    });

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

    // Remove moradores da unidade do equipamento Hikvision se não houver mais encomendas pendentes
    this.hikvisionService.unsyncUnitResidentsIfNoPending(delivery.tenantId, delivery.unitId).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao remover moradores do equipamento após retirada: ${err.message}`);
    });

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

    // Remove moradores da unidade do equipamento Hikvision se não houver mais encomendas pendentes
    this.hikvisionService.unsyncUnitResidentsIfNoPending(delivery.tenantId, delivery.unitId).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao remover moradores do equipamento após retirada (totem): ${err.message}`);
    });

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
