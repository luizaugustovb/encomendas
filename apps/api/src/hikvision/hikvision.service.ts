import { Injectable, Logger, Inject, forwardRef, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { TenantConfigService } from '../tenant-config/tenant-config.service';
import axios, { AxiosInstance } from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import FormData from 'form-data';
import sharp from 'sharp';

// Agente HTTPS que ignora certificados autoassinados (comum em dispositivos Hikvision)
const httpsAgentInsecure = new https.Agent({ rejectUnauthorized: false });

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface HikvisionConfig {
  ip: string;
  port: number;
  user: string;
  password: string;
}

export interface HikvisionUserInfo {
  employeeNo: string;
  name: string;
  userType?: string;
  Valid?: {
    enable: boolean;
    beginTime: string;
    endTime: string;
  };
  doorRight?: string;
  RightPlan?: Array<{ doorNo: number; planTemplateNo: string }>;
}

export interface HikvisionAccessEvent {
  eventType: string;
  employeeNoString: string;
  name: string;
  time: string;
  doorNo: number;
  cardNo?: string;
  type?: number;
  serialNo?: number;
}

export interface SyncResult {
  total: number;
  synced: number;
  failed: number;
  errors: Array<{ userId: string; name: string; error: string }>;
}

// ── Serviço ────────────────────────────────────────────────────────────────

@Injectable()
export class HikvisionService implements OnModuleInit {
  private readonly logger = new Logger(HikvisionService.name);

  /** Map: tenantId → AbortController (para parar alertStream) */
  private activeStreams = new Map<string, AbortController>();

  /** Cache de WWW-Authenticate por ip:porta para evitar 401 em POSTs com corpo */
  private authCache = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    @Inject(forwardRef(() => TenantConfigService))
    private tenantConfigService: TenantConfigService,
  ) { }

  /**
   * Ao iniciar o módulo, ativa a escuta de eventos para todos os tenants configurados
   */
  async onModuleInit() {
    this.logger.log('Iniciando Hikvision Event Streams...');
    try {
      const configs = await this.prisma.tenantConfig.findMany({
        where: { hikvisionEnabled: true },
      });

      for (const config of configs) {
        this.startEventStream(config.tenantId).catch(err => {
          this.logger.error(`Falha ao iniciar stream para tenant ${config.tenantId}: ${err.message}`);
        });
      }
    } catch (error) {
      this.logger.error(`Erro ao buscar configurações Hikvision: ${error.message}`);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  /**
   * Traduz erros de rede em mensagens legíveis
   */
  private translateConnectionError(error: any, ip: string, port: number): string {
    const code = error.code || error.cause?.code;
    const portStr = `${ip}:${port}`;
    switch (code) {
      case 'ECONNRESET':
        return `Conexão resetada pelo dispositivo em ${portStr}. Se a porta for 443, o sistema já usa HTTPS automaticamente. Verifique se as credenciais estão corretas.`;
      case 'ECONNREFUSED':
        return `Dispositivo recusou conexão em ${portStr}. Verifique IP e porta nas configurações do equipamento.`;
      case 'ETIMEDOUT':
      case 'ECONNABORTED':
        return `Timeout ao conectar em ${portStr}. O dispositivo não respondeu a tempo.`;
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return `Dispositivo inacessível em ${portStr}. Verifique a rede ou VPN/WireGuard.`;
      case 'ENOTFOUND':
        return `Endereço ${ip} não encontrado. Verifique o IP ou hostname configurado.`;
      case 'DEPTH_ZERO_SELF_SIGNED_CERT':
      case 'CERT_HAS_EXPIRED':
      case 'ERR_TLS_CERT_ALTNAME_INVALID':
        return `Erro de certificado SSL em ${portStr}. Isso é esperado em dispositivos Hikvision — tente novamente.`;
      default:
        return error.message || 'Erro desconhecido';
    }
  }

  /**
   * Calcula o header Digest Authorization a partir do WWW-Authenticate challenge
   */
  private computeDigestAuth(
    wwwAuth: string,
    method: string,
    uri: string,
    username: string,
    password: string,
  ): string {
    const realm = wwwAuth.match(/realm="([^"]*)"/)?.[1] || '';
    const nonce = wwwAuth.match(/nonce="([^"]*)"/)?.[1] || '';
    const qop = wwwAuth.match(/qop="([^"]*)"/)?.[1] || '';
    const opaque = wwwAuth.match(/opaque="([^"]*)"/)?.[1] || '';

    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');

    const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

    let response: string;
    if (qop) {
      response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
        .digest('hex');
    } else {
      response = crypto.createHash('md5')
        .update(`${ha1}:${nonce}:${ha2}`)
        .digest('hex');
    }

    let header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) header += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
    if (opaque) header += `, opaque="${opaque}"`;

    return header;
  }

  private createClient(config: HikvisionConfig, timeoutMs = 45000): AxiosInstance {
    const port = config.port || 80;
    const isHttps = port === 443 || config.ip.startsWith('https://');

    let baseURL: string;
    if (config.ip.startsWith('http://') || config.ip.startsWith('https://')) {
      baseURL = config.ip;
    } else if (isHttps) {
      baseURL = `https://${config.ip}${port === 443 ? '' : ':' + port}`;
    } else {
      baseURL = `http://${config.ip}${port === 80 ? '' : ':' + port}`;
    }

    // Chave de cache baseada no IP:porta para não misturar nonces entre equipamentos diferentes
    const cacheKey = `${config.ip}:${port}`;

    const client = axios.create({
      baseURL,
      timeout: timeoutMs,
      headers: { 'Content-Type': 'application/json' },
      validateStatus: (status) => status < 500,
      // Permite certificados autoassinados (Hikvision usa self-signed por padrão)
      httpsAgent: isHttps ? httpsAgentInsecure : undefined,
    });

    // Injeta auth cacheado se existir
    client.interceptors.request.use((req) => {
      if (this.authCache.has(cacheKey) && !req.headers['Authorization']) {
        const wwwAuth = this.authCache.get(cacheKey)!;
        const url = new URL(req.url!, req.baseURL);
        const uri = url.pathname + url.search;
        req.headers['Authorization'] = this.computeDigestAuth(
          wwwAuth, (req.method || 'GET').toUpperCase(), uri, config.user, config.password
        );
      }

      // Se estiver usando a ponte local (URL), envia a chave de segurança
      if (config.ip.startsWith('http')) {
        req.headers['x-bridge-key'] = process.env.BRIDGE_API_KEY || 'minha-chave-segura-123';
      }
      return req;
    });

    client.interceptors.response.use(async (response) => {
      if (response.status === 401 && response.headers['www-authenticate']) {
        const wwwAuth = response.headers['www-authenticate'];
        // Atualiza cache com o novo desafio (nonce) por IP:porta
        this.authCache.set(cacheKey, wwwAuth);

        const originalConfig = response.config;

        // Extrai o path da URL para o cálculo do Digest
        const url = new URL(originalConfig.url!, originalConfig.baseURL);
        const uri = url.pathname + url.search;

        const authHeader = this.computeDigestAuth(
          wwwAuth,
          (originalConfig.method || 'GET').toUpperCase(),
          uri,
          config.user,
          config.password,
        );

        // Reenvia a requisição com o header Digest
        originalConfig.headers['Authorization'] = authHeader;

        // Mantém a chave da ponte no retry
        if (config.ip.startsWith('http')) {
          originalConfig.headers['x-bridge-key'] = process.env.BRIDGE_API_KEY || 'minha-chave-segura-123';
        }

        // Agora queremos que erros reais (4xx/5xx) sejam lançados normalmente
        originalConfig.validateStatus = (status) => status < 500;

        try {
          const retryResponse = await axios.request(originalConfig);

          // Se o retry também retornou 401, as credenciais estão erradas
          if (retryResponse.status === 401) {
            // Invalida cache para forçar novo desafio na próxima vez
            this.authCache.delete(cacheKey);
            const error: any = new Error(`Credenciais inválidas para ${config.ip} (usuário: ${config.user})`);
            error.response = retryResponse;
            throw error;
          }

          if (retryResponse.status >= 400) {
            const error: any = new Error(`Request failed with status ${retryResponse.status}`);
            error.response = retryResponse;
            throw error;
          }

          return retryResponse;
        } catch (retryError: any) {
          // Propaga o erro melhorado
          if (retryError.response?.status === 401 || retryError.message?.includes('Credenciais')) {
            this.authCache.delete(cacheKey);
          }
          if (retryError.code === 'ERR_BAD_RESPONSE' || retryError.response?.status === 401) {
            throw new Error(`Credenciais inválidas para ${config.ip} (usuário: ${config.user})`);
          }
          throw retryError;
        }
      }

      // Se não for 401, verifica se é um status de erro
      if (response.status >= 400) {
        const error: any = new Error(`Request failed with status ${response.status}`);
        error.response = response;
        throw error;
      }

      return response;
    });

    return client;
  }

  /** Monta a URL base do equipamento */
  private getBaseUrl(config: HikvisionConfig): string {
    return config.ip.startsWith('http')
      ? config.ip
      : `http://${config.ip}:${config.port}`;
  }

  /** Obtém config Hikvision do tenant ou lança erro */
  private async getConfigOrFail(tenantId: string): Promise<HikvisionConfig> {
    const config = await this.tenantConfigService.getHikvisionConfig(tenantId);
    if (!config || !config.ip) {
      throw new Error('Hikvision não configurado ou desabilitado para este condomínio');
    }
    return {
      ip: config.ip,
      port: config.port || 80,
      user: config.user || 'admin',
      password: config.password || '',
      tenantId,
    } as any;
  }

  /** Gera employeeNo sequencial único para o tenant */
  private async generateEmployeeNo(tenantId: string): Promise<string> {
    const lastUser = await this.prisma.user.findFirst({
      where: { tenantId, hikvisionEmployeeNo: { not: null } },
      orderBy: { hikvisionEmployeeNo: 'desc' },
      select: { hikvisionEmployeeNo: true },
    });
    const lastNo = lastUser?.hikvisionEmployeeNo
      ? parseInt(lastUser.hikvisionEmployeeNo, 10)
      : 0;
    return String(lastNo + 1).padStart(6, '0');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. CONEXÃO / DEVICE INFO
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Testa conexão e retorna informações do dispositivo
   */
  async testConnection(config: HikvisionConfig): Promise<{
    success: boolean;
    message: string;
    deviceName?: string;
    deviceModel?: string;
    deviceInfo?: any;
  }> {
    const client = this.createClient(config);

    try {
      const response = await client.request({
        method: 'GET',
        url: `/ISAPI/System/deviceInfo`,
        headers: { Accept: 'application/xml' },
      });

      const xmlData = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

      // Extrai deviceName e model do XML retornado
      const deviceNameMatch = xmlData.match(/<deviceName>([^<]*)<\/deviceName>/);
      const modelMatch = xmlData.match(/<model>([^<]*)<\/model>/);
      const deviceName = deviceNameMatch?.[1] || 'Desconhecido';
      const deviceModel = modelMatch?.[1] || '';

      this.logger.log(`Hikvision conexão OK: ${config.ip}:${config.port} - ${deviceName} (${deviceModel})`);

      const modelInfo = deviceModel ? ` (${deviceModel})` : '';
      return {
        success: true,
        message: `Conexão estabelecida com sucesso! Equipamento: ${deviceName}${modelInfo}`,
        deviceName,
        deviceModel,
        deviceInfo: response.data,
      };
    } catch (error) {
      const msg =
        error.code === 'ECONNREFUSED'
          ? `Equipamento não encontrado em ${config.ip}:${config.port}`
          : error.code === 'ETIMEDOUT'
            ? `Tempo esgotado ao conectar em ${config.ip}:${config.port}`
            : error.response?.status === 401
              ? 'Credenciais inválidas (usuário/senha incorretos)'
              : `Erro de conexão: ${error.message}`;

      this.logger.error(`Hikvision teste falhou: ${msg}`);
      return { success: false, message: msg };
    }
  }

  /**
   * Retorna capacidades do equipamento
   */
  async getDeviceCapabilities(tenantId: string) {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config);

    const response = await client.request({
      method: 'GET',
      url: `/ISAPI/AccessControl/capabilities`,
      headers: { Accept: 'application/json' },
    });
    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. GESTÃO DE USUÁRIOS NO EQUIPAMENTO
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Cria/atualiza um usuário no equipamento Hikvision (ISAPI/AccessControl/UserInfo/Record)
   */
  async createDeviceUser(
    config: HikvisionConfig,
    userInfo: HikvisionUserInfo,
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.createClient(config);

    try {
      await client.request({
        method: 'POST',
        url: `/ISAPI/AccessControl/UserInfo/Record?format=json`,
        headers: { 'Content-Type': 'application/json' },
        data: {
          UserInfo: {
            employeeNo: userInfo.employeeNo,
            name: userInfo.name,
            userType: userInfo.userType || 'normal',
            Valid: userInfo.Valid || {
              enable: true,
              beginTime: '2024-01-01T00:00:00',
              endTime: '2030-12-31T23:59:59',
            },
            doorRight: userInfo.doorRight || '1',
            RightPlan: userInfo.RightPlan || [
              { doorNo: 1, planTemplateNo: '1' },
            ],
          },
        },
      });

      this.logger.log(`Usuário ${userInfo.employeeNo} (${userInfo.name}) criado no dispositivo`);
      return { success: true };
    } catch (error) {
      const subStatusCode = error.response?.data?.subStatusCode || '';
      if (subStatusCode === 'employeeNoAlreadyUserExist' || subStatusCode === 'employeeNoAlreadyExist') {
        this.logger.log(`Usuário ${userInfo.employeeNo} já existe. Tentando atualizar dados via Modify...`);
        try {
          await client.request({
            method: 'PUT',
            url: `/ISAPI/AccessControl/UserInfo/Modify?format=json`,
            headers: { 'Content-Type': 'application/json' },
            data: {
              UserInfo: {
                employeeNo: userInfo.employeeNo,
                name: userInfo.name,
                userType: userInfo.userType || 'normal',
                // Mantemos o resto padrão ou conforme necessário
              },
            },
          });
          return { success: true };
        } catch (updateError) {
          const updateErrMsg = updateError.response?.data?.statusString || updateError.message;
          this.logger.error(`Erro ao atualizar usuário existente ${userInfo.employeeNo}: ${updateErrMsg}`);
          return { success: false, error: updateErrMsg };
        }
      }

      const errMsg = error.response?.data?.statusString || error.message;
      this.logger.error(`Erro ao criar usuário ${userInfo.employeeNo} no dispositivo: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Busca usuários cadastrados no equipamento
   */
  async searchDeviceUsers(
    config: HikvisionConfig,
    options?: { searchPosition?: number; maxResults?: number },
  ): Promise<{ totalMatches: number; users: any[] }> {
    const client = this.createClient(config);

    const response = await client.request({
      method: 'POST',
      url: `/ISAPI/AccessControl/UserInfo/Search?format=json`,
      headers: { 'Content-Type': 'application/json' },
      data: {
        UserInfoSearchCond: {
          searchID: Date.now().toString(),
          searchResultPosition: options?.searchPosition || 0,
          maxResults: options?.maxResults || 30,
        },
      },
    });

    const data = (response.data as any)?.UserInfoSearch || {};
    return {
      totalMatches: data.totalMatches || 0,
      users: data.UserInfo || [],
    };
  }

  /**
   * Remove um usuário do equipamento
   */
  async deleteDeviceUser(
    config: HikvisionConfig,
    employeeNo: string,
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.createClient(config);

    try {
      await client.request({
        method: 'PUT',
        url: `/ISAPI/AccessControl/UserInfo/Delete?format=json`,
        headers: { 'Content-Type': 'application/json' },
        data: {
          UserInfoDelCond: {
            EmployeeNoList: [{ employeeNo }],
          },
        },
      });

      this.logger.log(`Usuário ${employeeNo} removido do dispositivo`);
      return { success: true };
    } catch (error) {
      const errMsg = error.response?.data?.statusString || error.message;
      this.logger.error(`Erro ao remover usuário ${employeeNo}: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. FACE (CADASTRO DE FOTO FACIAL)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Envia foto facial para o equipamento (multipart form-data)
   * POST /ISAPI/Intelligent/FDLib/FaceDataRecord?format=json
   */
  async uploadFacePhoto(
    config: HikvisionConfig,
    employeeNo: string,
    photoPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    if (!fs.existsSync(photoPath)) {
      return { success: false, error: `Arquivo não encontrado: ${photoPath}` };
    }

    const url = `/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json`;
    const form = new FormData();

    // Redimensiona e comprime a foto para < 200KB (limite Hikvision)
    let photoBuffer: Buffer;
    try {
      photoBuffer = await sharp(photoPath)
        .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      this.logger.log(`Foto processada pelo Sharp: ${photoBuffer.length} bytes`);
    } catch (e) {
      this.logger.error(`Erro ao processar foto com Sharp: ${e.message}`);
      photoBuffer = fs.readFileSync(photoPath);
    }

    // Metadados em JSON (formato padrão ISAPI)
    const jsonMetadata = JSON.stringify({
      faceLibType: 'blackFD',
      FDID: '1',
      FPID: employeeNo,
    });

    form.append('FaceDataRecord', jsonMetadata, {
      contentType: 'application/json',
    });

    // Foto JPG (campo 'img' é o padrão ISAPI)
    form.append('img', photoBuffer, {
      filename: `${employeeNo}.jpg`,
      contentType: 'image/jpeg',
    });

    try {
      this.logger.log(`Enviando face de ${employeeNo} para o dispositivo (Arquivo: ${photoPath})...`);
      const client = this.createClient(config);
      const response = await client.post(url, form, {
        headers: form.getHeaders(),
      });

      this.logger.log(`Face de ${employeeNo} enviada com sucesso. Resposta: ${JSON.stringify(response.data)}`);
      return { success: true };
    } catch (error) {
      const respData = error.response?.data;
      const errMsg = respData?.statusString || error.message;
      const subCode = respData?.subStatusCode || '';

      this.logger.error(`Erro ao enviar face ${employeeNo}: ${errMsg} (SubCode: ${subCode}). Dados completos: ${JSON.stringify(respData)}`);
      return { success: false, error: `${errMsg}${subCode ? ' - ' + subCode : ''}` };
    }
  }

  /**
   * Remove foto facial do equipamento
   */
  async deleteFacePhoto(
    config: HikvisionConfig,
    employeeNo: string,
  ): Promise<{ success: boolean; error?: string }> {
    const client = this.createClient(config);

    try {
      await client.request({
        method: 'PUT',
        url: `/ISAPI/Intelligent/FDLib/FDSearch/Delete?format=json`,
        headers: { 'Content-Type': 'application/json' },
        data: {
          FaceInfoDelCond: {
            FPID: [employeeNo],
          },
        },
      });
      this.logger.log(`Face ${employeeNo} removida do dispositivo`);
      return { success: true };
    } catch (error) {
      const errMsg = error.response?.data?.statusString || error.message;
      return { success: false, error: errMsg };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. CONTROLE DE PORTA
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Abre porta remota via ISAPI
   */
  async openDoor(
    tenantId: string,
    doorNo: number = 1,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfigOrFail(tenantId);
    return this.openDoorWithConfig(String(doorNo), config);
  }

  /**
   * Abre porta via ISAPI com config direta
   */
  async openDoorWithConfig(
    doorId: string,
    config: HikvisionConfig,
  ): Promise<{ success: boolean; message: string }> {
    // Timeout curto para operações de porta (não pode ficar 45s no ar)
    const client = this.createClient(config, 10000);
    const port = (config as any).port || 80;
    const target = `${config.ip}:${port}`;

    try {
      await client.request({
        method: 'PUT',
        url: `/ISAPI/AccessControl/RemoteControl/door/${doorId}`,
        headers: { 'Content-Type': 'application/xml' },
        data: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
      });

      this.logger.log(`Porta ${doorId} aberta via ${target}`);
      return { success: true, message: `Porta ${doorId} aberta com sucesso` };
    } catch (error) {
      const msg = this.translateConnectionError(error, config.ip, port);
      this.logger.error(`Erro ao abrir porta ${doorId} em ${target} (user: ${config.user}): ${msg}`);
      return { success: false, message: msg };
    }
  }

  /**
   * Fecha porta remota
   */
  async closeDoor(
    tenantId: string,
    doorNo: number = 1,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config, 10000);
    const port = (config as any).port || 80;

    try {
      await client.request({
        method: 'PUT',
        url: `/ISAPI/AccessControl/RemoteControl/door/${doorNo}`,
        headers: { 'Content-Type': 'application/xml' },
        data: '<RemoteControlDoor><cmd>close</cmd></RemoteControlDoor>',
      });

      return { success: true, message: `Porta ${doorNo} fechada com sucesso` };
    } catch (error) {
      return { success: false, message: this.translateConnectionError(error, config.ip, port) };
    }
  }

  /**
   * Mantém porta aberta (always open)
   */
  async keepDoorOpen(
    tenantId: string,
    doorNo: number = 1,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config, 10000);
    const port = (config as any).port || 80;

    try {
      await client.request({
        method: 'PUT',
        url: `/ISAPI/AccessControl/RemoteControl/door/${doorNo}`,
        headers: { 'Content-Type': 'application/xml' },
        data: '<RemoteControlDoor><cmd>alwaysOpen</cmd></RemoteControlDoor>',
      });

      return { success: true, message: `Porta ${doorNo} em modo permanentemente aberta` };
    } catch (error) {
      return { success: false, message: this.translateConnectionError(error, config.ip, port) };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. EVENTOS DE ACESSO
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Busca logs de eventos de acesso (POST /ISAPI/AccessControl/AcsEvent)
   */
  async getAccessEvents(
    tenantId: string,
    options?: {
      startTime?: string;
      endTime?: string;
      employeeNo?: string;
      maxResults?: number;
    },
  ): Promise<{ total: number; events: HikvisionAccessEvent[] }> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config);

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const searchCond: any = {
      searchID: Date.now().toString(),
      searchResultPosition: 0,
      maxResults: options?.maxResults || 50,
      major: 0, // 0 = all events
      minor: 0,
      startTime: options?.startTime || startOfDay.toISOString().slice(0, 19),
      endTime: options?.endTime || now.toISOString().slice(0, 19),
    };

    if (options?.employeeNo) {
      searchCond.employeeNoString = options.employeeNo;
    }

    const response = await client.request({
      method: 'POST',
      url: `/ISAPI/AccessControl/AcsEvent?format=json`,
      headers: { 'Content-Type': 'application/json' },
      data: { AcsEventCond: searchCond },
    });

    const data = (response.data as any)?.AcsEvent || {};
    return {
      total: data.totalMatches || 0,
      events: data.InfoList || [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. ALERTSTREAM — EVENTOS EM TEMPO REAL
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Inicia escuta de eventos em tempo real via alertStream.
   * Quando reconhece um morador (employeeNo), verifica encomendas pendentes
   * e envia notificação via WhatsApp.
   */
  async startEventStream(tenantId: string): Promise<{ success: boolean; message: string }> {
    if (this.activeStreams.has(tenantId)) {
      return { success: false, message: 'Stream já está ativo para este condomínio' };
    }

    const config = await this.getConfigOrFail(tenantId);
    const controller = new AbortController();
    this.activeStreams.set(tenantId, controller);

    // Executa em background (não bloqueia)
    this.listenAlertStream(tenantId, config, controller.signal).catch((err) => {
      this.logger.error(`AlertStream encerrado para tenant ${tenantId}: ${err.message}`);
      this.activeStreams.delete(tenantId);
    });

    this.logger.log(`AlertStream iniciado para tenant ${tenantId}`);
    return { success: true, message: 'Escuta de eventos em tempo real iniciada' };
  }

  /**
   * Para a escuta de eventos em tempo real
   */
  stopEventStream(tenantId: string): { success: boolean; message: string } {
    const controller = this.activeStreams.get(tenantId);
    if (!controller) {
      return { success: false, message: 'Nenhum stream ativo para este condomínio' };
    }

    controller.abort();
    this.activeStreams.delete(tenantId);
    this.logger.log(`AlertStream parado para tenant ${tenantId}`);
    return { success: true, message: 'Escuta de eventos em tempo real parada' };
  }

  /**
   * Retorna status de todos os streams ativos
   */
  getActiveStreams(): { tenantId: string }[] {
    return Array.from(this.activeStreams.keys()).map((tenantId) => ({ tenantId }));
  }

  /**
   * Loop interno de escuta do alertStream (GET /ISAPI/Event/notification/alertStream)
   */
  private async listenAlertStream(
    tenantId: string,
    config: HikvisionConfig,
    signal: AbortSignal,
  ): Promise<void> {
    const client = this.createClient(config);

    const response = await client.get('/ISAPI/Event/notification/alertStream', {
      responseType: 'stream',
      timeout: 0, // sem timeout, stream contínuo
      signal,
    });

    const stream = response.data;
    let buffer = '';

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();

      // Tenta extrair JSON events do buffer (boundary multipart)
      const jsonMatches = buffer.match(/\{[\s\S]*?"eventType"[\s\S]*?\}/g);
      if (jsonMatches) {
        for (const jsonStr of jsonMatches) {
          try {
            const event = JSON.parse(jsonStr);
            this.handleRealtimeEvent(tenantId, event);
          } catch {
            // JSON incompleto, ignora
          }
        }
        // Limpa o buffer processado
        const lastIndex = buffer.lastIndexOf('}');
        buffer = buffer.substring(lastIndex + 1);
      }
    });

    return new Promise((resolve, reject) => {
      stream.on('end', () => resolve());
      stream.on('error', (err: Error) => reject(err));
      signal.addEventListener('abort', () => {
        stream.destroy();
        resolve();
      });
    });
  }

  /**
   * Processa evento recebido em tempo real do alertStream
   */
  private async handleRealtimeEvent(tenantId: string, event: any): Promise<void> {
    this.logger.log(`[AlertStream ${tenantId}] Evento: ${JSON.stringify(event)}`);

    const employeeNo = event.employeeNoString || event.employeeNo;
    if (!employeeNo) return;

    try {
      // Busca o usuário pelo employeeNo
      const user = await this.prisma.user.findFirst({
        where: {
          tenantId,
          hikvisionEmployeeNo: String(employeeNo),
          active: true,
        },
        include: { unit: true },
      });

      if (!user) {
        this.logger.warn(`[AlertStream] employeeNo ${employeeNo} não encontrado no sistema`);
        return;
      }

      // Conta encomendas pendentes
      const pendingCount = await this.prisma.delivery.count({
        where: { userId: user.id, status: 'PENDING' },
      });

      const doorNo = event.doorNo || 1;

      if (pendingCount > 0) {
        // ✅ TEM ENCOMENDA → Abre a porta e notifica
        this.logger.log(`[AlertStream] ${user.name} tem ${pendingCount} encomenda(s) - ABRINDO PORTA ${doorNo}`);

        await this.openDoor(tenantId, doorNo);

        // Registra evento de acesso com abertura
        const pendingDelivery = await this.prisma.delivery.findFirst({
          where: { userId: user.id, status: 'PENDING' },
          orderBy: { createdAt: 'asc' },
        });

        await this.prisma.deliveryEvent.create({
          data: {
            deliveryId: pendingDelivery?.id || (await this.getAnyDeliveryId(user.id)),
            userId: user.id,
            type: 'DOOR_ACCESS',
            metadata: JSON.stringify({
              source: 'hikvision_alertstream',
              eventType: event.eventType,
              doorNo,
              time: event.time || new Date().toISOString(),
              employeeNo,
              doorOpened: true,
              pendingCount,
            }),
          },
        });

        // Envia WhatsApp avisando das encomendas
        if (user.phone) {
          const whatsappToken = await this.tenantConfigService.getWhatsappToken(tenantId);
          const msg = pendingCount === 1
            ? `📦 Olá ${user.name}! A porta foi liberada. Você tem *1 encomenda* pendente de retirada na portaria. Retire assim que possível!`
            : `📦 Olá ${user.name}! A porta foi liberada. Você tem *${pendingCount} encomendas* pendentes de retirada na portaria. Retire assim que possível!`;

          await this.whatsappService.sendMessageWithToken(user.phone, msg, whatsappToken);
          this.logger.log(`[AlertStream] WhatsApp enviado para ${user.name} - ${pendingCount} encomenda(s)`);
        }
      } else {
        // ❌ SEM ENCOMENDA → Porta NÃO abre
        this.logger.log(`[AlertStream] ${user.name} SEM encomendas - porta ${doorNo} NÃO liberada`);

        // Registra tentativa de acesso sem abertura
        const anyDeliveryId = await this.getAnyDeliveryId(user.id);
        if (anyDeliveryId) {
          await this.prisma.deliveryEvent.create({
            data: {
              deliveryId: anyDeliveryId,
              userId: user.id,
              type: 'DOOR_ACCESS',
              metadata: JSON.stringify({
                source: 'hikvision_alertstream',
                eventType: event.eventType,
                doorNo,
                time: event.time || new Date().toISOString(),
                employeeNo,
                doorOpened: false,
                reason: 'Nenhuma encomenda pendente',
              }),
            },
          });
        }
      }
    } catch (error) {
      this.logger.error(`[AlertStream] Erro ao processar evento: ${error.message}`);
    }
  }

  /** Retorna qualquer delivery id do user para vincular evento, ou cria um registro sem deliveryId */
  private async getAnyDeliveryId(userId: string): Promise<string> {
    const delivery = await this.prisma.delivery.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return delivery?.id || '';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 7. CALLBACK DE EVENTOS (recepção via HTTP POST do equipamento)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Processa evento enviado pelo equipamento via HTTP callback.
   * O equipamento é configurado para enviar eventos para:
   * POST http://SERVIDOR:3001/api/hikvision/event/:tenantId
   */
  async processEvent(tenantId: string, eventData: any) {
    this.logger.log(`[Callback ${tenantId}] Evento Hikvision: ${JSON.stringify(eventData)}`);
    await this.handleRealtimeEvent(tenantId, eventData);
    return { success: true };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8. SINCRONIZAÇÃO EM MASSA (USUÁRIOS + FACES)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sincroniza todos os moradores do tenant com o equipamento Hikvision.
   * Cria o usuário no dispositivo + envia foto facial se tiver.
   */
  async syncAllUsers(tenantId: string): Promise<SyncResult> {
    const config = await this.getConfigOrFail(tenantId);

    const users = await this.prisma.user.findMany({
      where: { tenantId, active: true, role: 'MORADOR' },
    });

    const result: SyncResult = { total: users.length, synced: 0, failed: 0, errors: [] };

    for (const user of users) {
      try {
        // Gera employeeNo se não tiver
        let employeeNo = user.hikvisionEmployeeNo;
        if (!employeeNo) {
          employeeNo = await this.generateEmployeeNo(tenantId);
          await this.prisma.user.update({
            where: { id: user.id },
            data: { hikvisionEmployeeNo: employeeNo },
          });
        }

        // Cria usuário no dispositivo
        const createResult = await this.createDeviceUser(config, {
          employeeNo,
          name: user.name,
        });

        if (!createResult.success) {
          result.failed++;
          result.errors.push({ userId: user.id, name: user.name, error: createResult.error || 'Erro desconhecido' });
          continue;
        }

        // Aguarda o processamento interno do dispositivo
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Envia foto facial se tiver
        if (user.photoUrl) {
          const photoFullPath = path.join(
            process.cwd(), user.photoUrl.replace(/^\//, ''),
          );
          if (fs.existsSync(photoFullPath)) {
            const faceResult = await this.uploadFacePhoto(config, employeeNo, photoFullPath);
            if (!faceResult.success) {
              this.logger.warn(`Face de ${user.name} falhou: ${faceResult.error}`);
            }
          }
        }

        // Marca como sincronizado
        await this.prisma.user.update({
          where: { id: user.id },
          data: { hikvisionSynced: true },
        });

        result.synced++;
      } catch (error) {
        result.failed++;
        result.errors.push({ userId: user.id, name: user.name, error: error.message });
      }
    }

    this.logger.log(
      `[Sync ${tenantId}] Total: ${result.total}, Sincronizados: ${result.synced}, Falhas: ${result.failed}`,
    );
    return result;
  }

  /**
   * Sincroniza um único usuário com o equipamento
   */
  async syncSingleUser(
    tenantId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string; employeeNo?: string }> {
    const config = await this.getConfigOrFail(tenantId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user) {
      return { success: false, message: 'Usuário não encontrado' };
    }

    let employeeNo = user.hikvisionEmployeeNo;
    const client = this.createClient(config);

    // Warm-up: Garante que o cache de Digest Auth está populado
    if (!this.authCache.has(tenantId)) {
      await client.get('/ISAPI/System/deviceInfo').catch(() => { });
    }
    if (!employeeNo) {
      employeeNo = await this.generateEmployeeNo(tenantId);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { hikvisionEmployeeNo: employeeNo },
      });
    }

    // Cria no dispositivo
    const createResult = await this.createDeviceUser(config, {
      employeeNo,
      name: user.name,
    });

    if (!createResult.success) {
      return { success: false, message: `Erro ao criar no dispositivo: ${createResult.error}` };
    }

    // Pequeno delay para o dispositivo processar a criação antes de receber a face
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Envia face
    if (user.photoUrl) {
      const photoFullPath = path.join(
        process.cwd(), user.photoUrl.replace(/^\//, ''),
      );
      this.logger.log(`[Sync] Iniciando envio de face para user ${user.name} (Emp No: ${employeeNo}). Arquivo: ${photoFullPath}`);
      if (fs.existsSync(photoFullPath)) {
        const faceResult = await this.uploadFacePhoto(config, employeeNo, photoFullPath);
        if (!faceResult.success) {
          this.logger.error(`[Sync] Falha ao enviar face de ${user.name}: ${faceResult.error}`);
          return {
            success: true,
            message: `Usuário criado no dispositivo, mas a face falhou: ${faceResult.error}`,
            employeeNo,
          };
        }
        this.logger.log(`[Sync] Face de ${user.name} sincronizada com sucesso`);
      } else {
        this.logger.warn(`[Sync] Arquivo de foto não encontrado: ${photoFullPath}`);
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { hikvisionSynced: true },
    });

    return {
      success: true,
      message: `Usuário ${user.name} sincronizado com sucesso (employeeNo: ${employeeNo})`,
      employeeNo,
    };
  }

  /**
   * Remove um usuário do equipamento e desmarca sincronia
   */
  async unsyncUser(
    tenantId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const config = await this.getConfigOrFail(tenantId);

    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user || !user.hikvisionEmployeeNo) {
      return { success: false, message: 'Usuário não sincronizado com Hikvision' };
    }

    // Remove do dispositivo
    await this.deleteDeviceUser(config, user.hikvisionEmployeeNo);
    await this.deleteFacePhoto(config, user.hikvisionEmployeeNo);

    // Desmarca no banco
    await this.prisma.user.update({
      where: { id: user.id },
      data: { hikvisionSynced: false, hikvisionEmployeeNo: null },
    });

    return { success: true, message: `Usuário ${user.name} removido do dispositivo` };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 8.5 SINCRONIZAÇÃO DE MORADORES POR UNIDADE (FLUXO DE ENCOMENDAS)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Sincroniza todos os moradores ativos de uma unidade com o equipamento.
   * Chamado quando uma encomenda é cadastrada para a unidade.
   */
  async syncUnitResidents(
    tenantId: string,
    unitId: string,
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    const config = await this.getConfigOrFail(tenantId);
    const residents = await this.prisma.user.findMany({
      where: { tenantId, unitId, role: 'MORADOR', active: true },
    });

    const result = { synced: 0, failed: 0, errors: [] as string[] };

    for (const resident of residents) {
      // Pula se já está sincronizado no equipamento
      if (resident.hikvisionSynced) {
        this.logger.log(`[SyncUnit] Morador ${resident.name} já sincronizado, pulando`);
        result.synced++;
        continue;
      }

      try {
        let employeeNo = resident.hikvisionEmployeeNo;
        if (!employeeNo) {
          employeeNo = await this.generateEmployeeNo(tenantId);
          await this.prisma.user.update({
            where: { id: resident.id },
            data: { hikvisionEmployeeNo: employeeNo },
          });
        }

        // Cria usuário no dispositivo
        const createResult = await this.createDeviceUser(config, {
          employeeNo,
          name: resident.name,
        });

        if (!createResult.success) {
          result.failed++;
          result.errors.push(`${resident.name}: ${createResult.error}`);
          continue;
        }

        // Delay para o dispositivo processar
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Envia foto facial se tiver
        if (resident.photoUrl) {
          const photoFullPath = path.join(
            process.cwd(), resident.photoUrl.replace(/^\//, ''),
          );
          if (fs.existsSync(photoFullPath)) {
            const faceResult = await this.uploadFacePhoto(config, employeeNo, photoFullPath);
            if (!faceResult.success) {
              this.logger.warn(`[SyncUnit] Face de ${resident.name} falhou: ${faceResult.error}`);
            }
          }
        }

        // Marca como sincronizado
        await this.prisma.user.update({
          where: { id: resident.id },
          data: { hikvisionSynced: true },
        });

        result.synced++;
        this.logger.log(`[SyncUnit] Morador ${resident.name} sincronizado (employeeNo: ${employeeNo})`);
      } catch (error) {
        result.failed++;
        result.errors.push(`${resident.name}: ${error.message}`);
      }
    }

    this.logger.log(
      `[SyncUnit] Unidade ${unitId}: ${result.synced} sincronizados, ${result.failed} falhas`,
    );
    return result;
  }

  /**
   * Remove moradores de uma unidade do equipamento SE não houver mais
   * encomendas pendentes para a unidade.
   * Chamado quando uma encomenda é retirada.
   */
  async unsyncUnitResidentsIfNoPending(
    tenantId: string,
    unitId: string,
  ): Promise<{ removed: number; kept: number; reason?: string }> {
    // Verifica se a unidade ainda tem encomendas pendentes
    const pendingCount = await this.prisma.delivery.count({
      where: { tenantId, unitId, status: 'PENDING' },
    });

    if (pendingCount > 0) {
      this.logger.log(
        `[UnsyncUnit] Unidade ${unitId} ainda tem ${pendingCount} encomenda(s) pendente(s). Mantendo moradores no equipamento.`,
      );
      return { removed: 0, kept: pendingCount, reason: `${pendingCount} encomendas pendentes` };
    }

    // Não há mais pendentes → remove todos os moradores da unidade do equipamento
    const config = await this.getConfigOrFail(tenantId);
    const residents = await this.prisma.user.findMany({
      where: { tenantId, unitId, role: 'MORADOR', hikvisionSynced: true },
    });

    let removed = 0;
    for (const resident of residents) {
      if (!resident.hikvisionEmployeeNo) continue;

      try {
        await this.deleteDeviceUser(config, resident.hikvisionEmployeeNo);
        await this.deleteFacePhoto(config, resident.hikvisionEmployeeNo);

        await this.prisma.user.update({
          where: { id: resident.id },
          data: { hikvisionSynced: false },
        });

        removed++;
        this.logger.log(`[UnsyncUnit] Morador ${resident.name} removido do equipamento`);
      } catch (error) {
        this.logger.error(`[UnsyncUnit] Erro ao remover ${resident.name}: ${error.message}`);
      }
    }

    this.logger.log(
      `[UnsyncUnit] Unidade ${unitId}: ${removed} moradores removidos do equipamento`,
    );
    return { removed, kept: 0 };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 9. AUTORIZAÇÃO DE ACESSO (verificar encomendas pendentes)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Verifica se um morador possui encomendas pendentes
   */
  async authorizeAccess(userId: string): Promise<{
    allow: boolean;
    reason: string;
    pendingCount: number;
  }> {
    const pendingDeliveries = await this.prisma.delivery.count({
      where: { userId, status: 'PENDING' },
    });

    if (pendingDeliveries > 0) {
      this.logger.log(`Usuário ${userId} - ${pendingDeliveries} encomenda(s) pendente(s)`);
      return {
        allow: true,
        reason: `Usuário possui ${pendingDeliveries} encomenda(s) pendente(s)`,
        pendingCount: pendingDeliveries,
      };
    }

    return {
      allow: false,
      reason: 'Nenhuma encomenda pendente',
      pendingCount: 0,
    };
  }

  /**
   * Busca por employeeNo (usado pelo equipamento via callback)
   */
  async authorizeByEmployeeNo(
    tenantId: string,
    employeeNo: string,
  ): Promise<{
    allow: boolean;
    reason: string;
    user?: { id: string; name: string };
    pendingCount: number;
  }> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, hikvisionEmployeeNo: employeeNo, active: true },
      select: { id: true, name: true },
    });

    if (!user) {
      return { allow: false, reason: 'Usuário não encontrado', pendingCount: 0 };
    }

    const result = await this.authorizeAccess(user.id);
    return { ...result, user };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 10. FACE LIBRARY (BIBLIOTECA FACIAL)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Lista bibliotecas faciais no equipamento
   */
  async listFaceLibraries(tenantId: string): Promise<any[]> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config);

    const response = await client.request({
      method: 'POST',
      url: `/ISAPI/Intelligent/FDLib?format=json`,
      headers: { 'Content-Type': 'application/json' },
      data: { FDID: 'all' },
    });

    return (response.data as any)?.FDLibList || [];
  }

  /**
   * Cria uma biblioteca facial
   */
  async createFaceLibrary(
    tenantId: string,
    name: string,
  ): Promise<{ success: boolean; FDID?: string }> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config);

    try {
      const response = await client.request({
        method: 'POST',
        url: `/ISAPI/Intelligent/FDLib?format=json`,
        headers: { 'Content-Type': 'application/json' },
        data: { FaceLib: { name, faceLibType: 'blackFD' } },
      });

      return { success: true, FDID: (response.data as any)?.FDID };
    } catch (error) {
      return { success: false };
    }
  }

  /**
   * Busca faces cadastradas em uma biblioteca
   */
  async searchFaces(
    tenantId: string,
    fdid: string = '1',
    options?: { maxResults?: number },
  ): Promise<{ totalMatches: number; faces: any[] }> {
    const config = await this.getConfigOrFail(tenantId);
    const client = this.createClient(config);

    const response = await client.request({
      method: 'POST',
      url: `/ISAPI/Intelligent/FDLib/FDSearch?format=json`,
      headers: { 'Content-Type': 'application/json' },
      data: {
        searchResultPosition: 0,
        maxResults: options?.maxResults || 30,
        FDID: fdid,
      },
    });

    return {
      totalMatches: (response.data as any)?.totalMatches || 0,
      faces: (response.data as any)?.MatchList || [],
    };
  }
}
