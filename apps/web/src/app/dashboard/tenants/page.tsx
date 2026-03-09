"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { compressImage } from "@/lib/image-utils";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Plus, Trash2, Pencil, RotateCcw, AlertTriangle, Settings, ArrowLeft,
  Phone, Wifi, WifiOff, Video, Save, TestTube2, Loader2, Signal,
  CheckCircle, XCircle, Users, Building2, MapPin, Camera, UserCircle, PlusCircle,
} from "lucide-react";

// ─── Interfaces ───────────────────────────────────────────────────

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

const roleLabels: Record<string, string> = {
  ADMIN: "Admin Master",
  ADMIN_CONDOMINIO: "Admin Condomínio",
  PORTEIRO: "Porteiro",
  ZELADOR: "Zelador",
  MORADOR: "Morador",
};

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE — Lista de condomínios
// ═══════════════════════════════════════════════════════════════════

export default function TenantsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [openPermanentDelete, setOpenPermanentDelete] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState<any>(null);
  const [confirmName, setConfirmName] = useState("");

  const [configTenant, setConfigTenant] = useState<any>(null);

  // Create form
  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formSindico, setFormSindico] = useState("");
  const [formSindicoPhone, setFormSindicoPhone] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDocument, setEditDocument] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSindico, setEditSindico] = useState("");
  const [editSindicoPhone, setEditSindicoPhone] = useState("");

  const loadData = async () => {
    if (!token) return;
    try { setTenants(await api.getTenants(token)); } catch { }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [token]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createTenant({ name: formName, document: formDocument || undefined, address: formAddress || undefined, phone: formPhone || undefined, sindico: formSindico || undefined, sindicoPhone: formSindicoPhone || undefined }, token);
      setOpenCreate(false);
      setFormName(""); setFormDocument(""); setFormAddress(""); setFormPhone(""); setFormSindico(""); setFormSindicoPhone("");
      addToast("Condomínio cadastrado!", "success");
      loadData();
    } catch (err: any) { addToast(err.message || "Erro ao cadastrar", "error"); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingTenant) return;
    try {
      await api.updateTenant(editingTenant.id, { name: editName, document: editDocument || undefined, address: editAddress || undefined, phone: editPhone || undefined, sindico: editSindico || undefined, sindicoPhone: editSindicoPhone || undefined }, token);
      setOpenEdit(false); setEditingTenant(null);
      addToast("Condomínio atualizado!", "success");
      loadData();
    } catch (err: any) { addToast(err.message || "Erro ao atualizar", "error"); }
  };

  const openEditDialog = (t: any) => {
    setEditingTenant(t); setEditName(t.name); setEditDocument(t.document || "");
    setEditAddress(t.address || ""); setEditPhone(t.phone || "");
    setEditSindico(t.sindico || ""); setEditSindicoPhone(t.sindicoPhone || "");
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try { await api.deleteTenant(id, token); addToast("Condomínio desativado!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro ao desativar", "error"); }
  };

  const handleReactivate = async (id: string) => {
    if (!token) return;
    try { await api.reactivateTenant(id, token); addToast("Condomínio reativado!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro ao reativar", "error"); }
  };

  const handlePermanentDelete = async () => {
    if (!token || !deletingTenant) return;
    if (confirmName !== deletingTenant.name) { addToast("O nome digitado não confere.", "error"); return; }
    try {
      await api.permanentDeleteTenant(deletingTenant.id, token);
      setOpenPermanentDelete(false); setDeletingTenant(null); setConfirmName("");
      addToast("Condomínio excluído permanentemente!", "success"); loadData();
    } catch (err: any) { addToast(err.message || "Erro ao excluir", "error"); }
  };

  if (configTenant) return <TenantConfigView tenant={configTenant} token={token!} onBack={() => setConfigTenant(null)} />;

  if (loading) return <div className="animate-pulse">Carregando condomínios...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Condomínios</h1>
          <p className="text-muted-foreground">Gerencie os condomínios do sistema</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Novo Condomínio</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Cadastrar Condomínio</DialogTitle><DialogDescription>Preencha os dados do novo condomínio</DialogDescription></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Ex: Residencial Sol Nascente" /></div>
              <div className="space-y-2"><Label>CNPJ</Label><Input value={formDocument} onChange={(e) => setFormDocument(e.target.value)} placeholder="00.000.000/0001-00" /></div>
              <div className="space-y-2"><Label>Endereço</Label><Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Rua, número, cidade" /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(11) 99999-0000" /></div>
              <div className="space-y-2"><Label>Síndico</Label><Input value={formSindico} onChange={(e) => setFormSindico(e.target.value)} placeholder="Nome do síndico" /></div>
              <div className="space-y-2"><Label>Telefone do Síndico</Label><Input value={formSindicoPhone} onChange={(e) => setFormSindicoPhone(e.target.value)} placeholder="(11) 99999-0000" /></div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Condomínio</DialogTitle><DialogDescription>Altere os dados do condomínio</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>CNPJ</Label><Input value={editDocument} onChange={(e) => setEditDocument(e.target.value)} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
            <div className="space-y-2"><Label>Síndico</Label><Input value={editSindico} onChange={(e) => setEditSindico(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone do Síndico</Label><Input value={editSindicoPhone} onChange={(e) => setEditSindicoPhone(e.target.value)} /></div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openPermanentDelete} onOpenChange={setOpenPermanentDelete}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Excluir Permanentemente</DialogTitle>
            <DialogDescription>Esta ação é <strong>irreversível</strong>. Todos os dados serão excluídos.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm font-medium">Condomínio: <strong>{deletingTenant?.name}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">Para confirmar, digite o nome:</p>
            </div>
            <Input placeholder={deletingTenant?.name} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpenPermanentDelete(false)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={handlePermanentDelete} disabled={confirmName !== deletingTenant?.name}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card className="w-full overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Síndico</TableHead>
                <TableHead>Tel. Síndico</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nenhum condomínio encontrado</TableCell></TableRow>
              ) : tenants.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell>{t.sindico || "—"}</TableCell>
                  <TableCell>{t.sindicoPhone || "—"}</TableCell>
                  <TableCell><Badge variant={t.active ? "success" : "destructive"}>{t.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {t.active && <Button size="sm" variant="outline" onClick={() => setConfigTenant(t)} title="Configurações"><Settings className="h-3 w-3" /></Button>}
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(t)} title="Editar"><Pencil className="h-3 w-3" /></Button>
                      {t.active ? (
                        <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} title="Desativar"><Trash2 className="h-3 w-3" /></Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleReactivate(t.id)} title="Reativar" className="text-green-600 hover:text-green-700"><RotateCcw className="h-3 w-3" /></Button>
                          <Button size="sm" variant="destructive" onClick={() => { setDeletingTenant(t); setConfirmName(""); setOpenPermanentDelete(true); }} title="Excluir permanentemente"><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TENANT CONFIG VIEW — Abas: Configurações | Usuários | Unidades | Localizações
