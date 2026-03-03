import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const FormData = require('form-data');

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  private get apiUrl(): string {
    return process.env.WHATSAPP_API_URL || 'https://api.viicio.com.br';
  }

  private get apiToken(): string {
    return process.env.WHATSAPP_API_TOKEN || '';
  }

  private isStubToken(token?: string): boolean {
    const t = token || this.apiToken;
    return !t || t === 'your-viicio-token-here';
  }

  /**
   * Envia mensagem de texto via WhatsApp (Viicio)
   */
  async sendMessage(phone: string, message: string): Promise<boolean> {
    return this.sendMessageWithToken(phone, message, this.apiToken);
  }

  /**
   * Envia mensagem com token específico (para uso por tenant)
   */
  async sendMessageWithToken(phone: string, message: string, token: string): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');

    if (this.isStubToken(token)) {
      this.logger.warn(`[WHATSAPP STUB] Texto para ${cleanPhone}: ${message}`);
      return true;
    }

    try {
      await axios.post(
        `${this.apiUrl}/api/messages/send`,
        {
          number: cleanPhone,
          body: message,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`WhatsApp (texto) enviado para ${cleanPhone}`);
      return true;
    } catch (error) {
      this.logger.error(`Erro ao enviar WhatsApp para ${cleanPhone}:`, error.message);
      return false;
    }
  }

  /**
   * Envia mensagem com mídia (imagem/PDF) via WhatsApp (Viicio)
   */
  async sendMedia(
    phone: string,
    message: string,
    mediaUrl: string,
  ): Promise<boolean> {
    return this.sendMediaWithToken(phone, message, mediaUrl, this.apiToken);
  }

  async sendMediaWithToken(
    phone: string,
    message: string,
    mediaUrl: string,
    token: string,
  ): Promise<boolean> {
    const cleanPhone = phone.replace(/\D/g, '');

    if (this.isStubToken(token)) {
      this.logger.warn(
        `[WHATSAPP STUB] Mídia para ${cleanPhone}: ${message} | URL: ${mediaUrl}`,
      );
      return true;
    }

    try {
      const formData = new FormData();
      formData.append('number', cleanPhone);
      formData.append('body', message);
      formData.append('url', mediaUrl);

      await axios.post(`${this.apiUrl}/api/messages/send`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          ...formData.getHeaders(),
        },
      });

      this.logger.log(`WhatsApp (mídia) enviado para ${cleanPhone}`);
      return true;
    } catch (error) {
      this.logger.error(
        `Erro ao enviar WhatsApp (mídia) para ${cleanPhone}:`,
        error.message,
      );
      return false;
    }
  }
}
