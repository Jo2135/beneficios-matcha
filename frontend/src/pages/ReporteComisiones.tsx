import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cotizacionesApi, clientesApi, reportesApi } from "../api/endpoints";
import { TrendingUp, Package, User, Receipt, ChevronDown, ChevronRight, Search } from "lucide-react";

type Tab = "ventas" | "cuenta" | "cobrar" | "comisiones";

const ESTADOS: Record<string, { label: string; color: string }> = {
  BORRADOR:    { label: "Borrador",    color: "#6b7280" },
  ENVIADA:     { label: "Enviada",     color: "#2563eb" },
  APROBADA:    { label: "Aprobada",    color: "#16a34a" },
  EN_DESPACHO: { label: "En despacho", color: "#7c3aed" },
  COMPLETADA:  { label: "Completada",  color: "#0284c7" },
  RECHAZADA:   { label: "Rechazada",   color: "#dc2626" },
};

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Reportes() {
  const [tab, setTab] = useState<Tab>("ventas");

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Reportes</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Consultas flexibles sobre ventas, clientes y cobros</p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
        {([
          { id: "ventas",     label: "Ventas por Producto", icon: Package },
          { id: "cuenta",     label: "Estado de Cuenta",    icon: User },
          { id: "cobrar",     label: "Cuentas por Cobrar",  icon: Receipt },
          { id: "comisiones", label: "Comisiones Vendedor", icon: TrendingUp },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontSize: 13, fontWeight: 600,
              background: tab === id ? "#2563eb" : "#f1f5f9",
              color: tab === id ? "#fff" : "#475569",
            }}
          >
            <Icon size={15} />{label}
          </button>
        ))}
      </div>

      {tab === "ventas"     && <TabVentas />}
      {tab === "cuenta"     && <TabEstadoCuenta />}
      {tab === "cobrar"     && <TabCuentasCobrar />}
      {tab === "comisiones" && <TabComisiones />}
    </div>
  );
}

// ─── TAB VENTAS POR PRODUCTO ───────────────────────────────────────────────

