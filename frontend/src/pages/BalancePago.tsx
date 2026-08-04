import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api as apiClient } from "../api/client";
import { conceptosApi } from "../api/endpoints";
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
  gananciaVendedor?: number;  // comisión del vendedor — sección superior independiente
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

// ─── Conceptos adicionales del despacho ──────────────────────────────────────
// Comisión 2, Viáticos, Carga Externa, Ayudante... No salen de los productos,
// por eso no entran en ningún porcentaje. Quedan guardados en el despacho: a
// diferencia del viejo "Ayudante", sobreviven a Regenerar.
const ATAJOS = ["Comisión 2", "Viáticos", "Carga Externa", "Ayudante"];

function ConceptosExtraEditor({ despachoId, generado, onRecalcular }: {
  despachoId: number; generado: boolean; onRecalcular?: () => Promise<boolean>;
}) {
  const qc = useQueryClient();
  const [nombre, setNombre] = useState("");
  const [monto, setMonto] = useState("");
  const [cobrado, setCobrado] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: conceptos = [] } = useQuery<any[]>({
    queryKey: ["conceptos", despachoId],
    queryFn: () => conceptosApi.listar(despachoId),
  });

  const refrescar = async (aviso?: string) => {
    qc.invalidateQueries({ queryKey: ["conceptos", despachoId] });
    qc.invalidateQueries({ queryKey: ["ganancias-gastos", despachoId] });
    const recalc = onRecalcular ? await onRecalcular() : false;
    qc.invalidateQueries({ queryKey: ["balance", despachoId] });
    setMsg(aviso ?? (recalc ? "Guardado y balance recalculado."
      : generado ? "Guardado. Pulsa \"Regenerar\" cuando quieras aplicarlo al balance."
      : "Guardado. Ahora genera el balance."));
  };

  const crear = useMutation({
    mutationFn: () => conceptosApi.crear(despachoId, { nombre: nombre.trim(), monto: Number(monto), cobradoAlCliente: cobrado }),
    onSuccess: (r: any) => { setNombre(""); setMonto(""); refrescar(r?.aviso); },
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo agregar el concepto"),
  });
  const borrar = useMutation({
    mutationFn: (id: number) => conceptosApi.eliminar(id),
    onSuccess: (r: any) => refrescar(r?.aviso),
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo eliminar"),
  });

  const totalCobrado = conceptos.filter((c) => c.cobradoAlCliente).reduce((s, c) => s + Number(c.monto), 0);
  const totalGasto = conceptos.filter((c) => !c.cobradoAlCliente).reduce((s, c) => s + Number(c.monto), 0);
  const valido = nombre.trim() !== "" && Number(monto) > 0;

  return (
    <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#5b21b6", marginBottom: 2 }}>Conceptos adicionales</div>
      <div style={{ fontSize: 11, color: "#7c3aed", marginBottom: 10 }}>
        Montos que no salen de los productos vendidos, así que no entran en ningún porcentaje (comisión del vendedor, flete, Ganancias_2).
      </div>

      {conceptos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {conceptos.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "#fff", border: "1px solid #e9d5ff", borderRadius: 7, marginBottom: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", flex: 1 }}>{c.nombre}</span>
              <span style={{ fontSize: 10, padding: "1px 8px", borderRadius: 8, fontWeight: 600, background: c.cobradoAlCliente ? "#dcfce7" : "#fee2e2", color: c.cobradoAlCliente ? "#166534" : "#991b1b" }}>
                {c.cobradoAlCliente ? "lo paga el cliente" : "lo paga Ecoplast"}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#5b21b6", minWidth: 90, textAlign: "right" }}>${fmt(Number(c.monto))}</span>
              <button onClick={() => { if (confirm(`¿Eliminar "${c.nombre}"?`)) borrar.mutate(c.id); }}
                disabled={borrar.isPending} title="Eliminar concepto"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2 }}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
            {totalCobrado > 0 && <>Cobrado al cliente: <strong>${fmt(totalCobrado)}</strong> (sube su factura){totalGasto > 0 && " · "}</>}
            {totalGasto > 0 && <>Gasto de Ecoplast: <strong>${fmt(totalGasto)}</strong> (baja el Extra Material)</>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {ATAJOS.map((a) => (
          <button key={a} onClick={() => { setNombre(a); setCobrado(a !== "Ayudante"); setMsg(null); }}
            style={{ background: nombre === a ? "#7c3aed" : "#fff", color: nombre === a ? "#fff" : "#6d28d9", border: "1px solid #ddd6fe", borderRadius: 999, padding: "4px 12px", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            {a}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Concepto
          <input value={nombre} onChange={(e) => { setNombre(e.target.value); setMsg(null); }} placeholder="Ej: Viáticos"
            style={{ display: "block", marginTop: 3, width: 200, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Monto $
          <input type="number" min="0" step="0.01" value={monto} onChange={(e) => { setMonto(e.target.value); setMsg(null); }} placeholder="0.00"
            style={{ display: "block", marginTop: 3, width: 120, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }} />
        </label>
        <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>¿Quién lo paga?
          <select value={cobrado ? "cliente" : "ecoplast"} onChange={(e) => setCobrado(e.target.value === "cliente")}
            style={{ display: "block", marginTop: 3, width: 210, padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, background: "#fff" }}>
            <option value="cliente">El cliente (sube su factura)</option>
            <option value="ecoplast">Ecoplast (baja el Extra)</option>
          </select>
        </label>
        <button onClick={() => crear.mutate()} disabled={!valido || crear.isPending}
          style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: valido ? 1 : 0.5 }}>
          {crear.isPending ? "Agregando…" : "Agregar"}
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#16a34a" }}>✓ {msg}</div>}
    </div>
  );
}

// ─── Gastos de la carga (obreros / pigmento / electricidad) ──────────────────
// Cuando una carga lleva varios clientes, estos gastos son del viaje completo y
// José reparte el monto entre las facturas. Aquí fija la porción de ESTE
// despacho antes de generar (o regenerar) el balance. Vacío = tabla automática.
function GastosCargaEditor({ despachoId, generado, onRecalcular }: {
  despachoId: number; generado: boolean;
  // Recalcula el balance ya generado; devuelve true si de verdad recalculó.
  onRecalcular?: () => Promise<boolean>;
}) {
  const qc = useQueryClient();
  const [vals, setVals] = useState<{ obreros: string; pigmento: string; electricidad: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const { data: g } = useQuery({
    queryKey: ["ganancias-gastos", despachoId],
    queryFn: () => apiClient.get(`/despachos/${despachoId}/ganancias`).then((r) => r.data),
  });
  const gastos = g?.gastos;

  useEffect(() => {
    if (gastos && vals === null) {
      setVals({ obreros: String(gastos.obreros), pigmento: String(gastos.pigmento), electricidad: String(gastos.electricidad) });
    }
  }, [gastos, vals]);

  const guardar = useMutation({
    mutationFn: async () => {
      const campos = [
        { campo: "gastos_obreros",  val: Number(vals!.obreros),      base: Number(gastos.base.obreros) },
        { campo: "gastos_pigmento", val: Number(vals!.pigmento),     base: Number(gastos.base.pigmento) },
        { campo: "gastos_elect",    val: Number(vals!.electricidad), base: Number(gastos.base.electricidad) },
      ];
      for (const c of campos) {
        // Igual a la tabla automática = quitar el ajuste; distinto = fijar monto manual
        if (c.val === c.base) await apiClient.patch("/tablas", { campo: c.campo, despachoId, eliminar: true });
        else await apiClient.patch("/tablas", { campo: c.campo, valor: c.val, despachoId });
      }
      // Rearmar el balance de una vez para que los montos se reflejen (sin el paso aparte)
      return onRecalcular ? await onRecalcular() : false;
    },
    onSuccess: (recalculado) => {
      setMsg(
        recalculado ? "Gastos guardados y balance recalculado."
        : !generado ? "Gastos guardados. Ahora genera el balance."
        : "Gastos guardados. Este balance ya tiene pagos: pulsa \"Regenerar\" (arriba) cuando quieras recalcular."
      );
      qc.invalidateQueries({ queryKey: ["ganancias-gastos", despachoId] });
      qc.invalidateQueries({ queryKey: ["balance", despachoId] });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudieron guardar los gastos"),
  });

  if (!gastos || !vals) return null;

  const invalido = Object.values(vals).some((v) => v.trim() === "" || !(Number(v) >= 0));
  const campos: { key: "obreros" | "pigmento" | "electricidad"; label: string }[] = [
    { key: "obreros", label: "Obreros" },
    { key: "pigmento", label: "Pigmento" },
    { key: "electricidad", label: "Electricidad y Gasoil" },
  ];

  return (
    <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "14px 18px", marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e", marginBottom: 2 }}>Gastos de esta carga</div>
      <div style={{ fontSize: 11, color: "#a16207", marginBottom: 10 }}>
        Si el viaje llevó varios clientes, reparte aquí lo que corresponde a este despacho. La tabla automática (según total de factura) da: obreros ${fmt(Number(gastos.base.obreros))} · pigmento ${fmt(Number(gastos.base.pigmento))} · electricidad ${fmt(Number(gastos.base.electricidad))}.
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {campos.map(({ key, label }) => {
          const manual = Number(vals[key]) !== Number(gastos.base[key]);
          return (
            <label key={key} style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
              {label}{" "}
              {manual && <span style={{ fontSize: 10, background: "#fde68a", color: "#92400e", borderRadius: 8, padding: "1px 6px" }}>manual</span>}
              <input
                type="number" min="0" step="0.01"
                value={vals[key]}
                onChange={(e) => { setVals({ ...vals, [key]: e.target.value }); setMsg(null); }}
                style={{ display: "block", marginTop: 3, width: 130, padding: "7px 10px", border: manual ? "1.5px solid #f59e0b" : "1px solid #d1d5db", borderRadius: 8, fontSize: 13 }}
              />
            </label>
          );
        })}
        <button
          onClick={() => guardar.mutate()}
          disabled={invalido || guardar.isPending}
          style={{ background: "#d97706", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: invalido ? 0.5 : 1 }}
        >
          {guardar.isPending ? "Guardando…" : generado ? "Guardar y recalcular" : "Guardar gastos"}
        </button>
        <button
          onClick={() => { setVals({ obreros: String(gastos.base.obreros), pigmento: String(gastos.base.pigmento), electricidad: String(gastos.base.electricidad) }); setMsg(null); }}
          title="Volver a los montos de la tabla automática (recuerda Guardar)"
          style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "#64748b" }}
        >
          Tabla automática
        </button>
      </div>
      {msg && <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#16a34a" }}>✓ {msg}</div>}
    </div>
  );
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
    mutationFn: (ayudante: number) => apiClient.post(`/despachos/${despachoId}/balance/generar`, { ayudante }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["balance", despachoId] }),
  });

  // El Ayudante ya no se pregunta aquí: ahora es un "concepto adicional"
  // guardado en el despacho, así no se pierde al regenerar.
  const preguntarAyudanteYGenerar = () => generar.mutate(0);

  const handleRegenerar = () => {
    const hayPagos = balance?.items.some(i => i.cuotas.length > 0);
    const hayAjustes = balance?.items.some(i => i.esEditable && i.notas);
    if (hayPagos || hayAjustes) {
      const msg = "⚠️ ATENCIÓN\n\nRegenerar recalculará todos los montos con las tasas actuales.\n\nLos pagos ya registrados se conservan, pero cualquier monto editado manualmente volverá al valor calculado.\n\n¿Deseas continuar?";
      if (!window.confirm(msg)) return;
    }
    preguntarAyudanteYGenerar();
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
      <div style={{ padding: 40, maxWidth: 640, margin: "0 auto" }}>
        {/* Primero se decide la porción de gastos de esta carga; luego se genera */}
        {isMaster && <GastosCargaEditor despachoId={despachoId} generado={false} />}
        {isMaster && <ConceptosExtraEditor despachoId={despachoId} generado={false} />}
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "#64748b", marginBottom: 20 }}>El balance aún no ha sido generado para este despacho.</p>
          <button
            onClick={preguntarAyudanteYGenerar}
            disabled={generar.isPending}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", cursor: "pointer", fontSize: 15 }}
          >
            {generar.isPending ? "Generando…" : "Generar Balance"}
          </button>
        </div>
      </div>
    );
  }

  // Rearma el balance tras cambiar gastos o conceptos. Devuelve false (y no toca
  // nada) si ya hay pagos o montos editados a mano: regenerar borra las cuotas,
  // así que en ese caso decide el usuario con el botón "Regenerar", que avisa.
  const recalcularBalance = async (): Promise<boolean> => {
    const hayPagos = balance.items.some((i) => i.cuotas.length > 0);
    const hayEdits = balance.items.some((i) => i.esEditable && i.notas);
    if (hayPagos || hayEdits) return false;
    await apiClient.post(`/despachos/${despachoId}/balance/generar`, {});
    return true;
  };

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
            onClick={() => pdfBalancePago({ despachoId, calculadoEn: balance?.calculadoEn, items: balance?.items ?? [], gananciaVendedor: balance?.gananciaVendedor })}
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

      {/* Sección superior: Comisión del Vendedor (independiente, no suma en el balance) */}
      {(balance.gananciaVendedor ?? 0) > 0 && (
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 10,
          padding: "12px 18px", marginBottom: 16,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#0e7490" }}>Ganancia del Vendedor</div>
            <div style={{ fontSize: 11, color: "#64748b" }}>Resumen — ya incluida en el balance; el detalle por vendedor está en la tabla</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#0891b2" }}>${fmt(Number(balance.gananciaVendedor))}</div>
        </div>
      )}

      {/* Gastos de la carga y conceptos adicionales: al guardar, recalculan solos */}
      {isMaster && (
        <>
          <GastosCargaEditor despachoId={despachoId} generado={true} onRecalcular={recalcularBalance} />
          <ConceptosExtraEditor despachoId={despachoId} generado={true} onRecalcular={recalcularBalance} />
        </>
      )}

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
