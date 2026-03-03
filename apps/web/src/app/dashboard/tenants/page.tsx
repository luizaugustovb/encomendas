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
import { Plus, Trash2, Pencil, RotateCcw, AlertTriangle } from "lucide-react";

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

  // Create form
  const [formName, setFormName] = useState("");
  const [formDocument, setFormDocument] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formPhone, setFormPhone] = useState("");

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDocument, setEditDocument] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");

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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createTenant(
        {
          name: formName,
          document: formDocument || undefined,
          address: formAddress || undefined,
          phone: formPhone || undefined,
        },
        token,
      );
      setOpenCreate(false);
      setFormName(""); setFormDocument(""); setFormAddress(""); setFormPhone("");
      addToast("Condomínio cadastrado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar condomínio", "error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingTenant) return;
    try {
      await api.updateTenant(
        editingTenant.id,
        {
          name: editName,
          document: editDocument || undefined,
          address: editAddress || undefined,
          phone: editPhone || undefined,
        },
        token,
      );
      setOpenEdit(false);
      setEditingTenant(null);
      addToast("Condomínio atualizado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao atualizar condomínio", "error");
    }
  };

  const openEditDialog = (tenant: any) => {
    setEditingTenant(tenant);
    setEditName(tenant.name);
    setEditDocument(tenant.document || "");
    setEditAddress(tenant.address || "");
    setEditPhone(tenant.phone || "");
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteTenant(id, token);
      addToast("Condomínio desativado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao desativar condomínio", "error");
    }
  };

  const handleReactivate = async (id: string) => {
    if (!token) return;
    try {
      await api.reactivateTenant(id, token);
      addToast("Condomínio reativado com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao reativar condomínio", "error");
    }
  };

  const openPermanentDeleteDialog = (tenant: any) => {
    setDeletingTenant(tenant);
    setConfirmName("");
    setOpenPermanentDelete(true);
  };

  const handlePermanentDelete = async () => {
    if (!token || !deletingTenant) return;
    if (confirmName !== deletingTenant.name) {
      addToast("O nome digitado não confere. Verifique e tente novamente.", "error");
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
      addToast(err.message || "Erro ao excluir condomínio permanentemente", "error");
    }
  };

  if (loading) return <div className="animate-pulse">Carregando condomínios...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Condomínios</h1>
          <p className="text-muted-foreground">Gerencie os condomínios do sistema</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Novo Condomínio</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Condomínio</DialogTitle>
              <DialogDescription>Preencha os dados do novo condomínio</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} required placeholder="Ex: Residencial Sol Nascente" />
              </div>
              <div className="space-y-2">
                <Label>CNPJ</Label>
                <Input value={formDocument} onChange={(e) => setFormDocument(e.target.value)} placeholder="00.000.000/0001-00" />
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Rua, número, cidade" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="(11) 99999-0000" />
              </div>
              <Button type="submit" className="w-full">Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Condomínio</DialogTitle>
            <DialogDescription>Altere os dados do condomínio</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input value={editDocument} onChange={(e) => setEditDocument(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Endereço</Label>
              <Input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Confirmation Dialog */}
      <Dialog open={openPermanentDelete} onOpenChange={setOpenPermanentDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Excluir Permanentemente
            </DialogTitle>
            <DialogDescription>
              Esta ação é <strong>irreversível</strong>. Todos os dados do condomínio serão excluídos permanentemente, incluindo:
              usuários, unidades, localizações, encomendas e eventos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <p className="text-sm font-medium">Condomínio: <strong>{deletingTenant?.name}</strong></p>
              <p className="text-xs text-muted-foreground mt-1">
                Para confirmar, digite o nome do condomínio abaixo:
              </p>
            </div>
            <div className="space-y-2">
              <Label>Nome do condomínio</Label>
              <Input
                placeholder={deletingTenant?.name}
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpenPermanentDelete(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={handlePermanentDelete}
                disabled={confirmName !== deletingTenant?.name}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Excluir Permanentemente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Nenhum condomínio encontrado
                  </TableCell>
                </TableRow>
              ) : (
                tenants.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.document || "—"}</TableCell>
                    <TableCell>{t.address || "—"}</TableCell>
                    <TableCell>{t.phone || "—"}</TableCell>
                    <TableCell>
                      <Badge variant={t.active ? "success" : "destructive"}>
                        {t.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
                            <Button size="sm" variant="destructive" onClick={() => openPermanentDeleteDialog(t)} title="Excluir permanentemente">
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
