import { useState, useMemo, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facturasApi, clientesApi, cuentasApi, empresasApi, authApi } from "../api/endpoints";
import { FileText, DollarSign, Clock, CheckCircle, AlertTriangle, Download, XCircle, Trash2, Search, X, Plus, Minus, ArrowUp, ArrowDown, BarChart2, Undo2, Truck } from "lucide-react";
import { pdfFactura, pdfEstadoCuenta } from "../utils/pdf";
import { useAuth } from "../contexts/AuthContext";
import ImportarFacturasExcel from "../components/ImportarFacturasExcel";

const ESTADO: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  EMITIDA:         { label: "Emitida",       color: "#475569", bg: "#f1f5f9", icon: FileText },
  PENDIENTE_COBRO: { label: "Por Cobrar",    color: "#2563eb", bg: "#dbeafe", icon: Clock },
  COBRADA_PARCIAL: { label: "Parcial",       color: "#d97706", bg: "#fef3c7", icon: AlertTriangle },
  COBRADA:         { label: "Cobrada",       color: "#16a34a", bg: "#dcfce7", icon: CheckCircle },
  VENCIDA:         { label: "Vencida",       color: "#dc2626", bg: "#fee2e2", icon: AlertTriangle },
  ANULADA:         { label: "Anulada",       color: "#94a3b8", bg: "#f8fafc", icon: XCircle },
};

const FILTROS = [
  { key: "TODAS",          label: "Todas" },
  { key: "PENDIENTE_COBRO",label: "Por Cobrar" },
  { key: "COBRADA_PARCIAL",label: "Parcial" },
  { key: "VENCIDA",        label: "Vencidas" },
  { key: "COBRADA",        label: "Cobradas" },
];

