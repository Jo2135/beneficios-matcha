import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api as apiClient } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import {
  ArrowLeft, RefreshCw, Plus, Trash2, FileText, Edit3, Check, X, Download,
} from "lucide-react";
import { pdfBalancePago } from "../utils/pdf";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Cuota { id: number; fecha: string; monto: number; notas?: string }
interface Item {
  id: number; nombre: string; montoTotal: number; esEditable: boolean;
  orden: number; notas?: string; cuotas: Cuota[];
}
interface Balance {
  id: number; nombre?: string; items: Item[];
  calculadoEn?: string;   // ISO timestamp del último cálculo
}

const fmtFecha = (iso?: string) => {
  if (!iso) return null;
  return new Date(iso).toLocaleString("es-VE", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
};

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function pagado(item: Item) {
  return item.cuotas.reduce((s, c) => s + Number(c.monto), 0);
}
function saldo(item: Item) {
  return Number(item.montoTotal) - pagado(item);
}

// Recoge todas las fechas únicas del balance, ordenadas
function fechasUnicas(items: Item[]): string[] {
  const set = new Set<string>();
  items.forEach((i) => i.cuotas.forEach((c) => set.add(c.fecha.slice(0, 10))));
  return [...set].sort();
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function BalancePago() {
  const { id } = useParams<{ id: string }>();
  const despachoId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { esMaster: isMaster } = useAuth();

  // ── State UI ────────────────────────────────────────────────────────────
  const [editando, setEditando] = useState<number | null>(null);
  const [editMonto, setEditMonto] = useState("");
  const [notaAbierta, setNotaAbierta] = useState<number | null>(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [nuevaCuota, setNuevaCuota] = useState<{ itemId: number; fecha: string; monto: string; notas: string } | null>(null);
  const [tooltipItem, setTooltipItem] = useState<number | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────
  const { data: balance, isLoading, isError } = useQuery<Balance>({
    queryKey: ["balance", despachoId],
    queryFn: () => apiClient.get(`/despachos/${despachoId}/balance`).then((r) => r.data),
    retry: false,
  });

  // ── Mutations ───────────────────────────────────────────────────────────
  const generar = useMutation({
    mutationFn: () => apiClient.post(`/despachos/${despachoId}/balance/generar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["balance", despachoId] }),
  });

  const handleRegenerar = () => {
    const hayPagos = balance?.items.some(i => i.cuotas.length > 0);
    const hayAjustes = balance?.items.some(i => i.esEditable && i.notas);
    if (hayPagos || hayAjustes) {
      const msg = "⚠️ ATENCIÓN\n\nRegenerar recalculará todos los montos con las tasas actuales.\n\nLos pagos ya registrados se conservan, pero cualquier monto editado manualmente volverá al valor calculado.\n\n¿Deseas continuar?";
      if (!window.confirm(msg)) return;
    }
    generar.mutate();
  };

  const actualizarItem = useMutation({
    mutationFn: ({ itemId, montoTotal, notas }: { itemId: number; montoTotal?: number; notas?: string }) =>
      apiClient.patch(`/balance/items/${itemId}`, { montoTotal, notas }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["balance", despachoId] }); setEditando(null); setNotaAbierta(null); },
  });

  const agregarCuota = useMutation({
    mutationFn: ({ itemId, fecha, monto, notas }: { itemId: number; fecha: string; monto: number; notas?: string }) =>
      apiClient.post(`/balance/items/${itemId}/cuotas`, { fecha, monto, notas }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["balance", despachoId] }); setNuevaCuota(null); },
  });

  const eliminarCuota = useMutation({
    mutationFn: (cuotaId: number) => apiClient.delete(`/balance/cuotas/${cuotaId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["balance", despachoId] }),
  });

  // ── Render helpers ──────────────────────────────────────────────────────
  if (isLoading) return <div style={{ padding: 40, textAlign: "center" }}>Cargando balance…</div>;

  if (isError || !balance) {
    return (
      <div style={{ padding: 40, maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
        <p style={{ color: "#64748b", marginBottom: 20 }}>El balance aún no ha sido generado para este despacho.</p>
        <button
          onClick={() => generar.mutate()}
          disabled={generar.isPending}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontSize: 15 }}
        >
          {generar.isPending ? "Generando…" : "Generar Balance"}
        </button>
      </div>
    );
  }

  const items = balance.items;
  const fechas = fechasUnicas(items);
  const totalGeneral = items.reduce((s, i) => s + Number(i.montoTotal), 0);
  const totalPagado = items.reduce((s, i) => s + pagado(i), 0);
  const totalSaldo = totalGeneral - totalPagado;

  // Estilos base
  const thStyle: React.CSSProperties = {
    padding: "8px 10px", background: "#1e293b", color: "#fff",
    fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textAlign: "center",
  };
  const tdStyle: React.CSSProperties = {
    padding: "6px 10px", fontSize: 13, borderBottom: "1px solid #e2e8f0",
    verticalAlign: "middle",
  };

  return (
    <div style={{ padding: "20px 16px", maxWidth: "100%", overflowX: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <ArrowLeft size={20} color="#64748b" />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>
            Balance de Pagos — Despacho #{despachoId}
          </h2>
          {balance?.calculadoEn && (
            <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>
              Calculado el {fmtFecha(balance.calculadoEn)}
            </p>
          )}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            onClick={() => pdfBalancePago({ despachoId, calculadoEn: balance?.calculadoEn, items: balance?.items ?? [] })}
            title="Exportar balance como PDF"
            style={{ display: "flex", alignItems: "center", gap: 6,
              background: "#fef9c3", border: "1px solid #fde047", borderRadius: 8,
              padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#854d0e" }}
          >
            <Download size={14} /> PDF
          </button>
          {isMaster && (
            <button
              onClick={handleRegenerar}
              disabled={generar.isPending}
              title="Regenerar balance desde ganancias (recalcula montos)"
              style={{ display: "flex", alignItems: "center", gap: 6,
                background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 8,
                padding: "7px 14px", cursor: "pointer", fontSize: 13, color: "#475569" }}
            >
              <RefreshCw size={14} />
              {generar.isPending ? "Regenerando…" : "Regenerar"}
            </button>
          )}
        </div>
      </div>

      {/* Contador de estado */}
      {(() => {
        const pagados = items.filter((i) => saldo(i) <= 0.005).length;
        const pendientes = items.length - pagados;
        return (
          <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>
              <strong style={{ color: "#1e293b" }}>{items.length}</strong> conceptos
            </span>
            <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>
              ✓ {pagados} pagados
            </span>
            <span style={{ fontSize: 13, color: pendientes > 0 ? "#dc2626" : "#94a3b8", fontWeight: pendientes > 0 ? 600 : 400 }}>
              ● {pendientes} pendientes
            </span>
            <span style={{ fontSize: 13, color: "#64748b", marginLeft: "auto" }}>
              Pendiente total:{" "}
              <strong style={{ color: totalSaldo > 0.005 ? "#dc2626" : "#16a34a" }}>
                ${fmt(totalSaldo)}
              </strong>
            </span>
          </div>
        );
      })()}

      {/* Tabla */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
        <table style={{ borderCollapse: "collapse", width: "max-content", minWidth: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: "left", minWidth: 200, background: "#0f172a" }}>Concepto</th>
              <th style={{ ...thStyle, minWidth: 110, background: "#0f172a" }}>Monto Total</th>
              {/* Columnas de fechas */}
              {fechas.map((f) => (
                <th key={f} style={{ ...thStyle, minWidth: 100 }}>
                  {new Date(f + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short" })}
                </th>
              ))}
              <th style={{ ...thStyle, minWidth: 110, background: "#0f172a" }}>Saldo</th>
              <th style={{ ...thStyle, minWidth: 90, background: "#0f172a" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const sal = saldo(item);
              const pagadoCompleto = sal <= 0.005;
              const sobrepagado = sal < -0.005;
              const rowBg = pagadoCompleto ? "#fef2f2" : "#fff";

              return (
                <tr key={item.id} style={{ background: rowBg }}>
                  {/* Nombre */}
                  <td
                    style={{ ...tdStyle, position: "relative", cursor: item.notas ? "help" : "default" }}
                    onMouseEnter={() => item.notas ? setTooltipItem(item.id) : undefined}
                    onMouseLeave={() => setTooltipItem(null)}
                  >
                    <span style={{ fontWeight: 600, color: pagadoCompleto ? "#dc2626" : "#0f172a" }}>
                      {item.nombre}
                    </span>
                    {item.notas && (
                      <span style={{ marginLeft: 5, fontSize: 11, color: "#94a3b8" }}>📝</span>
                    )}
                    {tooltipItem === item.id && item.notas && (
                      <div style={{
                        position: "absolute", left: 0, top: "100%", zIndex: 200,
                        background: "#1e293b", color: "#e2e8f0", borderRadius: 8,
                        padding: "8px 12px", fontSize: 12, maxWidth: 300,
                        whiteSpace: "pre-wrap", lineHeight: 1.5,
                        boxShadow: "0 6px 20px rgba(0,0,0,.3)",
                        pointerEvents: "none",
                      }}>
                        {item.notas}
                      </div>
                    )}
                  </td>

                  {/* Monto total (editable MASTER) */}
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {editando === item.id ? (
                      <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                        <input
                          type="number" value={editMonto} step="0.01"
                          onChange={(e) => setEditMonto(e.target.value)}
                          style={{ width: 80, border: "1px solid #3b82f6", borderRadius: 4, padding: "2px 6px", fontSize: 13 }}
                          autoFocus
                        />
                        <button onClick={() => actualizarItem.mutate({ itemId: item.id, montoTotal: Number(editMonto) })}
                          style={{ background: "#22c55e", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>
                          <Check size={13} />
                        </button>
                        <button onClick={() => setEditando(null)}
                          style={{ background: "#ef4444", color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>
                          <X size={13} />
                        </button>
                      </div>
                    ) : (
                      <span style={{ fontWeight: 700, color: "#0f172a" }}>${fmt(Number(item.montoTotal))}</span>
                    )}
                  </td>

                  {/* Celda por cada fecha */}
                  {fechas.map((f) => {
                    const cuota = item.cuotas.find((c) => c.fecha.slice(0, 10) === f);
                    return (
                      <td key={f} style={{ ...tdStyle, textAlign: "center" }}>
                        {cuota ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <span style={{ color: "#16a34a", fontWeight: 600 }}>{fmt(Number(cuota.monto))}</span>
                            {isMaster && (
                              <button onClick={() => eliminarCuota.mutate(cuota.id)}
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }} title="Eliminar pago">
                                <Trash2 size={11} color="#ef4444" />
                              </button>
                            )}
                          </div>
                        ) : null}
                      </td>
                    );
                  })}

                  {/* Saldo */}
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700,
                    color: pagadoCompleto ? "#dc2626" : sobrepagado ? "#7c3aed" : "#0f172a" }}>
                    {sobrepagado ? `(${fmt(Math.abs(sal))})` : `$${fmt(sal)}`}
                  </td>

                  {/* Acciones */}
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                      {/* Agregar pago */}
                      <button
                        onClick={() => setNuevaCuota({ itemId: item.id, fecha: new Date().toISOString().slice(0, 10), monto: "", notas: "" })}
                        title="Agregar pago"
                        style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6,
                          padding: "4px 7px", cursor: "pointer", color: "#2563eb" }}>
                        <Plus size={13} />
                      </button>
                      {/* Editar monto (MASTER) */}
                      {isMaster && item.esEditable && (
                        <button
                          onClick={() => { setEditando(item.id); setEditMonto(String(item.montoTotal)); }}
                          title="Editar monto"
                          style={{ background: "#fefce8", border: "1px solid #fef08a", borderRadius: 6,
                            padding: "4px 7px", cursor: "pointer", color: "#a16207" }}>
                          <Edit3 size={13} />
                        </button>
                      )}
                      {/* Notas */}
                      <button
                        onClick={() => { setNotaAbierta(item.id); setNotaTexto(item.notas ?? ""); }}
                        title="Notas"
                        style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6,
                          padding: "4px 7px", cursor: "pointer", color: "#15803d" }}>
                        <FileText size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Fila totales */}
            <tr style={{ background: "#1e293b" }}>
              <td style={{ ...tdStyle, color: "#fff", fontWeight: 700, borderBottom: "none" }}>Total</td>
              <td style={{ ...tdStyle, textAlign: "right", color: "#fff", fontWeight: 700, borderBottom: "none" }}>
                ${fmt(totalGeneral)}
              </td>
              {fechas.map((f) => {
                const montoPorFecha = items.reduce((s, i) => {
                  const c = i.cuotas.find((c) => c.fecha.slice(0, 10) === f);
                  return s + (c ? Number(c.monto) : 0);
                }, 0);
                return (
                  <td key={f} style={{ ...tdStyle, textAlign: "center", color: "#86efac", fontWeight: 700, borderBottom: "none" }}>
                    {montoPorFecha > 0 ? fmt(montoPorFecha) : ""}
                  </td>
                );
              })}
              <td style={{ ...tdStyle, textAlign: "right", color: totalSaldo < 0 ? "#c084fc" : "#fbbf24", fontWeight: 700, borderBottom: "none" }}>
                {totalSaldo < 0 ? `(${fmt(Math.abs(totalSaldo))})` : `$${fmt(totalSaldo)}`}
              </td>
              <td style={{ borderBottom: "none" }} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* Modal agregar pago */}
      {nuevaCuota && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 340, boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Agregar Pago</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Fecha</label>
              <input type="date" value={nuevaCuota.fecha}
                onChange={(e) => setNuevaCuota({ ...nuevaCuota, fecha: e.target.value })}
                style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 10px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Monto ($)</label>
              <input type="number" value={nuevaCuota.monto} step="0.01" placeholder="0.00"
                onChange={(e) => setNuevaCuota({ ...nuevaCuota, monto: e.target.value })}
                style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 10px", fontSize: 14, boxSizing: "border-box" }}
                autoFocus />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Nota (opcional)</label>
              <input type="text" value={nuevaCuota.notas} placeholder="Observación…"
                onChange={(e) => setNuevaCuota({ ...nuevaCuota, notas: e.target.value })}
                style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 6, padding: "7px 10px", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setNuevaCuota(null)}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                disabled={!nuevaCuota.monto || Number(nuevaCuota.monto) <= 0 || agregarCuota.isPending}
                onClick={() => agregarCuota.mutate({ itemId: nuevaCuota.itemId, fecha: nuevaCuota.fecha, monto: Number(nuevaCuota.monto), notas: nuevaCuota.notas || undefined })}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, background: "#2563eb", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                {agregarCuota.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal notas */}
      {notaAbierta !== null && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, width: 360, boxShadow: "0 8px 32px rgba(0,0,0,.18)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Notas — {items.find((i) => i.id === notaAbierta)?.nombre}</h3>
            <textarea value={notaTexto} rows={5}
              onChange={(e) => setNotaTexto(e.target.value)}
              placeholder="Escribe una nota…"
              style={{ width: "100%", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 10px", fontSize: 14, resize: "vertical", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button onClick={() => setNotaAbierta(null)}
                style={{ flex: 1, padding: "9px 0", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => actualizarItem.mutate({ itemId: notaAbierta, notas: notaTexto })}
                disabled={actualizarItem.isPending}
                style={{ flex: 1, padding: "9px 0", border: "none", borderRadius: 8, background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                {actualizarItem.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
