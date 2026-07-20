import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { pagosVendedorApi, authApi, tasaCambioApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Wallet, Plus, CheckCircle, XCircle, Clock, FileText, Paperclip, Trash2, Camera } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") ?? "http://localhost:5101";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (raw: any) => (raw ? new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const hoyISO = () => new Date().toISOString().slice(0, 10);

// Mismo catálogo que el backend (METODOS_PAGO)
const METODOS: { key: string; label: string; moneda: string }[] = [
  { key: "BINANCE",        label: "Binance",                           moneda: "USDT" },
  { key: "DEPOSITO_USD",   label: "Depósito en dólares",               moneda: "USD" },
  { key: "DEPOSITO_BS",    label: "Depósito en Bs (banco venezolano)", moneda: "BS" },
  { key: "BANESCO_PANAMA", label: "Transferencia Banesco Panamá",      moneda: "USD" },
  { key: "BANCO_COLOMBIA", label: "Depósito banco colombiano",         moneda: "COP" },
  { key: "ZELLE",          label: "Zelle",                              moneda: "USD" },
];
const metodoDe = (key: string) => METODOS.find((m) => m.key === key);
const APROBACION: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  PENDIENTE: { label: "Por aprobar", color: "#d97706", bg: "#fef3c7", icon: Clock },
  APROBADO:  { label: "Aprobado",    color: "#16a34a", bg: "#dcfce7", icon: CheckCircle },
  RECHAZADO: { label: "Rechazado",   color: "#dc2626", bg: "#fee2e2", icon: XCircle },
};

