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

    // Destrava porta ao confirmar retirada
    try {
      const doorResult = await this.hikvisionService.openDoor(delivery.tenantId, 1);
      await this.prisma.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          userId,
          type: 'DOOR_ACCESS',
          metadata: JSON.stringify({
            source: 'DASHBOARD',
            tenantId: delivery.tenantId,
            doorNo: 1,
            success: doorResult.success,
            message: doorResult.message,
          }),
        },
      });
    } catch (error: any) {
      this.logger.warn(`[Withdraw] Falha ao destravar porta do tenant ${delivery.tenantId}: ${error.message}`);
    }

    // Remove moradores da unidade do equipamento Hikvision se não houver mais encomendas pendentes
    this.hikvisionService.unsyncUnitResidentsIfNoPending(delivery.tenantId, delivery.unitId).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao remover moradores do equipamento após retirada: ${err.message}`);
    });

    return updated;
  }

  async generateLabel(id: string, format: 'a4' | 'thermal' | 'sticker' = 'a4'): Promise<Buffer> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');

    if (format === 'thermal') {
      return this.generateThermalLabel(delivery);
    }
    if (format === 'sticker') {
      return this.generateStickerLabel(delivery);
    }

    // ===== FORMATO A4 =====
    const qrBuffer = await QRCode.toBuffer(delivery.code, { width: 300 });
    const unitLabel = delivery.unit.block
      ? `${delivery.unit.type} ${delivery.unit.number} - Bloco ${delivery.unit.block}`
      : `${delivery.unit.type} ${delivery.unit.number}`;
    const dateStr = delivery.createdAt.toLocaleString('pt-BR');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pw = doc.page.width - 100; // largura útil

      // ── Título ──
      doc.fontSize(28).font('Helvetica-Bold').text('ENCOMENDA', { align: 'center' });
      doc.moveDown(0.8);

      // ── Linha separadora ──
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(1).stroke('#999999');
      doc.moveDown(0.8);

      // ── Dados do morador (centralizados) ──
      doc.fontSize(18).font('Helvetica-Bold').text(delivery.user.name, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(14).font('Helvetica').text(unitLabel, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(12).font('Helvetica').text(`Localização: ${delivery.location.code}${delivery.location.description ? ' - ' + delivery.location.description : ''}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(`Cadastro: ${dateStr}`, { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(11).font('Helvetica').text(`Status: ${delivery.status === 'PENDING' ? 'PENDENTE' : 'RETIRADA'}`, { align: 'center' });
      doc.moveDown(1);

      // ── Linha separadora ──
      doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).lineWidth(1).stroke('#999999');
      doc.moveDown(1);

      // ── Código da encomenda ──
      doc.fontSize(16).font('Helvetica-Bold').text(delivery.code, { align: 'center' });
      doc.moveDown(0.8);

      // ── QR Code centralizado ──
      const qrSize = 220;
      doc.image(qrBuffer, (doc.page.width - qrSize) / 2, doc.y, { width: qrSize, height: qrSize });

      doc.end();
    });
  }

  /**
   * Gera etiqueta para impressora térmica 80mm (~226 pontos de largura)
   */
  private async generateThermalLabel(delivery: any): Promise<Buffer> {
    const qrBuffer = await QRCode.toBuffer(delivery.code, { width: 160 });
    const unitLabel = delivery.unit.block
      ? `${delivery.unit.type} ${delivery.unit.number} - Bl ${delivery.unit.block}`
      : `${delivery.unit.type} ${delivery.unit.number}`;
    const dateStr = delivery.createdAt.toLocaleString('pt-BR');
    const pw = 226;
    const margin = 10;
    const usable = pw - margin * 2;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [pw, 450],
        margin,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Título ──
      doc.fontSize(13).font('Helvetica-Bold').text('ENCOMENDA', { align: 'center', width: usable });
      doc.moveDown(0.3);

      // ── Separador ──
      doc.moveTo(margin, doc.y).lineTo(pw - margin, doc.y).dash(2, { space: 2 }).stroke();
      doc.undash();
      doc.moveDown(0.4);

      // ── Dados do morador (centralizados) ──
      doc.fontSize(10).font('Helvetica-Bold').text(delivery.user.name, { align: 'center', width: usable });
      doc.moveDown(0.15);
      doc.fontSize(9).font('Helvetica').text(unitLabel, { align: 'center', width: usable });
      doc.moveDown(0.15);
      doc.fontSize(8).font('Helvetica').text(`Loc: ${delivery.location.code}${delivery.location.description ? ' - ' + delivery.location.description : ''}`, { align: 'center', width: usable });
      doc.moveDown(0.15);
      doc.fontSize(7).font('Helvetica').text(dateStr, { align: 'center', width: usable });
      doc.moveDown(0.4);

      // ── Separador ──
      doc.moveTo(margin, doc.y).lineTo(pw - margin, doc.y).dash(2, { space: 2 }).stroke();
      doc.undash();
      doc.moveDown(0.4);

      // ── Código ──
      doc.fontSize(9).font('Helvetica-Bold').text(delivery.code, { align: 'center', width: usable });
      doc.moveDown(0.3);

      // ── QR Code centralizado ──
      const qrSize = 140;
      doc.image(qrBuffer, (pw - qrSize) / 2, doc.y, { width: qrSize, height: qrSize });

      doc.end();
    });
  }

  /**
   * Gera etiqueta adesiva estilo Mercado Livre (~100x150mm = 283x425 pontos)
   */
  private async generateStickerLabel(delivery: any): Promise<Buffer> {
    const qrBuffer = await QRCode.toBuffer(delivery.code, { width: 240 });
    const unitLabel = delivery.unit.block
      ? `${delivery.unit.type} ${delivery.unit.number} - Bloco ${delivery.unit.block}`
      : `${delivery.unit.type} ${delivery.unit.number}`;
    const dateStr = delivery.createdAt.toLocaleString('pt-BR');
    const pw = 283; // ~100mm
    const ph = 425; // ~150mm
    const margin = 14;
    const usable = pw - margin * 2;

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: [pw, ph],
        margin,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Título ──
      doc.fontSize(16).font('Helvetica-Bold').text('ENCOMENDA', { align: 'center', width: usable });
      doc.moveDown(0.4);

      // ── Linha sólida ──
      doc.moveTo(margin, doc.y).lineTo(pw - margin, doc.y).lineWidth(1).stroke('#333333');
      doc.moveDown(0.5);

      // ── Dados do morador (centralizados) ──
      doc.fontSize(13).font('Helvetica-Bold').text(delivery.user.name, { align: 'center', width: usable });
      doc.moveDown(0.2);
      doc.fontSize(11).font('Helvetica').text(unitLabel, { align: 'center', width: usable });
      doc.moveDown(0.2);
      doc.fontSize(9).font('Helvetica').text(`Localização: ${delivery.location.code}${delivery.location.description ? ' - ' + delivery.location.description : ''}`, { align: 'center', width: usable });
      doc.moveDown(0.2);
      doc.fontSize(8).font('Helvetica').text(dateStr, { align: 'center', width: usable });
      doc.moveDown(0.5);

      // ── Linha sólida ──
      doc.moveTo(margin, doc.y).lineTo(pw - margin, doc.y).lineWidth(1).stroke('#333333');
      doc.moveDown(0.5);

      // ── Código da encomenda ──
      doc.fontSize(11).font('Helvetica-Bold').text(delivery.code, { align: 'center', width: usable });
      doc.moveDown(0.4);

      // ── QR Code centralizado ──
      const qrSize = 170;
      doc.image(qrBuffer, (pw - qrSize) / 2, doc.y, { width: qrSize, height: qrSize });

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
  async findByCode(code: string, tenantId?: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
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
   * Lista moradores ativos da mesma unidade da encomenda (para fluxo "não sou eu" no totem)
   */
  async getUnitResidentsByCode(code: string, tenantId?: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { ...(tenantId ? { tenantId } : {}), OR: [{ code }, { qrcode: code }] },
      select: { unitId: true, userId: true },
    });
    if (!delivery) throw new NotFoundException('Encomenda não encontrada');

    const residents = await this.prisma.user.findMany({
      where: {
        unitId: delivery.unitId,
        role: 'MORADOR',
        active: true,
      },
      select: { id: true, name: true, photoUrl: true },
      orderBy: { name: 'asc' },
    });

    return residents;
  }

  /**
   * Retirada via totem (sem autenticação JWT, usa código da encomenda)
   * Agora aceita múltiplas fotos e identificação de quem retirou
   */
  async withdrawFromTotem(code: string, photoUrls: string[] = [], withdrawnById?: string, tenantId?: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        ...(tenantId ? { tenantId } : {}),
        OR: [{ code }, { qrcode: code }],
      },
      include: { user: true, unit: true, location: true },
    });

    if (!delivery) throw new NotFoundException('Encomenda não encontrada');
    if (delivery.status === 'WITHDRAWN') throw new BadRequestException('Encomenda já foi retirada');

    // Se withdrawnById informado, verifica se é morador da mesma unidade
    const actualWithdrawnById = withdrawnById || delivery.userId;
    if (withdrawnById && withdrawnById !== delivery.userId) {
      const withdrawnByUser = await this.prisma.user.findUnique({
        where: { id: withdrawnById },
        select: { unitId: true, name: true },
      });
      if (!withdrawnByUser || withdrawnByUser.unitId !== delivery.unitId) {
        throw new BadRequestException('Apenas moradores da mesma unidade podem retirar esta encomenda');
      }
    }

    const mainPhotoUrl = photoUrls[0] || undefined;

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'WITHDRAWN',
        withdrawnAt: new Date(),
        withdrawnById: actualWithdrawnById,
        ...(mainPhotoUrl ? { withdrawPhotoUrl: mainPhotoUrl } : {}),
      },
      include: { user: true, unit: true, withdrawnBy: { select: { id: true, name: true } } },
    });

    // Registrar evento principal de retirada
    await this.prisma.deliveryEvent.create({
      data: {
        deliveryId: delivery.id,
        userId: actualWithdrawnById,
        type: 'WITHDRAWN',
        photoUrl: mainPhotoUrl,
        metadata: JSON.stringify({
          withdrawnAt: new Date().toISOString(),
          source: 'TOTEM',
          withdrawnById: actualWithdrawnById,
          isOriginalOwner: actualWithdrawnById === delivery.userId,
          totalPhotos: photoUrls.length,
        }),
      },
    });

    // Registrar cada foto capturada como evento separado para audit trail
    for (let i = 0; i < photoUrls.length; i++) {
      await this.prisma.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          userId: actualWithdrawnById,
          type: 'TOTEM_PHOTO_CAPTURED',
          photoUrl: photoUrls[i],
          metadata: JSON.stringify({
            photoIndex: i,
            photoType: i === 0 ? 'face' : i === 1 ? 'package_with_person' : 'additional',
            capturedAt: new Date().toISOString(),
            source: 'TOTEM',
          }),
        },
      });
    }

    // Se outro morador retirou (não o dono), registrar evento especial
    if (actualWithdrawnById !== delivery.userId) {
      await this.prisma.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          userId: actualWithdrawnById,
          type: 'TOTEM_OTHER_RESIDENT',
          photoUrl: mainPhotoUrl,
          metadata: JSON.stringify({
            originalOwnerId: delivery.userId,
            originalOwnerName: delivery.user.name,
            withdrawnById: actualWithdrawnById,
          }),
        },
      });
    }

    if (delivery.user.phone) {
      try {
        const whatsappToken = await this.tenantConfigService.getWhatsappToken(delivery.tenantId);
        const withdrawnByName = actualWithdrawnById !== delivery.userId
          ? (await this.prisma.user.findUnique({ where: { id: actualWithdrawnById }, select: { name: true } }))?.name || 'outro morador'
          : delivery.user.name;

        const extraMsg = actualWithdrawnById !== delivery.userId
          ? `\n👤 Retirada por: ${withdrawnByName} (morador da mesma unidade)`
          : '';

        await this.whatsappService.sendMessageWithToken(
          delivery.user.phone,
          `✅ *Encomenda Retirada (Totem)*\n\nOlá ${delivery.user.name},\nSua encomenda (${delivery.code}) foi retirada via totem.${extraMsg}\n\nData: ${new Date().toLocaleString('pt-BR')}`,
          whatsappToken,
        );
      } catch (error) {
        this.logger.error(`Erro ao enviar WhatsApp de retirada (totem): ${error.message}`);
      }
    }

    try {
      const doorResult = await this.hikvisionService.openDoor(delivery.tenantId, 1);
      await this.prisma.deliveryEvent.create({
        data: {
          deliveryId: delivery.id,
          userId: actualWithdrawnById,
          type: 'DOOR_ACCESS',
          metadata: JSON.stringify({
            source: 'TOTEM',
            tenantId: delivery.tenantId,
            doorNo: 1,
            success: doorResult.success,
            message: doorResult.message,
          }),
        },
      });
    } catch (error: any) {
      this.logger.warn(`[Totem] Falha ao destravar porta do tenant ${delivery.tenantId}: ${error.message}`);
    }

    // Remove moradores da unidade do equipamento Hikvision se não houver mais encomendas pendentes
    this.hikvisionService.unsyncUnitResidentsIfNoPending(delivery.tenantId, delivery.unitId).catch((err) => {
      this.logger.warn(`[Hikvision] Falha ao remover moradores do equipamento após retirada (totem): ${err.message}`);
    });

    return updated;
  }

  /**
   * Audit logs - retorna eventos detalhados de todas as encomendas (somente ADMIN/ADMIN_CONDOMINIO)
   */
  async getAuditLogs(tenantId: string, role: string, filters?: { deliveryId?: string; type?: string; from?: string; to?: string; unitId?: string }) {
    const isAdmin = role === 'ADMIN';
    const where: any = {};

    if (!isAdmin) {
      where.delivery = { tenantId };
    }

    if (filters?.deliveryId) {
      where.deliveryId = filters.deliveryId;
    }
    if (filters?.unitId) {
      if (where.delivery) {
        where.delivery.unitId = filters.unitId;
      } else {
        where.delivery = { unitId: filters.unitId };
      }
    }
    if (filters?.type) {
      where.type = filters.type;
    }
    if (filters?.from || filters?.to) {
      where.createdAt = {};
      if (filters.from) where.createdAt.gte = new Date(filters.from);
      if (filters.to) where.createdAt.lte = new Date(filters.to);
    }

    return this.prisma.deliveryEvent.findMany({
      where,
      include: {
        delivery: {
          select: {
            id: true,
            code: true,
            status: true,
            photoUrl: true,
            withdrawPhotoUrl: true,
            user: { select: { id: true, name: true, photoUrl: true } },
            unit: { select: { id: true, number: true, block: true, type: true } },
            withdrawnBy: { select: { id: true, name: true, photoUrl: true } },
          },
        },
        user: { select: { id: true, name: true, photoUrl: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
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
