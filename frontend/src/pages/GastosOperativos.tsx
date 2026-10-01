import { Fragment, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { gastosOperativosApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Receipt, Plus, Trash2, Split, X, ChevronDown, ChevronRight, Wallet } from "lucide-react";

/**
 * Gastos Operativos — almuerzos, agua, soldadura, insumos.
 *
 * Dos pasos, como lo pidió José: primero se carga el pago; después se reparte
 * entre los renglones del balance de las facturas que él decida. Un mismo
 * gasto puede ir partido entre varias.
 */

const usd = (n: any) =>
  `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (raw: any) =>
  raw ? new Date(String(raw).slice(0, 10) + "T12:00:00").toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const hoyISO = () => new Date().toLocaleDateString("en-CA");

interface Asignacion {
  id: number; monto: number; renglon: string;
  despachoId: number; despacho: string; clientes: string; facturas: string;
}
interface Gasto {
  id: number; fecha: string; descripcion: string; monto: number;
  medioPago: string; medioPagoLabel: string; notas?: string | null;
  asignado: number; libre: number; asignaciones: Asignacion[];
}
interface Destino {
  despachoId: number; numero: string; fecha: string | null; clientes: string; facturas: string;
  renglones: { nombre: string; montoTotal: number; pagado: number; saldo: number }[];
}

export default function GastosOperativos() {
  const qc = useQueryClient();
  const { esMaster } = useAuth();

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [form, setForm] = useState({ fecha: hoyISO(), descripcion: "", monto: "", medioPago: "EFECTIVO", notas: "" });
  const [error, setError] = useState("");
  const [abierto, setAbierto] = useState<number | null>(null);     // fila expandida
  const [repartir, setRepartir] = useState<Gasto | null>(null);     // gasto en el modal

  const { data, isLoading } = useQuery({
    queryKey: ["gastos-operativos", desde, hasta],
    queryFn: () => gastosOperativosApi.listar({ desde: desde || undefined, hasta: hasta || undefined }),
  });

  const gastos: Gasto[] = data?.gastos ?? [];
  const medios: { key: string; label: string }[] = data?.medios ?? [];
  const t = data?.totales;

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["gastos-operativos"] });
    qc.invalidateQueries({ queryKey: ["gastos-destinos"] });
    qc.invalidateQueries({ queryKey: ["balance"] });
    qc.invalidateQueries({ queryKey: ["control-despachos"] });
  };

  const crear = useMutation({
    mutationFn: () => gastosOperativosApi.crear({
      fecha: form.fecha, descripcion: form.descripcion, monto: Number(form.monto),
      medioPago: form.medioPago, notas: form.notas || undefined,
    }),
    onSuccess: () => {
      refrescar();
      setForm({ fecha: form.fecha, descripcion: "", monto: "", medioPago: form.medioPago, notas: "" });
      setError("");
    },
    onError: (e: any) => setError(e?.response?.data?.error ?? "No se pudo guardar el gasto"),
  });

  const borrar = useMutation({
    mutationFn: ({ id, confirmar }: { id: number; confirmar?: boolean }) => gastosOperativosApi.eliminar(id, confirmar),
    onSuccess: refrescar,
    onError: (e: any, vars) => {
      const d = e?.response?.data;
      if (d?.codigoError === "GASTO_ASIGNADO" && window.confirm(`${d.error}\n\n¿Borrarlo de todos modos?`)) {
        borrar.mutate({ id: vars.id, confirmar: true });
        return;
      }
      setError(d?.error ?? "No se pudo borrar");
    },
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Receipt size={22} color="#1e293b" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Gastos Operativos</h1>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>
        Almuerzos, agua, soldadura, insumos. Primero se carga el pago; después lo repartes entre los renglones del
        balance de las facturas que decidas.
      </p>

      {/* Cifras del período */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
        <Tarjeta titulo="Total gastado" valor={usd(t?.total)} color="#1e293b" borde="#cbd5e1" />
        <Tarjeta titulo="Ya repartido en balances" valor={usd(t?.asignado)} color="#0e7490" borde="#a5f3fc" />
        <Tarjeta titulo="Sin repartir" valor={usd(t?.libre)} color="#b45309" borde="#fde68a" />
      </div>

      {/* Cargar un gasto */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 12 }}>Cargar un gasto</div>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 130px 210px auto", gap: 10, alignItems: "end" }}>
          <div>
            <label style={lbl}>Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>¿En qué se gastó?</label>
            <input value={form.descripcion} placeholder="Ej: 5 kg de soldadura" onChange={(e) => setForm({ ...form, descripcion: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>Monto ($)</label>
            <input type="number" step="0.01" min="0" value={form.monto} placeholder="0.00" onChange={(e) => setForm({ ...form, monto: e.target.value })} style={inp} />
          </div>
          <div>
            <label style={lbl}>¿Con qué se pagó?</label>
            <select value={form.medioPago} onChange={(e) => setForm({ ...form, medioPago: e.target.value })} style={inp}>
              {medios.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <button
            onClick={() => { setError(""); crear.mutate(); }}
            disabled={!form.descripcion.trim() || !(Number(form.monto) > 0) || crear.isPending}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff",
              border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              opacity: !form.descripcion.trim() || !(Number(form.monto) > 0) ? 0.5 : 1,
            }}
          >
            <Plus size={14} /> {crear.isPending ? "Guardando…" : "Registrar"}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inpChico} />
        <span style={{ fontSize: 13, color: "#64748b" }}>Hasta</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inpChico} />
        {(desde || hasta) && (
          <button onClick={() => { setDesde(""); setHasta(""); }} style={{ ...inpChico, cursor: "pointer", border: "none", background: "#f1f5f9", color: "#64748b" }}>
            <X size={12} style={{ verticalAlign: -1 }} /> Limpiar
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{gastos.length} gastos</span>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Cargando…</div>
      ) : (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                {["", "Fecha", "Descripción", "Pagado con", "Monto", "Repartido", "Sin repartir", ""].map((h, i) => (
                  <th key={i} style={{ padding: "9px 10px", color: "#fff", fontWeight: 600, fontSize: 11, textAlign: i >= 4 && i <= 6 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 28, textAlign: "center", color: "#94a3b8" }}>Todavía no hay gastos cargados</td></tr>
              )}
              {gastos.map((g) => {
                const expandido = abierto === g.id;
                return (
                  <Fragment key={g.id}>
                    <tr style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ ...td, width: 28 }}>
                        {g.asignaciones.length > 0 && (
                          <button onClick={() => setAbierto(expandido ? null : g.id)} title="Ver el reparto"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 0 }}>
                            {expandido ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </button>
                        )}
                      </td>
                      <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{fechaCorta(g.fecha)}</td>
                      <td style={{ ...td, fontWeight: 600, color: "#1e293b" }}>
                        {g.descripcion}
                        {g.asignaciones.length > 0 && (
                          <span style={{ marginLeft: 7, fontSize: 10, color: "#0e7490", background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 20, padding: "1px 7px" }}>
                            {g.asignaciones.length} reparto{g.asignaciones.length !== 1 ? "s" : ""}
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: "#475569" }}>{g.medioPagoLabel}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{usd(g.monto)}</td>
                      <td style={{ ...td, textAlign: "right", color: "#0e7490" }}>{g.asignado > 0 ? usd(g.asignado) : "—"}</td>
                      <td style={{ ...td, textAlign: "right", fontWeight: 700, color: g.libre > 0.005 ? "#b45309" : "#16a34a" }}>
                        {g.libre > 0.005 ? usd(g.libre) : "✓"}
                      </td>
                      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                        {esMaster && (
                          <button onClick={() => setRepartir(g)} title="Repartir este gasto en el balance"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#0e7490", marginRight: 5 }}>
                            <Split size={11} /> Repartir
                          </button>
                        )}
                        <button onClick={() => { setError(""); if (window.confirm(`¿Borrar "${g.descripcion}" de ${usd(g.monto)}?`)) borrar.mutate({ id: g.id }); }}
                          title="Borrar gasto"
                          style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                          <Trash2 size={13} color="#ef4444" />
                        </button>
                      </td>
                    </tr>
                    {expandido && g.asignaciones.map((a) => (
                      <tr key={`a${a.id}`} style={{ background: "#f8fafc" }}>
                        <td style={td} />
                        <td style={td} />
                        <td style={{ ...td, color: "#334155" }} colSpan={2}>
                          <span style={{ color: "#94a3b8" }}>↳</span> {a.despacho} · {a.clientes || "—"}
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.facturas}</div>
                        </td>
                        <td style={{ ...td, color: "#0f172a", fontWeight: 600 }}>{a.renglon}</td>
                        <td style={{ ...td, textAlign: "right", color: "#0e7490", fontWeight: 700 }}>{usd(a.monto)}</td>
                        <td style={td} colSpan={2} />
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {repartir && (
        <ModalRepartir
          gasto={gastos.find((g) => g.id === repartir.id) ?? repartir}
          onCerrar={() => setRepartir(null)}
          onCambio={refrescar}
        />
      )}
    </div>
  );
}

// ─── Modal: repartir un gasto entre renglones del balance ────────────────────

function ModalRepartir({ gasto, onCerrar, onCambio }: { gasto: Gasto; onCerrar: () => void; onCambio: () => void }) {
  const qc = useQueryClient();
  const [despachoId, setDespachoId] = useState<number | "">("");
  const [renglon, setRenglon] = useState("");
  const [monto, setMonto] = useState("");
  const [error, setError] = useState("");

  const { data: destinos = [] } = useQuery<Destino[]>({
    queryKey: ["gastos-destinos"],
    queryFn: gastosOperativosApi.destinos,
  });

  const destino = destinos.find((d) => d.despachoId === despachoId);
  const renglonElegido = destino?.renglones.find((r) => r.nombre === renglon);

  const refrescarTodo = () => {
    qc.invalidateQueries({ queryKey: ["gastos-operativos"] });
    qc.invalidateQueries({ queryKey: ["gastos-destinos"] });
    onCambio();
  };

  const asignar = useMutation({
    mutationFn: () => gastosOperativosApi.asignar(gasto.id, { ordenDespachoId: Number(despachoId), renglon, monto: Number(monto) }),
    onSuccess: () => { refrescarTodo(); setMonto(""); setRenglon(""); setError(""); },
    onError: (e: any) => setError(e?.response?.data?.error ?? "No se pudo repartir"),
  });

  const quitar = useMutation({
    mutationFn: (asignacionId: number) => gastosOperativosApi.desasignar(asignacionId),
    onSuccess: refrescarTodo,
    onError: (e: any) => setError(e?.response?.data?.error ?? "No se pudo quitar"),
  });

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "min(720px, 96vw)", maxHeight: "90vh", overflowY: "auto", padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Repartir el gasto</h3>
          <button onClick={onCerrar} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
          {gasto.descripcion} · {usd(gasto.monto)} · {gasto.medioPagoLabel}
          <b style={{ color: gasto.libre > 0.005 ? "#b45309" : "#16a34a", marginLeft: 8 }}>
            {gasto.libre > 0.005 ? `quedan ${usd(gasto.libre)} sin repartir` : "repartido completo"}
          </b>
        </p>

        {/* Lo ya repartido */}
        {gasto.asignaciones.length > 0 && (
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 16, overflow: "hidden" }}>
            {gasto.asignaciones.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 13px", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
                <div style={{ flex: 1 }}>
                  <b style={{ color: "#1e293b" }}>{a.renglon}</b>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{a.despacho} · {a.clientes || "—"} · {a.facturas}</div>
                </div>
                <b style={{ color: "#0e7490" }}>{usd(a.monto)}</b>
                <button onClick={() => quitar.mutate(a.id)} title="Quitar este reparto"
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }}>
                  <Trash2 size={13} color="#ef4444" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Nuevo reparto */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>Factura / despacho</label>
            <select value={despachoId} onChange={(e) => { setDespachoId(e.target.value ? Number(e.target.value) : ""); setRenglon(""); }} style={inp}>
              <option value="">Elige a cuál se le resta…</option>
              {destinos.map((d) => (
                <option key={d.despachoId} value={d.despachoId}>
                  {d.numero} · {d.clientes || "sin cliente"}{d.facturas ? ` · ${d.facturas}` : ""}
                </option>
              ))}
            </select>
            {destinos.length === 0 && (
              <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>
                No hay despachos con balance generado todavía.
              </div>
            )}
          </div>

          <div>
            <label style={lbl}>Renglón del balance</label>
            <select value={renglon} onChange={(e) => setRenglon(e.target.value)} disabled={!destino} style={{ ...inp, opacity: destino ? 1 : 0.6 }}>
              <option value="">{destino ? "Elige el renglón…" : "Primero elige la factura"}</option>
              {destino?.renglones.map((r) => (
                <option key={r.nombre} value={r.nombre}>
                  {r.nombre} — saldo {usd(r.saldo)}
                </option>
              ))}
            </select>
            {renglonElegido && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
                De {usd(renglonElegido.montoTotal)} ya se pagaron {usd(renglonElegido.pagado)}; quedan {usd(renglonElegido.saldo)}.
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "end" }}>
            <div style={{ width: 160 }}>
              <label style={lbl}>Monto a restarle</label>
              <input type="number" step="0.01" min="0" value={monto} placeholder={gasto.libre.toFixed(2)}
                onChange={(e) => setMonto(e.target.value)} style={inp} />
            </div>
            <button onClick={() => setMonto(gasto.libre.toFixed(2))} disabled={gasto.libre <= 0.005}
              style={{ ...btnSec, opacity: gasto.libre <= 0.005 ? 0.5 : 1 }}>
              Todo lo que queda
            </button>
            <button
              onClick={() => { setError(""); asignar.mutate(); }}
              disabled={!despachoId || !renglon || !(Number(monto) > 0) || asignar.isPending}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6, background: "#0e7490", color: "#fff",
                border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                opacity: !despachoId || !renglon || !(Number(monto) > 0) ? 0.5 : 1,
              }}
            >
              <Wallet size={14} /> {asignar.isPending ? "Aplicando…" : "Aplicar al balance"}
            </button>
          </div>

          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 8, padding: "8px 12px", fontSize: 12 }}>
              {error}
            </div>
          )}
          <p style={{ margin: 0, fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
            Lo que apliques baja el saldo de ese renglón en el Balance de Pagos, igual que un abono. Puedes partir el
            mismo gasto entre varias facturas: aplica una parte, elige otra factura y aplica el resto.
          </p>
        </div>
      </div>
    </div>
  );
}

function Tarjeta({ titulo, valor, color, borde }: { titulo: string; valor: string; color: string; borde: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${borde}`, borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 }}>{titulo}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{valor}</div>
    </div>
  );
}

const td: React.CSSProperties = { padding: "9px 10px", verticalAlign: "top" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inp: React.CSSProperties = { width: "100%", padding: "8px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const inpChico: React.CSSProperties = { padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none" };
const btnSec: React.CSSProperties = { padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, background: "#fff", color: "#334155", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" };
