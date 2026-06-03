import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cotizacionesApi } from "../api/endpoints";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

const ESTADOS: Record<string, { label: string; color: string }> = {
  APROBADA:   { label: "Aprobada",   color: "#16a34a" },
  COMPLETADA: { label: "Completada", color: "#0284c7" },
};

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReporteComisiones() {
  const [mes, setMes] = useState(mesActual());
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());

  const { data = [], isLoading } = useQuery({
    queryKey: ["reporte-comisiones", mes],
    queryFn: () => cotizacionesApi.reporteComisiones(mes),
  });

  const toggleExpandir = (id: number) => {
    setExpandidos((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalGeneral = (data as any[]).reduce((s: number, v: any) => s + v.comision, 0);
  const ventasGeneral = (data as any[]).reduce((s: number, v: any) => s + v.totalVentas, 0);

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Reporte de Comisiones</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            Cotizaciones aprobadas y completadas · ganancia de vendedor
          </p>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 4 }}>Mes</label>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            style={{ padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none" }}
          />
        </div>
      </div>

      {/* Resumen global */}
      {(data as any[]).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          <SummaryCard label="Vendedores activos" value={String((data as any[]).length)} />
          <SummaryCard label="Total ventas (mes)" value={`$${ventasGeneral.toFixed(2)}`} />
          <SummaryCard label="Total comisiones (mes)" value={`$${totalGeneral.toFixed(2)}`} accent />
        </div>
      )}

      {/* Tabla por vendedor */}
      {isLoading && (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>Cargando...</div>
      )}

      {!isLoading && (data as any[]).length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8", background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" }}>
          <TrendingUp size={36} style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: "#475569" }}>Sin cotizaciones aprobadas este mes</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Prueba seleccionando otro mes</div>
        </div>
      )}

      {(data as any[]).map((v: any) => {
        const expanded = expandidos.has(v.vendedor.id);
        return (
          <div key={v.vendedor.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}>
            {/* Fila del vendedor */}
            <div
              style={{ display: "flex", alignItems: "center", padding: "14px 18px", cursor: "pointer", gap: 12 }}
              onClick={() => toggleExpandir(v.vendedor.id)}
            >
              <div style={{ color: "#94a3b8" }}>
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>{v.vendedor.nombre}</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>
                  {v.totalCotizaciones} {v.totalCotizaciones === 1 ? "cotización" : "cotizaciones"}
                </div>
              </div>
              <div style={{ textAlign: "right", marginRight: 32 }}>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Total Ventas</div>
                <div style={{ fontWeight: 600, color: "#1e293b" }}>${v.totalVentas.toFixed(2)}</div>
              </div>
              <div style={{ textAlign: "right", background: "#f0fdf4", padding: "8px 16px", borderRadius: 8, minWidth: 110 }}>
                <div style={{ fontSize: 11, color: "#166534" }}>Comisión</div>
                <div style={{ fontWeight: 800, fontSize: 17, color: "#166534" }}>${v.comision.toFixed(2)}</div>
              </div>
            </div>

            {/* Detalle de cotizaciones */}
            {expanded && (
              <div style={{ borderTop: "1px solid #f1f5f9" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>N° Cotización</th>
                      <th style={thStyle}>Cliente</th>
                      <th style={thStyle}>Fecha</th>
                      <th style={thStyle}>Estado</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Total Venta</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Comisión</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.detalle.map((d: any) => {
                      const est = ESTADOS[d.estado];
                      return (
                        <tr key={d.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={tdStyle}><span style={{ fontWeight: 700, color: "#2563eb" }}>{d.numero}</span></td>
                          <td style={tdStyle}>{d.cliente}</td>
                          <td style={tdStyle}>{new Date(d.fecha).toLocaleDateString("es-VE")}</td>
                          <td style={tdStyle}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: est?.color, background: est?.color + "18", padding: "2px 8px", borderRadius: 10 }}>
                              {est?.label}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "right" }}>${d.totalNeto.toFixed(2)}</td>
                          <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#166534" }}>
                            ${d.comision.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                    {/* Subtotal */}
                    <tr style={{ background: "#f0fdf4", borderTop: "1px solid #bbf7d0" }}>
                      <td colSpan={4} style={{ ...tdStyle, fontWeight: 600, color: "#166534" }}>Subtotal {v.vendedor.nombre}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>${v.totalVentas.toFixed(2)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, color: "#166534" }}>${v.comision.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? "#f0fdf4" : "#fff",
      border: `1px solid ${accent ? "#bbf7d0" : "#e2e8f0"}`,
      borderRadius: 12, padding: "16px 20px",
    }}>
      <div style={{ fontSize: 12, color: accent ? "#166534" : "#64748b", fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? "#166534" : "#1e293b" }}>{value}</div>
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "#374151" };
