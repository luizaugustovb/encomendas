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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Package, Plus, FileText, MessageCircle, QrCode, Camera, ImageIcon, Printer } from "lucide-react";

export default function DeliveriesPage() {
  const { token, user } = useAuth();
  const { addToast } = useToast();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCreate, setOpenCreate] = useState(false);
  const [openWithdraw, setOpenWithdraw] = useState(false);

  // Create form
  const [formUserId, setFormUserId] = useState("");
  const [formLocationId, setFormLocationId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPhoto, setFormPhoto] = useState<File | null>(null);
  const [formPhotoPreview, setFormPhotoPreview] = useState<string | null>(null);
  const photoCameraRef = useRef<HTMLInputElement>(null);
  const photoUploadRef = useRef<HTMLInputElement>(null);

  // Withdraw form
  const [withdrawCode, setWithdrawCode] = useState("");
  const [withdrawUserId, setWithdrawUserId] = useState("");

  const loadData = async () => {
    if (!token) return;
    try {
      const [d, u, l] = await Promise.all([
        api.getDeliveries(token),
        api.getUsers(token).catch(() => []),
        api.getLocations(token).catch(() => []),
      ]);
      setDeliveries(d);
      setUsers(u);
      setLocations(l);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [token]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 190);
    setFormPhoto(compressed);
    setFormPhotoPreview(URL.createObjectURL(compressed));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await api.createDelivery(
        {
          userId: formUserId,
          locationId: formLocationId,
          description: formDescription,
          photo: formPhoto || undefined,
        },
        token,
      );
      setOpenCreate(false);
      resetCreateForm();
      addToast("Encomenda cadastrada com sucesso!", "success");
      loadData();
    } catch (err: any) {
      addToast(err.message || "Erro ao cadastrar encomenda", "error");
    }
  };

  const resetCreateForm = () => {
    setFormUserId("");
    setFormLocationId("");
    setFormDescription("");
    setFormPhoto(null);
    setFormPhotoPreview(null);
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      await api.withdrawDelivery({ userId: withdrawUserId, qrcode: withdrawCode }, token);
      setOpenWithdraw(false);
      setWithdrawCode("");
      setWithdrawUserId("");
      loadData();
      addToast("Encomenda retirada com sucesso!", "success");
    } catch (err: any) {
      addToast(err.message || "Erro ao retirar encomenda", "error");
    }
  };

  const handleLabel = async (id: string, format: 'a4' | 'thermal' | 'sticker' = 'a4') => {
    if (!token) return;
    try {
      const blob = await api.getDeliveryLabel(id, token, format);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (err: any) {
      addToast(err.message || "Erro ao gerar etiqueta", "error");
    }
  };

  const handleWhatsapp = async (id: string) => {
    if (!token) return;
    try {
      await api.sendWhatsapp(id, token);
      addToast("WhatsApp enviado com sucesso!", "success");
    } catch (err: any) {
      addToast(err.message || "Erro ao enviar WhatsApp", "error");
    }
  };

  if (loading) return <div className="animate-pulse">Carregando encomendas...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Encomendas</h1>
          <p className="text-muted-foreground text-sm">Gerencie as encomendas do condomínio</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Withdraw Dialog */}
          <Dialog open={openWithdraw} onOpenChange={setOpenWithdraw}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none">
                <QrCode className="mr-2 h-4 w-4" />
                Retirar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Retirar Encomenda</DialogTitle>
                <DialogDescription>Insira o código da encomenda e selecione o morador</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleWithdraw} className="space-y-4">
                <div className="space-y-2">
                  <Label>Código da Encomenda</Label>
                  <Input
                    placeholder="ENC-XXXXX-XXXX"
                    value={withdrawCode}
                    onChange={(e) => setWithdrawCode(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Morador</Label>
                  <Select value={withdrawUserId} onValueChange={setWithdrawUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o morador" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.unit ? ` - ${u.unit.number}${u.unit.block ? `/${u.unit.block}` : ''}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full">Confirmar Retirada</Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Create Dialog */}
          <Dialog open={openCreate} onOpenChange={(open) => { setOpenCreate(open); if (!open) resetCreateForm(); }}>
            <DialogTrigger asChild>
              <Button className="flex-1 sm:flex-none">
                <Plus className="mr-2 h-4 w-4" />
                Nova Encomenda
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Cadastrar Encomenda</DialogTitle>
                <DialogDescription>Registre uma nova encomenda recebida</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Morador *</Label>
                  <Select value={formUserId} onValueChange={setFormUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o morador" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.filter((u: any) => u.role === 'MORADOR' && u.active).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                          {u.unit ? ` - ${u.unit.number}${u.unit.block ? `/${u.unit.block}` : ''}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Localização *</Label>
                  <Select value={formLocationId} onValueChange={setFormLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a localização" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l: any) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.code} - {l.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Descrição (opcional)</Label>
                  <Input
                    placeholder="Ex: Caixa grande, Correios"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                  />
                </div>

                {/* Photo upload */}
                <div className="space-y-3 pb-2">
                  <Label>Foto do Produto (opcional)</Label>

                  {formPhotoPreview ? (
                    <div className="relative border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50 dark:bg-slate-900/50">
                      <img src={formPhotoPreview} alt="Preview" className="max-h-48 mx-auto rounded-md object-contain" />
                      <div className="absolute top-2 right-2 flex gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => setFormPhotoPreview(null)}>
                          Remover
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-24 flex flex-col items-center justify-center gap-2 border-dashed bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                        onClick={() => photoCameraRef.current?.click()}
                      >
                        <Camera className="w-6 h-6 text-blue-500" />
                        <span className="text-sm font-medium">Tirar Foto</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 h-24 flex flex-col items-center justify-center gap-2 border-dashed bg-slate-50 hover:bg-slate-100 dark:bg-slate-900/50 dark:hover:bg-slate-800"
                        onClick={() => photoUploadRef.current?.click()}
                      >
                        <ImageIcon className="w-6 h-6 text-emerald-500" />
                        <span className="text-sm font-medium">Fazer Upload</span>
                      </Button>
                    </div>
                  )}

                  <input
                    ref={photoCameraRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <input
                    ref={photoUploadRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </div>

                <Button type="submit" className="w-full">Cadastrar Encomenda</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile card view */}
      <div className="block sm:hidden space-y-3">
        {deliveries.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma encomenda encontrada
            </CardContent>
          </Card>
        ) : (
          deliveries.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs">{d.code}</span>
                  <Badge variant={d.status === "PENDING" ? "destructive" : "success"}>
                    {d.status === "PENDING" ? "Pendente" : "Retirada"}
                  </Badge>
                </div>
                {d.photoUrl && (
                  <img src={d.photoUrl} alt="Foto" className="w-full max-h-32 object-contain rounded-md bg-muted" />
                )}
                <div className="text-sm space-y-1">
                  <p><span className="text-muted-foreground">Morador:</span> {d.user?.name}</p>
                  <p><span className="text-muted-foreground">Unidade:</span> {d.unit?.number}{d.unit?.block ? ` / ${d.unit.block}` : ""}</p>
                  <p><span className="text-muted-foreground">Local:</span> {d.location?.code}</p>
                  <p><span className="text-muted-foreground">Data:</span> {new Date(d.createdAt).toLocaleString("pt-BR")}</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => handleLabel(d.id, 'a4')} className="flex-1">
                    <FileText className="h-3 w-3 mr-1" /> A4
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleLabel(d.id, 'thermal')} className="flex-1">
                    <Printer className="h-3 w-3 mr-1" /> 80mm
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleWhatsapp(d.id)} className="flex-1">
                    <MessageCircle className="h-3 w-3 mr-1" /> WhatsApp
                  </Button>
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
                <TableHead>Código</TableHead>
                <TableHead>Foto</TableHead>
                <TableHead>Morador</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma encomenda encontrada
                  </TableCell>
                </TableRow>
              ) : (
                deliveries.map((d: any) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.code}</TableCell>
                    <TableCell>
                      {d.photoUrl ? (
                        <img src={d.photoUrl} alt="Foto" className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-muted flex items-center justify-center">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{d.user?.name}</TableCell>
                    <TableCell>
                      {d.unit?.number}
                      {d.unit?.block ? ` / ${d.unit.block}` : ""}
                    </TableCell>
                    <TableCell>{d.location?.code}</TableCell>
                    <TableCell>
                      <Badge variant={d.status === "PENDING" ? "destructive" : "success"}>
                        {d.status === "PENDING" ? "Pendente" : "Retirada"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(d.createdAt).toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLabel(d.id, 'a4')}
                          title="Etiqueta A4"
                        >
                          <FileText className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLabel(d.id, 'thermal')}
                          title="Cupom 80mm"
                        >
                          <Printer className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleLabel(d.id, 'sticker')}
                          title="Etiqueta Adesiva"
                        >
                          <QrCode className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleWhatsapp(d.id)}
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle className="h-3 w-3" />
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