// ═══════════════════════════════════════════════════════════════════

type ConfigTab = "config" | "users" | "units" | "locations";

function TenantConfigView({ tenant, token, onBack }: { tenant: any; token: string; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<ConfigTab>("config");

  const tabs: { key: ConfigTab; label: string; icon: any }[] = [
    { key: "config", label: "Configurações", icon: Settings },
    { key: "users", label: "Usuários", icon: Users },
    { key: "units", label: "Unidades", icon: Building2 },
    { key: "locations", label: "Localizações", icon: MapPin },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button>
        <div>
          <h1 className="text-2xl font-bold">{tenant.name}</h1>
          {tenant.sindico && <p className="text-sm text-muted-foreground">Síndico: {tenant.sindico}{tenant.sindicoPhone ? ` · ${tenant.sindicoPhone}` : ""}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && <ConfigTabContent tenant={tenant} token={token} />}
      {activeTab === "users" && <UsersTabContent tenant={tenant} token={token} />}
      {activeTab === "units" && <UnitsTabContent tenant={tenant} token={token} />}
      {activeTab === "locations" && <LocationsTabContent tenant={tenant} token={token} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Componente: Teste de Câmera RTSP (página Condomínios)
// ═══════════════════════════════════════════════════════════════════

function RtspTestSectionTenants({ token, url, tenantId }: { token: string; url: string; tenantId: string }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    setShowPreview(false);
    setPreviewError(false);
    setPreviewUrl(null);
    try {
      const res = await api.testRtsp(token, tenantId);
      setResult(res);
      if (res.success) {
        setShowPreview(true);
        loadPreviewImage();
      }
    } catch (err: any) {
      setResult({ success: false, message: err.message || "Erro ao testar" });
    }
    setTesting(false);
  };

  const loadPreviewImage = async () => {
    setLoadingPreview(true);
    setPreviewError(false);
    try {
      const res = await fetch(`/api/tenant-config/rtsp-proxy?tenantId=${encodeURIComponent(tenantId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Falha");
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError(true);
    }
    setLoadingPreview(false);
  };

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <h3 className="mb-3 text-sm font-semibold">Teste de Conectividade</h3>

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <button
          onClick={handleTest}
          disabled={testing || !url}
          className="flex items-center justify-center gap-2 rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}
          {testing ? "Testando..." : "Testar Câmera"}
        </button>
        {!url && <span className="text-xs text-muted-foreground self-center">Salve a URL primeiro</span>}
      </div>

      {result && (
        <div className={`mb-3 flex items-center gap-2 rounded-lg border p-3 text-sm ${
          result.success
            ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
            : "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"
        }`}>
          {result.success ? <CheckCircle className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
          <div>
            <p className="font-medium">{result.message}</p>
            {result.ping !== null && result.ping !== undefined && (
              <p className="text-xs opacity-75">Ping: {result.ping}ms · Tipo: {result.contentType || "N/A"}</p>
            )}
          </div>
        </div>
      )}

      {showPreview && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Preview da câmera (via proxy)</span>
            <button
              onClick={loadPreviewImage}
              disabled={loadingPreview}
              className="text-xs text-purple-500 hover:underline flex items-center gap-1"
            >
              {loadingPreview ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Recarregar
            </button>
          </div>
          <div className="relative aspect-video w-full max-w-lg overflow-hidden rounded-lg bg-black border">
            {loadingPreview && !previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
              </div>
            )}
            {previewUrl && !previewError && (
              <img
                src={previewUrl}
                alt="Preview câmera"
                className="h-full w-full object-contain"
                onError={() => setPreviewError(true)}
              />
            )}
            {previewError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 gap-2">
                <Camera className="h-8 w-8 opacity-50" />
                <span className="text-xs">Falha ao carregar imagem</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: Configurações (WhatsApp, Equipamentos, RTSP)
// ═══════════════════════════════════════════════════════════════════

function ConfigTabContent({ tenant, token }: { tenant: any; token: string }) {
  const { addToast } = useToast();
  const [config, setConfig] = useState<TenantConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [openEqForm, setOpenEqForm] = useState(false);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [openDeleteEq, setOpenDeleteEq] = useState(false);
  const [deletingEqId, setDeletingEqId] = useState<string | null>(null);

  const [eqName, setEqName] = useState("");
  const [eqIp, setEqIp] = useState("");
  const [eqPort, setEqPort] = useState("80");
  const [eqUser, setEqUser] = useState("admin");
  const [eqPassword, setEqPassword] = useState("");
  const [eqDoorCount, setEqDoorCount] = useState("1");
  const [eqWireguardIp, setEqWireguardIp] = useState("");
  const [eqEnabled, setEqEnabled] = useState(true);
  const [testingHikEqId, setTestingHikEqId] = useState<string | null>(null);
  const [hikTestResult, setHikTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);

  useEffect(() => { loadConfig(); loadEquipments(); }, []);

  async function loadConfig() {
    setLoading(true);
    try { setConfig(await api.getTenantConfig(token, tenant.id)); } catch { setConfig({}); }
    setLoading(false);
  }
  async function loadEquipments() {
    setLoadingEq(true);
    try { const all = await api.getEquipments(token); setEquipments(all.filter((eq: Equipment) => eq.tenantId === tenant.id)); } catch { }
    setLoadingEq(false);
  }
  async function handleSave() {
    setSaving(true); setMessage(null);
    try {
      await api.updateTenantConfig({ whatsappToken: config.whatsappToken || null, hikvisionIp: config.hikvisionIp || null, hikvisionPort: config.hikvisionPort ? Number(config.hikvisionPort) : null, hikvisionUser: config.hikvisionUser || null, hikvisionPassword: config.hikvisionPassword || null, hikvisionEnabled: config.hikvisionEnabled || false, rtspCameraUrl: config.rtspCameraUrl || null }, token, tenant.id);
      setMessage({ type: "success", text: "Configurações salvas!" });
    } catch (err: any) { setMessage({ type: "error", text: err.message || "Erro ao salvar" }); }
    setSaving(false);
  }
  async function handleTestWhatsapp() {
    if (!testPhone) return;
    setTestingWhatsapp(true); setMessage(null);
    try { const r = await api.testWhatsapp(testPhone, token); setMessage({ type: "success", text: r.message || "Teste enviado!" }); }
    catch (err: any) { setMessage({ type: "error", text: err.message || "Erro no teste" }); }
    setTestingWhatsapp(false);
  }

  function resetEqForm() { setEqName(""); setEqIp(""); setEqPort("80"); setEqUser("admin"); setEqPassword(""); setEqDoorCount("1"); setEqWireguardIp(""); setEqEnabled(true); setEditingEqId(null); }
  function handleEditEq(eq: Equipment) { setEditingEqId(eq.id); setEqName(eq.name); setEqIp(eq.hikvisionIp || ""); setEqPort(String(eq.hikvisionPort || 80)); setEqUser(eq.hikvisionUser || "admin"); setEqPassword(eq.hikvisionPassword || ""); setEqDoorCount(String(eq.doorCount || 1)); setEqWireguardIp(eq.wireguardIp || ""); setEqEnabled(eq.enabled); setOpenEqForm(true); }
  async function handleSubmitEq() {
    if (!eqName.trim()) { addToast("Nome é obrigatório", "error"); return; }
    const data = { name: eqName.trim(), tenantId: tenant.id, hikvisionIp: eqIp.trim() || undefined, hikvisionPort: parseInt(eqPort) || 80, hikvisionUser: eqUser.trim() || "admin", hikvisionPassword: eqPassword || undefined, doorCount: parseInt(eqDoorCount) || 1, wireguardIp: eqWireguardIp.trim() || undefined, enabled: eqEnabled };
    try {
      if (editingEqId) { await api.updateEquipment(editingEqId, data, token); addToast("Equipamento atualizado", "success"); }
      else { await api.createEquipment(data, token); addToast("Equipamento adicionado", "success"); }
      setOpenEqForm(false); resetEqForm(); loadEquipments();
    } catch (err: any) { addToast(err.message || "Erro ao salvar", "error"); }
  }
  async function handleDeleteEq() {
    if (!deletingEqId) return;
    try { await api.deleteEquipment(deletingEqId, token); addToast("Equipamento removido", "success"); setOpenDeleteEq(false); setDeletingEqId(null); loadEquipments(); }
    catch (err: any) { addToast(err.message || "Erro ao remover", "error"); }
  }
  async function handleTestHikvision(eqId: string) {
    setTestingHikEqId(eqId); setHikTestResult(null);
    try {
      const r = await api.testHikvision(token, tenant.id);
      setHikTestResult({ id: eqId, success: r.success, message: r.message || (r.success ? 'Conexão OK' : 'Falha') });
    } catch (err: any) {
      setHikTestResult({ id: eqId, success: false, message: err.message || 'Erro ao testar' });
    }
    setTestingHikEqId(null);
  }

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      {message && (
        <div className={`flex items-center gap-2 rounded-lg border p-4 ${message.type === "success" ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" : "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"}`}>
          {message.type === "success" ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}{message.text}
        </div>
      )}

      {/* WhatsApp */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2"><Phone className="h-5 w-5 text-green-600" /><h2 className="text-lg font-semibold">WhatsApp (Viício)</h2></div>
        <p className="mb-4 text-sm text-muted-foreground">Token de API para envio de mensagens WhatsApp.</p>
        <div className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium">Token da API</label><input type="password" className="w-full rounded-md border px-3 py-2 bg-background" placeholder="Deixe vazio para usar token principal" value={config.whatsappToken || ""} onChange={(e) => setConfig({ ...config, whatsappToken: e.target.value })} /></div>
          <div className="rounded-lg border bg-muted/50 p-4">
            <h3 className="mb-2 text-sm font-semibold">Teste de Disparo</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="tel" className="w-full sm:flex-1 rounded-md border px-3 py-2 text-sm bg-background" placeholder="Número (ex: 5511999999999)" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <button onClick={handleTestWhatsapp} disabled={testingWhatsapp || !testPhone} className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50">
                {testingWhatsapp ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />}Testar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Equipamentos */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2"><Wifi className="h-5 w-5 text-indigo-600" /><h2 className="text-lg font-semibold">Equipamentos</h2></div>
          <Button size="sm" onClick={() => { resetEqForm(); setOpenEqForm(true); }}><Plus className="h-4 w-4 mr-1" />Adicionar</Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">Cadastre os equipamentos Hikvision. Eles aparecerão no menu Equipamentos.</p>
        {loadingEq ? <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : equipments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm"><WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhum equipamento</div>
        ) : (
          <div className="space-y-3">
            {equipments.map((eq) => (
              <div key={eq.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{eq.name}</span>
                    {eq.enabled ? <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-xs">Habilitado</Badge> : <Badge variant="secondary" className="text-xs">Desabilitado</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{eq.hikvisionIp || "IP não configurado"}{eq.hikvisionPort && eq.hikvisionPort !== 80 ? `:${eq.hikvisionPort}` : ""}{" · "}{eq.doorCount} porta{eq.doorCount > 1 ? "s" : ""}{eq.wireguardIp ? ` · WG: ${eq.wireguardIp}` : ""}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" title="Testar conexão" onClick={() => handleTestHikvision(eq.id)} disabled={testingHikEqId === eq.id}>
                    {testingHikEqId === eq.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Signal className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleEditEq(eq)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeletingEqId(eq.id); setOpenDeleteEq(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                {hikTestResult?.id === eq.id && (
                  <div className={`w-full mt-1 flex items-center gap-1.5 rounded px-2 py-1 text-xs ${hikTestResult.success ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'}`}>
                    {hikTestResult.success ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />} {hikTestResult.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={openEqForm} onOpenChange={setOpenEqForm}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingEqId ? "Editar Equipamento" : "Novo Equipamento"}</DialogTitle><DialogDescription>{editingEqId ? "Altere os dados" : "Preencha os dados do equipamento"}</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input placeholder="Ex: Portaria Principal" value={eqName} onChange={(e) => setEqName(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3"><div className="col-span-2"><Label>IP</Label><Input placeholder="192.168.1.100" value={eqIp} onChange={(e) => setEqIp(e.target.value)} /></div><div><Label>Porta</Label><Input type="number" value={eqPort} onChange={(e) => setEqPort(e.target.value)} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Usuário</Label><Input value={eqUser} onChange={(e) => setEqUser(e.target.value)} /></div><div><Label>Senha</Label><Input type="password" value={eqPassword} onChange={(e) => setEqPassword(e.target.value)} /></div></div>
            <div className="grid grid-cols-2 gap-3"><div><Label>Nº Portas</Label><Input type="number" min="1" max="8" value={eqDoorCount} onChange={(e) => setEqDoorCount(e.target.value)} /></div><div><Label>IP WireGuard</Label><Input placeholder="10.0.0.x" value={eqWireguardIp} onChange={(e) => setEqWireguardIp(e.target.value)} /></div></div>
            <div className="flex items-center gap-2"><input type="checkbox" id="eqEn" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} className="rounded" /><Label htmlFor="eqEn">Habilitado</Label></div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => { setOpenEqForm(false); resetEqForm(); }}>Cancelar</Button><Button onClick={handleSubmitEq}>{editingEqId ? "Salvar" : "Adicionar"}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={openDeleteEq} onOpenChange={setOpenDeleteEq}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Remover Equipamento</DialogTitle><DialogDescription>Tem certeza?</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={() => setOpenDeleteEq(false)}>Cancelar</Button><Button variant="destructive" onClick={handleDeleteEq}>Remover</Button></div>
        </DialogContent>
      </Dialog>

      {/* Câmera RTSP */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2"><Video className="h-5 w-5 text-purple-600" /><h2 className="text-lg font-semibold">Câmera RTSP (Totem)</h2></div>
        <p className="mb-4 text-sm text-muted-foreground">URL HTTP da câmera para exibir feed ao vivo no totem. Aceita MJPEG stream ou snapshot JPEG.</p>
        <div className="space-y-4">
          <div><label className="mb-1 block text-sm font-medium">URL da Câmera</label><input type="text" className="w-full rounded-md border px-3 py-2 bg-background" placeholder="http://192.168.1.100/ISAPI/Streaming/channels/101/httpPreview" value={config.rtspCameraUrl || ""} onChange={(e) => setConfig({ ...config, rtspCameraUrl: e.target.value })} /></div>
          <RtspTestSectionTenants token={token} url={config.rtspCameraUrl || ""} tenantId={tenant.id} />
        </div>
      </div>

      <div className="flex justify-end pt-4 pb-8">
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Salvar Configurações
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: Usuários
// ═══════════════════════════════════════════════════════════════════

function UsersTabContent({ tenant, token }: { tenant: any; token: string }) {
  const { addToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [openPermanentDelete, setOpenPermanentDelete] = useState(false);
  const [permanentDeleteUser, setPermanentDeleteUser] = useState<any>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState("");

  // Create
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("MORADOR");
  const [formUnitId, setFormUnitId] = useState("");
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null);
  const createPhotoRef = useRef<HTMLInputElement>(null);

  // Edit
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("MORADOR");
  const [editUnitId, setEditUnitId] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const editPhotoRef = useRef<HTMLInputElement>(null);

  // New unit inline
  const [openNewUnit, setOpenNewUnit] = useState(false);
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [newUnitBlock, setNewUnitBlock] = useState("");
  const [newUnitType, setNewUnitType] = useState("APARTAMENTO");

  const loadData = async () => {
    try {
      const [u, un] = await Promise.all([
        api.getUsers(token, tenant.id),
        api.getUnits(token, tenant.id).catch(() => []),
      ]);
      setUsers(u); setUnits(un);
    } catch { }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>, mode: "create" | "edit") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 190);
    if (mode === "create") { setFormPhoto(compressed); setFormPhotoPreview(URL.createObjectURL(compressed)); }
    else { setEditPhoto(compressed); setEditPhotoPreview(URL.createObjectURL(compressed)); }
  };

  const resetCreateForm = () => { setFormName(""); setFormEmail(""); setFormPassword(""); setFormPhone(""); setFormRole("MORADOR"); setFormUnitId(""); setFormPhoto(null); setFormPhotoPreview(null); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createUser({ name: formName, email: formEmail, password: formPassword, phone: formPhone ? `55${formPhone}` : undefined, role: formRole, unitId: formUnitId || undefined, tenantId: tenant.id }, token);
      if (formPhoto && created?.id) { try { await api.uploadUserPhoto(created.id, formPhoto, token); } catch { } }
      setOpenCreate(false); resetCreateForm();
      addToast("Usuário cadastrado!", "success"); loadData();
    } catch (err: any) { addToast(err.message || "Erro ao cadastrar", "error"); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const data: any = { name: editName, email: editEmail, phone: editPhone ? `55${editPhone}` : editPhone, role: editRole, unitId: editUnitId || null };
      if (editPassword) data.password = editPassword;
      await api.updateUser(editingUser.id, data, token);
      if (editPhoto) { try { await api.uploadUserPhoto(editingUser.id, editPhoto, token); } catch { } }
      setOpenEdit(false); setEditingUser(null);
      addToast("Usuário atualizado!", "success"); loadData();
    } catch (err: any) { addToast(err.message || "Erro ao atualizar", "error"); }
  };

  const openEditDialog = (u: any) => {
    setEditingUser(u); setEditName(u.name); setEditEmail(u.email); setEditPassword("");
    setEditPhone(u.phone ? u.phone.replace(/^55/, "") : ""); setEditRole(u.role);
    setEditUnitId(u.unitId || ""); setEditPhoto(null); setEditPhotoPreview(u.photoUrl || null);
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => { try { await api.deleteUser(id, token); addToast("Usuário desativado!", "success"); loadData(); } catch (err: any) { addToast(err.message || "Erro", "error"); } };
  const handleReactivate = async (id: string) => { try { await api.reactivateUser(id, token); addToast("Usuário reativado!", "success"); loadData(); } catch (err: any) { addToast(err.message || "Erro", "error"); } };
  const handlePermanentDelete = async () => {
    if (!permanentDeleteUser || permanentDeleteConfirm !== permanentDeleteUser.name) { addToast("Nome não confere", "error"); return; }
    try { await api.permanentDeleteUser(permanentDeleteUser.id, token); setOpenPermanentDelete(false); setPermanentDeleteUser(null); setPermanentDeleteConfirm(""); addToast("Excluído permanentemente!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro", "error"); }
  };

  const handleCreateInlineUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createUnit({ number: newUnitNumber, block: newUnitBlock || undefined, type: newUnitType, tenantId: tenant.id }, token);
      setOpenNewUnit(false); setNewUnitNumber(""); setNewUnitBlock(""); setNewUnitType("APARTAMENTO");
      addToast("Unidade criada!", "success");
      const un = await api.getUnits(token, tenant.id).catch(() => []);
      setUnits(un); setFormUnitId(created.id);
    } catch (err: any) { addToast(err.message || "Erro", "error"); }
  };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">Usuários</h2><p className="text-sm text-muted-foreground">Moradores e funcionários deste condomínio</p></div>
        <Dialog open={openCreate} onOpenChange={(o) => { setOpenCreate(o); if (!o) resetCreateForm(); }}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Novo</Button></DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Cadastrar Usuário</DialogTitle><DialogDescription>Preencha os dados do novo usuário</DialogDescription></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                <div className="relative w-20 h-20 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden" onClick={() => createPhotoRef.current?.click()}>
                  {formPhotoPreview ? <img src={formPhotoPreview} alt="Preview" className="w-full h-full object-cover" /> : <UserCircle className="w-10 h-10 text-muted-foreground/50" />}
                  <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1"><Camera className="w-3 h-3" /></div>
                </div>
                <input ref={createPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handlePhotoChange(e, "create")} />
                <p className="text-xs text-muted-foreground">Foto (reconhecimento facial)</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Nome *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} required /></div>
                <div className="space-y-1"><Label>E-mail *</Label><Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required /></div>
                <div className="space-y-1"><Label>Senha *</Label><Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} /></div>
                <div className="space-y-1"><Label>Telefone</Label><div className="flex"><span className="inline-flex items-center px-2 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-xs">+55</span><Input className="rounded-l-none" placeholder="84999990000" value={formPhone} onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, ""))} /></div></div>
              </div>
              <div className="space-y-1"><Label>Função *</Label>
                <Select value={formRole} onValueChange={setFormRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
                  <SelectItem value="ADMIN">Admin Master</SelectItem><SelectItem value="ADMIN_CONDOMINIO">Admin Condomínio</SelectItem><SelectItem value="PORTEIRO">Porteiro</SelectItem><SelectItem value="ZELADOR">Zelador</SelectItem><SelectItem value="MORADOR">Morador</SelectItem>
                </SelectContent></Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between"><Label>Unidade {formRole === "MORADOR" ? "*" : "(opcional)"}</Label>
                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setOpenNewUnit(true)}><PlusCircle className="h-3 w-3 mr-1" />Criar unidade</Button>
                </div>
                <Select value={formUnitId} onValueChange={setFormUnitId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.number}{u.block ? ` - Bloco ${u.block}` : ""} ({u.type})</SelectItem>)}</SelectContent></Select>
              </div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Inline Unit Dialog */}
      <Dialog open={openNewUnit} onOpenChange={setOpenNewUnit}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Criar Unidade</DialogTitle><DialogDescription>A unidade será criada neste condomínio</DialogDescription></DialogHeader>
          <form onSubmit={handleCreateInlineUnit} className="space-y-4">
            <div className="space-y-1"><Label>Número *</Label><Input value={newUnitNumber} onChange={(e) => setNewUnitNumber(e.target.value)} required placeholder="Ex: 101" /></div>
            <div className="space-y-1"><Label>Bloco</Label><Input value={newUnitBlock} onChange={(e) => setNewUnitBlock(e.target.value)} placeholder="Ex: A" /></div>
            <div className="space-y-1"><Label>Tipo</Label><Select value={newUnitType} onValueChange={setNewUnitType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APARTAMENTO">Apartamento</SelectItem><SelectItem value="CASA">Casa</SelectItem></SelectContent></Select></div>
            <Button type="submit" className="w-full">Criar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar Usuário</DialogTitle><DialogDescription>Altere os dados do usuário</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative w-20 h-20 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden" onClick={() => editPhotoRef.current?.click()}>
                {editPhotoPreview ? <img src={editPhotoPreview} alt="Preview" className="w-full h-full object-cover" /> : <UserCircle className="w-10 h-10 text-muted-foreground/50" />}
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1"><Camera className="w-3 h-3" /></div>
              </div>
              <input ref={editPhotoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => handlePhotoChange(e, "edit")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Nome</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
              <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required /></div>
              <div className="space-y-1"><Label>Nova Senha</Label><Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} minLength={6} placeholder="Manter atual" /></div>
              <div className="space-y-1"><Label>Telefone</Label><div className="flex"><span className="inline-flex items-center px-2 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-xs">+55</span><Input className="rounded-l-none" value={editPhone} onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ""))} /></div></div>
            </div>
            <div className="space-y-1"><Label>Função</Label><Select value={editRole} onValueChange={setEditRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
              <SelectItem value="ADMIN">Admin Master</SelectItem><SelectItem value="ADMIN_CONDOMINIO">Admin Condomínio</SelectItem><SelectItem value="PORTEIRO">Porteiro</SelectItem><SelectItem value="ZELADOR">Zelador</SelectItem><SelectItem value="MORADOR">Morador</SelectItem>
            </SelectContent></Select></div>
            <div className="space-y-1"><Label>Unidade</Label><Select value={editUnitId} onValueChange={setEditUnitId}><SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger><SelectContent>{units.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.number}{u.block ? ` - Bloco ${u.block}` : ""} ({u.type})</SelectItem>)}</SelectContent></Select></div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Dialog */}
      <Dialog open={openPermanentDelete} onOpenChange={setOpenPermanentDelete}>
        <DialogContent className="max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Excluir Permanentemente</DialogTitle><DialogDescription>Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">Digite o nome: <strong>{permanentDeleteUser?.name}</strong></p>
            <Input value={permanentDeleteConfirm} onChange={(e) => setPermanentDeleteConfirm(e.target.value)} placeholder="Nome do usuário" />
            <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={() => setOpenPermanentDelete(false)}>Cancelar</Button><Button variant="destructive" className="flex-1" onClick={handlePermanentDelete} disabled={permanentDeleteConfirm !== permanentDeleteUser?.name}>Excluir</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Users Table */}
      <Card className="w-full overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-10">Foto</TableHead><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Telefone</TableHead><TableHead>Função</TableHead><TableHead>Unidade</TableHead><TableHead>Status</TableHead><TableHead>Ações</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum usuário encontrado</TableCell></TableRow>
              ) : users.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell><div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center">{u.photoUrl ? <img src={u.photoUrl} alt="" className="w-full h-full object-cover" /> : <UserCircle className="w-5 h-5 text-muted-foreground" />}</div></TableCell>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-xs">{u.email}</TableCell>
                  <TableCell className="text-xs">{u.phone || "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge></TableCell>
                  <TableCell>{u.unit ? `${u.unit.number}${u.unit.block ? `/${u.unit.block}` : ""}` : "—"}</TableCell>
                  <TableCell><Badge variant={u.active ? "success" : "destructive"}>{u.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}><Pencil className="h-3 w-3" /></Button>
                      {u.active ? (
                        <Button size="sm" variant="outline" onClick={() => handleDelete(u.id)}><Trash2 className="h-3 w-3" /></Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id)}><RotateCcw className="h-3 w-3" /></Button>
                          <Button size="sm" variant="destructive" onClick={() => { setPermanentDeleteUser(u); setPermanentDeleteConfirm(""); setOpenPermanentDelete(true); }}><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: Unidades
// ═══════════════════════════════════════════════════════════════════

function UnitsTabContent({ tenant, token }: { tenant: any; token: string }) {
  const { addToast } = useToast();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);

  const [formNumber, setFormNumber] = useState("");
  const [formBlock, setFormBlock] = useState("");
  const [formType, setFormType] = useState("APARTAMENTO");
  const [editNumber, setEditNumber] = useState("");
  const [editBlock, setEditBlock] = useState("");
  const [editType, setEditType] = useState("APARTAMENTO");

  const loadData = async () => { try { setUnits(await api.getUnits(token, tenant.id)); } catch { } setLoading(false); };
  useEffect(() => { loadData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createUnit({ number: formNumber, block: formBlock || undefined, type: formType, tenantId: tenant.id }, token); setOpenCreate(false); setFormNumber(""); setFormBlock(""); setFormType("APARTAMENTO"); addToast("Unidade cadastrada!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro", "error"); }
  };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    try { await api.updateUnit(editingUnit.id, { number: editNumber, block: editBlock || undefined, type: editType }, token); setOpenEdit(false); setEditingUnit(null); addToast("Unidade atualizada!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro", "error"); }
  };
  const openEditDialog = (u: any) => { setEditingUnit(u); setEditNumber(u.number); setEditBlock(u.block || ""); setEditType(u.type || "APARTAMENTO"); setOpenEdit(true); };
  const handleDelete = async (id: string) => { try { await api.deleteUnit(id, token); addToast("Unidade desativada!", "success"); loadData(); } catch (err: any) { addToast(err.message || "Erro", "error"); } };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">Unidades</h2><p className="text-sm text-muted-foreground">Casas e apartamentos deste condomínio</p></div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Cadastrar Unidade</DialogTitle><DialogDescription>Preencha os dados da nova unidade</DialogDescription></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1"><Label>Número *</Label><Input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} required placeholder="Ex: 101" /></div>
              <div className="space-y-1"><Label>Bloco</Label><Input value={formBlock} onChange={(e) => setFormBlock(e.target.value)} placeholder="Ex: A" /></div>
              <div className="space-y-1"><Label>Tipo</Label><Select value={formType} onValueChange={setFormType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APARTAMENTO">Apartamento</SelectItem><SelectItem value="CASA">Casa</SelectItem></SelectContent></Select></div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Unidade</DialogTitle><DialogDescription>Altere os dados</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-1"><Label>Número</Label><Input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} required /></div>
            <div className="space-y-1"><Label>Bloco</Label><Input value={editBlock} onChange={(e) => setEditBlock(e.target.value)} /></div>
            <div className="space-y-1"><Label>Tipo</Label><Select value={editType} onValueChange={setEditType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="APARTAMENTO">Apartamento</SelectItem><SelectItem value="CASA">Casa</SelectItem></SelectContent></Select></div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="w-full overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Bloco</TableHead><TableHead>Tipo</TableHead><TableHead>Moradores</TableHead><TableHead className="text-center">Qtd</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {units.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Nenhuma unidade encontrada</TableCell></TableRow>
              ) : units.map((u: any) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.number}</TableCell>
                  <TableCell>{u.block || "—"}</TableCell>
                  <TableCell>{u.type}</TableCell>
                  <TableCell>{u.users?.length > 0 ? <div className="flex flex-wrap gap-1">{u.users.map((usr: any) => <Badge key={usr.id} variant="secondary" className="text-xs">{usr.name}</Badge>)}</div> : <span className="text-muted-foreground text-xs">Sem moradores</span>}</TableCell>
                  <TableCell className="text-center">{u.users?.length || 0}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(u.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TAB: Localizações
// ═══════════════════════════════════════════════════════════════════

function LocationsTabContent({ tenant, token }: { tenant: any; token: string }) {
  const { addToast } = useToast();
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingLoc, setEditingLoc] = useState<any>(null);

  const [formCode, setFormCode] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editDesc, setEditDesc] = useState("");

  const loadData = async () => {
    try {
      const all = await api.getLocations(token);
      setLocations(all.filter((l: any) => l.tenantId === tenant.id));
    } catch { }
    setLoading(false);
  };
  useEffect(() => { loadData(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.createLocation({ code: formCode, description: formDesc || undefined, tenantId: tenant.id }, token); setOpenCreate(false); setFormCode(""); setFormDesc(""); addToast("Localização cadastrada!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro", "error"); }
  };
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    try { await api.updateLocation(editingLoc.id, { code: editCode, description: editDesc || undefined }, token); setOpenEdit(false); setEditingLoc(null); addToast("Localização atualizada!", "success"); loadData(); }
    catch (err: any) { addToast(err.message || "Erro", "error"); }
  };
  const openEditDialog = (l: any) => { setEditingLoc(l); setEditCode(l.code); setEditDesc(l.description || ""); setOpenEdit(true); };
  const handleDelete = async (id: string) => { try { await api.deleteLocation(id, token); addToast("Localização desativada!", "success"); loadData(); } catch (err: any) { addToast(err.message || "Erro", "error"); } };

  if (loading) return <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-lg font-semibold">Localizações</h2><p className="text-sm text-muted-foreground">Locais de armazenamento de encomendas</p></div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nova</Button></DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Cadastrar Localização</DialogTitle><DialogDescription>Defina código e descrição</DialogDescription></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-1"><Label>Código *</Label><Input value={formCode} onChange={(e) => setFormCode(e.target.value)} required placeholder="Ex: E1-P2" /></div>
              <div className="space-y-1"><Label>Descrição</Label><Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Ex: Estante 1 - Prateleira 2" /></div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Editar Localização</DialogTitle><DialogDescription>Altere os dados</DialogDescription></DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-1"><Label>Código</Label><Input value={editCode} onChange={(e) => setEditCode(e.target.value)} required /></div>
            <div className="space-y-1"><Label>Descrição</Label><Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} /></div>
            <Button type="submit" className="w-full">Salvar</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="w-full overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Código</TableHead><TableHead>Descrição</TableHead><TableHead>Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {locations.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Nenhuma localização encontrada</TableCell></TableRow>
              ) : locations.map((l: any) => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono font-medium">{l.code}</TableCell>
                  <TableCell>{l.description || "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(l)}><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(l.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
