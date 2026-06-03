import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { facturasApi } from "../api/endpoints";
import { FileText, DollarSign, Clock, CheckCircle, AlertTriangle, Download, XCircle, Trash2, Search, X } from "lucide-react";
import { pdfFactura } from "../utils/pdf";
import { useAuth } from "../contexts/AuthContext";

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
  const { esMaster } = useAuth();
  const [filtro, setFiltro] = useState("TODAS");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [facturaId, setFacturaId] = useState<number | null>(null);

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

  const hayFiltros = busqueda || desde || hasta;
  const limpiarFiltros = () => { setBusqueda(""); setDesde(""); setHasta(""); };

  const facturas = useMemo(() => {
    let lista = filtro === "TODAS" ? todas : todas.filter((f: any) => f.estado === filtro);
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter((f: any) =>
        f.numero?.toLowerCase().includes(q) ||
        f.cliente?.nombre?.toLowerCase().includes(q)
      );
    }
    if (desde) {
      const d = new Date(desde);
      lista = lista.filter((f: any) => new Date(f.fechaEmision ?? f.creadoEn) >= d);
    }
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59);
      lista = lista.filter((f: any) => new Date(f.fechaEmision ?? f.creadoEn) <= h);
    }
    return lista;
  }, [todas, filtro, busqueda, desde, hasta]);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Facturas</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
          {hayFiltros ? `${facturas.length} de ${todas.length}` : `${todas.length}`} facturas emitidas
        </p>
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
              {["Número", "Cliente", "Empresa", "Fecha", "Total", "Saldo", "Estado", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
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
                  <td style={{ ...tdStyle, fontSize: 12, color: "#64748b" }}>{f.empresa?.nombre ?? "—"}</td>
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
                  <td style={tdStyle}><span style={{ fontSize: 12, color: "#94a3b8" }}>Ver →</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => pdfFactura(factura)}
                  style={{ ...btnAction, background: "#f1f5f9", color: "#475569", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Download size={13} /> Descargar PDF
                </button>
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
                <button onClick={() => setFacturaId(null)} style={btnClose}>✕</button>
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
                    </tr>
                  </thead>
                  <tbody>
                    {(factura.lineas ?? []).map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagos registrados */}
            {factura.pagos?.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Pagos Recibidos</div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Cuenta</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Monto Asignado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factura.pagos.map((pa: any) => (
                      <tr key={pa.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ ...tdStyle, color: "#64748b" }}>{fecha(pa.fechaAsignacion)}</td>
                        <td style={tdStyle}>{pa.pago?.cuenta?.nombre ?? "—"} <span style={{ color: "#94a3b8", fontSize: 11 }}>({pa.pago?.cuenta?.moneda})</span></td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "#16a34a" }}>{usd(pa.montoAsignado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
