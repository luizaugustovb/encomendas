"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import {
  Settings, Wifi, Camera, Save, TestTube2, Phone, Loader2, CheckCircle, XCircle, Video,
} from "lucide-react";

interface TenantConfig {
  id?: string;
  tenantId?: string;
  whatsappToken?: string;
  hikvisionIp?: string;
  hikvisionPort?: number;
  hikvisionUser?: string;
  hikvisionPassword?: string;
  hikvisionEnabled?: boolean;
  rtspCameraUrl?: string;
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const [config, setConfig] = useState<TenantConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testingHikvision, setTestingHikvision] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // For ADMIN: allow selecting tenant
  const [tenants, setTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!token) return;
    loadConfig();
    if (isAdmin) {
      api.getTenants(token).then(setTenants).catch(() => { });
    }
  }, [token]);

  useEffect(() => {
    if (selectedTenantId && token) {
      loadConfig(selectedTenantId);
    }
  }, [selectedTenantId]);

  async function loadConfig(tenantId?: string) {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.getTenantConfig(token, tenantId);
      setConfig(data);
    } catch {
      setConfig({});
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.updateTenantConfig(
        {
          whatsappToken: config.whatsappToken || null,
          hikvisionIp: config.hikvisionIp || null,
          hikvisionPort: config.hikvisionPort ? Number(config.hikvisionPort) : null,
          hikvisionUser: config.hikvisionUser || null,
          hikvisionPassword: config.hikvisionPassword || null,
          hikvisionEnabled: config.hikvisionEnabled || false,
          rtspCameraUrl: config.rtspCameraUrl || null,
        },
        token,
        isAdmin ? selectedTenantId || undefined : undefined,
      );
      setMessage({ type: "success", text: "Configurações salvas com sucesso!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao salvar" });
    }
    setSaving(false);
  }

  async function handleTestWhatsapp() {
    if (!token || !testPhone) return;
    setTestingWhatsapp(true);
    setMessage(null);
    try {
      const result = await api.testWhatsapp(testPhone, token);
      setMessage({ type: "success", text: result.message || "Mensagem de teste enviada!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro no teste" });
    }
    setTestingWhatsapp(false);
  }

  async function handleTestHikvision() {
    if (!token) return;
    setTestingHikvision(true);
    setMessage(null);
    try {
      const result = await api.testHikvision(token, isAdmin ? selectedTenantId || undefined : undefined);
      if (result.success) {
        setMessage({ type: "success", text: result.message });
      } else {
        setMessage({ type: "error", text: result.message });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro no teste" });
    }
    setTestingHikvision(false);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Configurações</h1>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-4 ${message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
            }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          {message.text}
        </div>
      )}

      {/* Selector de tenant para ADMIN */}
      {isAdmin && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Selecionar Condomínio</h2>
          <select
            className="w-full rounded-md border px-3 py-2"
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
          >
            <option value="">Selecione um condomínio...</option>
            {tenants.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* WhatsApp Config */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Phone className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold">WhatsApp (Viício)</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Token de API do Viício para envio de mensagens WhatsApp.
          Se não configurado, será usado o token principal do sistema.
        </p>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Token da API</label>
            <input
              type="password"
              className="w-full rounded-md border px-3 py-2"
              placeholder="Deixe vazio para usar token principal"
              value={config.whatsappToken || ""}
              onChange={(e) => setConfig({ ...config, whatsappToken: e.target.value })}
            />
          </div>

          {/* Test WhatsApp - Admin only */}
          {isAdmin && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 text-sm font-semibold">Teste de Disparo</h3>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="tel"
                  className="w-full sm:flex-1 rounded-md border px-3 py-2 text-sm"
                  placeholder="Número de teste (ex: 5511999999999)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                />
                <button
                  onClick={handleTestWhatsapp}
                  disabled={testingWhatsapp || !testPhone}
                  className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {testingWhatsapp ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TestTube2 className="h-4 w-4" />
                  )}
                  Testar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hikvision Config */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Camera className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Hikvision</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Configurações de conexão com equipamento Hikvision para controle de acesso.
        </p>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="hikvisionEnabled"
              checked={config.hikvisionEnabled || false}
              onChange={(e) => setConfig({ ...config, hikvisionEnabled: e.target.checked })}
              className="h-4 w-4 rounded"
            />
            <label htmlFor="hikvisionEnabled" className="text-sm font-medium">
              Equipamento habilitado
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Endereço IP</label>
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                placeholder="192.168.1.100"
                value={config.hikvisionIp || ""}
                onChange={(e) => setConfig({ ...config, hikvisionIp: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Porta</label>
              <input
                type="number"
                className="w-full rounded-md border px-3 py-2"
                placeholder="80"
                value={config.hikvisionPort || ""}
                onChange={(e) => setConfig({ ...config, hikvisionPort: parseInt(e.target.value) || undefined })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Usuário</label>
              <input
                type="text"
                className="w-full rounded-md border px-3 py-2"
                placeholder="admin"
                value={config.hikvisionUser || ""}
                onChange={(e) => setConfig({ ...config, hikvisionUser: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Senha</label>
              <input
                type="password"
                className="w-full rounded-md border px-3 py-2"
                placeholder="••••••••"
                value={config.hikvisionPassword || ""}
                onChange={(e) => setConfig({ ...config, hikvisionPassword: e.target.value })}
              />
            </div>
          </div>

          {/* Test Hikvision - Admin only */}
          {isAdmin && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 text-sm font-semibold">Teste de Conexão</h3>
              <button
                onClick={handleTestHikvision}
                disabled={testingHikvision}
                className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {testingHikvision ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4" />
                )}
                Testar Conexão
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RTSP Camera */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Video className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Câmera RTSP (Totem)</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          URL da câmera para exibição no totem de retirada de encomendas. Se configurado, o totem exibirá a seção &quot;Ambiente Monitorado&quot; com o feed da câmera.
          Utilize uma URL HTTP/MJPEG acessível pelo navegador (ex: http://192.168.1.100/ISAPI/Streaming/channels/101/httpPreview).
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium">URL da Câmera</label>
          <input
            type="text"
            className="w-full rounded-md border px-3 py-2"
            placeholder="http://192.168.1.100/ISAPI/Streaming/channels/101/httpPreview"
            value={config.rtspCameraUrl || ""}
            onChange={(e) => setConfig({ ...config, rtspCameraUrl: e.target.value })}
          />
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-col sm:flex-row justify-end pt-4 pb-8">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
