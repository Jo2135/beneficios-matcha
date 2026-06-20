import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tablasApi, despachosApi } from "../api/endpoints";
import { SlidersHorizontal, Lock, KeyRound, RotateCcw, Save, ShieldCheck } from "lucide-react";

// Los campos g2_* se guardan como fracción (0.022 = 2.2%); el resto tal cual.
const esFraccion = (campo: string) => campo.startsWith("g2_");
const toDisplay = (campo: string, raw: number) => (esFraccion(campo) ? raw * 100 : raw);
const toRaw = (campo: string, disp: number) => (esFraccion(campo) ? disp / 100 : disp);
const fmt = (n: number) => Number(n).toLocaleString("es-VE", { maximumFractionDigits: 4 });

export default function TablasGanancias() {
  const { data: pinInfo, isLoading: cargandoPin } = useQuery({ queryKey: ["tablas-pin"], queryFn: tablasApi.pinEstado });
  const [desbloqueado, setDesbloqueado] = useState(false);

  if (cargandoPin) return <div style={{ padding: 40, color: "#94a3b8" }}>Cargando...</div>;

  return (
    <div style={{ padding: 24, maxWidth: 980 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          <SlidersHorizontal size={22} /> Tablas de Ganancias
        </h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
          Modifica los porcentajes y costos usados en la distribución de ganancias. Protegido con clave.
        </p>
      </div>

      {!pinInfo?.configurado ? (
        <ConfigurarPin onListo={() => setDesbloqueado(true)} />
      ) : !desbloqueado ? (
        <DesbloquearPin onOk={() => setDesbloqueado(true)} />
      ) : (
        <Editor />
      )}
    </div>
  );
}

/* ─────────── Configurar PIN por primera vez ─────────── */
function ConfigurarPin({ onListo }: { onListo: () => void }) {
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (pin.length < 4) return setErr("El PIN debe tener al menos 4 dígitos");
    if (pin !== pin2) return setErr("Los PIN no coinciden");
    setSaving(true); setErr("");
    try { await tablasApi.setPin({ pinNuevo: pin }); qc.invalidateQueries({ queryKey: ["tablas-pin"] }); onListo(); }
    catch (e: any) { setErr(e?.response?.data?.error ?? "Error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={cardCentro}>
      <KeyRound size={36} style={{ color: "#7c3aed", marginBottom: 10 }} />
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Crea la clave de acceso</h2>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px", textAlign: "center" }}>
        Es una clave independiente, solo para entrar a modificar los porcentajes de ganancias.
      </p>
      <input type="password" placeholder="Nuevo PIN (mín. 4 dígitos)" value={pin} onChange={(e) => setPin(e.target.value)} style={inSt} />
      <input type="password" placeholder="Repetir PIN" value={pin2} onChange={(e) => setPin2(e.target.value)} style={{ ...inSt, marginTop: 10 }} />
      {err && <div style={errSt}>{err}</div>}
      <button onClick={guardar} disabled={saving} style={{ ...btnPrimary, marginTop: 14, width: "100%" }}>{saving ? "Guardando..." : "Crear clave"}</button>
    </div>
  );
}

/* ─────────── Desbloquear con PIN ─────────── */
function DesbloquearPin({ onOk }: { onOk: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [verificando, setVerificando] = useState(false);

  const entrar = async () => {
    setVerificando(true); setErr("");
    try { await tablasApi.verificarPin(pin); onOk(); }
    catch (e: any) { setErr(e?.response?.data?.error ?? "PIN incorrecto"); }
    finally { setVerificando(false); }
  };

  return (
    <div style={cardCentro}>
      <Lock size={36} style={{ color: "#7c3aed", marginBottom: 10 }} />
      <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Ingresa la clave</h2>
      <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 16px", textAlign: "center" }}>Necesaria para ver y modificar los porcentajes.</p>
      <input type="password" placeholder="PIN" value={pin} autoFocus
        onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} style={inSt} />
      {err && <div style={errSt}>{err}</div>}
      <button onClick={entrar} disabled={verificando || !pin} style={{ ...btnPrimary, marginTop: 14, width: "100%" }}>{verificando ? "Verificando..." : "Entrar"}</button>
    </div>
  );
}

/* ─────────── Editor de tablas ─────────── */
function Editor() {
  const qc = useQueryClient();
  const [ambito, setAmbito] = useState<"global" | "despacho">("global");
  const [despachoId, setDespachoId] = useState<number | null>(null);
  const [cambiarPin, setCambiarPin] = useState(false);

  const { data: despachos = [] } = useQuery({ queryKey: ["despachos"], queryFn: despachosApi.listar });
  const conFactura = (despachos as any[]).filter((d) => d.facturas?.length > 0);

  const usaDespacho = ambito === "despacho" && despachoId;
  const { data, isLoading } = useQuery({
    queryKey: ["tablas", usaDespacho ? despachoId : "global"],
    queryFn: () => tablasApi.listar(usaDespacho ? despachoId! : undefined),
  });

  const guardar = async (campo: string, valorRaw: number) => {
    await tablasApi.setOverride({ campo, valor: valorRaw, despachoId: usaDespacho ? despachoId : null });
    qc.invalidateQueries({ queryKey: ["tablas"] });
  };
  const restablecer = async (campo: string) => {
    await tablasApi.setOverride({ campo, despachoId: usaDespacho ? despachoId : null, eliminar: true });
    qc.invalidateQueries({ queryKey: ["tablas"] });
  };

  const campos: any[] = data ? Object.values(data.campos) : [];
  const grupos: Record<string, any[]> = {};
  for (const c of campos) { (grupos[c.grupo] ??= []).push(c); }

  return (
    <div>
      {/* Barra de ámbito + PIN */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#16a34a", fontSize: 13, fontWeight: 600 }}>
            <ShieldCheck size={16} /> Acceso desbloqueado
          </span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { setAmbito("global"); }}
              style={{ ...tab, ...(ambito === "global" ? tabActivo : {}) }}>Porcentajes generales (todas)</button>
            <button onClick={() => setAmbito("despacho")}
              style={{ ...tab, ...(ambito === "despacho" ? tabActivo : {}) }}>Una factura específica</button>
          </div>
          {ambito === "despacho" && (
            <select value={despachoId ?? ""} onChange={(e) => setDespachoId(Number(e.target.value) || null)} style={{ ...inSt, width: "auto", marginTop: 0 }}>
              <option value="">— Elegir factura —</option>
              {conFactura.map((d: any) => (
                <option key={d.id} value={d.id}>{d.facturas[0].numero} · {new Date(d.fechaSalida ?? d.creadoEn).toLocaleDateString("es-VE")}</option>
              ))}
            </select>
          )}
          <button onClick={() => setCambiarPin(true)} style={{ ...tab, marginLeft: "auto" }}>Cambiar clave</button>
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginTop: 10 }}>
          {ambito === "global"
            ? "Estás editando los porcentajes que aplican a TODAS las facturas."
            : usaDespacho
              ? "Estás editando solo esta factura. Lo que cambies aquí no afecta a las demás."
              : "Elige una factura arriba para ajustar sus porcentajes individualmente."}
        </div>
      </div>

      {cambiarPin && <ModalCambiarPin onClose={() => setCambiarPin(false)} />}

      {ambito === "despacho" && !usaDespacho ? (
        <div style={{ ...card, padding: 30, textAlign: "center", color: "#94a3b8" }}>Selecciona una factura para ver y editar sus porcentajes.</div>
      ) : isLoading ? (
        <div style={{ padding: 30, color: "#94a3b8" }}>Cargando tablas...</div>
      ) : (
        Object.entries(grupos).map(([grupo, items]) => (
          <div key={grupo} style={{ ...card, marginBottom: 14 }}>
            <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 700, color: "#374151" }}>{grupo}</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fff" }}>
                  {["Concepto", "Por defecto", "Valor actual", ""].map((h) => <th key={h} style={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {items.map((c: any) => (
                  <FilaCampo
                    key={c.campo + (usaDespacho ? "-" + despachoId : "")}
                    c={c} usaDespacho={!!usaDespacho}
                    onGuardar={(v) => guardar(c.campo, v)} onRestablecer={() => restablecer(c.campo)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}

function FilaCampo({ c, usaDespacho, onGuardar, onRestablecer }: any) {
  const dispEfectivo = toDisplay(c.campo, c.efectivo);
  const [val, setVal] = useState(String(dispEfectivo));
  const [busy, setBusy] = useState(false);
  const overrideEnAmbito = usaDespacho ? c.despachoOverride !== null : c.globalOverride !== null;
  const cambiado = Number(val) !== Number(dispEfectivo);

  const run = async (fn: () => Promise<any>, despuesReset?: boolean) => {
    setBusy(true);
    try { await fn(); if (despuesReset) setVal(String(toDisplay(c.campo, c.defaultVal))); }
    catch (e: any) { alert(e?.response?.data?.error ?? "Error"); }
    finally { setBusy(false); }
  };

  return (
    <tr style={{ borderTop: "1px solid #f1f5f9" }}>
      <td style={{ ...td, fontWeight: 500 }}>
        {c.label}
        {overrideEnAmbito && <span style={{ marginLeft: 8, fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>● modificado</span>}
      </td>
      <td style={{ ...td, color: "#94a3b8" }}>{fmt(toDisplay(c.campo, c.defaultVal))} {c.unidad}</td>
      <td style={td}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <input type="number" step="any" value={val} onChange={(e) => setVal(e.target.value)}
            style={{ width: 110, padding: "6px 9px", border: `1px solid ${cambiado ? "#7c3aed" : "#d1d5db"}`, borderRadius: 7, fontSize: 13, outline: "none" }} />
          <span style={{ fontSize: 12, color: "#64748b", width: 34 }}>{c.unidad}</span>
        </span>
      </td>
      <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
        <button disabled={busy || !cambiado || val === "" || isNaN(Number(val))}
          onClick={() => run(() => onGuardar(toRaw(c.campo, Number(val))))}
          style={{ ...btnMini, background: "#16a34a", color: "#fff", opacity: (!cambiado || val === "") ? 0.4 : 1 }}>
          <Save size={12} /> Guardar
        </button>
        {overrideEnAmbito && (
          <button disabled={busy} onClick={() => run(() => onRestablecer(), true)}
            style={{ ...btnMini, background: "#f1f5f9", color: "#64748b", marginLeft: 6 }} title="Volver al valor por defecto">
            <RotateCcw size={12} /> Restablecer
          </button>
        )}
      </td>
    </tr>
  );
}

function ModalCambiarPin({ onClose }: { onClose: () => void }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (nuevo.length < 4) return setErr("El nuevo PIN debe tener al menos 4 dígitos");
    setSaving(true); setErr("");
    try { await tablasApi.setPin({ pinActual: actual, pinNuevo: nuevo }); onClose(); }
    catch (e: any) { setErr(e?.response?.data?.error ?? "Error"); }
    finally { setSaving(false); }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={{ ...cardCentro, width: 360 }} onClick={(e) => e.stopPropagation()}>
        <KeyRound size={30} style={{ color: "#7c3aed", marginBottom: 8 }} />
        <h2 style={{ margin: "0 0 14px", fontSize: 17 }}>Cambiar clave</h2>
        <input type="password" placeholder="PIN actual" value={actual} onChange={(e) => setActual(e.target.value)} style={inSt} />
        <input type="password" placeholder="Nuevo PIN" value={nuevo} onChange={(e) => setNuevo(e.target.value)} style={{ ...inSt, marginTop: 10 }} />
        {err && <div style={errSt}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, width: "100%" }}>
          <button onClick={onClose} style={{ ...btnMini, background: "#f1f5f9", color: "#64748b", flex: 1, justifyContent: "center", padding: "9px" }}>Cancelar</button>
          <button onClick={guardar} disabled={saving} style={{ ...btnPrimary, flex: 1 }}>{saving ? "..." : "Guardar"}</button>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" };
const cardCentro: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 28, maxWidth: 380, margin: "40px auto", display: "flex", flexDirection: "column", alignItems: "center" };
const inSt: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const errSt: React.CSSProperties = { color: "#dc2626", fontSize: 12, marginTop: 8, alignSelf: "flex-start" };
const btnPrimary: React.CSSProperties = { background: "#7c3aed", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnMini: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const tab: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#64748b", padding: "7px 12px" };
const tabActivo: React.CSSProperties = { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" };
const th: React.CSSProperties = { padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "9px 16px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const overlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 };
