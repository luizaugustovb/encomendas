"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import {
  Settings, Wifi, Camera, Save, TestTube2, Phone, Loader2, CheckCircle, XCircle, Video,
  Plus, Pencil, Trash2, WifiOff, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

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

interface Equipment {
  id: string;
  tenantId: string;
  name: string;
  type: string;
  hikvisionIp: string | null;
  hikvisionPort: number | null;
  hikvisionUser: string | null;
  hikvisionPassword: string | null;
  enabled: boolean;
  doorCount: number;
  wireguardIp: string | null;
  active: boolean;
  tenant: { id: string; name: string };
}

export default function SettingsPage() {
  const { user, token } = useAuth();
  const { addToast } = useToast();
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

  // Equipment CRUD
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loadingEquipments, setLoadingEquipments] = useState(false);
  const [openEqForm, setOpenEqForm] = useState(false);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [openDeleteEq, setOpenDeleteEq] = useState(false);
  const [deletingEqId, setDeletingEqId] = useState<string | null>(null);

  // Equipment form fields
  const [eqName, setEqName] = useState("");
  const [eqIp, setEqIp] = useState("");
  const [eqPort, setEqPort] = useState("80");
  const [eqUser, setEqUser] = useState("admin");
  const [eqPassword, setEqPassword] = useState("");
  const [eqDoorCount, setEqDoorCount] = useState("1");
  const [eqWireguardIp, setEqWireguardIp] = useState("");
  const [eqEnabled, setEqEnabled] = useState(true);
  const [eqTenantId, setEqTenantId] = useState("");

  const isAdmin = user?.role === "ADMIN";

  useEffect(() => {
    if (!token) return;
    loadConfig();
    loadEquipments();
    if (isAdmin) {
      api.getTenants(token).then(setTenants).catch(() => { });
    }
  }, [token]);

  useEffect(() => {
    if (selectedTenantId && token) {
      loadConfig(selectedTenantId);
    }
  }, [selectedTenantId]);

  // ─── Equipment CRUD helpers ──────────────────────────────────────

  async function loadEquipments() {
    if (!token) return;
    setLoadingEquipments(true);
    try {
      const eqs = await api.getEquipments(token);
      setEquipments(eqs);
    } catch { }
    setLoadingEquipments(false);
  }

  function resetEqForm() {
    setEqName(""); setEqIp(""); setEqPort("80"); setEqUser("admin");
    setEqPassword(""); setEqDoorCount("1"); setEqWireguardIp("");
    setEqEnabled(true); setEqTenantId(""); setEditingEqId(null);
  }

  function handleCreateEq() {
    resetEqForm();
    if (!isAdmin && user?.tenantId) setEqTenantId(user.tenantId);
    setOpenEqForm(true);
  }

  function handleEditEq(eq: Equipment) {
    setEditingEqId(eq.id);
    setEqName(eq.name);
    setEqIp(eq.hikvisionIp || "");
    setEqPort(String(eq.hikvisionPort || 80));
    setEqUser(eq.hikvisionUser || "admin");
    setEqPassword(eq.hikvisionPassword || "");
    setEqDoorCount(String(eq.doorCount || 1));
    setEqWireguardIp(eq.wireguardIp || "");
    setEqEnabled(eq.enabled);
    setEqTenantId(eq.tenantId);
    setOpenEqForm(true);
  }

  async function handleSubmitEq() {
    if (!token || !eqName.trim()) {
      addToast("Nome é obrigatório", "error"); return;
    }
    const data = {
      name: eqName.trim(),
      tenantId: eqTenantId || undefined,
      hikvisionIp: eqIp.trim() || undefined,
      hikvisionPort: parseInt(eqPort) || 80,
      hikvisionUser: eqUser.trim() || "admin",
      hikvisionPassword: eqPassword || undefined,
      doorCount: parseInt(eqDoorCount) || 1,
      wireguardIp: eqWireguardIp.trim() || undefined,
      enabled: eqEnabled,
    };
    try {
      if (editingEqId) {
        await api.updateEquipment(editingEqId, data, token);
        addToast("Equipamento atualizado", "success");
      } else {
        await api.createEquipment(data, token);
        addToast("Equipamento adicionado", "success");
      }
      setOpenEqForm(false); resetEqForm(); loadEquipments();
    } catch (err: any) {
      addToast(err.message || "Erro ao salvar", "error");
    }
  }

  async function handleDeleteEq() {
    if (!token || !deletingEqId) return;
    try {
      await api.deleteEquipment(deletingEqId, token);
      addToast("Equipamento removido", "success");
      setOpenDeleteEq(false); setDeletingEqId(null); loadEquipments();
    } catch (err: any) {
      addToast(err.message || "Erro ao remover", "error");
    }
  }

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

      {/* ═══════ Equipamentos Hikvision ═══════ */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Equipamentos</h2>
          </div>
          <Button size="sm" onClick={handleCreateEq}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Cadastre os equipamentos Hikvision deste condomínio. Eles aparecerão no menu Equipamentos com status e controle de porta.
        </p>

        {loadingEquipments ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : equipments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />
            Nenhum equipamento cadastrado
          </div>
        ) : (
          <div className="space-y-3">
            {equipments.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{eq.name}</span>
                    {eq.enabled ? (
                      <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-xs">Habilitado</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Desabilitado</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {eq.hikvisionIp || "IP não configurado"}
                    {eq.hikvisionPort && eq.hikvisionPort !== 80 ? `:${eq.hikvisionPort}` : ""}
                    {" · "}{eq.doorCount} porta{eq.doorCount > 1 ? "s" : ""}
                    {isAdmin && eq.tenant ? ` · ${eq.tenant.name}` : ""}
                    {eq.wireguardIp ? ` · WG: ${eq.wireguardIp}` : ""}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleEditEq(eq)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeletingEqId(eq.id); setOpenDeleteEq(true); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipment Create/Edit Dialog */}
      <Dialog open={openEqForm} onOpenChange={setOpenEqForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingEqId ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle>
            <DialogDescription>
              {editingEqId ? "Altere os dados do equipamento" : "Preencha os dados do equipamento Hikvision"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input placeholder="Ex: Portaria Principal" value={eqName} onChange={(e) => setEqName(e.target.value)} />
            </div>
            {isAdmin && (
              <div>
                <Label>Condomínio</Label>
                <Select value={eqTenantId} onValueChange={setEqTenantId}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>IP do Hikvision</Label>
                <Input placeholder="192.168.1.100" value={eqIp} onChange={(e) => setEqIp(e.target.value)} />
              </div>
              <div>
                <Label>Porta</Label>
                <Input type="number" value={eqPort} onChange={(e) => setEqPort(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Usuário</Label>
                <Input value={eqUser} onChange={(e) => setEqUser(e.target.value)} />
              </div>
              <div>
                <Label>Senha</Label>
                <Input type="password" value={eqPassword} onChange={(e) => setEqPassword(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº de Portas</Label>
                <Input type="number" min="1" max="8" value={eqDoorCount} onChange={(e) => setEqDoorCount(e.target.value)} />
              </div>
              <div>
                <Label>IP WireGuard</Label>
                <Input placeholder="10.0.0.x" value={eqWireguardIp} onChange={(e) => setEqWireguardIp(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="eqEnabled" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor="eqEnabled">Habilitado</Label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setOpenEqForm(false); resetEqForm(); }}>Cancelar</Button>
              <Button onClick={handleSubmitEq}>{editingEqId ? "Salvar" : "Adicionar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Equipment Delete Dialog */}
      <Dialog open={openDeleteEq} onOpenChange={setOpenDeleteEq}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Equipamento</DialogTitle>
            <DialogDescription>Tem certeza que deseja remover este equipamento?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenDeleteEq(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteEq}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>

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
