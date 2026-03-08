"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wifi,
  WifiOff,
  Plus,
  Pencil,
  Trash2,
  Unlock,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldX,
  Signal,
  Loader2,
} from "lucide-react";

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

interface StatusMap {
  [id: string]: { online: boolean; latencyMs?: number; wireguardOnline?: boolean };
}

export default function EquipmentPage() {
  const { token, user } = useAuth();
  const { addToast } = useToast();

  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [loading, setLoading] = useState(true);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [openingDoor, setOpeningDoor] = useState<string | null>(null);
  const [tenants, setTenants] = useState<any[]>([]);

  // Dialog state
  const [openForm, setOpenForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openDelete, setOpenDelete] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formIp, setFormIp] = useState("");
  const [formPort, setFormPort] = useState("80");
  const [formUser, setFormUser] = useState("admin");
  const [formPassword, setFormPassword] = useState("");
  const [formDoorCount, setFormDoorCount] = useState("1");
  const [formWireguardIp, setFormWireguardIp] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);

  const isAdmin = user?.role === "ADMIN";
  const isAdminCond = user?.role === "ADMIN_CONDOMINIO";
  const canEdit = isAdmin || isAdminCond;

  // ─── Data loading ─────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [eqs, tn] = await Promise.all([
        api.getEquipments(token),
        isAdmin ? api.getTenants(token).catch(() => []) : Promise.resolve([]),
      ]);
      setEquipments(eqs);
      setTenants(tn.filter((t: any) => t.active));
    } catch (err: any) {
      addToast(err.message || "Erro ao carregar equipamentos", "error");
    } finally {
      setLoading(false);
    }
  }, [token, isAdmin]);

  const loadStatus = useCallback(async () => {
    if (!token) return;
    setCheckingStatus(true);
    try {
      const statuses: Array<{ id: string; online: boolean; latencyMs?: number; wireguardOnline?: boolean }> =
        await api.getEquipmentStatus(token);
      const map: StatusMap = {};
      statuses.forEach((s) => {
        map[s.id] = { online: s.online, latencyMs: s.latencyMs, wireguardOnline: s.wireguardOnline };
      });
      setStatusMap(map);
    } catch {
      // silently fail
    } finally {
      setCheckingStatus(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!loading && equipments.length > 0) {
      loadStatus();
    }
  }, [loading, equipments.length, loadStatus]);

  // Auto refresh status every 30s
  useEffect(() => {
    if (equipments.length === 0) return;
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [equipments.length, loadStatus]);

  // ─── Actions ──────────────────────────────────────────────────────

  const handleOpenDoor = async (equipmentId: string, doorNo: number) => {
    if (!token) return;
    setOpeningDoor(`${equipmentId}-${doorNo}`);
    try {
      const result = await api.openEquipmentDoor(equipmentId, doorNo, token);
      if (result?.success === false) {
        addToast(result.message || "Erro ao abrir porta", "error");
      } else {
        addToast(`Porta ${doorNo} destravada com sucesso`, "success");
      }
    } catch (err: any) {
      addToast(err.message || "Erro ao abrir porta", "error");
    } finally {
      setOpeningDoor(null);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormTenantId("");
    setFormIp("");
    setFormPort("80");
    setFormUser("admin");
    setFormPassword("");
    setFormDoorCount("1");
    setFormWireguardIp("");
    setFormEnabled(true);
    setEditingId(null);
  };

  const handleCreate = () => {
    resetForm();
    if (!isAdmin && user?.tenantId) {
      setFormTenantId(user.tenantId);
    }
    setOpenForm(true);
  };

  const handleEdit = (eq: Equipment) => {
    setEditingId(eq.id);
    setFormName(eq.name);
    setFormTenantId(eq.tenantId);
    setFormIp(eq.hikvisionIp || "");
    setFormPort(String(eq.hikvisionPort || 80));
    setFormUser(eq.hikvisionUser || "admin");
    setFormPassword(eq.hikvisionPassword || "");
    setFormDoorCount(String(eq.doorCount || 1));
    setFormWireguardIp(eq.wireguardIp || "");
    setFormEnabled(eq.enabled);
    setOpenForm(true);
  };

  const handleSubmit = async () => {
    if (!token || !formName.trim()) {
      addToast("Nome é obrigatório", "error");
      return;
    }

    const data = {
      name: formName.trim(),
      tenantId: formTenantId || undefined,
      hikvisionIp: formIp.trim() || undefined,
      hikvisionPort: parseInt(formPort) || 80,
      hikvisionUser: formUser.trim() || "admin",
      hikvisionPassword: formPassword || undefined,
      doorCount: parseInt(formDoorCount) || 1,
      wireguardIp: formWireguardIp.trim() || undefined,
      enabled: formEnabled,
    };

    try {
      if (editingId) {
        await api.updateEquipment(editingId, data, token);
        addToast("Equipamento atualizado", "success");
      } else {
        await api.createEquipment(data, token);
        addToast("Equipamento criado", "success");
      }
      setOpenForm(false);
      resetForm();
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao salvar equipamento", "error");
    }
  };

  const handleDelete = async () => {
    if (!token || !deletingId) return;
    try {
      await api.deleteEquipment(deletingId, token);
      addToast("Equipamento removido", "success");
      setOpenDelete(false);
      setDeletingId(null);
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao remover", "error");
    }
  };

  // ─── Grouping ─────────────────────────────────────────────────────

  // Agrupa por condomínio para admin master
  const grouped = isAdmin
    ? equipments.reduce<Record<string, Equipment[]>>((acc, eq) => {
        const key = eq.tenant?.name || "Sem condomínio";
        if (!acc[key]) acc[key] = [];
        acc[key].push(eq);
        return acc;
      }, {})
    : { "": equipments };

  // ─── Render ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Equipamentos</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie seus equipamentos Hikvision
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadStatus}
            disabled={checkingStatus}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${checkingStatus ? "animate-spin" : ""}`} />
            Atualizar Status
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Equipamento
            </Button>
          )}
        </div>
      </div>

      {/* Equipment cards */}
      {equipments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Wifi className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum equipamento cadastrado</p>
            {canEdit && (
              <Button variant="outline" className="mt-4" onClick={handleCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Equipamento
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([groupName, items]) => (
          <div key={groupName}>
            {isAdmin && groupName && (
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                {groupName}
              </h2>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((eq) => {
                const status = statusMap[eq.id];
                const online = status?.online ?? null;
                const wireguardOnline = status?.wireguardOnline;

                return (
                  <Card
                    key={eq.id}
                    className={`relative overflow-hidden transition-all ${
                      !eq.enabled ? "opacity-60" : ""
                    }`}
                  >
                    {/* Status indicator bar */}
                    <div
                      className={`absolute top-0 left-0 right-0 h-1 ${
                        online === null
                          ? "bg-muted"
                          : online
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />

                    <CardContent className="pt-5 space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold truncate">{eq.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">
                            {eq.hikvisionIp || "IP não configurado"}
                            {eq.hikvisionPort && eq.hikvisionPort !== 80
                              ? `:${eq.hikvisionPort}`
                              : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {online === null ? (
                            <Badge variant="outline" className="text-xs">
                              <Signal className="h-3 w-3 mr-1" />
                              ...
                            </Badge>
                          ) : online ? (
                            <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-xs">
                              <Wifi className="h-3 w-3 mr-1" />
                              Online
                              {status?.latencyMs != null && (
                                <span className="ml-1 opacity-70">{status.latencyMs}ms</span>
                              )}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <WifiOff className="h-3 w-3 mr-1" />
                              Offline
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* WireGuard status (admin only) */}
                      {isAdmin && eq.wireguardIp && (
                        <div className="flex items-center gap-2 text-xs">
                          {wireguardOnline === undefined ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Shield className="h-3.5 w-3.5" />
                              WireGuard: verificando...
                            </span>
                          ) : wireguardOnline ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              WireGuard: conectado ({eq.wireguardIp})
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <ShieldX className="h-3.5 w-3.5" />
                              WireGuard: desconectado ({eq.wireguardIp})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Info badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">
                          {eq.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {eq.doorCount} porta{eq.doorCount > 1 ? "s" : ""}
                        </Badge>
                        {!eq.enabled && (
                          <Badge variant="secondary" className="text-xs">
                            Desabilitado
                          </Badge>
                        )}
                      </div>

                      {/* Door buttons */}
                      {eq.enabled && (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: eq.doorCount }, (_, i) => i + 1).map(
                            (doorNo) => (
                              <Button
                                key={doorNo}
                                size="sm"
                                variant="outline"
                                className="text-green-600 dark:text-green-400 hover:bg-green-500/10 hover:text-green-700 dark:hover:text-green-300 border-green-500/30"
                                disabled={openingDoor === `${eq.id}-${doorNo}` || online === false}
                                onClick={() => handleOpenDoor(eq.id, doorNo)}
                              >
                                {openingDoor === `${eq.id}-${doorNo}` ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Unlock className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                {eq.doorCount > 1
                                  ? `Destravar Porta ${doorNo}`
                                  : "Destravar Porta"}
                              </Button>
                            )
                          )}
                        </div>
                      )}

                      {/* Admin actions */}
                      {canEdit && (
                        <div className="flex gap-2 pt-2 border-t">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => handleEdit(eq)}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeletingId(eq.id);
                              setOpenDelete(true);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Remover
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openForm} onOpenChange={setOpenForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Editar Equipamento" : "Novo Equipamento"}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? "Altere os dados do equipamento"
                : "Preencha os dados do novo equipamento Hikvision"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome *</Label>
              <Input
                placeholder="Ex: Portaria Principal"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {isAdmin && (
              <div>
                <Label>Condomínio</Label>
                <Select value={formTenantId} onValueChange={setFormTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>IP do Hikvision</Label>
                <Input
                  placeholder="192.168.1.100"
                  value={formIp}
                  onChange={(e) => setFormIp(e.target.value)}
                />
              </div>
              <div>
                <Label>Porta</Label>
                <Input
                  type="number"
                  value={formPort}
                  onChange={(e) => setFormPort(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Usuário</Label>
                <Input
                  value={formUser}
                  onChange={(e) => setFormUser(e.target.value)}
                />
              </div>
              <div>
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nº de Portas</Label>
                <Input
                  type="number"
                  min="1"
                  max="8"
                  value={formDoorCount}
                  onChange={(e) => setFormDoorCount(e.target.value)}
                />
              </div>
              <div>
                <Label>IP WireGuard</Label>
                <Input
                  placeholder="10.0.0.x"
                  value={formWireguardIp}
                  onChange={(e) => setFormWireguardIp(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="formEnabled"
                checked={formEnabled}
                onChange={(e) => setFormEnabled(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="formEnabled">Habilitado</Label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setOpenForm(false);
                  resetForm();
                }}
              >
                Cancelar
              </Button>
              <Button onClick={handleSubmit}>{editingId ? "Salvar" : "Criar"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={openDelete} onOpenChange={setOpenDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover Equipamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este equipamento? A ação pode ser
              desfeita pelo administrador.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpenDelete(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
