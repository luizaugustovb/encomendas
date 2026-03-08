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
import { Plus, Trash2, Pencil, Camera, UserCircle, Filter, PlusCircle, RotateCcw, AlertTriangle } from "lucide-react";

const roleLabels: Record<string, string> = {
  ADMIN: "Admin Master",
  ADMIN_CONDOMINIO: "Admin Condomínio",
  PORTEIRO: "Porteiro",
  ZELADOR: "Zelador",
  MORADOR: "Morador",
};

export default function UsersPage() {
  const { token, user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [openNewUnit, setOpenNewUnit] = useState(false);
  const [openPermanentDelete, setOpenPermanentDelete] = useState(false);
  const [permanentDeleteUser, setPermanentDeleteUser] = useState<any>(null);
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState("");

  // Filter
  const [filterTenantId, setFilterTenantId] = useState("all");

  const isAdmin = currentUser?.role === "ADMIN";

  // Create form
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formRole, setFormRole] = useState("MORADOR");
  const [formUnitId, setFormUnitId] = useState("");
  const [formTenantId, setFormTenantId] = useState("");
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null);
  const createPhotoRef = useRef<HTMLInputElement>(null);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("MORADOR");
  const [editUnitId, setEditUnitId] = useState("");
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [editPhotoPreview, setEditPhotoPreview] = useState<string | null>(null);
  const editPhotoRef = useRef<HTMLInputElement>(null);

  // New unit inline form
  const [newUnitNumber, setNewUnitNumber] = useState("");
  const [newUnitBlock, setNewUnitBlock] = useState("");
  const [newUnitType, setNewUnitType] = useState("APARTAMENTO");

  // Filtered units by selected tenant
  const [createUnits, setCreateUnits] = useState<any[]>([]);
  const [editUnits, setEditUnits] = useState<any[]>([]);

  const loadData = async () => {
    if (!token) return;
    try {
      const effectiveTenantId = isAdmin && filterTenantId !== "all" ? filterTenantId : undefined;
      const [u, un, t] = await Promise.all([
        api.getUsers(token, effectiveTenantId),
        api.getUnits(token).catch(() => []),
        isAdmin ? api.getTenants(token).catch(() => []) : Promise.resolve([]),
      ]);
      setUsers(u);
      setUnits(un);
      setTenants(t.filter((t: any) => t.active));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [token, filterTenantId]);

  // Load units when tenant is selected in create form
  const handleCreateTenantChange = async (tenantId: string) => {
    setFormTenantId(tenantId);
    setFormUnitId("");
    if (token && tenantId) {
      try {
        const u = await api.getUnits(token, tenantId);
        setCreateUnits(u);
      } catch { setCreateUnits([]); }
    } else {
      setCreateUnits([]);
    }
  };

  // Load units when editing a user's tenant context
  const loadEditUnits = async (tenantId: string) => {
    if (token && tenantId) {
      try {
        const u = await api.getUnits(token, tenantId);
        setEditUnits(u);
      } catch { setEditUnits([]); }
    } else {
      setEditUnits([]);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>, mode: "create" | "edit") => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Comprime a foto limitando a < 200KB
    const compressedFile = await compressImage(file, 190); // 190 para ter margem segura < 200KB

    if (mode === "create") {
      setFormPhoto(compressedFile);
      setFormPhotoPreview(URL.createObjectURL(compressedFile));
    } else {
      setEditPhoto(compressedFile);
      setEditPhotoPreview(URL.createObjectURL(compressedFile));
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (isAdmin && !formTenantId) {
      addToast("Selecione o condomínio antes de cadastrar o usuário", "error");
      return;
    }

    try {
      const payload: any = {
        name: formName,
        email: formEmail,
        password: formPassword,
        phone: formPhone ? `55${formPhone}` : undefined,
        role: formRole,
        unitId: formUnitId || undefined,
      };
      if (isAdmin && formTenantId) {
        payload.tenantId = formTenantId;
      }

      const created = await api.createUser(payload, token);

      // Upload photo if selected
      if (formPhoto && created?.id) {
        try {
          await api.uploadUserPhoto(created.id, formPhoto, token);
        } catch (err) {
          console.error("Erro ao enviar foto:", err);
        }
      }

      setOpenCreate(false);
      resetCreateForm();
      addToast("Usuário cadastrado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar usuário", "error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUser) return;
    try {
      const data: any = {
        name: editName,
        email: editEmail,
        phone: editPhone ? `55${editPhone}` : editPhone,
        role: editRole,
        unitId: editUnitId || null,
      };
      if (editPassword) data.password = editPassword;
      await api.updateUser(editingUser.id, data, token);

      if (editPhoto) {
        try {
          await api.uploadUserPhoto(editingUser.id, editPhoto, token);
        } catch (err) {
          console.error("Erro ao enviar foto:", err);
        }
      }

      setOpenEdit(false);
      setEditingUser(null);
      addToast("Usuário atualizado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao atualizar usuário", "error");
    }
  };

  const openEditDialog = async (user: any) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword("");
    setEditPhone(user.phone ? user.phone.replace(/^55/, '') : "");
    setEditRole(user.role);
    setEditUnitId(user.unitId || "");
    setEditPhoto(null);
    setEditPhotoPreview(user.photoUrl || null);
    await loadEditUnits(user.tenantId);
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteUser(id, token);
      addToast("Usuário desativado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao desativar usuário", "error");
    }
  };

  const handleReactivate = async (id: string) => {
    if (!token) return;
    try {
      await api.reactivateUser(id, token);
      addToast("Usuário reativado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao reativar usuário", "error");
    }
  };

  const handlePermanentDelete = async () => {
    if (!token || !permanentDeleteUser) return;
    if (permanentDeleteConfirm !== permanentDeleteUser.name) {
      addToast("O nome digitado não confere", "error");
      return;
    }
    try {
      await api.permanentDeleteUser(permanentDeleteUser.id, token);
      addToast("Usuário excluído permanentemente!", "success");
      setOpenPermanentDelete(false);
      setPermanentDeleteUser(null);
      setPermanentDeleteConfirm("");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao excluir usuário", "error");
    }
  };

  const openPermanentDeleteDialog = (user: any) => {
    setPermanentDeleteUser(user);
    setPermanentDeleteConfirm("");
    setOpenPermanentDelete(true);
  };

  // Inline create unit
  const handleCreateInlineUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const tenantId = formTenantId || currentUser?.tenantId;
    if (!tenantId) {
      addToast("Selecione o condomínio primeiro", "error");
      return;
    }
    try {
      const created = await api.createUnit(
        { number: newUnitNumber, block: newUnitBlock || undefined, type: newUnitType, tenantId },
        token,
      );
      setOpenNewUnit(false);
      setNewUnitNumber(""); setNewUnitBlock(""); setNewUnitType("APARTAMENTO");
      addToast("Unidade criada com sucesso!", "success");
      await handleCreateTenantChange(tenantId);
      setFormUnitId(created.id);
    } catch (err: any) {
      addToast(err.message || "Erro ao criar unidade", "error");
    }
  };

  const resetCreateForm = () => {
    setFormName(""); setFormEmail(""); setFormPassword("");
    setFormPhone(""); setFormRole("MORADOR"); setFormUnitId("");
    setFormTenantId(""); setFormPhoto(null); setFormPhotoPreview(null);
    setCreateUnits([]);
  };

  if (loading) return <div className="animate-pulse">Carregando usuários...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Usuários</h1>
          <p className="text-muted-foreground">Gerencie os moradores e funcionários</p>
        </div>
        <Dialog open={openCreate} onOpenChange={(open) => { setOpenCreate(open); if (!open) resetCreateForm(); }}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Novo Usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Usuário</DialogTitle>
              <DialogDescription>Preencha os dados do novo usuário. Selecione o condomínio primeiro.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {/* Step 1: Condominium */}
              {isAdmin && (
                <div className="space-y-2 rounded-md border p-3 bg-muted/50">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    <Filter className="h-3 w-3" /> 1. Condomínio *
                  </Label>
                  <Select value={formTenantId} onValueChange={handleCreateTenantChange}>
                    <SelectTrigger><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Step 2: Photo */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="relative w-24 h-24 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                  onClick={() => createPhotoRef.current?.click()}
                >
                  {formPhotoPreview ? (
                    <img src={formPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <UserCircle className="w-12 h-12 text-muted-foreground/50" />
                  )}
                  <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1">
                    <Camera className="w-3 h-3" />
                  </div>
                </div>
                <input
                  ref={createPhotoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => handlePhotoChange(e, "create")}
                />
                <p className="text-xs text-muted-foreground">Foto de perfil (reconhecimento facial)</p>
              </div>

              {/* Step 3: Basic data */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>E-mail *</Label>
                  <Input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Senha *</Label>
                  <Input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} />
                </div>
                <div className="space-y-2">
                  <Label>Telefone (WhatsApp)</Label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+55</span>
                    <Input className="rounded-l-none" placeholder="84999990000" value={formPhone} onChange={(e) => setFormPhone(e.target.value.replace(/\D/g, ''))} />
                  </div>
                </div>
              </div>

              {/* Step 4: Role */}
              <div className="space-y-2">
                <Label>Função *</Label>
                <Select value={formRole} onValueChange={setFormRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {isAdmin && <SelectItem value="ADMIN">Admin Master</SelectItem>}
                    <SelectItem value="ADMIN_CONDOMINIO">Admin Condomínio</SelectItem>
                    <SelectItem value="PORTEIRO">Porteiro</SelectItem>
                    <SelectItem value="ZELADOR">Zelador</SelectItem>
                    <SelectItem value="MORADOR">Morador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Step 5: Unit (with inline create) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Unidade {formRole === "MORADOR" ? "*" : "(opcional)"}</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      if (isAdmin && !formTenantId) {
                        addToast("Selecione o condomínio primeiro", "error");
                        return;
                      }
                      setOpenNewUnit(true);
                    }}
                  >
                    <PlusCircle className="h-3 w-3 mr-1" /> Criar unidade
                  </Button>
                </div>
                <Select value={formUnitId} onValueChange={setFormUnitId}>
                  <SelectTrigger><SelectValue placeholder="Selecione a unidade" /></SelectTrigger>
                  <SelectContent>
                    {(isAdmin ? createUnits : units).map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.number}{u.block ? ` - Bloco ${u.block}` : ''} ({u.type})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isAdmin && !formTenantId}
              >
                Cadastrar Usuário
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Inline Unit Creation Dialog */}
      <Dialog open={openNewUnit} onOpenChange={setOpenNewUnit}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Criar Nova Unidade</DialogTitle>
            <DialogDescription>A unidade será criada no condomínio selecionado</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInlineUnit} className="space-y-4">
            <div className="space-y-2">
              <Label>Número *</Label>
              <Input value={newUnitNumber} onChange={(e) => setNewUnitNumber(e.target.value)} required placeholder="Ex: 101" />
            </div>
            <div className="space-y-2">
              <Label>Bloco (opcional)</Label>
              <Input value={newUnitBlock} onChange={(e) => setNewUnitBlock(e.target.value)} placeholder="Ex: A" />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={newUnitType} onValueChange={setNewUnitType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="APARTAMENTO">Apartamento</SelectItem>
                  <SelectItem value="CASA">Casa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">Criar Unidade</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>Altere os dados do usuário</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {isAdmin && editingUser && (
              <div className="rounded-md border p-2 bg-muted/50">
                <p className="text-xs text-muted-foreground">Condomínio</p>
                <p className="text-sm font-medium">{editingUser.tenant?.name || "—"}</p>
              </div>
            )}

            {/* Photo */}
            <div className="flex flex-col items-center gap-2">
              <div
                className="relative w-24 h-24 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center cursor-pointer hover:border-primary transition-colors overflow-hidden"
                onClick={() => editPhotoRef.current?.click()}
              >
                {editPhotoPreview ? (
                  <img src={editPhotoPreview} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <UserCircle className="w-12 h-12 text-muted-foreground/50" />
                )}
                <div className="absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-1">
                  <Camera className="w-3 h-3" />
                </div>
              </div>
              <input
                ref={editPhotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handlePhotoChange(e, "edit")}
              />
              <p className="text-xs text-muted-foreground">Clique para alterar a foto</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha (vazio = manter)</Label>
                <Input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} minLength={6} />
              </div>
              <div className="space-y-2">
                <Label>Telefone (WhatsApp)</Label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-muted-foreground text-sm">+55</span>
                  <Input className="rounded-l-none" placeholder="84999990000" value={editPhone} onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Função</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {isAdmin && <SelectItem value="ADMIN">Admin Master</SelectItem>}
                  <SelectItem value="ADMIN_CONDOMINIO">Admin Condomínio</SelectItem>
                  <SelectItem value="PORTEIRO">Porteiro</SelectItem>
                  <SelectItem value="ZELADOR">Zelador</SelectItem>
                  <SelectItem value="MORADOR">Morador</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Unidade {editRole === "MORADOR" ? "*" : "(opcional)"}</Label>
              <Select value={editUnitId} onValueChange={setEditUnitId}>
                <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                <SelectContent>
                  {editUnits.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.number}{u.block ? ` - Bloco ${u.block}` : ''} ({u.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={openPermanentDelete} onOpenChange={setOpenPermanentDelete}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Permanentemente
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita. Todas as encomendas e dados associados a este usuário serão removidos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm">
              Para confirmar, digite o nome do usuário: <strong>{permanentDeleteUser?.name}</strong>
            </p>
            <Input
              value={permanentDeleteConfirm}
              onChange={(e) => setPermanentDeleteConfirm(e.target.value)}
              placeholder="Digite o nome do usuário"
            />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpenPermanentDelete(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handlePermanentDelete}
                disabled={permanentDeleteConfirm !== permanentDeleteUser?.name}
              >
                Excluir Permanentemente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Filter bar for ADMIN */}
      {isAdmin && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm whitespace-nowrap">Filtrar por condomínio:</Label>
              <Select value={filterTenantId} onValueChange={setFilterTenantId}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Todos os condomínios" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os condomínios</SelectItem>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="secondary" className="ml-auto">
                {users.length} usuário{users.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile card view */}
      <div className="block sm:hidden space-y-3">
        {users.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhum usuário encontrado
            </CardContent>
          </Card>
        ) : (
          users.map((u: any) => (
            <Card key={u.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0">
                    {u.photoUrl ? (
                      <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover" />
                    ) : (
                      <UserCircle className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{u.name}</p>
                      <Badge variant={u.active ? "success" : "destructive"} className="ml-2 flex-shrink-0">
                        {u.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <div className="flex flex-wrap gap-1 text-xs">
                      <Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge>
                      {u.unit && <Badge variant="outline">{u.unit.number}{u.unit.block ? `/${u.unit.block}` : ''}</Badge>}
                      {isAdmin && u.tenant && <Badge variant="outline">{u.tenant.name}</Badge>}
                    </div>
                    <div className="flex gap-1 pt-2">
                      <Button size="sm" variant="outline" onClick={() => openEditDialog(u)}>
                        <Pencil className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      {u.active ? (
                        <Button size="sm" variant="outline" onClick={() => handleDelete(u.id)}>
                          <Trash2 className="h-3 w-3 mr-1" /> Desativar
                        </Button>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id)}>
                            <RotateCcw className="h-3 w-3 mr-1" /> Reativar
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openPermanentDeleteDialog(u)}>
                            <Trash2 className="h-3 w-3 mr-1" /> Excluir
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Foto</TableHead>
                {isAdmin && <TableHead>Condomínio</TableHead>}
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Função</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                    Nenhum usuário encontrado
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u: any) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="w-8 h-8 rounded-full bg-muted overflow-hidden flex items-center justify-center">
                        {u.photoUrl ? (
                          <img src={u.photoUrl} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <UserCircle className="w-5 h-5 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant="outline">{u.tenant?.name || "—"}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs">{u.email}</TableCell>
                    <TableCell className="text-xs">{u.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{roleLabels[u.role] || u.role}</Badge>
                    </TableCell>
                    <TableCell>
                      {u.unit ? `${u.unit.number}${u.unit.block ? `/${u.unit.block}` : ''}` : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.active ? "success" : "destructive"}>
                        {u.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(u)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {u.active ? (
                          <Button size="sm" variant="outline" onClick={() => handleDelete(u.id)} title="Desativar">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleReactivate(u.id)} title="Reativar">
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => openPermanentDeleteDialog(u)} title="Excluir Permanentemente">
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
