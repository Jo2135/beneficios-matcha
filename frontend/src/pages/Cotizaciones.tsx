import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cotizacionesApi, despachosApi } from "../api/endpoints";
import { Plus, FileText, CheckCircle, XCircle, Send, ArrowRight, Truck, Download, Factory, TrendingUp, Trash2, Search, X, Edit2 } from "lucide-react";
import { pdfCotizacion, pdfHojaProduccion, pdfCotizacionGanancia } from "../utils/pdf";
import { useAuth } from "../contexts/AuthContext";

const ESTADOS: Record<string, { label: string; color: string }> = {
  BORRADOR: { label: "Borrador", color: "#6b7280" },
  ENVIADA: { label: "Enviada", color: "#2563eb" },
  APROBADA: { label: "Aprobada", color: "#16a34a" },
  EN_DESPACHO: { label: "En despacho", color: "#7c3aed" },
  COMPLETADA: { label: "Completada", color: "#0284c7" },
  RECHAZADA: { label: "Rechazada", color: "#dc2626" },
  VENCIDA: { label: "Vencida", color: "#ef4444" },
};

export default function Cotizaciones() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { puedeEditar, esVendedor, esMaster } = useAuth();
  const [filtroEstado, setFiltroEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [detalle, setDetalle] = useState<any>(null);
  const [modalDespacho, setModalDespacho] = useState(false);
  const [formDespacho, setFormDespacho] = useState({ chofer: "", vehiculo: "" });

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ["cotizaciones", filtroEstado],
    queryFn: () => cotizacionesApi.listar(filtroEstado ? { estado: filtroEstado } : undefined),
  });

  // Carga el detalle completo con líneas cuando se abre el panel
  const { data: cotizacionDetallada } = useQuery({
    queryKey: ["cotizacion-detalle", detalle?.id],
    queryFn: () => cotizacionesApi.obtener(detalle!.id),
    enabled: !!detalle?.id,
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      cotizacionesApi.cambiarEstado(id, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      setDetalle(null);
    },
  });

  const eliminarCot = useMutation({
    mutationFn: (id: number) => cotizacionesApi.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cotizaciones"] }); setDetalle(null); },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al eliminar"),
  });

  const generarFactura = useMutation({
    mutationFn: (id: number) => cotizacionesApi.generarFactura(id),
    onSuccess: (factura) => {
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      setDetalle(null);
      alert(`Factura ${factura.numero} generada exitosamente`);
    },
  });

  const crearDespacho = useMutation({
    mutationFn: () => despachosApi.crearDesdeCotizacion(detalle.id, formDespacho),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      setDetalle(null);
      setModalDespacho(false);
      navigate("/despachos");
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al crear despacho"),
  });

  const hayFiltros = busqueda || desde || hasta;

  const cotizacionesFiltradas = useMemo(() => {
    let lista = cotizaciones as any[];
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter((c) =>
        c.numero?.toLowerCase().includes(q) ||
        c.cliente?.nombre?.toLowerCase().includes(q) ||
        c.vendedor?.nombre?.toLowerCase().includes(q)
      );
    }
    if (desde) {
      const d = new Date(desde);
      lista = lista.filter((c) => new Date(c.creadoEn) >= d);
    }
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59);
      lista = lista.filter((c) => new Date(c.creadoEn) <= h);
    }
    return lista;
  }, [cotizaciones, busqueda, desde, hasta]);

  const limpiarFiltros = () => { setBusqueda(""); setDesde(""); setHasta(""); };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Cotizaciones</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {hayFiltros ? `${cotizacionesFiltradas.length} de ${(cotizaciones as any[]).length}` : `${(cotizaciones as any[]).length}`} cotizaciones
          </p>
        </div>
        <a href="/cotizaciones/nueva" style={{ ...btnPrimary, textDecoration: "none" }}><Plus size={16} /> Nueva Cotización</a>
      </div>

      {/* Barra de búsqueda y fechas */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número, cliente o vendedor..."
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

      {/* Filtros de estado */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setFiltroEstado("")} style={{ ...chipBtn, background: !filtroEstado ? "#dbeafe" : "#f1f5f9", color: !filtroEstado ? "#1d4ed8" : "#64748b" }}>Todas</button>
        {Object.entries(ESTADOS).map(([key, { label }]) => (
          <button key={key} onClick={() => setFiltroEstado(key)} style={{ ...chipBtn, background: filtroEstado === key ? "#dbeafe" : "#f1f5f9", color: filtroEstado === key ? "#1d4ed8" : "#64748b" }}>{label}</button>
        ))}
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Número", "Cliente", "Vendedor", "Total", "Estado", "Fecha", "Empresa", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cotizacionesFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} style={{ padding: "40px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                  No hay cotizaciones que coincidan con los filtros aplicados
                </td>
              </tr>
            )}
            {cotizacionesFiltradas.map((c: any) => {
              const est = ESTADOS[c.estado];
              return (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => setDetalle(c)}>
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: "#2563eb" }}>{c.numero}</span></td>
                  <td style={tdStyle}>{c.cliente?.nombre}</td>
                  <td style={tdStyle}>{c.vendedor?.nombre ?? "—"}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: "#1e293b" }}>${Number(c.totalNeto).toFixed(2)}</span></td>
                  <td style={tdStyle}>
                    <span style={{ ...tagStyle, color: est?.color, background: est?.color + "18" }}>{est?.label}</span>
                  </td>
                  <td style={tdStyle}>{c.creadoEn ? new Date(c.creadoEn).toLocaleDateString("es-VE") : "—"}</td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: "#94a3b8" }}>{c.empresa?.nombre ?? c.cliente?.empresaFactura}</span></td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ArrowRight size={14} style={{ color: "#94a3b8" }} />
                      {esMaster && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!window.confirm(`¿Eliminar ${c.numero}? Esta acción no se puede deshacer.`)) return;
                            eliminarCot.mutate(c.id);
                          }}
                          style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "4px 7px", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center" }}
                          title="Eliminar cotización"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal crear despacho */}
      {modalDespacho && detalle && (
        <div style={{ ...modalOverlay, zIndex: 100 }} onClick={() => setModalDespacho(false)}>
          <div style={{ ...modalBox, width: "min(440px, 95vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>Crear Despacho</h2>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>
              Cotización <strong>{detalle.numero}</strong> · {detalle.cliente?.nombre}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={labelStyle}>Chofer</label>
                <input
                  style={inputStyle}
                  placeholder="Nombre del chofer"
                  value={formDespacho.chofer}
                  onChange={(e) => setFormDespacho({ ...formDespacho, chofer: e.target.value })}
                />
              </div>
              <div>
                <label style={labelStyle}>Vehículo</label>
                <input
                  style={inputStyle}
                  placeholder="Placa o descripción"
                  value={formDespacho.vehiculo}
                  onChange={(e) => setFormDespacho({ ...formDespacho, vehiculo: e.target.value })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button onClick={() => setModalDespacho(false)} style={btnSecondary}>Cancelar</button>
              <button
                onClick={() => crearDespacho.mutate()}
                disabled={crearDespacho.isPending}
                style={{ ...btnPrimary, background: "#7c3aed" }}
              >
                <Truck size={14} />
                {crearDespacho.isPending ? "Creando..." : "Crear Despacho"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel lateral de detalle */}
      {detalle && (
        <div style={modalOverlay} onClick={() => setDetalle(null)}>
          <div style={{ ...modalBox, width: "min(700px, 95vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detalle.numero}</h2>
                <div style={{ fontSize: 13, color: "#64748b" }}>{detalle.cliente?.nombre}</div>
              </div>
              <span style={{ ...tagStyle, color: ESTADOS[detalle.estado]?.color, background: ESTADOS[detalle.estado]?.color + "18" }}>
                {ESTADOS[detalle.estado]?.label}
              </span>
            </div>

            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Stat label="Total Bruto" value={`$${Number(detalle.totalBruto).toFixed(2)}`} />
              <Stat label="Descuento" value={`$${Number(detalle.descuentoTotal).toFixed(2)}`} />
              <Stat label="Total Neto" value={`$${Number(detalle.totalNeto).toFixed(2)}`} bold />
            </div>

            {/* Panel de flete y comisión — solo visible internamente, nunca en PDF del cliente */}
            {cotizacionDetallada && (() => {
              const c = cotizacionDetallada.cliente ?? {};
              const lineas: any[] = cotizacionDetallada.lineas ?? [];
              const ftPct = Number(c.fleteTuberiaPct ?? 0);
              const fcPct = Number(c.fleteConexionesPct ?? 0);
              const ctPct = Number(c.comisionTuberiaPct ?? 0);
              const ccPct = Number(c.comisionConexionesPct ?? 0);
              if (ftPct + fcPct + ctPct + ccPct === 0) return null;

              const esConexion = (l: any) =>
                (l.producto?.origen ?? "INTERNO") === "EXTERNO" &&
                !(l.producto?.nombre ?? "").toLowerCase().includes("manguera");

              const totalTub = lineas.filter((l) => !esConexion(l)).reduce((s, l) => s + Number(l.totalLinea), 0);
              const totalCon = lineas.filter((l) => esConexion(l)).reduce((s, l) => s + Number(l.totalLinea), 0);

              const costoFlete =
                (ftPct > 0 ? totalTub * ftPct / (100 + ftPct) : 0) +
                (fcPct > 0 ? totalCon * fcPct / (100 + fcPct) : 0);
              const gananciaVendedor =
                (ctPct > 0 ? totalTub * ctPct / (100 + ctPct) : 0) +
                (ccPct > 0 ? totalCon * ccPct / (100 + ccPct) : 0);
              const labelVendedor = [
                ctPct > 0 && totalTub > 0 ? `${ctPct}% tub` : "",
                ccPct > 0 && totalCon > 0 ? `${ccPct}% con` : "",
              ].filter(Boolean).join(" · ");
              const totalGanancia = costoFlete + gananciaVendedor;

              return (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {costoFlete > 0 && (
                      <div style={{ flex: 1, minWidth: 140, background: "#fff", borderRadius: 7, padding: "8px 12px", border: "1px solid #dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Costo Flete</div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>${costoFlete.toFixed(2)}</span>
                      </div>
                    )}
                    {gananciaVendedor > 0 && (
                      <div style={{ flex: 1, minWidth: 140, background: "#fff", borderRadius: 7, padding: "8px 12px", border: "1px solid #dcfce7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Ganancia Vendedor</div>
                          {labelVendedor && <div style={{ fontSize: 10, color: "#94a3b8" }}>{labelVendedor}</div>}
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>${gananciaVendedor.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            {detalle.notas && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <strong>Notas:</strong> {detalle.notas}
              </div>
            )}

            {/* Líneas de productos */}
            {cotizacionDetallada?.lineas && cotizacionDetallada.lineas.length > 0 && (
              <div style={{ marginBottom: 16, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      <th style={thStyle}>Producto</th>
                      <th style={{ ...thStyle, textAlign: "center" }}>Cant.</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Precio</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cotizacionDetallada.lineas.map((l: any) => (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "7px 10px" }}>
                          <span style={{ fontWeight: 600 }}>{l.producto?.nombre}</span>
                          {l.producto?.medida && <span style={{ color: "#94a3b8", marginLeft: 4 }}>{l.producto.medida}</span>}
                          {l.notaCantidad && <span style={{ color: "#64748b", marginLeft: 4 }}>({l.notaCantidad})</span>}
                        </td>
                        <td style={{ padding: "7px 10px", textAlign: "center" }}>{Number(l.cantidad)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right" }}>${Number(l.precioUnitarioAplicado).toFixed(2)}</td>
                        <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600 }}>${Number(l.totalLinea).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Acciones según estado */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, justifyContent: "space-between", alignItems: "center" }}>
              {(detalle.estado === "BORRADOR" || detalle.estado === "RECHAZADA") && (
                <button onClick={() => { setDetalle(null); navigate(`/cotizaciones/editar/${detalle.id}`); }} style={{ ...btnAction, background: "#f1f5f9", color: "#374151" }}>
                  <Edit2 size={14} /> Editar
                </button>
              )}
              {detalle.estado === "BORRADOR" && (
                <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "ENVIADA" })} style={{ ...btnAction, background: "#dbeafe", color: "#1d4ed8" }}>
                  <Send size={14} /> Enviar para Aprobación
                </button>
              )}
              {detalle.estado === "ENVIADA" && puedeEditar && (
                <>
                  <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "APROBADA" })} style={{ ...btnAction, background: "#dcfce7", color: "#166534" }}>
                    <CheckCircle size={14} /> Aprobar
                  </button>
                  <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "RECHAZADA" })} style={{ ...btnAction, background: "#fee2e2", color: "#991b1b" }}>
                    <XCircle size={14} /> Rechazar
                  </button>
                </>
              )}
              {detalle.estado === "APROBADA" && puedeEditar && (
                <>
                  <button
                    onClick={() => cotizacionDetallada && pdfHojaProduccion(cotizacionDetallada)}
                    disabled={!cotizacionDetallada}
                    style={{ ...btnAction, background: "#fef3c7", color: "#92400e" }}
                  >
                    <Factory size={14} /> Hoja de Producción
                  </button>
                  <button
                    onClick={() => { setFormDespacho({ chofer: "", vehiculo: "" }); setModalDespacho(true); }}
                    style={{ ...btnAction, background: "#ede9fe", color: "#6d28d9" }}
                  >
                    <Truck size={14} /> Crear Despacho
                  </button>
                  <button
                    onClick={() => generarFactura.mutate(detalle.id)}
                    disabled={generarFactura.isPending}
                    style={{ ...btnPrimary }}
                  >
                    <FileText size={14} />
                    {generarFactura.isPending ? "Generando..." : "Factura Directa"}
                  </button>
                </>
              )}
            </div>
            {/* Eliminar — solo MASTER */}
            {esMaster && !["EN_DESPACHO", "COMPLETADA"].includes(detalle.estado) && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={() => {
                    if (!window.confirm(`¿Eliminar ${detalle.numero} permanentemente?`)) return;
                    eliminarCot.mutate(detalle.id);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#fee2e2", color: "#991b1b", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  <Trash2 size={14} /> Eliminar Cotización
                </button>
              </div>
            )}

            {/* Botones PDF */}
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                onClick={() => cotizacionDetallada && pdfCotizacion(cotizacionDetallada)}
                disabled={!cotizacionDetallada}
                style={{ ...btnAction, background: "#f1f5f9", color: "#475569", opacity: cotizacionDetallada ? 1 : 0.5 }}
              >
                <Download size={14} /> PDF Cliente
              </button>
              <button
                onClick={() => cotizacionDetallada && pdfCotizacionGanancia(cotizacionDetallada)}
                disabled={!cotizacionDetallada}
                style={{ ...btnAction, background: "#dcfce7", color: "#166534", opacity: cotizacionDetallada ? 1 : 0.5 }}
              >
                <TrendingUp size={14} /> PDF con Ganancia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: bold ? 700 : 500, color: "#1e293b" }}>{value}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnAction: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const chipBtn: React.CSSProperties = { border: "none", padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 500 };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: 13, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "90vh", overflow: "auto" };
