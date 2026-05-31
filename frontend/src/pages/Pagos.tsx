import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pagosApi, facturasApi, clientesApi } from "../api/endpoints";
import { Plus, AlertCircle, CheckCircle, Clock, ArrowRight } from "lucide-react";

const MONEDAS = ["USD", "USDT", "BS", "COP"];
const CUENTAS = [
  { nombre: "Banesco Panamá", moneda: "USD" },
  { nombre: "Binance", moneda: "USDT" },
  { nombre: "Banco Venezuela", moneda: "BS" },
  { nombre: "Bancamiga", moneda: "USD" },
  { nombre: "Bancolombia", moneda: "COP" },
];

export default function Pagos() {
  const qc = useQueryClient();
  const [modalPago, setModalPago] = useState(false);
  const [modalAsignar, setModalAsignar] = useState<any>(null);
  const [form, setForm] = useState<any>({ moneda: "USD", monto: "" });
  const [asignaciones, setAsignaciones] = useState<any[]>([]);

  const { data: pagos = [] } = useQuery({ queryKey: ["pagos"], queryFn: () => pagosApi.listar() });
  const { data: pendientes = [] } = useQuery({ queryKey: ["pagos-pendientes"], queryFn: pagosApi.pendientes });
  const { data: facturas = [] } = useQuery({ queryKey: ["facturas"], queryFn: () => facturasApi.listar({ estado: "PENDIENTE_COBRO,COBRADA_PARCIAL,EMITIDA" }) });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: clientesApi.listar });

  const registrar = useMutation({
    mutationFn: () => pagosApi.registrar(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["pagos-pendientes"] }); setModalPago(false); setForm({ moneda: "USD", monto: "" }); },
  });

  const asignar = useMutation({
    mutationFn: () => pagosApi.asignar(modalAsignar.id, asignaciones),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pagos"] }); qc.invalidateQueries({ queryKey: ["pagos-pendientes"] }); qc.invalidateQueries({ queryKey: ["facturas"] }); setModalAsignar(null); setAsignaciones([]); },
  });

  const estadoColor: Record<string, string> = { LIBRE: "#f59e0b", PARCIAL: "#3b82f6", ASIGNADO: "#22c55e" };
  const estadoIcon: Record<string, any> = { LIBRE: AlertCircle, PARCIAL: Clock, ASIGNADO: CheckCircle };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Pagos y Cobros</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {pendientes.length} pagos sin asignar
          </p>
        </div>
        <button onClick={() => setModalPago(true)} style={btnPrimary}><Plus size={16} /> Registrar Pago</button>
      </div>

      {/* Pagos pendientes de asignar */}
      {pendientes.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={16} /> Pagos sin asignar a factura
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {pendientes.map((p: any) => (
              <div key={p.id} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                <div style={{ fontWeight: 600 }}>{p.cliente?.nombre ?? "Sin cliente"}</div>
                <div style={{ color: "#059669", fontWeight: 700 }}>${Number(p.monto).toFixed(2)} {p.moneda}</div>
                <div style={{ color: "#6b7280", fontSize: 12 }}>{new Date(p.fecha).toLocaleDateString("es-VE")}</div>
                <button onClick={() => { setModalAsignar(p); setAsignaciones([]); }} style={{ ...btnPrimary, marginTop: 8, fontSize: 12, padding: "4px 10px" }}>
                  Asignar <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de pagos */}
      <div style={cardStyle}>
        <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", fontWeight: 600, fontSize: 15, color: "#1e293b" }}>
          Historial de Pagos
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Fecha", "Cliente", "Monto", "Moneda", "Cuenta", "Estado", "Origen Fondos", "Destino Uso", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagos.map((p: any) => {
              const Icon = estadoIcon[p.estado] ?? Clock;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>{new Date(p.fecha).toLocaleDateString("es-VE")}</td>
                  <td style={tdStyle}><span style={{ fontWeight: 500 }}>{p.cliente?.nombre ?? "Libre"}</span></td>
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: "#059669" }}>${Number(p.monto).toFixed(2)}</span></td>
                  <td style={tdStyle}><span style={tagStyle}>{p.moneda}</span></td>
                  <td style={tdStyle}>{p.cuenta?.nombre ?? "—"}</td>
                  <td style={tdStyle}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: estadoColor[p.estado] }}>
                      <Icon size={13} />{p.estado}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{p.origenFondos || "—"}</td>
                  <td style={{ ...tdStyle, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{p.destinoUso || "—"}</td>
                  <td style={tdStyle}>
                    {p.estado !== "ASIGNADO" && (
                      <button onClick={() => { setModalAsignar(p); setAsignaciones([]); }} style={btnIcon}><ArrowRight size={14} /></button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal nuevo pago */}
      {modalPago && (
        <div style={modalOverlay} onClick={() => setModalPago(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>Registrar Pago</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <label style={labelStyle}>Cliente</label>
                <select style={inputStyle} value={form.clienteId || ""} onChange={(e) => setForm({ ...form, clienteId: Number(e.target.value) || null })}>
                  <option value="">Sin cliente (pago libre)</option>
                  {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Fecha</label>
                <input type="date" style={inputStyle} value={form.fecha || new Date().toISOString().split("T")[0]} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Monto *</label>
                <input type="number" style={inputStyle} value={form.monto} step="0.01" placeholder="0.00" onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Moneda</label>
                <select style={inputStyle} value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                  {MONEDAS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              {(form.moneda === "BS") && (
                <div>
                  <label style={labelStyle}>Tasa Binance (Bs/USD)</label>
                  <input type="number" style={inputStyle} value={form.tasaCambioBs || ""} placeholder="Tasa del día" onChange={(e) => setForm({ ...form, tasaCambioBs: e.target.value })} />
                </div>
              )}
              {(form.moneda === "COP") && (
                <div>
                  <label style={labelStyle}>Tasa COP/USD</label>
                  <input type="number" style={inputStyle} value={form.tasaCambioCop || ""} onChange={(e) => setForm({ ...form, tasaCambioCop: e.target.value })} />
                </div>
              )}
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Cuenta de Destino</label>
                <select style={inputStyle} value={form.cuentaNombre || ""} onChange={(e) => setForm({ ...form, cuentaNombre: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {CUENTAS.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.moneda})</option>)}
                </select>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Origen de los fondos</label>
                <input style={inputStyle} value={form.origenFondos || ""} placeholder='Ej: "Cobro Hermanos M del despacho 22-04"' onChange={(e) => setForm({ ...form, origenFondos: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Destino / Uso del dinero</label>
                <input style={inputStyle} value={form.destinoUso || ""} placeholder='Ej: "Pago obreros semana del 28/05"' onChange={(e) => setForm({ ...form, destinoUso: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Observaciones adicionales</label>
                <textarea style={{ ...inputStyle, height: 70, resize: "vertical" }} value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Fecha prometida próximo abono</label>
                <input type="date" style={inputStyle} value={form.fechaProximoAbono || ""} onChange={(e) => setForm({ ...form, fechaProximoAbono: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setModalPago(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={() => registrar.mutate()} disabled={!form.monto || registrar.isPending} style={btnPrimary}>
                {registrar.isPending ? "Guardando..." : "Registrar Pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar pago a facturas */}
      {modalAsignar && (
        <div style={modalOverlay} onClick={() => setModalAsignar(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Asignar Pago a Factura(s)</h2>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 20 }}>
              Disponible: <strong style={{ color: "#059669" }}>${Number(modalAsignar.monto).toFixed(2)} {modalAsignar.moneda}</strong>
              {modalAsignar.cliente && ` — ${modalAsignar.cliente.nombre}`}
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle}>Factura</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Total</th>
                  <th style={thStyle}>Saldo</th>
                  <th style={thStyle}>Monto a asignar</th>
                </tr>
              </thead>
              <tbody>
                {facturas.filter((f: any) => !modalAsignar.clienteId || f.clienteId === modalAsignar.clienteId).map((f: any) => {
                  const idx = asignaciones.findIndex((a) => a.facturaId === f.id);
                  return (
                    <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={tdStyle}><span style={{ fontWeight: 600 }}>{f.numero}</span></td>
                      <td style={tdStyle}>{f.cliente?.nombre}</td>
                      <td style={tdStyle}>${Number(f.totalNeto).toFixed(2)}</td>
                      <td style={{ ...tdStyle, color: "#ef4444", fontWeight: 600 }}>${Number(f.saldoPendiente).toFixed(2)}</td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={idx >= 0 ? asignaciones[idx].montoAsignado : ""}
                          style={{ ...inputStyle, width: 120 }}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (idx >= 0) {
                              const updated = [...asignaciones];
                              if (val > 0) updated[idx] = { ...updated[idx], montoAsignado: val };
                              else updated.splice(idx, 1);
                              setAsignaciones(updated);
                            } else if (val > 0) {
                              setAsignaciones([...asignaciones, { facturaId: f.id, montoAsignado: val }]);
                            }
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button onClick={() => setModalAsignar(null)} style={btnSecondary}>Cancelar</button>
              <button onClick={() => asignar.mutate()} disabled={asignaciones.length === 0 || asignar.isPending} style={btnPrimary}>
                {asignar.isPending ? "Asignando..." : "Confirmar Asignación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnIcon: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#f1f5f9", borderRadius: 4, fontSize: 12, color: "#475569" };
const inputStyle: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, width: "min(700px, 95vw)", maxHeight: "90vh", overflow: "auto" };
