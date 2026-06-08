import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { facturasApi } from "../api/endpoints";
import { ArrowLeft, FileText } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-VE", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface PagoAsignado {
  id: number;
  fechaAsignacion: string;
  montoCobrado: string | number;
  pago: {
    fecha: string;
    referencia?: string;
    cuenta?: { nombre: string; moneda: string };
  };
}
interface Factura {
  id: number;
  numero: string;
  creadoEn: string;
  totalNeto: string | number;
  totalPagado: string | number;
  saldoPendiente: string | number;
  estado: string;
  cliente?: { id: number; nombre: string; rif?: string; diasCredito?: number; vendedor?: { nombre: string } };
  empresa?: { nombre: string };
  pagos: PagoAsignado[];
}

// ─── Movimiento de ledger (cargo o abono) ─────────────────────────────────────
type Movimiento =
  | { tipo: "factura"; fecha: string; factura: Factura }
  | { tipo: "pago"; fecha: string; pagoAsig: PagoAsignado; facturaNum: string };

// ─── Componente principal ─────────────────────────────────────────────────────
export default function EstadoCuenta() {
  const { clienteId } = useParams<{ clienteId: string }>();
  const id = Number(clienteId);
  const navigate = useNavigate();

  const { data: facturas = [], isLoading } = useQuery<Factura[]>({
    queryKey: ["facturas-con-pagos", id],
    queryFn: () => facturasApi.listarConPagos(id),
  });

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Cargando estado de cuenta…</div>;
  }

  const lista = facturas as Factura[];
  const cliente = lista[0]?.cliente;

  // Totales
  const totalFacturado = lista.reduce((s, f) => s + Number(f.totalNeto), 0);
  const totalCobrado   = lista.reduce((s, f) => s + Number(f.totalPagado), 0);
  const totalPendiente = lista.reduce((s, f) => s + Number(f.saldoPendiente), 0);

  // Construir ledger cronológico
  const movimientos: Movimiento[] = [];
  for (const f of lista) {
    movimientos.push({ tipo: "factura", fecha: f.creadoEn, factura: f });
    for (const p of f.pagos) {
      movimientos.push({ tipo: "pago", fecha: p.fechaAsignacion, pagoAsig: p, facturaNum: f.numero });
    }
  }
  movimientos.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());

  // Calcular saldo corrido
  let saldo = 0;

  // Estilos
  const thSt: React.CSSProperties = {
    padding: "9px 12px", background: "#1e293b", color: "#fff",
    fontSize: 12, fontWeight: 600, textAlign: "left",
  };
  const tdSt: React.CSSProperties = {
    padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #f1f5f9",
    verticalAlign: "middle",
  };

  return (
    <div style={{ padding: "20px 20px 60px", maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", marginTop: 2 }}>
          <ArrowLeft size={20} color="#64748b" />
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            Estado de Cuenta — {cliente?.nombre ?? `Cliente #${id}`}
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>
            {cliente?.rif && `RIF: ${cliente.rif} · `}
            {cliente?.diasCredito ? `Crédito: ${cliente.diasCredito} días` : "Sin crédito"}
            {cliente?.vendedor && ` · Vendedor: ${cliente.vendedor.nombre}`}
          </p>
        </div>
      </div>

      {/* Resumen */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <StatBox label="Total Facturado" valor={totalFacturado} color="#1d4ed8" bg="#dbeafe" />
        <StatBox label="Total Cobrado"   valor={totalCobrado}   color="#166534" bg="#dcfce7" />
        <StatBox label="Saldo Pendiente" valor={totalPendiente} color={totalPendiente > 0.01 ? "#dc2626" : "#166534"} bg={totalPendiente > 0.01 ? "#fee2e2" : "#dcfce7"} />
      </div>

      {lista.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}>
          <FileText size={40} style={{ marginBottom: 12 }} />
          <p style={{ margin: 0 }}>Sin facturas registradas para este cliente</p>
        </div>
      ) : (
        <div style={{ borderRadius: 10, border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,.06)" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={thSt}>Fecha</th>
                <th style={thSt}>Descripción</th>
                <th style={{ ...thSt, textAlign: "right" }}>Cargo ($)</th>
                <th style={{ ...thSt, textAlign: "right" }}>Abono ($)</th>
                <th style={{ ...thSt, textAlign: "right" }}>Saldo ($)</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((mov, idx) => {
                if (mov.tipo === "factura") {
                  const cargo = Number(mov.factura.totalNeto);
                  saldo += cargo;
                  return (
                    <tr key={`f-${mov.factura.id}`} style={{ background: "#f8fafc" }}>
                      <td style={{ ...tdSt, color: "#64748b", whiteSpace: "nowrap" }}>
                        {fmtFecha(mov.fecha)}
                      </td>
                      <td style={tdSt}>
                        <div style={{ fontWeight: 700, color: "#1e293b" }}>
                          Factura {mov.factura.numero}
                        </div>
                        {mov.factura.empresa && (
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{mov.factura.empresa.nombre}</div>
                        )}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: "#dc2626" }}>
                        {fmt(cargo)}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right" }}>—</td>
                      <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: saldo > 0.01 ? "#dc2626" : "#16a34a" }}>
                        {fmt(saldo)}
                      </td>
                    </tr>
                  );
                } else {
                  const abono = Number(mov.pagoAsig.montoCobrado);
                  saldo -= abono;
                  const cuenta = mov.pagoAsig.pago.cuenta;
                  const ref    = mov.pagoAsig.pago.referencia;
                  return (
                    <tr key={`p-${mov.pagoAsig.id}`} style={{ background: "#fff" }}>
                      <td style={{ ...tdSt, color: "#64748b", whiteSpace: "nowrap" }}>
                        {fmtFecha(mov.pagoAsig.fechaAsignacion)}
                      </td>
                      <td style={tdSt}>
                        <div style={{ color: "#0f172a" }}>
                          Abono — {mov.facturaNum}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {cuenta ? `${cuenta.nombre} (${cuenta.moneda})` : "Sin cuenta"}
                          {ref ? ` · Ref: ${ref}` : ""}
                        </div>
                      </td>
                      <td style={{ ...tdSt, textAlign: "right" }}>—</td>
                      <td style={{ ...tdSt, textAlign: "right", fontWeight: 600, color: "#16a34a" }}>
                        {fmt(abono)}
                      </td>
                      <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, color: saldo > 0.01 ? "#dc2626" : "#16a34a" }}>
                        {fmt(saldo)}
                      </td>
                    </tr>
                  );
                }
              })}

              {/* Fila total */}
              <tr style={{ background: "#1e293b" }}>
                <td colSpan={2} style={{ ...tdSt, color: "#fff", fontWeight: 700, borderBottom: "none" }}>
                  Total
                </td>
                <td style={{ ...tdSt, textAlign: "right", color: "#fca5a5", fontWeight: 700, borderBottom: "none" }}>
                  {fmt(totalFacturado)}
                </td>
                <td style={{ ...tdSt, textAlign: "right", color: "#86efac", fontWeight: 700, borderBottom: "none" }}>
                  {fmt(totalCobrado)}
                </td>
                <td style={{ ...tdSt, textAlign: "right", fontWeight: 700, borderBottom: "none",
                  color: totalPendiente > 0.01 ? "#fbbf24" : "#86efac" }}>
                  {fmt(totalPendiente)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Resumen por factura */}
      {lista.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1e293b", marginBottom: 12 }}>
            Detalle por Factura
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {lista.map((f) => {
              const pendiente = Number(f.saldoPendiente);
              const pagado    = Number(f.totalPagado);
              const total     = Number(f.totalNeto);
              const pct       = total > 0 ? Math.min(100, (pagado / total) * 100) : 0;
              return (
                <div key={f.id} style={{
                  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                  padding: "12px 16px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{f.numero}</span>
                      <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 10 }}>
                        {fmtFecha(f.creadoEn)}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#64748b" }}>Total: <strong>${fmt(total)}</strong></span>
                      <span style={{ fontSize: 12, color: "#16a34a" }}>Pagado: <strong>${fmt(pagado)}</strong></span>
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: pendiente > 0.01 ? "#dc2626" : "#16a34a",
                      }}>
                        Saldo: ${fmt(pendiente)}
                      </span>
                    </div>
                  </div>
                  {/* Barra de progreso */}
                  <div style={{ height: 5, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: pct >= 100 ? "#22c55e" : "#3b82f6",
                      borderRadius: 4, transition: "width .3s",
                    }} />
                  </div>
                  {/* Pagos de esta factura */}
                  {f.pagos.length > 0 && (
                    <div style={{ marginTop: 8, paddingLeft: 8, borderLeft: "2px solid #e2e8f0" }}>
                      {f.pagos.map((p) => (
                        <div key={p.id} style={{ display: "flex", gap: 16, fontSize: 12, color: "#475569", marginTop: 4 }}>
                          <span style={{ whiteSpace: "nowrap", color: "#94a3b8" }}>{fmtFecha(p.fechaAsignacion)}</span>
                          <span style={{ flex: 1 }}>
                            {p.pago.cuenta ? `${p.pago.cuenta.nombre} (${p.pago.cuenta.moneda})` : "Sin cuenta"}
                            {p.pago.referencia ? ` · Ref: ${p.pago.referencia}` : ""}
                          </span>
                          <span style={{ fontWeight: 600, color: "#16a34a" }}>${fmt(Number(p.montoCobrado))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {f.pagos.length === 0 && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>
                      Sin pagos registrados
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Stat box ─────────────────────────────────────────────────────────────────
function StatBox({ label, valor, color, bg }: { label: string; valor: number; color: string; bg: string }) {
  return (
    <div style={{ flex: 1, minWidth: 160, background: bg, borderRadius: 10, padding: "12px 16px" }}>
      <div style={{ fontSize: 11, color, fontWeight: 600, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
        ${valor.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </div>
    </div>
  );
}
