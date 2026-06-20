import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cotizacionesApi, clientesApi, reportesApi } from "../api/endpoints";
import { TrendingUp, Package, User, Receipt, ChevronDown, ChevronRight, Search, Download, BarChart2 } from "lucide-react";
import { pdfEstadoCuenta } from "../utils/pdf";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";

function descargarCSV(nombre: string, cabeceras: string[], filas: (string | number)[][]) {
  const contenido = [cabeceras, ...filas]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + contenido], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${nombre}.csv`; a.click();
  URL.revokeObjectURL(url);
}

type Tab = "ventas" | "cuenta" | "cobrar" | "comisiones" | "grafico";

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
          { id: "grafico",    label: "Análisis Visual",     icon: BarChart2 },
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
      {tab === "grafico"    && <TabGrafico />}
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
    queryKey: ["reporte-ventas-fac", q, desde, hasta, buscar],
    queryFn: () => reportesApi.ventasProductoFacturas({ q: q || undefined, desde: desde || undefined, hasta: hasta || undefined }),
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
          <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-end" }}>
            <SummaryCard label="Líneas encontradas" value={String((lineas as any[]).length)} />
            <SummaryCard label="Total unidades"     value={String(totalUnidades)} />
            <SummaryCard label="Monto total"        value={`$${totalMonto.toFixed(2)}`} accent />
            <button onClick={() => descargarCSV("ventas-producto", ["Producto","Medida","Categoría","Cliente","N° Fact.","Fecha","Estado","Cant.","Total"],
              (lineas as any[]).map((l: any) => [l.producto?.nombre, l.producto?.medida ?? "", l.producto?.categoria?.nombre ?? "", l.cotizacion?.cliente?.nombre, l.cotizacion?.numero, new Date(l.cotizacion?.creadoEn).toLocaleDateString("es-VE"), l.cotizacion?.estado, Number(l.cantidad), Number(l.totalLinea).toFixed(2)])
            )} style={btnCsv}><Download size={13} /> CSV</button>
          </div>
          <div style={tableCard}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Producto", "Medida", "Categoría", "Cliente", "N° Fact.", "Fecha", "Estado", "Cant.", "Total"].map((h) => (
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

          <div style={{ display: "flex", gap: 14, marginBottom: 20, alignItems: "flex-end" }}>
            <SummaryCard label="Total cotizado"  value={`$${totalCotizado.toFixed(2)}`} />
            <SummaryCard label="Total facturado" value={`$${totalFacturado.toFixed(2)}`} />
            <SummaryCard label="Saldo pendiente" value={`$${totalPendiente.toFixed(2)}`} accent={totalPendiente > 0} warn={totalPendiente > 0} />
            <button
              onClick={() => pdfEstadoCuenta(data)}
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}
            >
              <Download size={13} /> PDF
            </button>
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
          <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-end" }}>
            <SummaryCard label="Clientes con deuda" value={String(new Set((facturas as any[]).map((f: any) => f.clienteId)).size)} />
            <SummaryCard label="Facturas pendientes" value={String((facturas as any[]).length)} />
            <SummaryCard label="Total por cobrar" value={`$${totalPendiente.toFixed(2)}`} accent warn />
            <button onClick={() => descargarCSV("cuentas-cobrar", ["Cliente","RIF","Factura","Fecha","Total","Pagado","Saldo"],
              (facturas as any[]).map((f: any) => [f.cliente?.nombre, f.cliente?.rif ?? "", f.numero, new Date(f.creadoEn).toLocaleDateString("es-VE"), Number(f.totalNeto).toFixed(2), (Number(f.totalNeto)-Number(f.saldoPendiente)).toFixed(2), Number(f.saldoPendiente).toFixed(2)])
            )} style={btnCsv}><Download size={13} /> CSV</button>
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
          <div style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "flex-end" }}>
            <SummaryCard label="Vendedores"     value={String((data as any[]).length)} />
            <SummaryCard label="Total ventas"   value={`$${totalVentas.toFixed(2)}`} />
            <SummaryCard label="Total comisión" value={`$${totalComision.toFixed(2)}`} accent />
            <button onClick={() => descargarCSV(`comisiones-${mes}`, ["Vendedor","N° Cot.","Cliente","Fecha","Estado","Total Venta","Comisión"],
              (data as any[]).flatMap((v: any) => v.detalle.map((d: any) => [v.vendedor.nombre, d.numero, d.cliente, new Date(d.fecha).toLocaleDateString("es-VE"), d.estado, d.totalNeto.toFixed(2), d.comision.toFixed(2)]))
            )} style={btnCsv}><Download size={13} /> CSV</button>
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

// ─── TAB GRÁFICOS ─────────────────────────────────────────────────────────

const COLORS = ["#2563eb","#16a34a","#d97706","#dc2626","#7c3aed","#0891b2","#ea580c","#84cc16"];

function TabGrafico() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscar, setBuscar] = useState(false);

  const { data: lineas = [], isLoading } = useQuery({
    queryKey: ["grafico-ventas-fac", desde, hasta, buscar],
    queryFn: () => reportesApi.ventasProductoFacturas({ desde: desde || undefined, hasta: hasta || undefined }),
    enabled: buscar,
  });

  const typedLineas = lineas as any[];

  // Chart A — Ingresos por categoría
  const catMap: Record<string, number> = {};
  typedLineas.forEach((l) => {
    const cat = l.producto?.categoria?.nombre ?? "Sin categoría";
    catMap[cat] = (catMap[cat] ?? 0) + Number(l.totalLinea);
  });
  const pieData = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  // Charts B & C — Top 10 productos (agrupados por producto real). La etiqueta usa
  // el código para distinguir variantes/medidas que comparten nombre (ej. PEAD 4"
  // vs PEAD Reforzada 4"); el nombre completo va en el tooltip.
  const prodMap: Record<string, { codigo: string | null; nombre: string; medida: string; monto: number; cant: number }> = {};
  typedLineas.forEach((l) => {
    const p = l.producto;
    if (!p) return;
    const key = String(p.id ?? `${p.nombre} ${p.medida}`);
    const e = prodMap[key] ?? { codigo: p.codigo ?? null, nombre: p.nombre ?? "", medida: p.medida ?? "", monto: 0, cant: 0 };
    e.monto += Number(l.totalLinea);
    e.cant += Number(l.cantidad);
    prodMap[key] = e;
  });
  const etiquetaProd = (e: { codigo: string | null; nombre: string; medida: string }) => {
    if (e.codigo && e.codigo.trim()) return e.codigo.trim();
    const full = `${e.nombre} ${e.medida}`.trim();
    return full.length > 22 ? full.slice(0, 22) + "…" : full;
  };
  const prodArr = Object.values(prodMap).map((e) => ({
    name: `${e.nombre} ${e.medida}`.trim() + (e.codigo ? `  (${e.codigo})` : ""),
    label: etiquetaProd(e),
    monto: e.monto,
    cant: e.cant,
  }));
  const top10Monto = [...prodArr].sort((a, b) => b.monto - a.monto).slice(0, 10).map((e) => ({ name: e.name, label: e.label, value: e.monto }));
  const top10Cant = [...prodArr].sort((a, b) => b.cant - a.cant).slice(0, 10).map((e) => ({ name: e.name, label: e.label, value: e.cant }));

  // Chart D — Top clientes por ingresos
  const clienteMontoMap: Record<string, number> = {};
  typedLineas.forEach((l) => {
    const key = l.cotizacion?.cliente?.nombre ?? "Sin cliente";
    clienteMontoMap[key] = (clienteMontoMap[key] ?? 0) + Number(l.totalLinea);
  });
  const top10ClientesMonto = Object.entries(clienteMontoMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((d) => ({ ...d, shortName: d.name.length > 24 ? d.name.slice(0, 24) + "…" : d.name }));

  // Chart E — Top clientes por número de cotizaciones únicas
  const clienteCotMap: Record<string, Set<number>> = {};
  typedLineas.forEach((l) => {
    const key = l.cotizacion?.cliente?.nombre ?? "Sin cliente";
    if (!clienteCotMap[key]) clienteCotMap[key] = new Set();
    if (l.cotizacion?.id) clienteCotMap[key].add(Number(l.cotizacion.id));
  });
  const top10ClientesPedidos = Object.entries(clienteCotMap)
    .map(([name, cots]) => ({ name, value: cots.size }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((d) => ({ ...d, shortName: d.name.length > 24 ? d.name.slice(0, 24) + "…" : d.name }));

  const totalMonto = typedLineas.reduce((s, l) => s + Number(l.totalLinea), 0);

  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const pct = pieTotal > 0 ? ((pieData[index]?.value ?? 0) / pieTotal * 100).toFixed(1) : "0";
    const name = pieData[index]?.name ?? "";
    if (Number(pct) < 4) return null;
    return (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
        {name.length > 10 ? name.slice(0, 10) + "…" : name} {pct}%
      </text>
    );
  };

  return (
    <div>
      <div style={filterBox}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "flex-end" }}>
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

      {!buscar && <Vacio texto="Selecciona un rango de fechas y haz clic en Buscar" />}
      {buscar && isLoading && <Cargando />}

      {buscar && !isLoading && typedLineas.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 14, marginBottom: 20 }}>
            <SummaryCard label="Líneas encontradas" value={String(typedLineas.length)} />
            <SummaryCard label="Monto total" value={`$${totalMonto.toFixed(2)}`} accent />
          </div>

          {/* Chart A — Pie */}
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Ingresos por Categoría de Producto</div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={130}
                  dataKey="value"
                  labelLine={false}
                  label={renderPieLabel}
                >
                  {pieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Total"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Charts B & C — side by side */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Chart B */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Top 10 Productos por Ingresos</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10Monto} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                  <ReTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Ingresos"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ""} />
                  <Bar dataKey="value" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart C */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Top 10 Productos por Unidades Vendidas</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10Cant} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                  <ReTooltip formatter={(value: number) => [value, "Unidades"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ""} />
                  <Bar dataKey="value" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts D & E — Top Clientes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
            {/* Chart D */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Top 10 Clientes por Ingresos</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10ClientesMonto} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="shortName" width={130} tick={{ fontSize: 11 }} />
                  <ReTooltip formatter={(value: number) => [`$${value.toFixed(2)}`, "Ingresos"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ""} />
                  <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Chart E */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 16 }}>Top 10 Clientes por Pedidos</div>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10ClientesPedidos} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="shortName" width={130} tick={{ fontSize: 11 }} />
                  <ReTooltip formatter={(value: number) => [value, "Facturas"]} labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ""} />
                  <Bar dataKey="value" fill="#d97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
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
const btnCsv: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, padding: "8px 14px", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" };
