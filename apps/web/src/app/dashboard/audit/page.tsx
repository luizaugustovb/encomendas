"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import {
  FileSearch, Camera, Package, UserCheck, MessageCircle,
  Filter, ChevronDown, ChevronUp, ExternalLink, Clock,
  AlertTriangle, Eye,
} from "lucide-react";

interface AuditEvent {
  id: string;
  deliveryId: string;
  userId: string | null;
  type: string;
  photoUrl: string | null;
  metadata: string | null;
  createdAt: string;
  delivery: {
    id: string;
    code: string;
    status: string;
    photoUrl: string | null;
    withdrawPhotoUrl: string | null;
    user: { id: string; name: string; photoUrl: string | null };
    unit: { id: string; number: string; block: string | null; type: string };
    withdrawnBy: { id: string; name: string; photoUrl: string | null } | null;
  };
  user: { id: string; name: string; photoUrl: string | null; role: string } | null;
}

interface UnitOption {
  id: string;
  number: string;
  block: string | null;
  type: string;
}

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string; icon: any }> = {
  CREATED: { label: "Criada", color: "bg-blue-500/20 text-blue-400", icon: Package },
  WITHDRAWN: { label: "Retirada", color: "bg-green-500/20 text-green-400", icon: UserCheck },
  WHATSAPP_SENT: { label: "WhatsApp Enviado", color: "bg-emerald-500/20 text-emerald-400", icon: MessageCircle },
  TOTEM_PHOTO_CAPTURED: { label: "Foto Capturada", color: "bg-purple-500/20 text-purple-400", icon: Camera },
  TOTEM_OTHER_RESIDENT: { label: "Outro Morador", color: "bg-amber-500/20 text-amber-400", icon: AlertTriangle },
  DOOR_ACCESS: { label: "Acesso Porta", color: "bg-cyan-500/20 text-cyan-400", icon: ExternalLink },
};

const EVENT_TYPES_FILTER = [
  { value: "", label: "Todos" },
  { value: "CREATED", label: "Criada" },
  { value: "WITHDRAWN", label: "Retirada" },
  { value: "WHATSAPP_SENT", label: "WhatsApp" },
  { value: "TOTEM_PHOTO_CAPTURED", label: "Foto Totem" },
  { value: "TOTEM_OTHER_RESIDENT", label: "Outro Morador" },
  { value: "DOOR_ACCESS", label: "Acesso Porta" },
];