function TabVentas() {
  const [q, setQ]         = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState(false);

  const { data: lineas = [], isLoading } = useQuery({
    queryKey: ["reporte-ventas", q, desde, hasta, buscar],
    queryFn: () => reportesApi.ventasProducto({ q: q || undefined, desde: desde || undefined, hasta: hasta || undefined }),
    enabled: buscar,
  });

  const totalUnidades = (lineas as any[]).reduce((s: number, l: any) => s + Number(l.cantidad), 0);
  const totalMonto    = (lineas as any[]).reduce((s: number, l: any) => s + Number(l.totalLinea), 0);

  return (
    <div>
      <div style={filterBox}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Producto (nombre o medida)</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input style={{ ...inp, paddingLeft: 32 }} placeholder='Ej: amarillo, 2", codo...' value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Desde</label>
            <input type="date" style={inp} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Hasta</label>
            <input type="date" style={inp} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button onClick={() => setBuscar(true)} style={btnBuscar}>Buscar</button>
        </div>
      </div>

      {isLoading && <Cargando />}

      {buscar && !isLoading && (lineas as any[]).length === 0 && (
        <Vacio texto="No se encontraron ventas con esos criterios" />
      )}

      {(lineas as any[]).length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
            <SummaryCard label="Líneas encontradas" value={String((lineas as any[]).length)} />
            <SummaryCard label="Total unidades"     value={String(totalUnidades)} />
            <SummaryCard label="Monto total"        value={`$${totalMonto.toFixed(2)}`} accent />
          </div>
          <div style={tableCard}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Producto", "Medida", "Categoría", "Cliente", "N° Cot.", "Fecha", "Estado", "Cant.", "Total"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lineas as any[]).map((l: any, i: number) => {
                  const est = ESTADOS[l.cotizacion?.estado] ?? { label: l.cotizacion?.estado, color: "#6b7280" };
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={td}><span style={{ fontWeight: 600 }}>{l.producto?.nombre}</span></td>
                      <td style={td}>{l.producto?.medida ?? "—"}</td>
                      <td style={td}><span style={{ fontSize: 11, color: "#94a3b8" }}>{l.producto?.categoria?.nombre}</span></td>
                      <td style={td}>{l.cotizacion?.cliente?.nombre}</td>
                      <td style={td}><span style={{ fontWeight: 700, color: "#2563eb" }}>{l.cotizacion?.numero}</span></td>
                      <td style={td}>{new Date(l.cotizacion?.creadoEn).toLocaleDateString("es-VE")}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: est.color, background: est.color + "18", padding: "2px 8px", borderRadius: 10 }}>{est.label}</span></td>
                      <td style={{ ...td, textAlign: "center", fontWeight: 600 }}>{Number(l.cantidad)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>${Number(l.totalLinea).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB ESTADO DE CUENTA ─────────────────────────────────────────────────

function TabEstadoCuenta() {
  const [clienteId, setClienteId] = useState<number | "">("");
  const [desde, setDesde]         = useState("");
  const [hasta, setHasta]         = useState("");
  const [buscar, setBuscar]       = useState(false);

  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: clientesApi.listar });

  const { data, isLoading } = useQuery({
    queryKey: ["reporte-cuenta", clienteId, desde, hasta, buscar],
    queryFn: () => reportesApi.estadoCuenta(clienteId as number, { desde: desde || undefined, hasta: hasta || undefined }),
    enabled: buscar && !!clienteId,
  });

  const totalCotizado = (data?.cotizaciones ?? []).reduce((s: number, c: any) => s + Number(c.totalNeto), 0);
  const totalFacturado = (data?.facturas ?? []).reduce((s: number, f: any) => s + Number(f.totalNeto), 0);
  const totalPendiente = (data?.facturas ?? []).reduce((s: number, f: any) => s + Number(f.saldoPendiente), 0);

  return (
    <div>
      <div style={filterBox}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Cliente *</label>
            <select style={inp} value={clienteId} onChange={(e) => { setClienteId(Number(e.target.value) || ""); setBuscar(false); }}>
              <option value="">— Seleccionar cliente —</option>
              {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Desde</label>
            <input type="date" style={inp} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Hasta</label>
            <input type="date" style={inp} value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <button onClick={() => setBuscar(true)} disabled={!clienteId} style={{ ...btnBuscar, opacity: clienteId ? 1 : 0.5 }}>Buscar</button>
        </div>
      </div>

      {isLoading && <Cargando />}

      {data && !isLoading && (
        <>
          <div style={{ marginBottom: 16, padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#475569" }}>
            <strong>{data.cliente?.nombre}</strong> · RIF: {data.cliente?.rif ?? "—"} · Crédito: {data.cliente?.diasCredito ?? 0} días
          </div>

          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Total cotizado"  value={`$${totalCotizado.toFixed(2)}`} />
            <SummaryCard label="Total facturado" value={`$${totalFacturado.toFixed(2)}`} />
            <SummaryCard label="Saldo pendiente" value={`$${totalPendiente.toFixed(2)}`} accent={totalPendiente > 0} warn={totalPendiente > 0} />
          </div>

          {/* Cotizaciones */}
          {data.cotizaciones.length > 0 && (
            <Section titulo={`Cotizaciones (${data.cotizaciones.length})`}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8fafc" }}>{["N°", "Fecha", "Estado", "Vendedor", "Total"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.cotizaciones.map((c: any) => {
                    const est = ESTADOS[c.estado] ?? { label: c.estado, color: "#6b7280" };
                    return (
                      <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={td}><span style={{ fontWeight: 700, color: "#2563eb" }}>{c.numero}</span></td>
                        <td style={td}>{new Date(c.creadoEn).toLocaleDateString("es-VE")}</td>
                        <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: est.color, background: est.color + "18", padding: "2px 8px", borderRadius: 10 }}>{est.label}</span></td>
                        <td style={td}>{c.vendedor?.nombre ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>${Number(c.totalNeto).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {/* Facturas */}
          {data.facturas.length > 0 && (
            <Section titulo={`Facturas (${data.facturas.length})`} style={{ marginTop: 14 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "#f8fafc" }}>{["N°", "Fecha", "Total", "Pagado", "Saldo"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.facturas.map((f: any) => {
                    const pagado = Number(f.totalNeto) - Number(f.saldoPendiente);
                    return (
                      <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={td}><span style={{ fontWeight: 700, color: "#2563eb" }}>{f.numero}</span></td>
                        <td style={td}>{new Date(f.creadoEn).toLocaleDateString("es-VE")}</td>
                        <td style={{ ...td, textAlign: "right" }}>${Number(f.totalNeto).toFixed(2)}</td>
                        <td style={{ ...td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>${pagado.toFixed(2)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 700, color: Number(f.saldoPendiente) > 0 ? "#dc2626" : "#16a34a" }}>
                          ${Number(f.saldoPendiente).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          )}

          {data.cotizaciones.length === 0 && data.facturas.length === 0 && (
            <Vacio texto="Sin registros para este cliente en el período seleccionado" />
          )}
        </>
      )}
    </div>
  );
}

// ─── TAB CUENTAS POR COBRAR ───────────────────────────────────────────────

function TabCuentasCobrar() {
  const [producto, setProducto] = useState("");
  const [buscar, setBuscar]     = useState(true);
  const [query, setQuery]       = useState("");

  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ["cuentas-cobrar", query, buscar],
    queryFn: () => reportesApi.cuentasCobrar(query ? { producto: query } : undefined),
    enabled: buscar,
  });

  const totalPendiente = (facturas as any[]).reduce((s: number, f: any) => s + Number(f.saldoPendiente), 0);

  return (
    <div>
      <div style={filterBox}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: 12, alignItems: "flex-end" }}>
          <div>
            <label style={lbl}>Filtrar por producto (opcional)</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
              <input style={{ ...inp, paddingLeft: 32 }} placeholder='Ej: codo 2", tubería, conexión...' value={producto} onChange={(e) => setProducto(e.target.value)} />
            </div>
          </div>
          <button onClick={() => { setQuery(producto); setBuscar(true); }} style={btnBuscar}>Buscar</button>
        </div>
      </div>

      {isLoading && <Cargando />}

      {!isLoading && (facturas as any[]).length === 0 && (
        <Vacio texto={query ? `No hay facturas pendientes con "${query}"` : "No hay facturas con saldo pendiente"} />
      )}

      {(facturas as any[]).length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
            <SummaryCard label="Clientes con deuda" value={String(new Set((facturas as any[]).map((f: any) => f.clienteId)).size)} />
            <SummaryCard label="Facturas pendientes" value={String((facturas as any[]).length)} />
            <SummaryCard label="Total por cobrar" value={`$${totalPendiente.toFixed(2)}`} accent warn />
          </div>
          <div style={tableCard}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Cliente", "RIF", "Factura", "Fecha", "Total Factura", "Pagado", "Saldo Pendiente"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(facturas as any[]).map((f: any) => {
                  const pagado = Number(f.totalNeto) - Number(f.saldoPendiente);
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={td}><span style={{ fontWeight: 600 }}>{f.cliente?.nombre}</span></td>
                      <td style={td}><span style={{ fontSize: 12, color: "#94a3b8" }}>{f.cliente?.rif ?? "—"}</span></td>
                      <td style={td}><span style={{ fontWeight: 700, color: "#2563eb" }}>{f.numero}</span></td>
                      <td style={td}>{new Date(f.creadoEn).toLocaleDateString("es-VE")}</td>
                      <td style={{ ...td, textAlign: "right" }}>${Number(f.totalNeto).toFixed(2)}</td>
                      <td style={{ ...td, textAlign: "right", color: "#16a34a" }}>${pagado.toFixed(2)}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#dc2626" }}>${Number(f.saldoPendiente).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── TAB COMISIONES VENDEDOR ──────────────────────────────────────────────

function TabComisiones() {
  const [mes, setMes]           = useState(mesActual());
  const [expandidos, setExp]    = useState<Set<number>>(new Set());

  const { data = [], isLoading } = useQuery({
    queryKey: ["reporte-comisiones", mes],
    queryFn: () => cotizacionesApi.reporteComisiones(mes),
  });

  const toggle = (id: number) =>
    setExp((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const totalComision = (data as any[]).reduce((s: number, v: any) => s + v.comision, 0);
  const totalVentas   = (data as any[]).reduce((s: number, v: any) => s + v.totalVentas, 0);

  return (
    <div>
      <div style={{ ...filterBox, display: "flex", justifyContent: "flex-end" }}>
        <div>
          <label style={lbl}>Mes</label>
          <input type="month" style={inp} value={mes} onChange={(e) => setMes(e.target.value)} />
        </div>
      </div>

      {isLoading && <Cargando />}

      {!isLoading && (data as any[]).length === 0 && (
        <Vacio texto="Sin cotizaciones aprobadas o completadas en este mes. Asegúrate de que las cotizaciones tengan un vendedor asignado." />
      )}

      {(data as any[]).length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
            <SummaryCard label="Vendedores"     value={String((data as any[]).length)} />
            <SummaryCard label="Total ventas"   value={`$${totalVentas.toFixed(2)}`} />
            <SummaryCard label="Total comisión" value={`$${totalComision.toFixed(2)}`} accent />
          </div>
          {(data as any[]).map((v: any) => (
            <div key={v.vendedor.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", gap: 12 }} onClick={() => toggle(v.vendedor.id)}>
                <span style={{ color: "#94a3b8" }}>{expandidos.has(v.vendedor.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{v.vendedor.nombre}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{v.totalCotizaciones} cotizaciones</div>
                </div>
                <div style={{ textAlign: "right", marginRight: 32 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>Total Ventas</div>
                  <div style={{ fontWeight: 600 }}>${v.totalVentas.toFixed(2)}</div>
                </div>
                <div style={{ textAlign: "right", background: "#f0fdf4", padding: "8px 16px", borderRadius: 8, minWidth: 110 }}>
                  <div style={{ fontSize: 11, color: "#166534" }}>Comisión</div>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#166534" }}>${v.comision.toFixed(2)}</div>
                </div>
              </div>
              {expandidos.has(v.vendedor.id) && (
                <div style={{ borderTop: "1px solid #f1f5f9" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "#f8fafc" }}>{["N° Cot.", "Cliente", "Fecha", "Estado", "Total Venta", "Comisión"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {v.detalle.map((d: any) => {
                        const est = ESTADOS[d.estado] ?? { label: d.estado, color: "#6b7280" };
                        return (
                          <tr key={d.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={td}><span style={{ fontWeight: 700, color: "#2563eb" }}>{d.numero}</span></td>
                            <td style={td}>{d.cliente}</td>
                            <td style={td}>{new Date(d.fecha).toLocaleDateString("es-VE")}</td>
                            <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: est.color, background: est.color + "18", padding: "2px 8px", borderRadius: 10 }}>{est.label}</span></td>
                            <td style={{ ...td, textAlign: "right" }}>${d.totalNeto.toFixed(2)}</td>
                            <td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#166534" }}>${d.comision.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}>
                        <td colSpan={4} style={{ ...td, fontWeight: 600, color: "#166534" }}>Subtotal {v.vendedor.nombre}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>${v.totalVentas.toFixed(2)}</td>
                        <td style={{ ...td, textAlign: "right", fontWeight: 800, color: "#166534" }}>${v.comision.toFixed(2)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── COMPONENTS COMPARTIDOS ───────────────────────────────────────────────

function SummaryCard({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  const bg = warn ? "#fef2f2" : accent ? "#f0fdf4" : "#fff";
  const border = warn ? "#fecaca" : accent ? "#bbf7d0" : "#e2e8f0";
  const color = warn ? "#dc2626" : accent ? "#166534" : "#1e293b";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 20px", flex: 1 }}>
      <div style={{ fontSize: 12, color: warn ? "#dc2626" : "#64748b", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function Section({ titulo, children, style }: { titulo: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", ...style }}>
      <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 600, color: "#374151" }}>{titulo}</div>
      {children}
    </div>
  );
}

function Cargando() {
  return <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Cargando...</div>;
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", color: "#94a3b8" }}>
      <div style={{ fontSize: 14, color: "#475569", fontWeight: 500 }}>{texto}</div>
    </div>
  );
}

const filterBox: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 20 };
const tableCard: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" };
const btnBuscar: React.CSSProperties = { background: "#2563eb", color: "#fff", border: "none", padding: "9px 20px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "10px 12px", fontSize: 13, color: "#374151" };
