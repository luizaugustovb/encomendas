"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Wifi,
  WifiOff,
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
  enabled: boolean;
  doorCount: number;
  wireguardIp: string | null;
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

  const isAdmin = user?.role === "ADMIN";

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const eqs = await api.getEquipments(token);
      setEquipments(eqs);
    } catch (err: any) {
      addToast(err.message || "Erro ao carregar equipamentos", "error");
    } finally {
      setLoading(false);
    }
  }, [token]);

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
    } catch { }
    setCheckingStatus(false);
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!loading && equipments.length > 0) loadStatus();
  }, [loading, equipments.length, loadStatus]);

  // Auto refresh every 30s
  useEffect(() => {
    if (equipments.length === 0) return;
    const interval = setInterval(loadStatus, 30000);
    return () => clearInterval(interval);
  }, [equipments.length, loadStatus]);

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

  // Agrupar por condomínio para admin master
  const grouped = isAdmin
    ? equipments.reduce<Record<string, Equipment[]>>((acc, eq) => {
        const key = eq.tenant?.name || "Sem condomínio";
        if (!acc[key]) acc[key] = [];
        acc[key].push(eq);
        return acc;
      }, {})
    : { "": equipments };

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
            Status e controle dos equipamentos Hikvision
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadStatus}
          disabled={checkingStatus}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${checkingStatus ? "animate-spin" : ""}`} />
          Atualizar Status
        </Button>
      </div>

      {/* Equipment cards */}
      {equipments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Wifi className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>Nenhum equipamento cadastrado</p>
            <p className="text-xs mt-1">Adicione equipamentos em Configurações</p>
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
                    className={`relative overflow-hidden transition-all ${!eq.enabled ? "opacity-60" : ""}`}
                  >
                    {/* Status bar */}
                    <div className={`absolute top-0 left-0 right-0 h-1 ${
                      online === null ? "bg-muted" : online ? "bg-green-500" : "bg-red-500"
                    }`} />

                    <CardContent className="pt-5 space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold truncate">{eq.name}</h3>
                          <p className="text-xs text-muted-foreground truncate">
                            {eq.hikvisionIp || "IP não configurado"}
                            {eq.hikvisionPort && eq.hikvisionPort !== 80 ? `:${eq.hikvisionPort}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {online === null ? (
                            <Badge variant="outline" className="text-xs">
                              <Signal className="h-3 w-3 mr-1" />...
                            </Badge>
                          ) : online ? (
                            <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 text-xs">
                              <Wifi className="h-3 w-3 mr-1" />Online
                              {status?.latencyMs != null && <span className="ml-1 opacity-70">{status.latencyMs}ms</span>}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              <WifiOff className="h-3 w-3 mr-1" />Offline
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* WireGuard (admin only) */}
                      {isAdmin && eq.wireguardIp && (
                        <div className="text-xs">
                          {wireguardOnline === undefined ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Shield className="h-3.5 w-3.5" />WireGuard: verificando...
                            </span>
                          ) : wireguardOnline ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                              <ShieldCheck className="h-3.5 w-3.5" />WireGuard: conectado ({eq.wireguardIp})
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                              <ShieldX className="h-3.5 w-3.5" />WireGuard: desconectado ({eq.wireguardIp})
                            </span>
                          )}
                        </div>
                      )}

                      {/* Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline" className="text-xs">{eq.type}</Badge>
                        <Badge variant="outline" className="text-xs">
                          {eq.doorCount} porta{eq.doorCount > 1 ? "s" : ""}
                        </Badge>
                        {!eq.enabled && (
                          <Badge variant="secondary" className="text-xs">Desabilitado</Badge>
                        )}
                      </div>

                      {/* Door buttons */}
                      {eq.enabled && (
                        <div className="flex flex-wrap gap-2">
                          {Array.from({ length: eq.doorCount }, (_, i) => i + 1).map((doorNo) => (
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
                              {eq.doorCount > 1 ? `Destravar Porta ${doorNo}` : "Destravar Porta"}
                            </Button>
                          ))}
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
    </div>
  );
}