export default function PagosVendedores() {
  const qc = useQueryClient();
  const { esVendedor, puedeEditar } = useAuth();
  const [filtroVendedor, setFiltroVendedor] = useState<number | "">("");

  // Formulario
  const [vendedorId, setVendedorId] = useState<number | "">("");   // solo admin
  const [form, setForm] = useState<any>({ fecha: hoyISO(), metodoPago: "", monto: "", tasa: "", facturaDestinoId: "", observaciones: "" });
  const [comprobante, setComprobante] = useState<File | null>(null);   // imagen/PDF opcional del depósito
  const [resultado, setResultado] = useState<any>(null);
  const [tasasAprobar, setTasasAprobar] = useState<Record<number, string>>({}); // tasa por pago pendiente (Bs/COP)
  const adjuntarRef = useRef<HTMLInputElement>(null);
  const [adjuntarId, setAdjuntarId] = useState<number | null>(null);   // pago al que se anexa desde el historial

  const { data: vendedores = [] } = useQuery({ queryKey: ["vendedores"], queryFn: authApi.listarVendedores, enabled: puedeEditar });
  const { data: tasa } = useQuery({ queryKey: ["tasa-vigente"], queryFn: tasaCambioApi.vigente });
  const { data: pagos = [] } = useQuery({
    queryKey: ["pagos-vendedor", filtroVendedor],
    queryFn: () => pagosVendedorApi.listar(filtroVendedor ? { vendedorId: Number(filtroVendedor) } : undefined),
  });
  const vendedorFacturas = esVendedor ? undefined : (vendedorId || undefined);
  const { data: facturasPend = [] } = useQuery({
    queryKey: ["pagos-vendedor-facturas", vendedorFacturas ?? "yo"],
    queryFn: () => pagosVendedorApi.facturasPendientes(vendedorFacturas as number | undefined),
    enabled: esVendedor || !!vendedorId,
  });

  const metodo = metodoDe(form.metodoPago);
  const esMonedaExtranjera = metodo && (metodo.moneda === "BS" || metodo.moneda === "COP");
  const tasaReferencia = metodo?.moneda === "BS" ? Number(tasa?.bsUSDT ?? 0) : metodo?.moneda === "COP" ? Number(tasa?.copUSDT ?? 0) : 0;
  const usdCalculado = esMonedaExtranjera && Number(form.tasa) > 0 && Number(form.monto) > 0
    ? Number(form.monto) / Number(form.tasa) : 0;

  const crear = useMutation({
    mutationFn: async () => {
      const r = await pagosVendedorApi.crear({
        ...form,
        monto: Number(form.monto),
        tasa: esMonedaExtranjera && puedeEditar ? Number(form.tasa) : undefined,
        facturaDestinoId: form.facturaDestinoId || undefined,
        vendedorId: puedeEditar ? Number(vendedorId) : undefined,
      });
      // El comprobante es opcional: si falla su subida, el pago igual quedó registrado
      if (comprobante && r?.pago?.id) {
        try { await pagosVendedorApi.subirComprobante(r.pago.id, comprobante); }
        catch { alert("El pago se registró, pero no se pudo subir el comprobante. Puedes anexarlo desde el historial."); }
      }
      return r;
    },
    onSuccess: (r: any) => {
      setResultado(r);
      setForm({ fecha: hoyISO(), metodoPago: "", monto: "", tasa: "", facturaDestinoId: "", observaciones: "" });
      setComprobante(null);
      qc.invalidateQueries({ queryKey: ["pagos-vendedor"] });
      qc.invalidateQueries({ queryKey: ["pagos-vendedor-facturas"] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al registrar el pago"),
  });

  const subirComp = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => pagosVendedorApi.subirComprobante(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pagos-vendedor"] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo subir el comprobante"),
  });
  const borrarComp = useMutation({
    mutationFn: (id: number) => pagosVendedorApi.eliminarComprobante(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pagos-vendedor"] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo eliminar el comprobante"),
  });

  const aprobar = useMutation({
    mutationFn: ({ id, tasaAp }: { id: number; tasaAp?: number }) => pagosVendedorApi.aprobar(id, tasaAp),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["pagos-vendedor"] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
      const det = (r.resultado?.asignadas ?? []).map((a: any) => `${a.numero}: ${usd(a.monto)}`).join("\n");
      alert(`Pago aprobado y abonado:\n${det}${r.resultado?.sobrante > 0.005 ? `\nSobrante sin asignar: ${usd(r.resultado.sobrante)}` : ""}`);
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al aprobar"),
  });
  const rechazar = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) => pagosVendedorApi.rechazar(id, motivo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pagos-vendedor"] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al rechazar"),
  });

  const pendientes = (pagos as any[]).filter((p) => p.aprobacion === "PENDIENTE");
  const puedeEnviar = form.metodoPago && Number(form.monto) > 0
    && (!esMonedaExtranjera || esVendedor || Number(form.tasa) > 0)   // admin en Bs/COP debe fijar tasa
    && (esVendedor || vendedorId);

  return (
    <div style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          <Wallet size={22} /> {esVendedor ? "Mis Pagos" : "Pagos de Vendedores"}
        </h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
          {esVendedor
            ? "Registra los depósitos que realizas y revisa su estado. Un administrador los aprueba."
            : "Aprueba los pagos cargados por vendedores o registra pagos directos (sin aprobación)."}
        </p>
      </div>

      {/* Formulario */}
      <div style={{ ...card, padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} /> Registrar pago
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {puedeEditar && (
            <div>
              <label style={lbl}>Vendedor *</label>
              <select style={inSt} value={vendedorId} onChange={(e) => { setVendedorId(Number(e.target.value) || ""); setForm({ ...form, facturaDestinoId: "" }); }}>
                <option value="">— Elegir —</option>
                {(vendedores as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Fecha *</label>
            <input type="date" style={inSt} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </div>
          <div>
            <label style={lbl}>Modo del pago *</label>
            <select style={inSt} value={form.metodoPago} onChange={(e) => setForm({ ...form, metodoPago: e.target.value, tasa: "" })}>
              <option value="">— Elegir —</option>
              {METODOS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Cantidad {metodo ? `(${metodo.moneda})` : ""} *</label>
            <input type="number" min="0" step="0.01" style={inSt} placeholder="0.00" value={form.monto}
              onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </div>
          {esMonedaExtranjera && puedeEditar && (
            <div>
              <label style={lbl}>Tasa ({metodo!.moneda} por USD) *</label>
              <input type="number" min="0" step="0.0001" style={inSt} placeholder={tasaReferencia > 0 ? String(tasaReferencia) : "0.00"} value={form.tasa}
                onChange={(e) => setForm({ ...form, tasa: e.target.value })} />
              <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                {usdCalculado > 0 ? `Equivale a ${usd(usdCalculado)}` : tasaReferencia > 0 ? `Referencia cargada: ${tasaReferencia}` : "Tasa del mercado que manejan"}
              </div>
            </div>
          )}
          {esMonedaExtranjera && esVendedor && (
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <div style={{ fontSize: 11, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px" }}>
                La tasa la fija el administrador al aprobar tu pago.
              </div>
            </div>
          )}
          <div>
            <label style={lbl}>Aplicar a</label>
            <select style={inSt} value={form.facturaDestinoId} onChange={(e) => setForm({ ...form, facturaDestinoId: e.target.value })}>
              <option value="">Automático — pendiente más antigua</option>
              {(facturasPend as any[]).map((f: any) => (
                <option key={f.id} value={f.id}>{f.numero} · {f.cliente?.nombre} · saldo {usd(f.saldoPendiente)}</option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Observaciones</label>
            <input style={inSt} placeholder="Referencia del depósito, banco, comprobante..." value={form.observaciones}
              onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={lbl}>Comprobante del pago <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional — foto o PDF del depósito)</span></label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px dashed #93c5fd", borderRadius: 8, background: "#eff6ff", cursor: "pointer", fontSize: 13, color: "#1d4ed8", fontWeight: 600 }}>
              <Camera size={15} /> {comprobante ? comprobante.name : "Elegir imagen o PDF"}
              <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }}
                onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} />
            </label>
            {comprobante && (
              <button onClick={() => setComprobante(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 12 }}>
                Quitar
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#64748b" }}>
            {esVendedor
              ? "Tu pago quedará como \"Por aprobar\" hasta que un administrador lo confirme."
              : "Al registrarlo se abona de inmediato (más antigua primero; el excedente pasa a la siguiente)."}
          </span>
          <button onClick={() => crear.mutate()} disabled={!puedeEnviar || crear.isPending} style={{ ...btnPrimary, opacity: puedeEnviar ? 1 : 0.5 }}>
            {crear.isPending ? "Registrando..." : "Registrar pago"}
          </button>
        </div>

        {resultado && (
          <div style={{ marginTop: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534" }}>
            {resultado.resultado ? (
              <>
                <strong>Pago abonado:</strong>{" "}
                {(resultado.resultado.asignadas ?? []).map((a: any) => `${a.numero} (${usd(a.monto)})`).join(" · ") || "sin facturas pendientes"}
                {resultado.resultado.sobrante > 0.005 && <> · <strong style={{ color: "#d97706" }}>Sobrante sin asignar: {usd(resultado.resultado.sobrante)}</strong></>}
              </>
            ) : (
              <><strong>Pago registrado.</strong> Quedó "Por aprobar" — un administrador debe confirmarlo para que se abone.</>
            )}
          </div>
        )}
      </div>

      {/* Pendientes de aprobación (solo admin) */}
      {puedeEditar && pendientes.length > 0 && (
        <div style={{ ...card, padding: 18, marginBottom: 18, borderLeft: "4px solid #f59e0b" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>
            Por aprobar ({pendientes.length})
          </div>
          {pendientes.map((p: any) => {
            const esExt = p.moneda === "BS" || p.moneda === "COP";
            const tasaAp = Number(tasasAprobar[p.id]) || 0;
            const usdAprobar = esExt ? (tasaAp > 0 ? Number(p.monto) / tasaAp : 0) : Number(p.montousd ?? p.monto);
            return (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <div style={{ fontSize: 13 }}>
                  <strong>{p.vendedor?.nombre}</strong> · {metodoDe(p.metodoPago)?.label ?? p.metodoPago} · {fecha(p.fecha)}
                  <div style={{ fontSize: 12, color: "#64748b" }}>
                    {Number(p.monto).toLocaleString("es-VE")} {p.moneda}
                    {esExt && <span style={{ color: "#92400e" }}> · fija la tasa para aprobar</span>}
                    {p.observaciones && <> · {p.observaciones}</>}
                    {p.comprobanteUrl && (
                      <> · <a href={`${API_BASE}${p.comprobanteUrl}`} target="_blank" rel="noreferrer" style={{ color: "#1d4ed8", fontWeight: 600 }}>
                        <Paperclip size={11} style={{ verticalAlign: "-1px" }} /> Ver comprobante
                      </a></>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {esExt && (
                    <span style={{ display: "inline-flex", flexDirection: "column", gap: 1 }}>
                      <input type="number" min="0" step="0.0001" placeholder={`Tasa ${p.moneda}/USD`}
                        value={tasasAprobar[p.id] ?? ""}
                        onChange={(e) => setTasasAprobar((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        style={{ width: 120, padding: "6px 9px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }} />
                      <span style={{ fontSize: 10, color: tasaAp > 0 ? "#16a34a" : "#94a3b8" }}>
                        {tasaAp > 0 ? `= ${usd(usdAprobar)}` : "obligatoria"}
                      </span>
                    </span>
                  )}
                  <button
                    onClick={() => { if (confirm(`¿Aprobar y abonar ${usd(usdAprobar)} de ${p.vendedor?.nombre}?`)) aprobar.mutate({ id: p.id, tasaAp: esExt ? tasaAp : undefined }); }}
                    disabled={aprobar.isPending || (esExt && !(tasaAp > 0))}
                    style={{ ...btnMini, background: "#16a34a", color: "#fff", opacity: esExt && !(tasaAp > 0) ? 0.5 : 1 }}>
                    <CheckCircle size={13} /> Aprobar
                  </button>
                  <button onClick={() => { const m = prompt("Motivo del rechazo (opcional):"); if (m !== null) rechazar.mutate({ id: p.id, motivo: m }); }}
                    disabled={rechazar.isPending} style={{ ...btnMini, background: "#fee2e2", color: "#991b1b" }}>
                    <XCircle size={13} /> Rechazar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Historial */}
      <div style={card}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#1e293b" }}>
            {esVendedor ? `Mis depósitos (${(pagos as any[]).length})` : `Historial (${(pagos as any[]).length})`}
          </span>
          {puedeEditar && (
            <select style={{ ...inSt, width: "auto" }} value={filtroVendedor} onChange={(e) => setFiltroVendedor(Number(e.target.value) || "")}>
              <option value="">Todos los vendedores</option>
              {(vendedores as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          )}
        </div>
        {/* input oculto: se dispara desde el botón "Anexar" de cada fila */}
        <input ref={adjuntarRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file && adjuntarId) subirComp.mutate({ id: adjuntarId, file });
            setAdjuntarId(null);
          }} />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Fecha", ...(esVendedor ? [] : ["Vendedor"]), "Modo", "Cantidad", "USD", "Estado", "Abonado a", "Comprobante"].map((h) => <th key={h} style={th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {(pagos as any[]).length === 0 && (
              <tr><td colSpan={esVendedor ? 7 : 8} style={{ ...td, textAlign: "center", padding: 30, color: "#94a3b8" }}>Sin pagos registrados</td></tr>
            )}
            {(pagos as any[]).map((p: any) => {
              const ap = APROBACION[p.aprobacion] ?? APROBACION.PENDIENTE;
              const ApIcon = ap.icon;
              return (
                <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={td}>{fecha(p.fecha)}</td>
                  {!esVendedor && <td style={{ ...td, fontWeight: 600 }}>{p.vendedor?.nombre ?? "—"}</td>}
                  <td style={td}>{metodoDe(p.metodoPago)?.label ?? p.metodoPago ?? "—"}</td>
                  <td style={td}>
                    {Number(p.monto).toLocaleString("es-VE")} {p.moneda}
                    {(p.tasaCambioBs || p.tasaCambioCop) && (
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>tasa {Number(p.tasaCambioBs ?? p.tasaCambioCop).toLocaleString("es-VE")}</div>
                    )}
                  </td>
                  <td style={{ ...td, fontWeight: 600 }}>
                    {p.montousd != null ? usd(p.montousd)
                      : (p.moneda === "BS" || p.moneda === "COP")
                        ? <span style={{ fontSize: 11, color: "#d97706", fontWeight: 600 }}>tasa al aprobar</span>
                        : usd(p.monto)}
                  </td>
                  <td style={td}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: ap.color, background: ap.bg }} title={p.motivoRechazo ?? undefined}>
                      <ApIcon size={11} /> {ap.label}
                    </span>
                    {p.aprobacion === "RECHAZADO" && p.motivoRechazo && (
                      <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>{p.motivoRechazo}</div>
                    )}
                  </td>
                  <td style={td}>
                    {(p.asignaciones ?? []).length === 0 ? (
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{p.aprobacion === "APROBADO" ? "Sin asignar (saldo a favor)" : "—"}</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(p.asignaciones as any[]).map((a: any) => (
                          <span key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 11, background: "#dbeafe", color: "#1d4ed8", borderRadius: 6, padding: "2px 7px" }}>
                            <FileText size={10} /> {a.factura?.numero} · {usd(a.montoAsignado)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={td}>
                    {p.comprobanteUrl ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <a href={`${API_BASE}${p.comprobanteUrl}`} target="_blank" rel="noreferrer" title="Ver comprobante">
                          {p.comprobanteUrl.toLowerCase().endsWith(".pdf") ? (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>
                              <Paperclip size={13} /> PDF
                            </span>
                          ) : (
                            <img src={`${API_BASE}${p.comprobanteUrl}`} alt="Comprobante"
                              style={{ height: 34, width: 48, objectFit: "cover", borderRadius: 5, border: "1px solid #e2e8f0", cursor: "zoom-in", display: "block" }} />
                          )}
                        </a>
                        {puedeEditar && (
                          <button title="Eliminar comprobante"
                            onClick={() => { if (confirm("¿Eliminar el comprobante de este pago?")) borrarComp.mutate(p.id); }}
                            disabled={borrarComp.isPending}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 2 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </span>
                    ) : (
                      <button title="Anexar comprobante (foto o PDF del depósito)"
                        onClick={() => { setAdjuntarId(p.id); adjuntarRef.current?.click(); }}
                        disabled={subirComp.isPending}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px dashed #cbd5e1", borderRadius: 6, padding: "4px 9px", cursor: "pointer", fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                        <Paperclip size={12} /> Anexar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 };
const inSt: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnMini: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, border: "none", padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const th: React.CSSProperties = { padding: "9px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "9px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
