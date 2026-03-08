"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
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
  Plus, Trash2, Pencil, RotateCcw, AlertTriangle, Settings, ArrowLeft,
  Phone, Wifi, WifiOff, Camera, Video, Save, TestTube2, Loader2,
  CheckCircle, XCircle,
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

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════

export default function TenantsPage() {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingTenant, setEditingTenant] = useState<any>(null);
  const [openPermanentDelete, setOpenPermanentDelete] = useState(false);
  const [deletingTenant, setDeletingTenant] = useState<any>(null);
  const [confirmName, setConfirmName] = useState("");

  // Config view
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
    try {
      setTenants(await api.getTenants(token));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [token]);

  // ─── CRUD handlers ──────────────────────────────────────────────

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createTenant({
        name: formName,
        document: formDocument || undefined,
        address: formAddress || undefined,
        phone: formPhone || undefined,
        sindico: formSindico || undefined,
        sindicoPhone: formSindicoPhone || undefined,
      }, token);
      setOpenCreate(false);
      setFormName(""); setFormDocument(""); setFormAddress(""); setFormPhone("");
      setFormSindico(""); setFormSindicoPhone("");
      addToast("Condomínio cadastrado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar", "error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingTenant) return;
    try {
      await api.updateTenant(editingTenant.id, {
        name: editName,
        document: editDocument || undefined,
        address: editAddress || undefined,
        phone: editPhone || undefined,
        sindico: editSindico || undefined,
        sindicoPhone: editSindicoPhone || undefined,
      }, token);
      setOpenEdit(false);
      setEditingTenant(null);
      addToast("Condomínio atualizado!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao atualizar", "error");
    }
  };

  const openEditDialog = (tenant: any) => {
    setEditingTenant(tenant);
    setEditName(tenant.name);
    setEditDocument(tenant.document || "");
    setEditAddress(tenant.address || "");
    setEditPhone(tenant.phone || "");
    setEditSindico(tenant.sindico || "");
    setEditSindicoPhone(tenant.sindicoPhone || "");
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteTenant(id, token);
      addToast("Condomínio desativado!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao desativar", "error");
    }
  };

  const handleReactivate = async (id: string) => {
    if (!token) return;
    try {
      await api.reactivateTenant(id, token);
      addToast("Condomínio reativado!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao reativar", "error");
    }
  };

  const handlePermanentDelete = async () => {
    if (!token || !deletingTenant) return;
    if (confirmName !== deletingTenant.name) {
      addToast("O nome digitado não confere.", "error");
      return;
    }
    try {
      await api.permanentDeleteTenant(deletingTenant.id, token);
      setOpenPermanentDelete(false);
      setDeletingTenant(null);
      setConfirmName("");
      addToast("Condomínio excluído permanentemente!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao excluir", "error");
    }
  };

  // ─── CONFIG VIEW ────────────────────────────────────────────────

  if (configTenant) {
    return (
      <TenantConfigView
        tenant={configTenant}
        token={token!}
        onBack={() => setConfigTenant(null)}
      />
    );
  }

  // ─── RENDER ─────────────────────────────────────────────────────

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
            <DialogHeader>
              <DialogTitle>Cadastrar Condomínio</DialogTitle>
              <DialogDescription>Preencha os dados do novo condomínio</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Ex: Residencial Sol Nascente" /></div>
              <div className="space-y-2"><Label>CNPJ</Label><Input value={formDocument} onChange={(e) => setFormDocument(e.target.value)} placeholder="00.000.000/0001-00" /></div>
              <div className="space-y-2"><Label>Endereço</Label><Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Rua, número, cidade" /></div>
              <div className="space-y-2"><Label>Telefone do Condomínio</Label><Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(11) 99999-0000" /></div>
              <div className="space-y-2"><Label>Síndico</Label><Input value={formSindico} onChange={(e) => setFormSindico(e.target.value)} placeholder="Nome do síndico" /></div>
              <div className="space-y-2"><Label>Telefone do Síndico</Label><Input value={formSindicoPhone} onChange={(e) => setFormSindicoPhone(e.target.value)} placeholder="(11) 99999-0000" /></div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Condomínio</DialogTitle>
            <DialogDescription>Altere os dados do condomínio</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={editName} onChange={(e) => setEditName(e.target.value)} required /></div>
            <div className="space-y-2"><Label>CNPJ</Label><Input value={editDocument} onChange={(e) => setEditDocument(e.target.value)} /></div>
            <div className="space-y-2"><Label>Endereço</Label><Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone do Condomínio</Label><Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} /></div>
            <div className="space-y-2"><Label>Síndico</Label><Input value={editSindico} onChange={(e) => setEditSindico(e.target.value)} /></div>
            <div className="space-y-2"><Label>Telefone do Síndico</Label><Input value={editSindicoPhone} onChange={(e) => setEditSindicoPhone(e.target.value)} /></div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Dialog */}
      <Dialog open={openPermanentDelete} onOpenChange={setOpenPermanentDelete}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />Excluir Permanentemente
            </DialogTitle>
            <DialogDescription>
              Esta ação é <strong>irreversível</strong>. Todos os dados serão excluídos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm font-medium">Condomínio: <strong>{deletingTenant?.name}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">Para confirmar, digite o nome:</p>
            </div>
            <div className="space-y-2">
              <Label>Nome do condomínio</Label>
              <Input placeholder={deletingTenant?.name} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpenPermanentDelete(false)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={handlePermanentDelete} disabled={confirmName !== deletingTenant?.name}>
                <Trash2 className="mr-2 h-4 w-4" />Excluir Permanentemente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tenants Table */}
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
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum condomínio encontrado
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.sindico || "—"}</TableCell>
                    <TableCell>{t.sindicoPhone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.active ? "success" : "destructive"}>
                        {t.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {t.active && (
                          <Button size="sm" variant="outline" onClick={() => setConfigTenant(t)} title="Configurações">
                            <Settings className="h-3 w-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(t)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {t.active ? (
                          <Button size="sm" variant="outline" onClick={() => handleDelete(t.id)} title="Desativar">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleReactivate(t.id)} title="Reativar" className="text-green-600 hover:text-green-700">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => { setDeletingTenant(t); setConfirmName(""); setOpenPermanentDelete(true); }} title="Excluir permanentemente">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TENANT CONFIG VIEW (WhatsApp, Equipamentos, Câmera RTSP)
// ═══════════════════════════════════════════════════════════════════

function TenantConfigView({ tenant, token, onBack }: { tenant: any; token: string; onBack: () => void }) {
  const { addToast } = useToast();
  const [config, setConfig] = useState<TenantConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWhatsapp, setTestingWhatsapp] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Equipment CRUD
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [loadingEq, setLoadingEq] = useState(false);
  const [openEqForm, setOpenEqForm] = useState(false);
  const [editingEqId, setEditingEqId] = useState<string | null>(null);
  const [openDeleteEq, setOpenDeleteEq] = useState(false);
  const [deletingEqId, setDeletingEqId] = useState<string | null>(null);

  // Equipment form
  const [eqName, setEqName] = useState("");
  const [eqIp, setEqIp] = useState("");
  const [eqPort, setEqPort] = useState("80");
  const [eqUser, setEqUser] = useState("admin");
  const [eqPassword, setEqPassword] = useState("");
  const [eqDoorCount, setEqDoorCount] = useState("1");
  const [eqWireguardIp, setEqWireguardIp] = useState("");
  const [eqEnabled, setEqEnabled] = useState(true);

  useEffect(() => {
    loadConfig();
    loadEquipments();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const data = await api.getTenantConfig(token, tenant.id);
      setConfig(data);
    } catch { setConfig({}); }
    setLoading(false);
  }

  async function loadEquipments() {
    setLoadingEq(true);
    try {
      const all = await api.getEquipments(token);
      setEquipments(all.filter((eq: Equipment) => eq.tenantId === tenant.id));
    } catch { }
    setLoadingEq(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await api.updateTenantConfig({
        whatsappToken: config.whatsappToken || null,
        hikvisionIp: config.hikvisionIp || null,
        hikvisionPort: config.hikvisionPort ? Number(config.hikvisionPort) : null,
        hikvisionUser: config.hikvisionUser || null,
        hikvisionPassword: config.hikvisionPassword || null,
        hikvisionEnabled: config.hikvisionEnabled || false,
        rtspCameraUrl: config.rtspCameraUrl || null,
      }, token, tenant.id);
      setMessage({ type: "success", text: "Configurações salvas!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro ao salvar" });
    }
    setSaving(false);
  }

  async function handleTestWhatsapp() {
    if (!testPhone) return;
    setTestingWhatsapp(true); setMessage(null);
    try {
      const result = await api.testWhatsapp(testPhone, token);
      setMessage({ type: "success", text: result.message || "Teste enviado!" });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Erro no teste" });
    }
    setTestingWhatsapp(false);
  }

  // ─── Equipment CRUD ──────────────────────────────────────────────

  function resetEqForm() {
    setEqName(""); setEqIp(""); setEqPort("80"); setEqUser("admin");
    setEqPassword(""); setEqDoorCount("1"); setEqWireguardIp("");
    setEqEnabled(true); setEditingEqId(null);
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
    setOpenEqForm(true);
  }

  async function handleSubmitEq() {
    if (!eqName.trim()) { addToast("Nome é obrigatório", "error"); return; }
    const data = {
      name: eqName.trim(),
      tenantId: tenant.id,
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
    if (!deletingEqId) return;
    try {
      await api.deleteEquipment(deletingEqId, token);
      addToast("Equipamento removido", "success");
      setOpenDeleteEq(false); setDeletingEqId(null); loadEquipments();
    } catch (err: any) {
      addToast(err.message || "Erro ao remover", "error");
    }
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Configurações — {tenant.name}</h1>
          {tenant.sindico && (
            <p className="text-sm text-muted-foreground">
              Síndico: {tenant.sindico} {tenant.sindicoPhone ? `· ${tenant.sindicoPhone}` : ""}
            </p>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`flex items-center gap-2 rounded-lg border p-4 ${message.type === "success" ? "border-green-200 bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800" : "border-red-200 bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800"}`}>
          {message.type === "success" ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {message.text}
        </div>
      )}

      {/* ─── WhatsApp ──────────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Phone className="h-5 w-5 text-green-600" />
          <h2 className="text-lg font-semibold">WhatsApp (Viício)</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Token de API para envio de mensagens WhatsApp. Se não configurado, será usado o token principal.
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Token da API</label>
            <input type="password" className="w-full rounded-md border px-3 py-2 bg-background" placeholder="Deixe vazio para usar token principal" value={config.whatsappToken || ""} onChange={(e) => setConfig({ ...config, whatsappToken: e.target.value })} />
          </div>
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

      {/* ─── Equipamentos ──────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold">Equipamentos</h2>
          </div>
          <Button size="sm" onClick={() => { resetEqForm(); setOpenEqForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />Adicionar
          </Button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Cadastre os equipamentos Hikvision. Eles aparecerão no menu Equipamentos com status e controle de porta.
        </p>

        {loadingEq ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : equipments.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-30" />Nenhum equipamento cadastrado
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
                    {eq.wireguardIp ? ` · WG: ${eq.wireguardIp}` : ""}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleEditEq(eq)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => { setDeletingEqId(eq.id); setOpenDeleteEq(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <DialogDescription>{editingEqId ? "Altere os dados do equipamento" : "Preencha os dados do equipamento Hikvision"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome *</Label><Input placeholder="Ex: Portaria Principal" value={eqName} onChange={(e) => setEqName(e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2"><Label>IP</Label><Input placeholder="192.168.1.100" value={eqIp} onChange={(e) => setEqIp(e.target.value)} /></div>
              <div><Label>Porta</Label><Input type="number" value={eqPort} onChange={(e) => setEqPort(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Usuário</Label><Input value={eqUser} onChange={(e) => setEqUser(e.target.value)} /></div>
              <div><Label>Senha</Label><Input type="password" value={eqPassword} onChange={(e) => setEqPassword(e.target.value)} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Nº de Portas</Label><Input type="number" min="1" max="8" value={eqDoorCount} onChange={(e) => setEqDoorCount(e.target.value)} /></div>
              <div><Label>IP WireGuard</Label><Input placeholder="10.0.0.x" value={eqWireguardIp} onChange={(e) => setEqWireguardIp(e.target.value)} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="eqEn" checked={eqEnabled} onChange={(e) => setEqEnabled(e.target.checked)} className="rounded" />
              <Label htmlFor="eqEn">Habilitado</Label>
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
            <DialogDescription>Tem certeza que deseja remover?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenDeleteEq(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDeleteEq}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Câmera RTSP ──────────────────────────────────────── */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4 flex items-center gap-2">
          <Video className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold">Câmera RTSP (Totem)</h2>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          URL da câmera para exibição no totem de retirada de encomendas.
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium">URL da Câmera</label>
          <input type="text" className="w-full rounded-md border px-3 py-2 bg-background" placeholder="http://192.168.1.100/ISAPI/Streaming/channels/101/httpPreview" value={config.rtspCameraUrl || ""} onChange={(e) => setConfig({ ...config, rtspCameraUrl: e.target.value })} />
        </div>
      </div>

      {/* Save */}
      <div className="flex flex-col sm:flex-row justify-end pt-4 pb-8">
        <button onClick={handleSave} disabled={saving} className="flex w-full sm:w-auto items-center justify-center gap-2 rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
