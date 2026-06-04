import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { facturasApi, pagosApi, cotizacionesApi, despachosApi } from "../api/endpoints";
import { DollarSign, AlertTriangle, CheckCircle, Clock, TrendingUp, FileText, Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const { esMaster, usuario } = useAuth();
  const puedeVerFinanzas = esMaster || usuario?.rol === "ADMIN";

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

  const totalEmitido = balance?.totalEmitido ?? 0;
  const totalCobrado = balance?.totalCobrado ?? 0;
  const totalPendiente = balance?.totalPendiente ?? 0;

  const facturas = balance?.facturas ?? [];
  const vencidas = facturas.filter((f: any) => f.estado === "VENCIDA");
  const porCobrar = facturas.filter((f: any) => ["EMITIDA", "PENDIENTE_COBRO", "COBRADA_PARCIAL"].includes(f.estado));

  const cotsAbiertas = (cotizaciones as any[]).filter((c) => ["PENDIENTE", "ENVIADA", "APROBADA"].includes(c.estado));
  const cotsPorAprobar = (cotizaciones as any[]).filter((c) => c.estado === "ENVIADA");
  const despachosActivos = (despachos as any[]).filter((d) => ["PENDIENTE", "EN_RUTA"].includes(d.estado));

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Panel Principal</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Resumen operativo y financiero</p>
      </div>

      {/* KPIs financieros — solo MASTER/ADMIN */}
      {puedeVerFinanzas && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 16 }}>
          <KPICard icon={DollarSign} label="Total Emitido" value={`$${totalEmitido.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#2563eb" bg="#dbeafe" />
          <KPICard icon={CheckCircle} label="Total Cobrado" value={`$${totalCobrado.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#16a34a" bg="#dcfce7" />
          <KPICard icon={Clock} label="Por Cobrar" value={`$${totalPendiente.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`} color="#d97706" bg="#fef3c7" />
          <KPICard icon={AlertTriangle} label="Pagos sin asignar" value={pagos.length} color="#dc2626" bg="#fee2e2" onClick={() => navigate("/pagos")} />
        </div>
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
