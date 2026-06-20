import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { facturasApi, pagosApi, cotizacionesApi, despachosApi, reportesApi } from "../api/endpoints";
import { DollarSign, AlertTriangle, Banknote, Clock, TrendingUp, FileText, Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
} from "recharts";

export default function Dashboard() {
  const navigate = useNavigate();
  const { esMaster, usuario } = useAuth();
  const puedeVerFinanzas = esMaster || usuario?.rol === "ADMIN";

  // Rango de fechas del período (vacío = todas las transacciones)
  const anioActual = new Date().getFullYear();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [anioSel, setAnioSel] = useState(anioActual);
  const Q_INI: Record<number, string> = { 1: "01-01", 2: "04-01", 3: "07-01", 4: "10-01" };
  const Q_FIN: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
  const setTrimestre = (y: number, q: number) => { setDesde(`${y}-${Q_INI[q]}`); setHasta(`${y}-${Q_FIN[q]}`); };
  const trimestreActivo = (y: number, q: number) => desde === `${y}-${Q_INI[q]}` && hasta === `${y}-${Q_FIN[q]}`;

  const { data: balance } = useQuery({
    queryKey: ["balance"],
    queryFn: facturasApi.balance,
    enabled: puedeVerFinanzas,
  });
  const { data: pagos = [] } = useQuery({
    queryKey: ["pagos-pendientes"],
    queryFn: pagosApi.pendientes,
    enabled: puedeVerFinanzas,
  });
  const { data: cotizaciones = [] } = useQuery({
    queryKey: ["cotizaciones"],
    queryFn: () => cotizacionesApi.listar(),
  });
  const { data: despachos = [] } = useQuery({
    queryKey: ["despachos"],
    queryFn: despachosApi.listar,
    enabled: puedeVerFinanzas,
  });
  // Dinero recibido por fecha de pago (respeta el período); se calcula en el backend
  const { data: recibido } = useQuery({
    queryKey: ["dinero-recibido", desde, hasta],
    queryFn: () => reportesApi.dineroRecibido({ desde: desde || undefined, hasta: hasta || undefined }),
    enabled: puedeVerFinanzas,
  });

  const facturas = balance?.facturas ?? [];

  // Facturas dentro del rango elegido (sin rango = todas) — base de KPIs financieros y gráficas
  const facturasDistrib = facturas.filter((f: any) => {
    const t = new Date(f.fechaEmision ?? f.creadoEn).getTime();
    if (desde && t < new Date(desde).getTime()) return false;
    if (hasta) { const h = new Date(hasta); h.setHours(23, 59, 59, 999); if (t > h.getTime()) return false; }
    return true;
  });
  const hayRango = !!(desde || hasta);
  const aniosDisponibles: number[] = Array.from(
    new Set<number>([anioActual, ...facturas.map((f: any) => new Date(f.fechaEmision ?? f.creadoEn).getFullYear())])
  ).sort((a, b) => b - a);

  // KPIs financieros del período
  // Ventas = facturas EMITIDAS en el rango; Por Cobrar = saldo de esas facturas
  const totalEmitido = facturasDistrib.reduce((s: number, f: any) => s + Number(f.totalNeto), 0);
  const totalPendiente = facturasDistrib.reduce((s: number, f: any) => s + Number(f.saldoPendiente), 0);
  // Dinero Recibido = dinero que ENTRÓ en el rango (por fecha de pago); lo calcula el backend
  const dineroRecibido = recibido?.totalRecibido ?? 0;

  const vencidas = facturas.filter((f: any) => f.estado === "VENCIDA");
  const porCobrar = facturas.filter((f: any) => ["EMITIDA", "PENDIENTE_COBRO", "COBRADA_PARCIAL"].includes(f.estado));

  const criticas = vencidas.filter((f: any) => {
    const dias = Math.floor((Date.now() - new Date(f.creadoEn).getTime()) / 86400000);
    return dias > 30;
  });

  // Chart data — Estado de Facturas (pie)
  const ESTADO_COLORS: Record<string, string> = {
    EMITIDA: "#64748b",
    PENDIENTE_COBRO: "#2563eb",
    COBRADA_PARCIAL: "#d97706",
    COBRADA: "#16a34a",
    VENCIDA: "#dc2626",
  };
  const ESTADOS_CHART = ["EMITIDA", "PENDIENTE_COBRO", "COBRADA_PARCIAL", "COBRADA", "VENCIDA"];

  const pieData = ESTADOS_CHART.map((estado) => {
    const group = facturasDistrib.filter((f: any) => f.estado === estado);
    const value = group.reduce((sum: number, f: any) => {
      return sum + Number(estado === "COBRADA" ? f.totalNeto : f.saldoPendiente);
    }, 0);
    return { name: estado, value };
  }).filter((d) => d.value > 0);

  // Chart data — Top 5 clientes por saldo pendiente (bar) — respeta el rango
  const clienteSaldoMap: Record<string, number> = {};
  facturasDistrib.forEach((f: any) => {
    const nombre = f.cliente?.nombre ?? "Desconocido";
    clienteSaldoMap[nombre] = (clienteSaldoMap[nombre] ?? 0) + Number(f.saldoPendiente);
  });
  const barData = Object.entries(clienteSaldoMap)
    .filter(([, saldo]) => saldo > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, saldo]) => ({ nombre, saldo }));

  const cotsAbiertas = (cotizaciones as any[]).filter((c) => ["PENDIENTE", "ENVIADA", "APROBADA"].includes(c.estado));
  const cotsPorAprobar = (cotizaciones as any[]).filter((c) => c.estado === "ENVIADA");
  const despachosActivos = (despachos as any[]).filter((d) => ["PENDIENTE", "EN_RUTA"].includes(d.estado));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Panel Principal</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Resumen operativo y financiero</p>
      </div>

      {/* Selector de Período — controla los indicadores financieros y las gráficas */}
      {puedeVerFinanzas && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 16px", marginBottom: 18 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginRight: 2 }}>Período</span>
          <select value={anioSel} onChange={(e) => setAnioSel(Number(e.target.value))} style={fechaInput}>
            {aniosDisponibles.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {[1, 2, 3, 4].map((qn) => {
            const activo = trimestreActivo(anioSel, qn);
            return (
              <button key={qn} onClick={() => setTrimestre(anioSel, qn)}
                style={{ ...chipBtn, ...(activo ? chipBtnActivo : {}) }}>
                T{qn}
              </button>
            );
          })}
          <span style={{ width: 1, height: 22, background: "#e2e8f0", margin: "0 4px" }} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={fechaInput} />
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={fechaInput} />
          <button onClick={() => { setDesde(""); setHasta(""); }}
            style={{ ...chipBtn, ...(!hayRango ? chipBtnActivo : {}) }}>
            Todo
          </button>
          <span style={{ fontSize: 12, color: "#64748b", marginLeft: "auto", fontWeight: 500 }}>
            {hayRango ? `${facturasDistrib.length} facturas en el período` : `Todas las transacciones (${facturasDistrib.length})`}
          </span>
        </div>
      )}

      {/* Alerta facturas críticas */}
      {puedeVerFinanzas && criticas.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <AlertTriangle size={20} style={{ color: "#dc2626", flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, color: "#991b1b", fontSize: 14 }}>
              {criticas.length} factura{criticas.length !== 1 ? "s" : ""} con más de 30 días vencida{criticas.length !== 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 12, color: "#dc2626" }}>
              Saldo crítico: ${criticas.reduce((s: number, f: any) => s + Number(f.saldoPendiente), 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      )}

      {/* KPIs financieros — solo MASTER/ADMIN */}
      {puedeVerFinanzas && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.3 }}>
            {hayRango ? "Finanzas del período seleccionado" : "Finanzas — todas las transacciones"}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
            <KPICard icon={DollarSign} label="Ventas (facturas emitidas)" value={`$${totalEmitido.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#2563eb" bg="#dbeafe" />
            <KPICard icon={Banknote} label="Dinero Recibido (entró)" value={`$${dineroRecibido.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#16a34a" bg="#dcfce7" />
            <KPICard icon={Clock} label="Por Cobrar (de esas ventas)" value={`$${totalPendiente.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#d97706" bg="#fef3c7" />
            <KPICard icon={AlertTriangle} label="Pagos sin asignar" value={pagos.length} color="#dc2626" bg="#fee2e2" onClick={() => navigate("/pagos")} />
          </div>
        </>
      )}

      {/* KPIs operativos */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
        <KPICard
          icon={FileText}
          label="Cotizaciones Abiertas"
          value={cotsAbiertas.length}
          color="#7c3aed"
          bg="#f3e8ff"
          onClick={() => navigate("/cotizaciones")}
        />
        <KPICard
          icon={AlertTriangle}
          label="Por Aprobar"
          value={cotsPorAprobar.length}
          color="#ea580c"
          bg="#ffedd5"
          onClick={() => navigate("/cotizaciones")}
        />
        {puedeVerFinanzas && (
          <KPICard
            icon={Truck}
            label="Despachos Activos"
            value={despachosActivos.length}
            color="#0891b2"
            bg="#e0f2fe"
            onClick={() => navigate("/despachos")}
          />
        )}
        {puedeVerFinanzas && (
          <KPICard
            icon={TrendingUp}
            label="Facturas Vencidas"
            value={vencidas.length}
            color="#dc2626"
            bg="#fee2e2"
            onClick={() => navigate("/facturas")}
          />
        )}
      </div>

      {/* Gráficas */}
      {puedeVerFinanzas && facturas.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 28 }}>
          {/* Pie: Distribución de Facturas */}
          <div style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Distribución de Facturas</span>
            </div>
            <div style={{ padding: "12px 8px" }}>
              {pieData.length === 0 ? (
                <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                  Sin facturas en este rango de fechas
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90}>
                      {pieData.map((entry) => (
                        <Cell key={entry.name} fill={ESTADO_COLORS[entry.name] ?? "#94a3b8"} />
                      ))}
                    </Pie>
                    <ReTooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bar: Top 5 Clientes por Saldo Pendiente */}
          <div style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Top 5 Clientes con Saldo Pendiente</span>
            </div>
            <div style={{ padding: "16px 8px" }}>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={barData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="nombre"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 15) + "…" : v}
                  />
                  <YAxis tick={{ fontSize: 11 }} width={60} />
                  <ReTooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                  <Bar dataKey="saldo" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: puedeVerFinanzas ? "1fr 1fr 1fr" : "1fr", gap: 20 }}>
        {/* Cotizaciones por aprobar */}
        <div style={cardStyle}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
            <FileText size={16} style={{ color: "#ea580c" }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Por Aprobar ({cotsPorAprobar.length})</span>
          </div>
          <div style={{ maxHeight: 280, overflow: "auto" }}>
            {cotsPorAprobar.length === 0 ? (
              <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sin cotizaciones pendientes</div>
            ) : cotsPorAprobar.map((c: any) => (
              <div
                key={c.id}
                style={{ padding: "10px 18px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between", cursor: "pointer" }}
                onClick={() => navigate("/cotizaciones")}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: "#ea580c" }}>{c.numero}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{c.cliente?.nombre}</div>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", alignSelf: "center" }}>
                  {c.vendedor?.nombre ?? "—"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Facturas vencidas */}
        {puedeVerFinanzas && (
          <div style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
              <AlertTriangle size={16} style={{ color: "#dc2626" }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Facturas Vencidas ({vencidas.length})</span>
            </div>
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              {vencidas.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sin facturas vencidas</div>
              ) : vencidas.map((f: any) => {
                const diasVencida = Math.floor((Date.now() - new Date(f.creadoEn).getTime()) / 86400000);
                return (
                  <div key={f.id} style={{ padding: "10px 18px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{f.numero}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{f.cliente?.nombre}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: diasVencida > 30 ? "#dc2626" : "#f59e0b" }}>
                        hace {diasVencida} día{diasVencida !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 13 }}>${Number(f.saldoPendiente).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Por cobrar */}
        {puedeVerFinanzas && (
          <div style={cardStyle}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
              <TrendingUp size={16} style={{ color: "#2563eb" }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>Por Cobrar ({porCobrar.length})</span>
            </div>
            <div style={{ maxHeight: 280, overflow: "auto" }}>
              {porCobrar.map((f: any) => (
                <div key={f.id} style={{ padding: "10px 18px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{f.numero}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{f.cliente?.nombre} · {new Date(f.creadoEn).toLocaleDateString("es-VE")}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 700, color: "#0369a1", fontSize: 13 }}>${Number(f.saldoPendiente).toFixed(2)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{estadoBadge(f.estado)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, color, bg, onClick }: any) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20,
        display: "flex", alignItems: "center", gap: 16,
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.15s",
      }}
      onMouseEnter={(e) => { if (onClick) (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 10, background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{value}</div>
      </div>
    </div>
  );
}

function estadoBadge(estado: string) {
  const map: Record<string, string> = { EMITIDA: "Emitida", PENDIENTE_COBRO: "Pendiente", COBRADA_PARCIAL: "Cobro Parcial" };
  return map[estado] ?? estado;
}

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const fechaInput: React.CSSProperties = { padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, outline: "none", background: "#fff", color: "#374151" };
const chipBtn: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 6, background: "#f8fafc", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "4px 10px" };
const chipBtnActivo: React.CSSProperties = { background: "#2563eb", color: "#fff", borderColor: "#2563eb" };
