import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { controlDespachosApi } from "../api/endpoints";
import { ClipboardList, Wallet, Package, Plus, X, BarChart2, AlertTriangle } from "lucide-react";

const usd = (n: any) =>
  n == null ? "—" : `$${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (raw: any) =>
  raw ? new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function ControlDespachos() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [abonar, setAbonar] = useState<any>(null);      // fila con el form de abono abierto
  const [abMonto, setAbMonto] = useState("");
  const [abFecha, setAbFecha] = useState(hoyISO());
  const [abNotas, setAbNotas] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["control-despachos", desde, hasta],
    queryFn: () => controlDespachosApi.listar({ desde: desde || undefined, hasta: hasta || undefined }),
  });

  const registrarAbono = useMutation({
    mutationFn: () => controlDespachosApi.abonarMaterial(abonar.materialItemId, {
      fecha: abFecha, monto: Number(abMonto), notas: abNotas || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["control-despachos"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      setAbonar(null); setAbMonto(""); setAbNotas(""); setAbFecha(hoyISO());
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo registrar el abono"),
  });

  const filas: any[] = data?.filas ?? [];
  const t = data?.totales;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <ClipboardList size={22} color="#1e293b" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Control de Despachos y Deudas</h1>
      </div>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#64748b" }}>
        Cuánto falta por cobrar y cuánto se debe de materia prima, al día.
      </p>

      {/* Las dos cifras que importan */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 18 }}>
        <div style={{ background: "#fff", border: "1px solid #fecaca", borderLeft: "4px solid #dc2626", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "#991b1b", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <Wallet size={14} /> Por cobrar a clientes
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#dc2626", marginTop: 6 }}>{usd(t?.pendienteFactura)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            de {usd(t?.totalFactura)} facturado · cobrado {usd(t?.abonoFactura)}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #fed7aa", borderLeft: "4px solid #ea580c", borderRadius: 12, padding: "16px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: 0.4 }}>
            <Package size={14} /> Deuda de materia prima
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, color: "#ea580c", marginTop: 6 }}>{usd(t?.deudaMaterial)}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            de {usd(t?.costoMaterial)} en material · abonado {usd(t?.abonoMaterial)}
          </div>
        </div>
      </div>

      {(t?.despachosSinBalance ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "#92400e" }}>
          <AlertTriangle size={14} />
          {t.despachosSinBalance} despacho{t.despachosSinBalance !== 1 ? "s" : ""} sin balance generado: su costo de material aún no cuenta en la deuda. Entra a su Balance y genéralo.
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: "#64748b" }}>Desde</span>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inp} />
        <span style={{ fontSize: 13, color: "#64748b" }}>Hasta</span>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inp} />
        {(desde || hasta) && (
          <button onClick={() => { setDesde(""); setHasta(""); }} style={{ ...inp, cursor: "pointer", color: "#64748b", border: "none", background: "#f1f5f9" }}>
            <X size={12} style={{ verticalAlign: -1 }} /> Limpiar
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#94a3b8" }}>{filas.length} despachos</span>
      </div>

      {isLoading ? (
        <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Cargando…</div>
      ) : (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflowX: "auto", background: "#fff" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: "100%", whiteSpace: "nowrap" }}>
            <thead>
              <tr style={{ background: "#1e293b" }}>
                {["Fecha", "Cliente", "Chofer", "Tuberías", "Conexiones", "Comisión vend.", "Total factura", "Abonado", "Pendiente", "Material", "Abonado mat.", "Deuda mat.", "Danny amarillo", "Muchachas curvas", ""]
                  .map((h, i) => (
                    <th key={i} style={{ padding: "9px 10px", color: "#fff", fontWeight: 600, fontSize: 11, textAlign: i >= 3 && i <= 13 ? "right" : "left" }}>{h}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={15} style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>No hay despachos facturados en este rango</td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.despachoId} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={td}>{fecha(f.fecha)}</td>
                  <td style={{ ...td, fontWeight: 600, color: "#1e293b", whiteSpace: "normal", minWidth: 150 }}>
                    {f.cliente}
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>{f.numero} · {f.facturas.map((x: any) => x.numero).join(", ")}</div>
                  </td>
                  <td style={{ ...td, color: "#64748b" }}>{f.chofer ?? "—"}</td>
                  <td style={tdR}>{usd(f.montoTuberia)}</td>
                  <td style={tdR}>{usd(f.montoConexiones)}</td>
                  <td style={tdR}>{f.comisionVendedor == null ? "—" : usd(f.comisionVendedor)}</td>
                  <td style={{ ...tdR, fontWeight: 700 }}>{usd(f.totalFactura)}</td>
                  <td style={{ ...tdR, color: "#16a34a" }}>{usd(f.abonoFactura)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: Number(f.pendienteFactura) > 0.005 ? "#dc2626" : "#16a34a" }}>
                    {Number(f.pendienteFactura) > 0.005 ? usd(f.pendienteFactura) : "✓"}
                  </td>
                  <td style={tdR}>{f.costoMaterial == null ? <span style={{ color: "#d97706" }}>sin balance</span> : usd(f.costoMaterial)}</td>
                  <td style={{ ...tdR, color: "#16a34a" }}>{f.abonoMaterial == null ? "—" : usd(f.abonoMaterial)}</td>
                  <td style={{ ...tdR, fontWeight: 700, color: Number(f.deudaMaterial) > 0.005 ? "#ea580c" : "#16a34a" }}>
                    {f.deudaMaterial == null ? "—" : Number(f.deudaMaterial) > 0.005 ? usd(f.deudaMaterial) : "✓"}
                  </td>
                  <td style={tdR}>{f.dannyAmarillo == null ? "—" : usd(f.dannyAmarillo)}</td>
                  <td style={tdR}>{f.muchachasCurvas == null ? "—" : usd(f.muchachasCurvas)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                      {f.materialItemId && Number(f.deudaMaterial) > 0.005 && (
                        <button
                          title="Registrar abono al material de este despacho"
                          onClick={() => { setAbonar(f); setAbMonto(""); setAbFecha(hoyISO()); setAbNotas(""); }}
                          style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#c2410c" }}
                        >
                          <Plus size={11} /> Abonar
                        </button>
                      )}
                      <button
                        title="Ver balance del despacho"
                        onClick={() => navigate(`/despachos/${f.despachoId}/balance`)}
                        style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 11, fontWeight: 600, color: "#2563eb" }}
                      >
                        <BarChart2 size={11} /> Balance
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {filas.length > 0 && t && (
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #cbd5e1", fontWeight: 700 }}>
                  <td style={td} colSpan={3}>TOTALES</td>
                  <td style={tdR}>{usd(t.montoTuberia)}</td>
                  <td style={tdR}>{usd(t.montoConexiones)}</td>
                  <td style={tdR}>{usd(t.comisionVendedor)}</td>
                  <td style={tdR}>{usd(t.totalFactura)}</td>
                  <td style={{ ...tdR, color: "#16a34a" }}>{usd(t.abonoFactura)}</td>
                  <td style={{ ...tdR, color: "#dc2626", fontSize: 13 }}>{usd(t.pendienteFactura)}</td>
                  <td style={tdR}>{usd(t.costoMaterial)}</td>
                  <td style={{ ...tdR, color: "#16a34a" }}>{usd(t.abonoMaterial)}</td>
                  <td style={{ ...tdR, color: "#ea580c", fontSize: 13 }}>{usd(t.deudaMaterial)}</td>
                  <td style={tdR}>{usd(t.dannyAmarillo)}</td>
                  <td style={tdR}>{usd(t.muchachasCurvas)}</td>
                  <td style={td} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Modal: abonar material */}
      {abonar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}
          onClick={() => setAbonar(null)}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "min(430px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Abonar a material</h3>
              <button onClick={() => setAbonar(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
              {abonar.numero} · {abonar.cliente} — deuda actual <strong style={{ color: "#ea580c" }}>{usd(abonar.deudaMaterial)}</strong>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={lbl}>Fecha
                <input type="date" value={abFecha} onChange={(e) => setAbFecha(e.target.value)} style={inpFull} />
              </label>
              <label style={lbl}>Monto $
                <input type="number" min="0" step="0.01" value={abMonto} onChange={(e) => setAbMonto(e.target.value)} placeholder="0.00" style={inpFull} />
              </label>
              <label style={lbl}>Nota <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span>
                <input value={abNotas} onChange={(e) => setAbNotas(e.target.value)} placeholder="Referencia, proveedor..." style={inpFull} />
              </label>
              {Number(abMonto) > Number(abonar.deudaMaterial) + 0.005 && (
                <div style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, padding: "7px 10px" }}>
                  El monto supera la deuda de este despacho ({usd(abonar.deudaMaterial)}) — quedará en negativo.
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button onClick={() => setAbonar(null)} style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button
                onClick={() => registrarAbono.mutate()}
                disabled={!(Number(abMonto) > 0) || registrarAbono.isPending}
                style={{ background: "#ea580c", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: Number(abMonto) > 0 ? 1 : 0.5 }}
              >
                {registrarAbono.isPending ? "Registrando…" : "Registrar abono"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none" };
const inpFull: React.CSSProperties = { ...inp, width: "100%", display: "block", marginTop: 3, boxSizing: "border-box" };
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151" };
const td: React.CSSProperties = { padding: "8px 10px", color: "#374151" };
const tdR: React.CSSProperties = { ...td, textAlign: "right" };
