import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pagosApi, facturasApi, clientesApi, cuentasApi } from "../api/endpoints";
import { Plus, AlertCircle, CheckCircle, Clock, ArrowRight, Building2, Settings, Search, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const MONEDAS = ["USD", "USDT", "BS", "COP"];
const MONEDA_LABEL: Record<string, string> = { USD: "$ USD", USDT: "USDT", BS: "Bs.", COP: "COP" };

function usd(n: any) {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtFecha(raw: any) {
  if (!raw) return "—";
  return new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}

const ESTADO_COLOR: Record<string, string> = { LIBRE: "#f59e0b", PARCIAL: "#3b82f6", ASIGNADO: "#16a34a" };
const ESTADO_LABEL: Record<string, string> = { LIBRE: "Sin asignar", PARCIAL: "Parcial", ASIGNADO: "Completo" };
const ESTADO_ICON: Record<string, any> = { LIBRE: AlertCircle, PARCIAL: Clock, ASIGNADO: CheckCircle };

const FORM_VACIO = { clienteId: "", cuentaId: "", moneda: "USD", monto: "", montousd: "", tasaCambioBs: "", tasaCambioCop: "", fecha: new Date().toISOString().split("T")[0], origenFondos: "", destinoUso: "", observaciones: "", fechaProximoAbono: "" };

export default function Pagos() {
  const { esMaster, puedeEditar } = useAuth();
  const qc = useQueryClient();
  const [modalPago, setModalPago] = useState(false);
  const [modalAsignar, setModalAsignar] = useState<any>(null);
  const [modalCuentas, setModalCuentas] = useState(false);
  const [form, setForm] = useState<any>(FORM_VACIO);
  const [asignaciones, setAsignaciones] = useState<any[]>([]);
  const [nuevaCuenta, setNuevaCuenta] = useState({ nombre: "", moneda: "USD", tipoCuenta: "Ahorro", numeroCuenta: "", cedula: "", propietario: "Empresa", comisionPct: "0" });
  const [editCuenta, setEditCuenta] = useState<any>(null);
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");

  const { data: pagos = [] } = useQuery({ queryKey: ["pagos"], queryFn: () => pagosApi.listar() });
  const { data: pendientes = [] } = useQuery({ queryKey: ["pagos-pendientes"], queryFn: pagosApi.pendientes });
  const { data: cuentas = [] } = useQuery({ queryKey: ["cuentas"], queryFn: cuentasApi.listar });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: clientesApi.listar });
  const { data: facturasAbiertas = [] } = useQuery({
    queryKey: ["facturas-abiertas"],
    queryFn: () => facturasApi.listar({ estado: "EMITIDA,PENDIENTE_COBRO,COBRADA_PARCIAL" }),
  });

  const seedMutation = useMutation({
    mutationFn: cuentasApi.seedIniciales,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cuentas"] }),
  });

  const crearCuenta = useMutation({
    mutationFn: (data: any) => cuentasApi.crear(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cuentas"] }); setNuevaCuenta({ nombre: "", moneda: "USD", tipoCuenta: "Ahorro", numeroCuenta: "", cedula: "", propietario: "Empresa", comisionPct: "0" }); },
  });

  const actualizarCuenta = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => cuentasApi.actualizar(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cuentas"] }); setEditCuenta(null); },
  });

  const registrar = useMutation({
    mutationFn: () => {
      const payload: any = {
        clienteId: form.clienteId ? Number(form.clienteId) : null,
        cuentaId: form.cuentaId ? Number(form.cuentaId) : null,
        monto: Number(form.monto),
        moneda: form.moneda,
        fecha: form.fecha || undefined,
        origenFondos: form.origenFondos || undefined,
        destinoUso: form.destinoUso || undefined,
        observaciones: form.observaciones || undefined,
        fechaProximoAbono: form.fechaProximoAbono || undefined,
      };
      if (form.moneda === "BS" && form.tasaCambioBs) {
        payload.tasaCambioBs = Number(form.tasaCambioBs);
        payload.montousd = Number(form.monto) / Number(form.tasaCambioBs);
      }
      if (form.moneda === "COP" && form.tasaCambioCop) {
        payload.tasaCambioCop = Number(form.tasaCambioCop);
        payload.montousd = Number(form.monto) / Number(form.tasaCambioCop);
      }
      if (form.moneda === "USDT") payload.montousd = Number(form.monto);
      if (form.moneda === "USD") payload.montousd = Number(form.monto);
      return pagosApi.registrar(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pagos"] });
      qc.invalidateQueries({ queryKey: ["pagos-pendientes"] });
      setModalPago(false);
      setForm(FORM_VACIO);
    },
  });

  const asignar = useMutation({
    mutationFn: () => pagosApi.asignar(modalAsignar.id, asignaciones),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pagos"] });
      qc.invalidateQueries({ queryKey: ["pagos-pendientes"] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
      qc.invalidateQueries({ queryKey: ["facturas-abiertas"] });
      setModalAsignar(null);
      setAsignaciones([]);
    },
  });

  const hayFiltros = busqueda || desde || hasta;
  const pagosFiltrados = useMemo(() => {
    let lista = pagos as any[];
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter((p) =>
        p.cliente?.nombre?.toLowerCase().includes(q) ||
        p.cuenta?.nombre?.toLowerCase().includes(q) ||
        p.origenFondos?.toLowerCase().includes(q)
      );
    }
    if (desde) {
      const d = new Date(desde);
      lista = lista.filter((p) => new Date(p.fecha) >= d);
    }
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59);
      lista = lista.filter((p) => new Date(p.fecha) <= h);
    }
    return lista;
  }, [pagos, busqueda, desde, hasta]);

  const totalAsignado = asignaciones.reduce((s, a) => s + (a.montoAsignado || 0), 0);
  const disponible = modalAsignar ? Number(modalAsignar.monto) : 0;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Pagos y Cobros</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {pendientes.length} pago{pendientes.length !== 1 ? "s" : ""} sin asignar
          {hayFiltros && ` · ${pagosFiltrados.length} de ${(pagos as any[]).length} en historial`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {puedeEditar && (
            <button onClick={() => setModalCuentas(true)} style={btnSecondary}>
              <Building2 size={15} /> Cuentas
            </button>
          )}
          {puedeEditar && (
            <button onClick={() => setModalPago(true)} style={btnPrimary}>
              <Plus size={16} /> Registrar Pago
            </button>
          )}
        </div>
      </div>

      {/* Alerta: pagos sin asignar */}
      {pendientes.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 16, marginBottom: 22 }}>
          <div style={{ fontWeight: 600, color: "#92400e", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={16} /> Pagos pendientes de asignar a factura
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {pendientes.map((p: any) => (
              <div key={p.id} style={{ background: "#fff", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", fontSize: 13, minWidth: 180 }}>
                <div style={{ fontWeight: 700, marginBottom: 2 }}>{p.cliente?.nombre ?? "Sin cliente"}</div>
                <div style={{ color: "#059669", fontWeight: 700, fontSize: 15 }}>
                  {p.moneda === "BS" || p.moneda === "COP" ? Number(p.monto).toFixed(2) : usd(p.monto)} {MONEDA_LABEL[p.moneda]}
                </div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8 }}>
                  {p.cuenta?.nombre ?? "Sin cuenta"} · {fmtFecha(p.fecha)}
                </div>
                {puedeEditar && (
                  <button onClick={() => { setModalAsignar(p); setAsignaciones([]); }}
                    style={{ ...btnPrimary, fontSize: 12, padding: "5px 12px" }}>
                    Asignar <ArrowRight size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, cuenta u origen..."
            style={{ width: "100%", padding: "8px 10px 8px 32px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" as const, background: "#fff" }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" as const }}>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" as const }}>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
            style={{ padding: "7px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", background: "#fff" }} />
        </div>
        {hayFiltros && (
          <button onClick={() => { setBusqueda(""); setDesde(""); setHasta(""); }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 12, color: "#64748b" }}>
            <X size={12} /> Limpiar
          </button>
        )}
      </div>

      <div style={cardStyle}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #e2e8f0", fontWeight: 600, fontSize: 15 }}>
          Historial de Pagos {hayFiltros && <span style={{ fontSize: 13, fontWeight: 400, color: "#94a3b8" }}>({pagosFiltrados.length} de {(pagos as any[]).length})</span>}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Fecha", "Cliente", "Monto", "Moneda", "Cuenta", "Estado", "Origen / Uso", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>Sin pagos registrados</td></tr>
            )}
            {pagosFiltrados.map((p: any) => {
              const Icon = ESTADO_ICON[p.estado] ?? Clock;
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}>{fmtFecha(p.fecha)}</td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{p.cliente?.nombre ?? <span style={{ color: "#94a3b8" }}>Libre</span>}</td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#059669" }}>
                    {Number(p.monto).toFixed(2)} <span style={{ fontSize: 11, color: "#94a3b8" }}>{MONEDA_LABEL[p.moneda]}</span>
                  </td>
                  <td style={tdStyle}><span style={tagStyle}>{p.moneda}</span></td>
                  <td style={{ ...tdStyle, color: "#64748b" }}>{p.cuenta?.nombre ?? "—"}</td>
                  <td style={tdStyle}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: ESTADO_COLOR[p.estado] }}>
                      <Icon size={12} />{ESTADO_LABEL[p.estado] ?? p.estado}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontSize: 12, color: "#64748b", maxWidth: 220 }}>
                    {p.origenFondos ? <div style={{ marginBottom: 2 }}>↓ {p.origenFondos}</div> : null}
                    {p.destinoUso ? <div>↑ {p.destinoUso}</div> : null}
                    {(p.asignaciones ?? []).filter((a: any) => a.notas).map((a: any) => (
                      <div key={a.id} style={{ color: "#94a3b8", marginTop: 2 }}>
                        📋 {a.factura?.numero}: {a.notas}
                      </div>
                    ))}
                    {!p.origenFondos && !p.destinoUso && (p.asignaciones ?? []).every((a: any) => !a.notas) && "—"}
                  </td>
                  <td style={tdStyle}>
                    {p.estado !== "ASIGNADO" && puedeEditar && (
                      <button onClick={() => { setModalAsignar(p); setAsignaciones([]); }} style={btnIcon}>
                        <ArrowRight size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Modal: Registrar Pago ─────────────────────────────── */}
      {modalPago && (
        <div style={overlay} onClick={() => setModalPago(false)}>
          <div style={{ ...modal, width: "min(640px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 22px", fontSize: 18, fontWeight: 700 }}>Registrar Pago / Cobro</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <label style={lbl}>
                Cliente
                <select style={inp} value={form.clienteId} onChange={(e) => setForm({ ...form, clienteId: e.target.value })}>
                  <option value="">Sin cliente (pago libre)</option>
                  {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </label>
              <label style={lbl}>
                Fecha
                <input type="date" style={inp} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </label>
              <label style={lbl}>
                Monto *
                <input type="number" style={inp} value={form.monto} step="0.01" placeholder="0.00" onChange={(e) => setForm({ ...form, monto: e.target.value })} />
              </label>
              <label style={lbl}>
                Moneda
                <select style={inp} value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                  {MONEDAS.map((m) => <option key={m} value={m}>{m} — {MONEDA_LABEL[m]}</option>)}
                </select>
              </label>

              {form.moneda === "BS" && (
                <label style={lbl}>
                  Tasa Bs/USD
                  <input type="number" style={inp} value={form.tasaCambioBs} placeholder="Tasa del día" onChange={(e) => setForm({ ...form, tasaCambioBs: e.target.value })} />
                </label>
              )}
              {form.moneda === "COP" && (
                <label style={lbl}>
                  Tasa COP/USD
                  <input type="number" style={inp} value={form.tasaCambioCop} onChange={(e) => setForm({ ...form, tasaCambioCop: e.target.value })} />
                </label>
              )}
              {(form.moneda === "BS" || form.moneda === "COP") && (form.tasaCambioBs || form.tasaCambioCop) && form.monto && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  <span style={{ color: "#64748b" }}>Equivalente USD: </span>
                  <strong style={{ color: "#16a34a" }}>
                    {usd(Number(form.monto) / Number(form.moneda === "BS" ? form.tasaCambioBs : form.tasaCambioCop))}
                  </strong>
                </div>
              )}

              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Cuenta de destino
                <select style={inp} value={form.cuentaId} onChange={(e) => setForm({ ...form, cuentaId: e.target.value })}>
                  <option value="">Seleccionar cuenta...</option>
                  {cuentas.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
                  ))}
                </select>
                {cuentas.length === 0 && (
                  <span style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>
                    No hay cuentas. Ve a "Cuentas" para agregar las cuentas bancarias.
                  </span>
                )}
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Origen de los fondos
                <input style={inp} value={form.origenFondos} placeholder='Ej: "Cobro Gandica — Despacho #22"' onChange={(e) => setForm({ ...form, origenFondos: e.target.value })} />
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Destino / Uso del dinero
                <input style={inp} value={form.destinoUso} placeholder='Ej: "Pago obreros semana 28/05"' onChange={(e) => setForm({ ...form, destinoUso: e.target.value })} />
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Observaciones
                <textarea style={{ ...inp, height: 64, resize: "vertical" }} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              </label>
              <label style={{ ...lbl, gridColumn: "1/-1" }}>
                Fecha prometida próximo abono
                <input type="date" style={inp} value={form.fechaProximoAbono} onChange={(e) => setForm({ ...form, fechaProximoAbono: e.target.value })} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
              <button onClick={() => setModalPago(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={() => registrar.mutate()} disabled={!form.monto || registrar.isPending} style={btnPrimary}>
                {registrar.isPending ? "Guardando..." : "Registrar Pago"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Asignar a factura(s) ───────────────────────── */}
      {modalAsignar && (
        <div style={overlay} onClick={() => setModalAsignar(null)}>
          <div style={{ ...modal, width: "min(780px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Asignar Pago a Factura(s)</h2>
            <div style={{ color: "#64748b", fontSize: 14, marginBottom: 18 }}>
              Monto disponible:{" "}
              <strong style={{ color: "#059669", fontSize: 16 }}>
                {Number(modalAsignar.monto).toFixed(2)} {MONEDA_LABEL[modalAsignar.moneda]}
              </strong>
              {modalAsignar.cliente && ` · ${modalAsignar.cliente.nombre}`}
              {" · "}{fmtFecha(modalAsignar.fecha)}
            </div>

            {totalAsignado > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", marginBottom: 12, fontSize: 13 }}>
                Asignado: <strong style={{ color: "#16a34a" }}>{usd(totalAsignado)}</strong>
                {" · "}Restante: <strong style={{ color: totalAsignado > disponible ? "#dc2626" : "#1e293b" }}>{usd(disponible - totalAsignado)}</strong>
              </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 18 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Nº Factura", "Cliente", "Total", "Saldo", "Asignar"].map((h) => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {facturasAbiertas.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "30px 0", textAlign: "center", color: "#94a3b8" }}>No hay facturas pendientes de cobro</td></tr>
                )}
                {facturasAbiertas
                  .filter((f: any) => !modalAsignar.clienteId || f.clienteId === modalAsignar.clienteId)
                  .map((f: any) => {
                    const idx = asignaciones.findIndex((a) => a.facturaId === f.id);
                    return (
                      <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9", background: idx >= 0 ? "#f0fdf4" : undefined }}>
                        <td style={{ ...tdStyle, fontWeight: 700, color: "#2563eb" }}>{f.numero}</td>
                        <td style={tdStyle}>{f.cliente?.nombre}</td>
                        <td style={tdStyle}>{usd(f.totalNeto)}</td>
                        <td style={{ ...tdStyle, color: "#dc2626", fontWeight: 600 }}>{usd(f.saldoPendiente)}</td>
                        <td style={tdStyle}>
                          <input
                            type="number" step="0.01" min="0"
                            placeholder="0.00"
                            value={idx >= 0 ? asignaciones[idx].montoAsignado : ""}
                            style={{ ...inp, width: 120, padding: "6px 10px" }}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              const updated = [...asignaciones];
                              if (idx >= 0) {
                                if (val > 0) updated[idx] = { ...updated[idx], montoAsignado: val };
                                else updated.splice(idx, 1);
                              } else if (val > 0) {
                                updated.push({ facturaId: f.id, montoAsignado: val, notas: "" });
                              }
                              setAsignaciones(updated);
                            }}
                          />
                          {idx >= 0 && (
                            <input
                              placeholder="Nota: destino del pago..."
                              value={asignaciones[idx].notas ?? ""}
                              style={{ ...inp, width: 240, padding: "5px 8px", marginTop: 5, fontSize: 12, color: "#64748b" }}
                              onChange={(e) => {
                                const updated = [...asignaciones];
                                updated[idx] = { ...updated[idx], notas: e.target.value };
                                setAsignaciones(updated);
                              }}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setModalAsignar(null)} style={btnSecondary}>Cancelar</button>
              <button
                onClick={() => asignar.mutate()}
                disabled={asignaciones.length === 0 || totalAsignado > disponible || asignar.isPending}
                style={btnPrimary}
              >
                {asignar.isPending ? "Asignando..." : "Confirmar Asignación"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Gestionar Cuentas ──────────────────────────── */}
      {modalCuentas && (
        <div style={overlay} onClick={() => { setModalCuentas(false); setEditCuenta(null); }}>
          <div style={{ ...modal, width: "min(700px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Cuentas Bancarias</h2>
              {cuentas.length === 0 && esMaster && (
                <button onClick={() => seedMutation.mutate()} style={{ ...btnSecondary, fontSize: 13 }}>
                  <Settings size={14} /> Cargar cuentas iniciales
                </button>
              )}
            </div>

            {/* Lista de cuentas existentes */}
            {cuentas.length > 0 && (
              <div style={{ marginBottom: 20, maxHeight: 340, overflowY: "auto" }}>
                {cuentas.map((c: any) => (
                  <div key={c.id}>
                    {editCuenta?.id === c.id ? (
                      /* Modo edición inline */
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14, marginBottom: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                          <label style={lbl}>Nombre<input style={inp} value={editCuenta.nombre} onChange={(e) => setEditCuenta({ ...editCuenta, nombre: e.target.value })} /></label>
                          <label style={lbl}>Moneda<select style={inp} value={editCuenta.moneda} onChange={(e) => setEditCuenta({ ...editCuenta, moneda: e.target.value })}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select></label>
                          <label style={lbl}>Tipo<select style={inp} value={editCuenta.tipoCuenta || ""} onChange={(e) => setEditCuenta({ ...editCuenta, tipoCuenta: e.target.value })}>
                            <option value="">—</option>
                            <option>Ahorro</option><option>Corriente</option><option>Billetera Digital</option><option>Efectivo</option>
                          </select></label>
                          <label style={lbl}>N° de Cuenta<input style={inp} value={editCuenta.numeroCuenta || ""} placeholder="Ej: 0134-0000-00-0000000000" onChange={(e) => setEditCuenta({ ...editCuenta, numeroCuenta: e.target.value })} /></label>
                          <label style={lbl}>Cédula del titular<input style={inp} value={editCuenta.cedula || ""} placeholder="Ej: V-12345678" onChange={(e) => setEditCuenta({ ...editCuenta, cedula: e.target.value })} /></label>
                          <label style={lbl}>Propietario<input style={inp} value={editCuenta.propietario} onChange={(e) => setEditCuenta({ ...editCuenta, propietario: e.target.value })} /></label>
                          <label style={lbl}>Comisión %<input type="number" style={inp} value={editCuenta.comisionPct} step="0.01" onChange={(e) => setEditCuenta({ ...editCuenta, comisionPct: e.target.value })} /></label>
                        </div>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setEditCuenta(null)} style={btnSecondary}>Cancelar</button>
                          <button onClick={() => actualizarCuenta.mutate({ id: c.id, data: { ...editCuenta, comisionPct: Number(editCuenta.comisionPct) } })} style={btnPrimary}>Guardar</button>
                        </div>
                      </div>
                    ) : (
                      /* Vista normal */
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</div>
                          <div style={{ fontSize: 12, color: "#64748b", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                            <span>{c.moneda}{c.tipoCuenta ? ` · ${c.tipoCuenta}` : ""}</span>
                            {c.numeroCuenta && <span>N°: {c.numeroCuenta}</span>}
                            {c.cedula && <span>CI: {c.cedula}</span>}
                            <span>{c.propietario}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ ...tagStyle }}>{c.moneda}</span>
                          {puedeEditar && (
                            <button onClick={() => setEditCuenta({ ...c, comisionPct: String(c.comisionPct) })} style={{ ...btnIcon, fontSize: 12, padding: "5px 10px" }}>
                              Editar
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Agregar nueva cuenta */}
            {!editCuenta && (
              <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Agregar nueva cuenta</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <label style={lbl}>Nombre<input style={inp} value={nuevaCuenta.nombre} placeholder="Ej: BANCAMIGA Dólares" onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, nombre: e.target.value })} /></label>
                  <label style={lbl}>Moneda<select style={inp} value={nuevaCuenta.moneda} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, moneda: e.target.value })}>{MONEDAS.map((m) => <option key={m}>{m}</option>)}</select></label>
                  <label style={lbl}>Tipo de cuenta<select style={inp} value={nuevaCuenta.tipoCuenta} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, tipoCuenta: e.target.value })}>
                    <option>Ahorro</option><option>Corriente</option><option>Billetera Digital</option><option>Efectivo</option>
                  </select></label>
                  <label style={lbl}>N° de Cuenta<input style={inp} value={nuevaCuenta.numeroCuenta} placeholder="0134-0000-00-0000000000" onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, numeroCuenta: e.target.value })} /></label>
                  <label style={lbl}>Cédula del titular<input style={inp} value={nuevaCuenta.cedula} placeholder="V-12345678" onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, cedula: e.target.value })} /></label>
                  <label style={lbl}>Propietario / Titular<input style={inp} value={nuevaCuenta.propietario} onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, propietario: e.target.value })} /></label>
                  <label style={lbl}>Comisión % (si aplica)<input type="number" style={inp} value={nuevaCuenta.comisionPct} step="0.01" onChange={(e) => setNuevaCuenta({ ...nuevaCuenta, comisionPct: e.target.value })} /></label>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                  <button onClick={() => crearCuenta.mutate({ ...nuevaCuenta, comisionPct: Number(nuevaCuenta.comisionPct) })} disabled={!nuevaCuenta.nombre || crearCuenta.isPending} style={btnPrimary}>
                    {crearCuenta.isPending ? "Guardando..." : "Agregar Cuenta"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnIcon: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "8px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "10px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#f1f5f9", borderRadius: 4, fontSize: 12, color: "#475569", fontWeight: 600 };
const inp: React.CSSProperties = { padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", width: "100%", boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#374151" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modal: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "92vh", overflow: "auto" };
