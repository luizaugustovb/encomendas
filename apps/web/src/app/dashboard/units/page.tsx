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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Pencil, Filter } from "lucide-react";

export default function UnitsPage() {
  const { token, user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [units, setUnits] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<any>(null);

  const isAdmin = currentUser?.role === "ADMIN";

  // Filter
  const [filterTenantId, setFilterTenantId] = useState("all");

  // Create form
  const [formNumber, setFormNumber] = useState("");
  const [formBlock, setFormBlock] = useState("");
  const [formType, setFormType] = useState("APARTAMENTO");
  const [formTenantId, setFormTenantId] = useState("");

  // Edit form
  const [editNumber, setEditNumber] = useState("");
  const [editBlock, setEditBlock] = useState("");
  const [editType, setEditType] = useState("APARTAMENTO");

  const loadData = async () => {
    if (!token) return;
    try {
      const effectiveTenantId = isAdmin && filterTenantId !== "all" ? filterTenantId : undefined;
      const [u, t] = await Promise.all([
        api.getUnits(token, effectiveTenantId),
        isAdmin ? api.getTenants(token).catch(() => []) : Promise.resolve([]),
      ]);
      setUnits(u);
      setTenants(t.filter((t: any) => t.active));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [token, filterTenantId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (isAdmin && !formTenantId) {
      addToast("Selecione o condomínio", "error");
      return;
    }
    try {
      await api.createUnit(
        {
          number: formNumber,
          block: formBlock || undefined,
          type: formType,
          ...(isAdmin && formTenantId ? { tenantId: formTenantId } : {}),
        },
        token,
      );
      setOpenCreate(false);
      setFormNumber(""); setFormBlock(""); setFormType("APARTAMENTO"); setFormTenantId("");
      addToast("Unidade cadastrada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar unidade", "error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingUnit) return;
    try {
      await api.updateUnit(
        editingUnit.id,
        { number: editNumber, block: editBlock || undefined, type: editType },
        token,
      );
      setOpenEdit(false);
      setEditingUnit(null);
      addToast("Unidade atualizada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao atualizar unidade", "error");
    }
  };

  const openEditDialog = (unit: any) => {
    setEditingUnit(unit);
    setEditNumber(unit.number);
    setEditBlock(unit.block || "");
    setEditType(unit.type || "APARTAMENTO");
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteUnit(id, token);
      addToast("Unidade desativada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao desativar unidade", "error");
    }
  };

  if (loading) return <div className="animate-pulse">Carregando unidades...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Unidades</h1>
          <p className="text-muted-foreground">Gerencie casas e apartamentos</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Nova Unidade</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cadastrar Unidade</DialogTitle>
              <DialogDescription>Preencha os dados da nova unidade</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {isAdmin && tenants.length > 0 && (
                <div className="space-y-2 rounded-md border p-3 bg-muted/50">
                  <Label className="text-sm font-semibold flex items-center gap-1">
                    <Filter className="h-3 w-3" /> Condomínio *
                  </Label>
                  <Select value={formTenantId} onValueChange={setFormTenantId}>
                    <SelectTrigger><SelectValue placeholder="Selecione o condomínio" /></SelectTrigger>
                    <SelectContent>
                      {tenants.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input value={formNumber} onChange={(e) => setFormNumber(e.target.value)} required placeholder="Ex: 101" />
              </div>
              <div className="space-y-2">
                <Label>Bloco (opcional)</Label>
                <Input value={formBlock} onChange={(e) => setFormBlock(e.target.value)} placeholder="Ex: A" />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formType} onValueChange={setFormType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APARTAMENTO">Apartamento</SelectItem>
                    <SelectItem value="CASA">Casa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={isAdmin && !formTenantId}>Cadastrar</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
                {units.length} unidade{units.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={openEdit} onOpenChange={setOpenEdit}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Unidade</DialogTitle>
            <DialogDescription>Altere os dados da unidade</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            {isAdmin && editingUnit && (
              <div className="rounded-md border p-2 bg-muted/50">
                <p className="text-xs text-muted-foreground">Condomínio</p>
                <p className="text-sm font-medium">{editingUnit.tenant?.name || "—"}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Número</Label>
              <Input value={editNumber} onChange={(e) => setEditNumber(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Bloco (opcional)</Label>
              <Input value={editBlock} onChange={(e) => setEditBlock(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={editType} onValueChange={setEditType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="APARTAMENTO">Apartamento</SelectItem>
                  <SelectItem value="CASA">Casa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="w-full overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead>Condomínio</TableHead>}
                <TableHead>Número</TableHead>
                <TableHead>Bloco</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Moradores</TableHead>
                <TableHead className="text-center">Qtd</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {units.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                    Nenhuma unidade encontrada
                  </TableCell>
                </TableRow>
              ) : (
                units.map((u: any) => (
                  <TableRow key={u.id}>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant="outline">{u.tenant?.name || "—"}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{u.number}</TableCell>
                    <TableCell>{u.block || "—"}</TableCell>
                    <TableCell>{u.type}</TableCell>
                    <TableCell>
                      {u.users && u.users.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.users.map((usr: any) => (
                            <Badge key={usr.id} variant="secondary" className="text-xs">
                              {usr.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sem moradores</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{u.users?.length || 0}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(u)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(u.id)} title="Desativar">
                          <Trash2 className="h-3 w-3" />
                        </Button>
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