function usd(n: any) {
  const v = Number(n ?? 0);
  return isNaN(v) ? "$0,00" : `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fecha(raw: any) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Facturas() {
  const qc = useQueryClient();
  const { esMaster, puedeEditar } = useAuth();
  const navigate = useNavigate();
  const [filtro, setFiltro] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [filtroCliente, setFiltroCliente] = useState<number | "">("");
  const [filtroVendedor, setFiltroVendedor] = useState<number | "">("");
  const [ordenFecha, setOrdenFecha] = useState<"desc" | "asc">("desc");
  const [facturaId, setFacturaId] = useState<number | null>(null);

  const [editNotas, setEditNotas] = useState(false);
  const [notasValue, setNotasValue] = useState("");
  const [generandoBalance, setGenerandoBalance] = useState(false);
  const [modalManual, setModalManual] = useState(false);
  const [mForm, setMForm] = useState<any>({ pagos: [] });
  const [devolLineaId, setDevolLineaId] = useState<number | null>(null); // línea con el mini-form abierto
  const [devolCant, setDevolCant] = useState("");
  const [devolMotivo, setDevolMotivo] = useState("");

  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: clientesApi.listar });
  const { data: cuentas = [] } = useQuery({ queryKey: ["cuentas-todas"], queryFn: cuentasApi.listarTodas });
  const { data: empresas = [] } = useQuery({ queryKey: ["empresas"], queryFn: empresasApi.listar });
  const { data: vendedores = [] } = useQuery({ queryKey: ["vendedores"], queryFn: authApi.listarVendedores });

  const sumaPagosManual = (mForm.pagos as any[]).reduce((s: number, p: any) => s + (Number(p.monto) || 0), 0);
  const saldoManual = Math.max(0, (Number(mForm.totalNeto) || 0) - sumaPagosManual);
  const estadoManual = saldoManual <= 0 ? "COBRADA" : sumaPagosManual > 0 ? "COBRADA_PARCIAL" : "EMITIDA";

  const crearManual = useMutation({
    mutationFn: () => facturasApi.crearManual({ ...mForm, pagosIniciales: mForm.pagos }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
      setModalManual(false);
      setMForm({ pagos: [] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al crear la factura"),
  });

  const guardarNotas = useMutation({
    mutationFn: ({ id, notas }: { id: number; notas: string }) =>
      facturasApi.actualizarNotas(id, notas),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factura", facturaId] });
      setEditNotas(false);
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al guardar notas"),
  });

  const generarDespacho = useMutation({
    mutationFn: (cotizacionId?: number) => facturasApi.generarDespacho(facturaId!, cotizacionId ? { cotizacionId } : undefined),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["factura", facturaId] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
      alert(`Despacho ${r.despacho?.numero} creado desde ${r.cotizacion}. Ya puedes ver Ganancias y Balance.`);
    },
    onError: async (e: any) => {
      const msg = e?.response?.data?.error ?? "No se pudo generar el despacho";
      // Si hay varias cotizaciones posibles, se ofrece elegir
      try {
        const { candidatas } = await facturasApi.candidatasDespacho(facturaId!);
        if (!candidatas?.length) { alert(msg); return; }
        const lista = candidatas.map((c: any, i: number) => `${i + 1}) ${c.numero} · ${c.estado} · $${Number(c.totalNeto).toFixed(2)}${c.coincideMonto ? " (coincide)" : ""}`).join("   |   ");
        const sel = window.prompt(`${msg}   —   ${lista}   —   Escribe el número de la opción:`);
        const idx = Number(sel) - 1;
        if (candidatas[idx]) generarDespacho.mutate(candidatas[idx].id);
      } catch { alert(msg); }
    },
  });

  const crearDevolucion = useMutation({
    mutationFn: ({ lineaId, cantidad, motivo }: { lineaId: number; cantidad: number; motivo?: string }) =>
      facturasApi.registrarDevolucion(facturaId!, lineaId, { cantidad, motivo }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["factura", facturaId] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
      setDevolLineaId(null); setDevolCant(""); setDevolMotivo("");
      if (r?.aviso) alert(r.aviso);
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al registrar la devolución"),
  });

  const borrarDevolucion = useMutation({
    mutationFn: (id: number) => facturasApi.eliminarDevolucion(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["factura", facturaId] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al revertir la devolución"),
  });

  const eliminarFac = useMutation({
    mutationFn: (id: number) => facturasApi.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["facturas-balance"] }); setFacturaId(null); },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al eliminar"),
  });

  const { data: balance } = useQuery({
    queryKey: ["facturas-balance"],
    queryFn: facturasApi.balance,
  });

  const { data: factura } = useQuery({
    queryKey: ["factura", facturaId],
    queryFn: () => facturasApi.obtener(facturaId!),
    enabled: !!facturaId,
  });

  const todas: any[] = balance?.facturas ?? [];

  const hayFiltros = busqueda || desde || hasta || filtroCliente || filtroVendedor;
  const limpiarFiltros = () => { setBusqueda(""); setDesde(""); setHasta(""); setFiltroCliente(""); setFiltroVendedor(""); };

  const facturas = useMemo(() => {
    let lista = filtro === "TODAS" ? todas : todas.filter((f: any) => f.estado === filtro);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter((f: any) =>
        f.numero?.toLowerCase().includes(q) ||
        f.cliente?.nombre?.toLowerCase().includes(q)
      );
    }
    if (filtroCliente) lista = lista.filter((f: any) => f.clienteId === filtroCliente);
    if (filtroVendedor) lista = lista.filter((f: any) => f.cliente?.vendedor?.id === filtroVendedor);
    if (desde) {
      const d = new Date(desde);
      lista = lista.filter((f: any) => new Date(f.fechaEmision ?? f.creadoEn) >= d);
    }
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59);
      lista = lista.filter((f: any) => new Date(f.fechaEmision ?? f.creadoEn) <= h);
    }
    const ord = [...lista].sort((a: any, b: any) => {
      const ta = new Date(a.fechaEmision ?? a.creadoEn).getTime();
      const tb = new Date(b.fechaEmision ?? b.creadoEn).getTime();
      return ordenFecha === "asc" ? ta - tb : tb - ta;
    });
    return ord;
  }, [todas, filtro, busqueda, desde, hasta, filtroCliente, filtroVendedor, ordenFecha]);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Facturas</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {hayFiltros ? `${facturas.length} de ${todas.length}` : `${todas.length}`} facturas emitidas
          </p>
        </div>
        {esMaster && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ImportarFacturasExcel label="Importar Excel (despachos)" />
            <button
              onClick={() => { setMForm({ pagos: [] }); setModalManual(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#7c3aed", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
            >
              <Plus size={15} /> Factura manual
            </button>
          </div>
        )}
      </div>

      {/* Resumen */}
      {balance && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
          <div style={cardStat}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Total Emitido</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{usd(balance.totalEmitido)}</div>
          </div>
          <div style={{ ...cardStat, borderLeft: "4px solid #16a34a" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Cobrado</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{usd(balance.totalCobrado)}</div>
          </div>
          <div style={{ ...cardStat, borderLeft: "4px solid #f59e0b" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: 4 }}>Saldo Pendiente</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>{usd(balance.totalPendiente)}</div>
          </div>
        </div>
      )}

      {/* Barra de búsqueda y fechas */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número o cliente..."
            style={{ width: "100%", padding: "8px 10px 8px 32px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }}
          />
        </div>
        <select value={filtroCliente} onChange={(e) => setFiltroCliente(Number(e.target.value) || "")}
          style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", maxWidth: 190 }}>
          <option value="">Cliente: todos</option>
          {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <select value={filtroVendedor} onChange={(e) => setFiltroVendedor(Number(e.target.value) || "")}
          style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff", maxWidth: 170 }}>
          <option value="">Vendedor: todos</option>
          {(vendedores as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }} />
        </div>
        {hayFiltros && (
          <button onClick={limpiarFiltros} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {FILTROS.map((f) => {
          const count = f.key === "TODAS" ? todas.length : todas.filter((x: any) => x.estado === f.key).length;
          return (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "none",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: filtro === f.key ? 700 : 400,
                background: filtro === f.key ? "#1e293b" : "#f1f5f9",
                color: filtro === f.key ? "#fff" : "#64748b",
              }}
            >
              {f.label} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Número", "Cliente", "Vendedor", "Fecha", "Total", "Saldo", "Estado", ""].map((h) =>
                h === "Fecha" ? (
                  <th
                    key={h}
                    style={{ ...thStyle, cursor: "pointer", userSelect: "none" }}
                    onClick={() => setOrdenFecha((o) => (o === "desc" ? "asc" : "desc"))}
                    title="Ordenar por fecha"
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#2563eb" }}>
                      Fecha {ordenFecha === "desc" ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
                    </span>
                  </th>
                ) : (
                  <th key={h} style={thStyle}>{h}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {facturas.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                  <DollarSign size={32} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
                  No hay facturas en esta categoría
                </td>
              </tr>
            )}
            {facturas.map((f: any) => {
              const est = ESTADO[f.estado] ?? ESTADO["EMITIDA"];
              const EstIcon = est.icon;
              return (
                <tr
                  key={f.id}
                  style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                  onClick={() => setFacturaId(f.id)}
                >
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: "#2563eb" }}>{f.numero}</span></td>
                  <td style={tdStyle}>{f.cliente?.nombre ?? "—"}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "#64748b" }}>{f.cliente?.vendedor?.nombre ?? "—"}</td>
                  <td style={{ ...tdStyle, color: "#64748b" }}>{fecha(f.fechaEmision ?? f.creadoEn)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{usd(f.totalNeto)}</td>
                  <td style={{ ...tdStyle, color: Number(f.saldoPendiente) > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                    {Number(f.saldoPendiente) > 0 ? usd(f.saldoPendiente) : "✓ Cobrada"}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...badge, color: est.color, background: est.bg, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <EstIcon size={11} /> {est.label}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>Ver →</span>
                      {/* Ganancias/Balance calculan por despacho: solo facturas nacidas de uno */}
                      {f.ordenDespachoId && (
                        <>
                          <button
                            title="Ver distribución de ganancias del despacho"
                            onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${f.ordenDespachoId}/ganancias`); }}
                            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#16a34a" }}
                          >
                            <BarChart2 size={12} /> Ganancias
                          </button>
                          {esMaster && (
                            <button
                              title="Ver balance de pagos del despacho"
                              onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${f.ordenDespachoId}/balance`); }}
                              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#2563eb" }}
                            >
                              <BarChart2 size={12} /> Balance
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal Importar Factura Histórica */}
      {modalManual && (
        <div style={overlayStyle} onClick={() => setModalManual(false)}>
          <div style={{ ...modalStyle, width: "min(680px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Importar Factura Histórica</h2>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>Para registrar facturas pasadas con sus pagos ya realizados</p>
              </div>
              <button onClick={() => setModalManual(false)} style={btnClose}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbSt}>Cliente *</label>
                <select style={inSt} value={mForm.clienteId ?? ""} onChange={(e) => setMForm({ ...mForm, clienteId: Number(e.target.value) || undefined })}>
                  <option value="">— Seleccionar —</option>
                  {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={lbSt}>Número de Factura *</label>
                <input style={inSt} placeholder="Ej: 0001, FAC-2024-001" value={mForm.numero ?? ""} onChange={(e) => setMForm({ ...mForm, numero: e.target.value })} />
              </div>
              <div>
                <label style={lbSt}>Fecha de Emisión *</label>
                <input type="date" style={inSt} value={mForm.fechaEmision ?? ""} onChange={(e) => setMForm({ ...mForm, fechaEmision: e.target.value })} />
              </div>
              <div>
                <label style={lbSt}>Total Neto (USD) *</label>
                <input type="number" min="0" step="0.01" style={inSt} placeholder="0.00" value={mForm.totalNeto ?? ""} onChange={(e) => setMForm({ ...mForm, totalNeto: e.target.value })} />
              </div>
              <div>
                <label style={lbSt}>Empresa emisora</label>
                <select style={inSt} value={mForm.empresaId ?? ""} onChange={(e) => setMForm({ ...mForm, empresaId: Number(e.target.value) || undefined })}>
                  <option value="">— Ninguna —</option>
                  {(empresas as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={lbSt}>Notas internas</label>
                <textarea rows={2} style={{ ...inSt, resize: "vertical", height: 56, fontFamily: "inherit" }} placeholder="Observaciones, condiciones, referencias..." value={mForm.notas ?? ""} onChange={(e) => setMForm({ ...mForm, notas: e.target.value })} />
              </div>
            </div>

            {/* Pagos ya realizados */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Pagos ya realizados</span>
                <button
                  onClick={() => setMForm({ ...mForm, pagos: [...(mForm.pagos ?? []), { monto: "", fecha: mForm.fechaEmision ?? "", cuentaId: "", moneda: "USD", origenFondos: "" }] })}
                  style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, color: "#475569" }}
                >
                  <Plus size={12} /> Agregar pago
                </button>
              </div>
              {(mForm.pagos as any[]).length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", padding: "8px 0" }}>Sin pagos — la factura quedará como EMITIDA (pendiente de cobro)</div>
              )}
              {(mForm.pagos as any[]).map((p: any, i: number) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                  <div>
                    <label style={lbSt}>Monto (USD)</label>
                    <input type="number" min="0" step="0.01" style={inSt} placeholder="0.00" value={p.monto} onChange={(e) => { const ps = [...mForm.pagos]; ps[i] = { ...ps[i], monto: e.target.value }; setMForm({ ...mForm, pagos: ps }); }} />
                  </div>
                  <div>
                    <label style={lbSt}>Fecha del pago</label>
                    <input type="date" style={inSt} value={p.fecha} onChange={(e) => { const ps = [...mForm.pagos]; ps[i] = { ...ps[i], fecha: e.target.value }; setMForm({ ...mForm, pagos: ps }); }} />
                  </div>
                  <div>
                    <label style={lbSt}>Cuenta / Método</label>
                    <select style={inSt} value={p.cuentaId} onChange={(e) => { const ps = [...mForm.pagos]; ps[i] = { ...ps[i], cuentaId: Number(e.target.value) || "" }; setMForm({ ...mForm, pagos: ps }); }}>
                      <option value="">— Ninguna —</option>
                      {(cuentas as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                    </select>
                  </div>
                  <button onClick={() => { const ps = [...mForm.pagos]; ps.splice(i, 1); setMForm({ ...mForm, pagos: ps }); }} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "7px 9px", cursor: "pointer", color: "#dc2626", alignSelf: "flex-end" }}>
                    <Minus size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Preview estado */}
            {mForm.totalNeto && (
              <div style={{ background: estadoManual === "COBRADA" ? "#f0fdf4" : estadoManual === "COBRADA_PARCIAL" ? "#fffbeb" : "#f8fafc", border: `1px solid ${estadoManual === "COBRADA" ? "#bbf7d0" : estadoManual === "COBRADA_PARCIAL" ? "#fde68a" : "#e2e8f0"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Total pagado:</span>
                  <span style={{ fontWeight: 600, color: "#16a34a" }}>{usd(sumaPagosManual)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "#64748b" }}>Saldo pendiente:</span>
                  <span style={{ fontWeight: 700, color: saldoManual > 0 ? "#dc2626" : "#16a34a" }}>{usd(saldoManual)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                  <span style={{ color: "#64748b" }}>Estado resultante:</span>
                  <span style={{ fontWeight: 700, color: estadoManual === "COBRADA" ? "#16a34a" : estadoManual === "COBRADA_PARCIAL" ? "#d97706" : "#475569" }}>{estadoManual === "COBRADA" ? "✓ Cobrada" : estadoManual === "COBRADA_PARCIAL" ? "Cobro Parcial" : "Emitida (pendiente)"}</span>
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalManual(false)} style={{ ...btnAction, background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
              <button
                onClick={() => crearManual.mutate()}
                disabled={!mForm.clienteId || !mForm.numero || !mForm.totalNeto || crearManual.isPending}
                style={{ ...btnAction, background: "#7c3aed", color: "#fff", opacity: (!mForm.clienteId || !mForm.numero || !mForm.totalNeto) ? 0.5 : 1 }}
              >
                {crearManual.isPending ? "Guardando..." : "Crear Factura"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle */}
      {facturaId && factura && (
        <div style={overlayStyle} onClick={() => setFacturaId(null)}>
          <div style={{ ...modalStyle, width: "min(900px, 98vw)" }} onClick={(e) => e.stopPropagation()}>
            {/* Header modal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{factura.numero}</h2>
                  {(() => {
                    const est = ESTADO[factura.estado] ?? ESTADO["EMITIDA"];
                    const EstIcon = est.icon;
                    return (
                      <span style={{ ...badge, color: est.color, background: est.bg, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <EstIcon size={11} /> {est.label}
                      </span>
                    );
                  })()}
                </div>
                <div style={{ fontSize: 13, color: "#64748b" }}>
                  {factura.cliente?.nombre}
                  {factura.empresa && <> · <span style={{ color: "#94a3b8" }}>{factura.empresa.nombre}</span></>}
                  {" · "}{fecha(factura.fechaEmision ?? factura.creadoEn)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  onClick={() => pdfFactura(factura)}
                  style={{ ...btnAction, background: "#f1f5f9", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Download size={13} /> PDF Factura
                </button>
                <button
                  onClick={() => pdfEstadoCuenta({ cliente: factura.cliente, cotizaciones: [], facturas: [factura] })}
                  style={{ ...btnAction, background: "#dbeafe", color: "#1d4ed8", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Download size={13} /> PDF Recibo
                </button>
                <button
                  onClick={async () => {
                    setGenerandoBalance(true);
                    try {
                      const todas = await facturasApi.listarConPagos(factura.clienteId);
                      pdfEstadoCuenta({ cliente: factura.cliente, cotizaciones: [], facturas: todas });
                    } catch { alert("Error al generar el balance"); }
                    finally { setGenerandoBalance(false); }
                  }}
                  disabled={generandoBalance}
                  style={{ ...btnAction, background: "#dcfce7", color: "#166534", display: "flex", alignItems: "center", gap: 6, opacity: generandoBalance ? 0.6 : 1 }}
                >
                  <Download size={13} /> {generandoBalance ? "Generando..." : "PDF Balance Cliente"}
                </button>
                {puedeEditar && !factura.ordenDespachoId && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`Esta factura se creó con "Factura Directa" y no tiene despacho, por eso no hay Ganancias ni Balance.

¿Generar ahora su despacho desde la cotización?`)) return;
                      generarDespacho.mutate(undefined);
                    }}
                    disabled={generarDespacho.isPending}
                    style={{ ...btnAction, background: "#fef3c7", color: "#92400e", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Truck size={13} /> {generarDespacho.isPending ? "Generando..." : "Generar despacho"}
                  </button>
                )}
                {esMaster && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`¿Eliminar ${factura.numero} permanentemente?`)) return;
                      eliminarFac.mutate(factura.id);
                    }}
                    style={{ ...btnAction, background: "#fee2e2", color: "#991b1b", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <Trash2 size={13} /> Eliminar
                  </button>
                )}
                <button onClick={() => { setFacturaId(null); setEditNotas(false); }} style={btnClose}>✕</button>
              </div>
            </div>

            {/* Info cliente */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "#374151" }}>Datos del Cliente</div>
                <div>{factura.cliente?.nombre}</div>
                {factura.cliente?.rif && <div style={{ color: "#64748b" }}>RIF: {factura.cliente.rif}</div>}
                {factura.cliente?.direccion && <div style={{ color: "#64748b" }}>{factura.cliente.direccion}</div>}
                {factura.cliente?.condicionPago && <div style={{ color: "#64748b" }}>Condición: {factura.cliente.condicionPago}</div>}
              </div>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 16px", fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 6, color: "#374151" }}>Resumen</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: "#64748b" }}>Total bruto:</span>
                  <span>{usd(factura.totalBruto)}</span>
                </div>
                {Number(factura.descuentoTotal) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ color: "#64748b" }}>Descuento:</span>
                    <span style={{ color: "#dc2626" }}>−{usd(factura.descuentoTotal)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontWeight: 700 }}>
                  <span>Total Neto:</span>
                  <span>{usd(factura.totalNeto)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ color: "#64748b" }}>Cobrado:</span>
                  <span style={{ color: "#16a34a" }}>{usd(factura.totalPagado)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: Number(factura.saldoPendiente) > 0 ? "#dc2626" : "#16a34a" }}>
                  <span>Saldo pendiente:</span>
                  <span>{usd(factura.saldoPendiente)}</span>
                </div>
              </div>
            </div>

            {/* Líneas */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Productos</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                      <th style={thStyle}>Producto</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Medida</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Cant.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Precio Unit.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                      {puedeEditar && <th style={{ ...thStyle, textAlign: "right" }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(factura.lineas ?? []).map((l: any) => (
                      <Fragment key={l.id}>
                        <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                          <td style={tdStyle}>
                            <div style={{ fontWeight: 600 }}>{l.producto?.nombre}</div>
                            {l.producto?.categoria?.nombre && (
                              <div style={{ fontSize: 11, color: "#94a3b8" }}>{l.producto.categoria.nombre}</div>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                              {l.producto?.medida}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }}>{Number(l.cantidad)}</td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>{usd(l.precioUnitario)}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{usd(l.totalLinea)}</td>
                          {puedeEditar && (
                            <td style={{ ...tdStyle, textAlign: "right" }}>
                              {Number(l.cantidad) > 0 && (
                                <button
                                  title="Registrar devolución de producto en esta línea"
                                  onClick={() => { setDevolLineaId(devolLineaId === l.id ? null : l.id); setDevolCant(String(Number(l.cantidad))); setDevolMotivo(""); }}
                                  style={{ display: "inline-flex", alignItems: "center", gap: 4, background: devolLineaId === l.id ? "#fef2f2" : "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: "#b91c1c", fontWeight: 600 }}
                                >
                                  <Undo2 size={12} /> Devolver
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                        {devolLineaId === l.id && (
                          <tr style={{ background: "#fef2f2" }}>
                            <td colSpan={puedeEditar ? 6 : 5} style={{ padding: "10px 12px" }}>
                              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#7f1d1d" }}>
                                  Cantidad a devolver <span style={{ fontWeight: 400, color: "#94a3b8" }}>(máx. {Number(l.cantidad)})</span>
                                  <input
                                    type="number" min="0" max={Number(l.cantidad)} step="0.01"
                                    value={devolCant} onChange={(e) => setDevolCant(e.target.value)}
                                    style={{ display: "block", marginTop: 3, width: 110, padding: "6px 9px", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13 }}
                                  />
                                </label>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#7f1d1d", flex: 1, minWidth: 180 }}>
                                  Motivo <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span>
                                  <input
                                    value={devolMotivo} onChange={(e) => setDevolMotivo(e.target.value)}
                                    placeholder="Ej: producto dañado, pedido de más..."
                                    style={{ display: "block", marginTop: 3, width: "100%", padding: "6px 9px", border: "1px solid #fca5a5", borderRadius: 6, fontSize: 13, boxSizing: "border-box" }}
                                  />
                                </label>
                                <div style={{ fontSize: 12, color: "#7f1d1d" }}>
                                  Crédito: <strong>{usd((Number(devolCant) || 0) * Number(l.precioUnitario) * (1 - Number(l.descuentoPct ?? 0) / 100))}</strong>
                                </div>
                                <button onClick={() => setDevolLineaId(null)} style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                                <button
                                  onClick={() => crearDevolucion.mutate({ lineaId: l.id, cantidad: Number(devolCant), motivo: devolMotivo })}
                                  disabled={!(Number(devolCant) > 0) || Number(devolCant) > Number(l.cantidad) || crearDevolucion.isPending}
                                  style={{ background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: (Number(devolCant) > 0 && Number(devolCant) <= Number(l.cantidad)) ? 1 : 0.5 }}
                                >
                                  {crearDevolucion.isPending ? "Registrando…" : "Confirmar devolución"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Devoluciones registradas */}
            {(factura.devoluciones ?? []).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Devoluciones registradas</div>
                <div style={{ border: "1px solid #fecaca", borderRadius: 8, overflow: "hidden" }}>
                  {(factura.devoluciones ?? []).map((d: any, i: number) => (
                    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#fef2f2", borderTop: i > 0 ? "1px solid #fecaca" : undefined, fontSize: 12 }}>
                      <span style={{ color: "#94a3b8", minWidth: 76 }}>{new Date(d.creadoEn).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" })}</span>
                      <span style={{ flex: 1, fontWeight: 600, color: "#7f1d1d" }}>
                        {Number(d.cantidad)} × {d.producto?.nombre} {d.producto?.medida}
                        {d.motivo && <span style={{ fontWeight: 400, color: "#991b1b" }}> — {d.motivo}</span>}
                      </span>
                      <span style={{ color: "#94a3b8" }}>{d.creadoPor?.nombre}</span>
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>−{usd(d.montoDevuelto)}</span>
                      {puedeEditar && (
                        <button
                          title="Revertir esta devolución"
                          onClick={() => { if (confirm("¿Revertir esta devolución? Vuelve la cantidad y el monto a la factura.")) borrarDevolucion.mutate(d.id); }}
                          disabled={borrarDevolucion.isPending}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2 }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notas internas */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Notas internas</div>
                {!editNotas && (
                  <button
                    onClick={() => { setNotasValue(factura.notas ?? ""); setEditNotas(true); }}
                    style={{ fontSize: 12, padding: "4px 10px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", cursor: "pointer", color: "#64748b" }}
                  >
                    {factura.notas ? "Editar" : "+ Agregar nota"}
                  </button>
                )}
              </div>
              {editNotas ? (
                <div>
                  <textarea
                    value={notasValue}
                    onChange={(e) => setNotasValue(e.target.value)}
                    rows={3}
                    placeholder="Acuerdos de pago, observaciones, referencias..."
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
                  />
                  <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditNotas(false)} style={{ ...btnAction, background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
                    <button
                      onClick={() => guardarNotas.mutate({ id: factura.id, notas: notasValue })}
                      disabled={guardarNotas.isPending}
                      style={{ ...btnAction, background: "#2563eb", color: "#fff" }}
                    >
                      {guardarNotas.isPending ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : factura.notas ? (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#374151", whiteSpace: "pre-wrap" }}>
                  {factura.notas}
                </div>
              ) : (
                <div style={{ color: "#94a3b8", fontSize: 13 }}>Sin notas</div>
              )}
            </div>

            {/* Historial de Pagos — Resta/Abono */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Historial de Pagos</div>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                {/* Total factura row (amber) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", background: "#FDB913" }}>
                  <span style={{ fontWeight: 700, color: "#713f12", fontSize: 13 }}>Total Factura</span>
                  <span style={{ fontWeight: 800, color: "#713f12", fontSize: 14 }}>{usd(factura.totalNeto)}</span>
                </div>

                {(!factura.pagos || factura.pagos.length === 0) && (
                  <div style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 13 }}>Sin pagos registrados</div>
                )}

                {(() => {
                  const pagosOrdenados = [...(factura.pagos ?? [])].sort(
                    (a: any, b: any) => new Date(a.fechaAsignacion).getTime() - new Date(b.fechaAsignacion).getTime()
                  );
                  let saldo = Number(factura.totalNeto);
                  return pagosOrdenados.map((pa: any) => {
                    const monto = Number(pa.montoAsignado);
                    const cuentaNombre = pa.pago?.cuenta?.nombre ?? pa.pago?.origenFondos ?? "Abono";
                    const moneda = pa.pago?.cuenta?.moneda ?? pa.pago?.moneda ?? "";
                    const label = `${cuentaNombre}${moneda ? ` (${moneda})` : ""} · ${fecha(pa.fechaAsignacion)}`;
                    saldo -= monto;
                    return (
                      <div key={pa.id}>
                        {/* Abono row (white) */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "8px 14px", background: "#fff", borderTop: "1px solid #f1f5f9" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, color: "#374151", fontSize: 13 }}>{label}</div>
                            {pa.notas && puedeEditar && (
                              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontStyle: "italic" }}>{pa.notas}</div>
                            )}
                          </div>
                          <span style={{ fontWeight: 700, color: "#16a34a", fontSize: 14, marginLeft: 12, flexShrink: 0 }}>{usd(monto)}</span>
                        </div>
                        {/* Resta row (amber) */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 14px", background: "#fef3c7", borderTop: "1px solid #fde68a" }}>
                          <span style={{ fontWeight: 700, color: "#92400e", fontSize: 12 }}>Resta</span>
                          <span style={{ fontWeight: 800, color: "#92400e", fontSize: 13 }}>{usd(Math.max(0, saldo))}</span>
                        </div>
                      </div>
                    );
                  });
                })()}

                {/* Final status */}
                {Number(factura.saldoPendiente) <= 0.005 ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#16a34a", borderTop: "2px solid #15803d" }}>
                    <span style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>✓ PAGADO TODO</span>
                    {factura.pagos?.length > 0 && (
                      <span style={{ fontWeight: 600, color: "#dcfce7", fontSize: 13 }}>
                        {fecha((factura.pagos as any[]).reduce((latest: any, pa: any) =>
                          new Date(pa.fechaAsignacion) > new Date(latest.fechaAsignacion) ? pa : latest
                        ).fechaAsignacion)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#dc2626", borderTop: "2px solid #b91c1c" }}>
                    <span style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>SALDO PENDIENTE</span>
                    <span style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>{usd(factura.saldoPendiente)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const cardStat: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 20px", borderLeft: "4px solid #e2e8f0" };
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const badge: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "92vh", overflow: "auto" };
const btnAction: React.CSSProperties = { border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnClose: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#64748b" };
const lbSt: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 3 };
const inSt: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box" };
