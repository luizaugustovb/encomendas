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
import { Plus, Trash2, Pencil } from "lucide-react";

export default function LocationsPage() {
  const { token, user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [locations, setLocations] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState(false);
  const [editingLocation, setEditingLocation] = useState<any>(null);

  const isAdmin = currentUser?.role === "ADMIN";

  // Create form
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTenantId, setFormTenantId] = useState("");

  // Edit form
  const [editCode, setEditCode] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const loadData = async () => {
    if (!token) return;
    try {
      const [l, t] = await Promise.all([
        api.getLocations(token),
        isAdmin ? api.getTenants(token).catch(() => []) : Promise.resolve([]),
      ]);
      setLocations(l);
      setTenants(t);
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
      await api.createLocation(
        {
          code: formCode,
          description: formDescription || undefined,
          ...(isAdmin && formTenantId ? { tenantId: formTenantId } : {}),
        },
        token,
      );
      setOpenCreate(false);
      setFormCode(""); setFormDescription(""); setFormTenantId("");
      addToast("Localização cadastrada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar localização", "error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !editingLocation) return;
    try {
      await api.updateLocation(
        editingLocation.id,
        { code: editCode, description: editDescription || undefined },
        token,
      );
      setOpenEdit(false);
      setEditingLocation(null);
      addToast("Localização atualizada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao atualizar localização", "error");
    }
  };

  const openEditDialog = (loc: any) => {
    setEditingLocation(loc);
    setEditCode(loc.code);
    setEditDescription(loc.description || "");
    setOpenEdit(true);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await api.deleteLocation(id, token);
      addToast("Localização desativada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao desativar localização", "error");
    }
  };

  if (loading) return <div className="animate-pulse">Carregando localizações...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Localizações</h1>
          <p className="text-muted-foreground">Gerencie os locais de armazenamento</p>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Nova Localização</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastrar Localização</DialogTitle>
              <DialogDescription>Defina um código e descrição para o local</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              {isAdmin && tenants.length > 0 && (
                <div className="space-y-2">
                  <Label>Condomínio</Label>
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
                <Label>Código</Label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} required placeholder="Ex: E1-P2" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Ex: Estante 1 - Prateleira 2" />
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
            <DialogTitle>Editar Localização</DialogTitle>
            <DialogDescription>Altere os dados da localização</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="space-y-2">
              <Label>Código</Label>
              <Input value={editCode} onChange={(e) => setEditCode(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
            <Button type="submit" className="w-full">Salvar Alterações</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {isAdmin && <TableHead>Condomínio</TableHead>}
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">
                    Nenhuma localização encontrada
                  </TableCell>
                </TableRow>
              ) : (
                locations.map((l: any) => (
                  <TableRow key={l.id}>
                    {isAdmin && (
                      <TableCell>
                        <Badge variant="outline">{l.tenant?.name || "—"}</Badge>
                      </TableCell>
                    )}
                    <TableCell className="font-mono font-medium">{l.code}</TableCell>
                    <TableCell>{l.description || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(l)} title="Editar">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(l.id)} title="Desativar">
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
