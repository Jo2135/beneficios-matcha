import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cotizacionesApi } from "../api/endpoints";
import { Plus, FileText, CheckCircle, XCircle, Send, ArrowRight } from "lucide-react";

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
  const [filtroEstado, setFiltroEstado] = useState("");
  const [detalle, setDetalle] = useState<any>(null);

  const { data: cotizaciones = [] } = useQuery({
    queryKey: ["cotizaciones", filtroEstado],
    queryFn: () => cotizacionesApi.listar(filtroEstado ? { estado: filtroEstado } : undefined),
  });

  const cambiarEstado = useMutation({
    mutationFn: ({ id, estado }: { id: number; estado: string }) =>
      cotizacionesApi.cambiarEstado(id, estado),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      setDetalle(null);
    },
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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Cotizaciones</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{cotizaciones.length} cotizaciones</p>
        </div>
        <a href="/cotizaciones/nueva" style={{ ...btnPrimary, textDecoration: "none" }}><Plus size={16} /> Nueva Cotización</a>
      </div>

      {/* Filtros de estado */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
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
              {["Número", "Cliente", "Vendedor", "Total", "Estado", "Vence", "Empresa", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cotizaciones.map((c: any) => {
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
                  <td style={tdStyle}>{c.fechaVencimiento ? new Date(c.fechaVencimiento).toLocaleDateString("es-VE") : "—"}</td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: "#94a3b8" }}>{c.empresa?.nombre ?? c.cliente?.empresaFactura}</span></td>
                  <td style={tdStyle}><ArrowRight size={14} style={{ color: "#94a3b8" }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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

            <div style={{ background: "#f8fafc", borderRadius: 8, padding: 14, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <Stat label="Total Bruto" value={`$${Number(detalle.totalBruto).toFixed(2)}`} />
              <Stat label="Descuento" value={`$${Number(detalle.descuentoTotal).toFixed(2)}`} />
              <Stat label="Total Neto" value={`$${Number(detalle.totalNeto).toFixed(2)}`} bold />
            </div>

            {detalle.notas && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <strong>Notas:</strong> {detalle.notas}
              </div>
            )}

            {/* Acciones según estado */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
              {detalle.estado === "BORRADOR" && (
                <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "ENVIADA" })} style={{ ...btnAction, background: "#dbeafe", color: "#1d4ed8" }}>
                  <Send size={14} /> Marcar Enviada
                </button>
              )}
              {detalle.estado === "ENVIADA" && (
                <>
                  <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "APROBADA" })} style={{ ...btnAction, background: "#dcfce7", color: "#166534" }}>
                    <CheckCircle size={14} /> Aprobada
                  </button>
                  <button onClick={() => cambiarEstado.mutate({ id: detalle.id, estado: "RECHAZADA" })} style={{ ...btnAction, background: "#fee2e2", color: "#991b1b" }}>
                    <XCircle size={14} /> Rechazada
                  </button>
                </>
              )}
              {detalle.estado === "APROBADA" && (
                <button
                  onClick={() => generarFactura.mutate(detalle.id)}
                  disabled={generarFactura.isPending}
                  style={{ ...btnPrimary }}
                >
                  <FileText size={14} />
                  {generarFactura.isPending ? "Generando..." : "Generar Factura"}
                </button>
              )}
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
const btnAction: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const chipBtn: React.CSSProperties = { border: "none", padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 13, fontWeight: 500 };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: 13, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "90vh", overflow: "auto" };
