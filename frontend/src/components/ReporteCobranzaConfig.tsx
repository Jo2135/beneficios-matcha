import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reporteCobranzaApi } from "../api/endpoints";
import { Mail, Send, Eye, Download, CheckCircle2, AlertTriangle, X } from "lucide-react";

/**
 * Reporte semanal de cobranza — sección de Configuración.
 *
 * Los sábados a las 6:00 pm el sistema guarda un Excel con las facturas
 * pendientes por cobrar y lo manda por correo (ver backend/src/lib/reporteCobranza.ts).
 * Aquí se prende/apaga, se eligen los correos y se prueba.
 */

interface Config {
  activo: boolean;
  correos: string[];
  ultimoEnvio: string | null;
  ultimoError: string | null;
  proximoEnvio: string | null;
  smtp: { configurado: boolean; usuario: string | null };
  carpetaRespaldos: string;
}

const CAMPOS = 3;

const cuando = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-VE", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
    : null;

const normalizar = (lista: string[]) => lista.map((s) => s.trim().toLowerCase()).filter(Boolean).join(",");

export default function ReporteCobranzaConfig() {
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery<Config>({
    queryKey: ["reporte-cobranza"],
    queryFn: reporteCobranzaApi.config,
  });

  const [activo, setActivo] = useState(false);
  const [correos, setCorreos] = useState<string[]>(Array(CAMPOS).fill(""));
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!cfg) return;
    setActivo(cfg.activo);
    const lista = [...cfg.correos];
    while (lista.length < CAMPOS) lista.push("");
    setCorreos(lista);
  }, [cfg]);

  const hayCambios = !!cfg && (activo !== cfg.activo || normalizar(correos) !== cfg.correos.join(","));
  const errorApi = (e: any, porDefecto: string) => e?.response?.data?.error ?? porDefecto;

  const guardar = useMutation({
    mutationFn: () => reporteCobranzaApi.guardar({ activo, correos }),
    onSuccess: (d: Config) => {
      qc.setQueryData(["reporte-cobranza"], d);
      setMensaje({ tipo: "ok", texto: d.activo ? "Guardado. El reporte queda programado." : "Guardado. El reporte está apagado." });
    },
    onError: (e: any) => setMensaje({ tipo: "error", texto: errorApi(e, "No se pudo guardar") }),
  });

  const enviar = useMutation({
    mutationFn: reporteCobranzaApi.enviar,
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["reporte-cobranza"] });
      setMensaje({ tipo: "ok", texto: `Enviado a ${r.destinatarios.join(", ")}. Respaldo guardado en ${r.archivo}` });
    },
    onError: (e: any) => {
      qc.invalidateQueries({ queryKey: ["reporte-cobranza"] });
      setMensaje({ tipo: "error", texto: errorApi(e, "No se pudo enviar el reporte") });
    },
  });

  const verPrevia = useMutation({
    mutationFn: reporteCobranzaApi.vistaPrevia,
    onSuccess: (d: { html: string }) => setPreview(d.html),
    onError: (e: any) => setMensaje({ tipo: "error", texto: errorApi(e, "No se pudo armar la vista previa") }),
  });

  const bajarExcel = useMutation({
    mutationFn: reporteCobranzaApi.excel,
    onSuccess: (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cobranza-${new Date().toLocaleDateString("en-CA")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e: any) => setMensaje({ tipo: "error", texto: errorApi(e, "No se pudo generar el Excel") }),
  });

  const confirmarEnvio = () => {
    if (!cfg) return;
    if (!window.confirm(`Se enviará el reporte AHORA a:\n\n${cfg.correos.join("\n")}\n\n¿Continuar?`)) return;
    setMensaje(null);
    enviar.mutate();
  };

  const proximo = cfg?.proximoEnvio
    ? new Date(cfg.proximoEnvio).getTime() - Date.now() < 60_000 ? "en los próximos minutos" : cuando(cfg.proximoEnvio)
    : "apagado";

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
        <Mail size={18} style={{ color: "#0891b2" }} /> Reporte semanal de cobranza
      </h2>
      <p style={{ margin: "2px 0 16px", color: "#64748b", fontSize: 13 }}>
        Todos los sábados a las 6:00 pm (hora de Venezuela) el sistema guarda un respaldo en Excel de las facturas
        pendientes por cobrar y lo envía por correo.
      </p>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        {isLoading && <div style={{ color: "#94a3b8", fontSize: 13 }}>Cargando…</div>}

        {/* La cuenta que envía */}
        {cfg && !cfg.smtp.configurado && (
          <div style={{ display: "flex", gap: 10, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#92400e", lineHeight: 1.5 }}>
            <AlertTriangle size={17} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <b>Falta la cuenta de correo que envía el reporte.</b> Se configura una sola vez en el archivo{" "}
              <code>backend/.env</code> (líneas <code>SMTP_USER</code> y <code>SMTP_PASS</code>). Mientras tanto, el
              respaldo en Excel sí se guarda cada sábado.
            </div>
          </div>
        )}
        {cfg?.smtp.configurado && (
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "#15803d" }}>
            <CheckCircle2 size={15} /> Los correos salen desde <b>{cfg.smtp.usuario}</b>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} style={{ width: 18, height: 18, cursor: "pointer" }} />
          Enviar el reporte todos los sábados a las 6:00 pm
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {correos.map((c, i) => (
            <div key={i}>
              <label style={labelSt}>Correo {i + 1}</label>
              <input
                type="email"
                value={c}
                placeholder="nombre@correo.com"
                onChange={(e) => setCorreos((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                style={inputSt}
              />
            </div>
          ))}
        </div>

        {cfg && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 22px", fontSize: 12, color: "#475569" }}>
            <span>Próximo envío: <b>{proximo}</b></span>
            <span>Último envío: <b>{cuando(cfg.ultimoEnvio) ?? "nunca"}</b></span>
            <span>Respaldos en: <code style={{ fontSize: 11 }}>{cfg.carpetaRespaldos}</code></span>
          </div>
        )}

        {cfg?.ultimoError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 13px", fontSize: 12, color: "#991b1b", lineHeight: 1.5 }}>
            <b>Último error:</b> {cfg.ultimoError}
          </div>
        )}

        {mensaje && (
          <div style={{
            background: mensaje.tipo === "ok" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${mensaje.tipo === "ok" ? "#bbf7d0" : "#fecaca"}`,
            color: mensaje.tipo === "ok" ? "#166534" : "#991b1b",
            borderRadius: 8, padding: "9px 13px", fontSize: 13, lineHeight: 1.5,
          }}>
            {mensaje.texto}
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button
            onClick={() => { setMensaje(null); guardar.mutate(); }}
            disabled={!hayCambios || guardar.isPending}
            style={{ ...btn, background: "#2563eb", color: "#fff", border: "none", opacity: !hayCambios ? 0.5 : 1 }}
          >
            {guardar.isPending ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={() => verPrevia.mutate()} disabled={verPrevia.isPending} style={btn}>
            <Eye size={14} /> {verPrevia.isPending ? "Armando…" : "Vista previa"}
          </button>
          <button onClick={() => bajarExcel.mutate()} disabled={bajarExcel.isPending} style={btn}>
            <Download size={14} /> {bajarExcel.isPending ? "Generando…" : "Descargar Excel"}
          </button>
          <button
            onClick={confirmarEnvio}
            disabled={hayCambios || !cfg?.correos.length || enviar.isPending}
            title={hayCambios ? "Guarda los cambios primero" : !cfg?.correos.length ? "Agrega al menos un correo" : "Manda el reporte ya, para probar que llega"}
            style={{ ...btn, background: "#ecfeff", borderColor: "#a5f3fc", color: "#0e7490", opacity: hayCambios || !cfg?.correos.length ? 0.5 : 1 }}
          >
            <Send size={14} /> {enviar.isPending ? "Enviando…" : "Enviar ahora"}
          </button>
        </div>
      </div>

      {preview !== null && (
        <div
          onClick={() => setPreview(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "min(1000px, 96vw)", height: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <b style={{ fontSize: 14, color: "#1e293b" }}>Vista previa del correo</b>
              <button onClick={() => setPreview(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
                <X size={18} />
              </button>
            </div>
            <iframe title="Vista previa del reporte" srcDoc={preview} sandbox="" style={{ flex: 1, border: "none", width: "100%" }} />
          </div>
        </div>
      )}
    </div>
  );
}

const labelSt: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 };
const inputSt: React.CSSProperties = { width: "100%", padding: "8px 11px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const btn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8,
  border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