export default function AuditLogsPage() {
  const { token } = useAuth();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [photoModal, setPhotoModal] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitOption[]>([]);

  // Filters
  const [filterType, setFilterType] = useState("");
  const [filterCode, setFilterCode] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterUnitId, setFilterUnitId] = useState("");

  useEffect(() => {
    if (!token) return;
    api.getUnits(token).then((data: any) => setUnits(data || [])).catch(() => {});
  }, [token]);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const filters: any = {};
      if (filterType) filters.type = filterType;
      if (filterFrom) filters.from = filterFrom;
      if (filterTo) filters.to = filterTo;
      if (filterUnitId) filters.unitId = filterUnitId;
      const data = await api.getAuditLogs(token, filters);
      let filtered = data as AuditEvent[];
      // Client-side filter by delivery code (API filters by deliveryId, not code)
      if (filterCode.trim()) {
        const q = filterCode.trim().toUpperCase();
        filtered = filtered.filter((e) => e.delivery.code.toUpperCase().includes(q));
      }
      setEvents(filtered);
    } catch (err: any) {
      console.error("Erro ao carregar logs:", err);
    }
    setLoading(false);
  }, [token, filterType, filterCode, filterFrom, filterTo, filterUnitId]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function parseMetadata(meta: string | null): Record<string, any> {
    if (!meta) return {};
    try { return JSON.parse(meta); } catch { return {}; }
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  }

  function getEventInfo(type: string) {
    return EVENT_TYPE_LABELS[type] || { label: type, color: "bg-slate-500/20 text-slate-400", icon: FileSearch };
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Logs de Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Registro detalhado de todas as movimentações de encomendas
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 rounded-lg border px-4 py-2 text-sm hover:bg-accent"
        >
          <Filter className="h-4 w-4" />
          Filtros
          {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="rounded-lg border bg-card p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Código da Encomenda</label>
              <input
                type="text"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="ENC-..."
                value={filterCode}
                onChange={(e) => setFilterCode(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Tipo de Evento</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                {EVENT_TYPES_FILTER.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Unidade / Apartamento</label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filterUnitId}
                onChange={(e) => setFilterUnitId(e.target.value)}
              >
                <option value="">Todas</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.type} {u.number}{u.block ? ` - Bl ${u.block}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">De</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Até</label>
              <input
                type="datetime-local"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={loadLogs}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Aplicar
            </button>
            <button
              onClick={() => { setFilterCode(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); setFilterUnitId(""); }}
              className="rounded-md border px-4 py-2 text-sm hover:bg-accent"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { type: "CREATED", count: events.filter((e) => e.type === "CREATED").length },
          { type: "WITHDRAWN", count: events.filter((e) => e.type === "WITHDRAWN").length },
          { type: "TOTEM_PHOTO_CAPTURED", count: events.filter((e) => e.type === "TOTEM_PHOTO_CAPTURED").length },
          { type: "TOTEM_OTHER_RESIDENT", count: events.filter((e) => e.type === "TOTEM_OTHER_RESIDENT").length },
          { type: "WHATSAPP_SENT", count: events.filter((e) => e.type === "WHATSAPP_SENT").length },
        ].map(({ type, count }) => {
          const info = getEventInfo(type);
          const Icon = info.icon;
          return (
            <div key={type} className="flex items-center gap-2 rounded-lg border bg-card p-3">
              <div className={`rounded-md p-1.5 ${info.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-bold">{count}</p>
                <p className="text-xs text-muted-foreground">{info.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Events list */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileSearch className="mb-3 h-12 w-12" />
          <p className="text-lg font-medium">Nenhum log encontrado</p>
          <p className="text-sm">Ajuste os filtros ou aguarde novas movimentações.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((event) => {
            const info = getEventInfo(event.type);
            const Icon = info.icon;
            const meta = parseMetadata(event.metadata);
            const isExpanded = expandedEvent === event.id;
            const unitLabel = event.delivery.unit.block
              ? `${event.delivery.unit.type} ${event.delivery.unit.number} - Bl ${event.delivery.unit.block}`
              : `${event.delivery.unit.type} ${event.delivery.unit.number}`;

            return (
              <div
                key={event.id}
                className="rounded-lg border bg-card transition-colors hover:bg-accent/30"
              >
                {/* Main row */}
                <div
                  className="flex cursor-pointer items-center gap-3 p-4"
                  onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                >
                  <div className={`rounded-md p-2 ${info.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${info.color}`}>
                        {info.label}
                      </span>
                      <span className="font-mono text-sm text-muted-foreground">{event.delivery.code}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-sm text-muted-foreground">
                      <span>{event.delivery.user.name}</span>
                      <span>•</span>
                      <span>{unitLabel}</span>
                      {event.user && (
                        <>
                          <span>•</span>
                          <span className="text-xs">por {event.user.name}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {event.photoUrl && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPhotoModal(event.photoUrl); }}
                      className="shrink-0 rounded-md border p-1.5 hover:bg-accent"
                      title="Ver foto"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  )}

                  <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(event.createdAt)}
                  </div>

                  {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t px-4 py-3 space-y-3">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {/* Delivery info */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Encomenda</p>
                        <p className="text-sm"><span className="text-muted-foreground">Destinatário:</span> {event.delivery.user.name}</p>
                        <p className="text-sm"><span className="text-muted-foreground">Unidade:</span> {unitLabel}</p>
                        <p className="text-sm"><span className="text-muted-foreground">Status:</span> {event.delivery.status === "PENDING" ? "Pendente" : "Retirada"}</p>
                        {event.delivery.withdrawnBy && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Retirada por:</span>{" "}
                            <span className={event.delivery.withdrawnBy.id !== event.delivery.user.id ? "text-amber-400 font-medium" : ""}>
                              {event.delivery.withdrawnBy.name}
                              {event.delivery.withdrawnBy.id !== event.delivery.user.id && " (outro morador)"}
                            </span>
                          </p>
                        )}
                      </div>

                      {/* Metadata */}
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">Metadados</p>
                        {Object.entries(meta).map(([key, val]) => (
                          <p key={key} className="text-sm">
                            <span className="text-muted-foreground">{key}:</span>{" "}
                            {typeof val === "boolean" ? (val ? "Sim" : "Não") : String(val)}
                          </p>
                        ))}
                        {Object.keys(meta).length === 0 && (
                          <p className="text-sm text-muted-foreground italic">Sem metadados</p>
                        )}
                      </div>
                    </div>

                    {/* Photos row */}
                    <div className="flex gap-3 overflow-x-auto">
                      {event.photoUrl && (
                        <div className="shrink-0">
                          <p className="mb-1 text-xs text-muted-foreground">Foto do Evento</p>
                          <img
                            src={event.photoUrl}
                            alt="Evento"
                            className="h-28 w-28 cursor-pointer rounded-lg border object-cover hover:opacity-75"
                            onClick={() => setPhotoModal(event.photoUrl)}
                          />
                        </div>
                      )}
                      {event.delivery.photoUrl && (
                        <div className="shrink-0">
                          <p className="mb-1 text-xs text-muted-foreground">Foto Encomenda</p>
                          <img
                            src={event.delivery.photoUrl}
                            alt="Encomenda"
                            className="h-28 w-28 cursor-pointer rounded-lg border object-cover hover:opacity-75"
                            onClick={() => setPhotoModal(event.delivery.photoUrl)}
                          />
                        </div>
                      )}
                      {event.delivery.withdrawPhotoUrl && (
                        <div className="shrink-0">
                          <p className="mb-1 text-xs text-muted-foreground">Foto Retirada</p>
                          <img
                            src={event.delivery.withdrawPhotoUrl}
                            alt="Retirada"
                            className="h-28 w-28 cursor-pointer rounded-lg border object-cover hover:opacity-75"
                            onClick={() => setPhotoModal(event.delivery.withdrawPhotoUrl)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Photo modal */}
      {photoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPhotoModal(null)}
        >
          <img
            src={photoModal}
            alt="Foto ampliada"
            className="max-h-[85vh] max-w-[90vw] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
