import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { despachosApi } from "../api/endpoints";
import { ArrowLeft, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const usd = (n: number) => `$${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CAT_LABELS: Record<string, string> = {
  manguera34: "Manguera 3/8\" – 3/4\"",
  manguera13: "Manguera 1\" – 3\"",
  azul:       "Tubo Azul / Manguera Azul",
  negro:      "Tubo Negro Eléctrico",
  blanco:     "Tubo Blanco Eléctrico",
  amarillo:   "Tubo PEAD / Aguas Negras",
  gris:       "Tubo Gris Agua Blanca",
  negro_elec: "Tubo Negro Eléctrico",
  blanco_elec:"Tubo Blanco Eléctrico",
  manguera34_gan: "Manguera 3/8\"–3/4\"",
  manguera13_gan: "Manguera 1\"–3\"",
};

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function GananciasDespacho() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const despachoId = Number(id);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["ganancias-despacho", despachoId],
    queryFn: () => despachosApi.calcularGanancias(despachoId),
    enabled: !!despachoId,
  });

  const updateServicio = useMutation({
    mutationFn: ({ lineaId, esServicioExterno, costoServicioExterno }: any) =>
      despachosApi.actualizarServicioExterno(lineaId, { esServicioExterno, costoServicioExterno }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ganancias-despacho", despachoId] }),
  });

  // Costos de servicio externo editables en local antes de guardar
  const [costosSE, setCostosSE] = useState<Record<number, string>>({});

  if (isLoading) return <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Calculando distribución...</div>;
  if (isError || !data)
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <div style={{ color: "#ef4444", marginBottom: 12 }}>Error al calcular ganancias</div>
        <button onClick={() => navigate("/despachos")} style={btnSec}>Volver a Despachos</button>
      </div>
    );

  const d = data as any;
  const hayCurvas = d.curvas.totalVenta > 0;
  const hayPEAD   = d.gananciaAguasNegras.total > 0;
  const hayMateria = Object.values(d.costoMateria as Record<string, { kg: number }>)
    .some((v) => typeof v === "object" && v.kg > 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "'Segoe UI', sans-serif" }}>

      {/* HEADER */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => navigate("/despachos")} style={btnIcono}>
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#1e293b" }}>
            Distribución de Ganancias — {d.despacho.numero}
          </h1>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
            Total factura: <strong style={{ color: "#16a34a" }}>{usd(d.facturaTotal)}</strong>
          </div>
        </div>
        <button onClick={() => refetch()} style={{ ...btnSec, marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <RefreshCw size={14} /> Recalcular
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

        {/* ── COLUMNA IZQUIERDA ────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Productos del despacho */}
          <Section titulo="Productos del Despacho">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  {["Producto", "Cant.", "Kg/u", "Total Kg", "Categoría detectada", "Serv. Externo"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(d.lineas as any[]).map((linea: any, i: number) => (
                  <tr key={linea.id} style={{ background: i % 2 === 0 ? "#fff" : "#f8fafc" }}>
                    <td style={td}>
                      <div style={{ fontSize: 12, color: "#374151" }}>{linea.nombre} {linea.medida}</div>
                      {linea.codigo && <code style={{ fontSize: 10, color: "#7c3aed" }}>{linea.codigo}</code>}
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>{linea.cantidad}</td>
                    <td style={{ ...td, textAlign: "right" }}>{linea.pesoUnitKg > 0 ? linea.pesoUnitKg.toFixed(3) : "—"}</td>
                    <td style={{ ...td, textAlign: "right", fontWeight: 600 }}>{linea.totalKg > 0 ? linea.totalKg.toFixed(2) : "—"}</td>
                    <td style={{ ...td }}>
                      <CatBadge label={linea.catDetectada} curvaKey={linea.curvaKey} esPead={linea.esPead} />
                    </td>
                    <td style={{ ...td, textAlign: "center" }}>
                      {linea.elegibleServicio ? (
                        <ServicioExternoToggle
                          linea={linea}
                          costoLocal={costosSE[linea.id] ?? String(linea.costoServicioExterno || "")}
                          onCostoChange={(v) => setCostosSE(prev => ({ ...prev, [linea.id]: v }))}
                          onSave={(esActivo, costo) =>
                            updateServicio.mutate({ lineaId: linea.id, esServicioExterno: esActivo, costoServicioExterno: costo })
                          }
                        />
                      ) : (
                        <span style={{ fontSize: 11, color: "#cbd5e1" }}>N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* Costos de materia prima */}
          <Section titulo="Costos de Materia Prima">
            {(["manguera34", "manguera13", "azul", "gris", "negro", "blanco", "amarillo"] as const).map((cat) => {
              const item = d.costoMateria[cat];
              const kg = item?.kg ?? 0;
              return (
                <FilaCosto
                  key={cat}
                  label={CAT_LABELS[cat] || cat}
                  valor={kg > 0 ? usd(item.costo) : "—"}
                  detalle={kg > 0 ? `${kg.toFixed(2)} kg` : undefined}
                  dim={kg === 0}
                />
              );
            })}
            {hayCurvas && (
              <FilaCosto label="Curvas (material)" valor={usd(d.curvas.costoMaterial ?? 0)} />
            )}
            {!hayMateria && !hayCurvas && (
              <div style={{ padding: "10px 16px", fontSize: 12, color: "#94a3b8" }}>
                Sin materia prima detectada — revisa categorías en tabla de productos
              </div>
            )}
            <FilaCostoTotal label="Total Materia Prima" valor={usd(d.costoMateria.total ?? 0)} />
          </Section>

          {/* Gastos generales */}
          <Section titulo={`Gastos Generales (base ${usd(d.facturaTotal)})`}>
            <FilaCosto label="Obreros"              valor={usd(d.gastos.obreros)} />
            <FilaCosto label="Pigmento"             valor={usd(d.gastos.pigmento)} />
            <FilaCosto label="Electricidad y Gasoil" valor={usd(d.gastos.electricidad)} />
            <FilaCostoTotal label="Total Gastos" valor={usd(d.gastos.total)} />
          </Section>

          {/* Curvas (siempre visible) */}
          <Section titulo="Distribución Curvas Eléctricas">
            {!hayCurvas ? (
              <div style={{ padding: "10px 16px", fontSize: 12, color: "#94a3b8" }}>
                Sin curvas en este despacho
              </div>
            ) : (
              <>
                {(d.curvas.detalle as any[]).map((c: any) => (
                  <FilaCosto key={c.clave} label={`${c.clave} × ${c.cantidad}`} valor={usd(c.subtotal)} detalle={`$${c.costoUnit}/u`} />
                ))}
                <div style={{ borderTop: "1px solid #f1f5f9" }}>
                  <PagoLinea label="Pago Fábrica" monto={d.curvas.pagoFabrica} color="#dc2626" />
                  <PagoLinea label="Pago Muchachas" monto={d.curvas.pagoMuchachas} color="#d97706" />
                  <PagoLinea label="Ganancia Sr. Alberto (Curvas)" monto={d.curvas.gananciaAlberto} color="#16a34a" />
                </div>
              </>
            )}
          </Section>

        </div>

        {/* ── COLUMNA DERECHA ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Ganancia General (I25 / I26) */}
          <Section titulo="Ganancia General (Mangueras + Eléctrica + Agua Blanca)">
            <div style={{ padding: "8px 12px", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>Desglose por categoría</div>
              {(d.gananciaGeneral.desglose as any[]).filter((g: any) => g.kg > 0).map((g: any) => (
                <div key={g.cat} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", padding: "2px 0" }}>
                  <span>{CAT_LABELS[g.cat] || g.cat} ({g.kg.toFixed(2)} kg × ${g.rate})</span>
                  <span>{usd(g.ganancia)}</span>
                </div>
              ))}
              {d.gananciaGeneral.total === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Sin productos en estas categorías</div>
              )}
            </div>
            <div style={{ borderTop: "1px solid #e2e8f0" }}>
              <PagoLinea label="Sr. Alberto Gral (60%)" monto={d.gananciaGeneral.srAlbertoGral} color="#16a34a" badge="I25" />
              <PagoLinea label="Capital (40%)"           monto={d.gananciaGeneral.capital}       color="#2563eb" badge="I26" />
            </div>
          </Section>

          {/* Ganancia Aguas Negras (H47) */}
          <Section titulo="Ganancia Tuberías Aguas Negras (PEAD)">
            {!hayPEAD && (
              <div style={{ padding: "12px 16px", fontSize: 13, color: "#94a3b8" }}>
                Sin tuberías PEAD en este despacho
              </div>
            )}
            {hayPEAD && (
              <>
                <div style={{ padding: "8px 12px 4px", fontSize: 12, color: "#64748b" }}>
                  Total base: {usd(d.gananciaAguasNegras.total)} — H47
                </div>
                <PagoLinea label="Sr. Alberto Amarillo" monto={d.gananciaAguasNegras.srAlbertoAmarillo} color="#16a34a" />
                <PagoLinea label="Danny Amarillo"       monto={d.gananciaAguasNegras.dannyAmarillo}      color="#7c3aed" />
                <PagoLinea label="Darwin Amarillo"      monto={d.gananciaAguasNegras.darwinAmarillo}     color="#d97706" />
              </>
            )}
          </Section>

          {/* Ganancias_2 — % sobre factura */}
          <Section titulo="Porcentajes sobre Factura Total">
            <div style={{ padding: "4px 12px 8px", fontSize: 12, color: "#64748b" }}>
              Base: {usd(d.facturaTotal)} — fórmula: x − x / (1 + %)
            </div>
            <PagoLinea label="SBUG"       monto={d.ganancias2.sbug}       color="#dc2626" />
            <PagoLinea label="Yolanda"    monto={d.ganancias2.yolanda}    color="#d97706" />
            <PagoLinea label="Sandra"     monto={d.ganancias2.sandra}     color="#d97706" />
            <PagoLinea label="Comisiones" monto={d.ganancias2.comisiones} color="#7c3aed" />
          </Section>

          {/* Comisiones vendedores */}
          {(d.comisionesVendedores?.detalle?.length ?? 0) > 0 && (
            <Section titulo="Comisiones Vendedores">
              {(d.comisionesVendedores.detalle as any[]).map((c: any, i: number) => (
                <PagoLinea
                  key={i}
                  label={`${c.nombre} (${c.pct}%)`}
                  monto={c.monto}
                  color="#0891b2"
                  detalle={`Base: ${usd(c.base)}`}
                />
              ))}
            </Section>
          )}

          {/* Servicios externos activos */}
          {(d.servicioExterno as any[]).length > 0 && (
            <Section titulo="Servicios Externos de Fabricación">
              {(d.servicioExterno as any[]).map((s: any) => (
                <PagoLinea key={s.lineaId} label={`Mano de obra — ${s.nombre}`} monto={s.costo} color="#0891b2" />
              ))}
            </Section>
          )}

          {/* Extra de Material (fondo reserva) */}
          {d.extraMaterial !== undefined && (
            <Section titulo="Extra de Material — Fondo Reserva">
              <div style={{ padding: "16px", textAlign: "center" }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: d.extraMaterial >= 0 ? "#16a34a" : "#dc2626" }}>
                  {usd(d.extraMaterial)}
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>
                  Diferencia entre venta total y gastos + ganancias distribuidas
                </div>
              </div>
            </Section>
          )}

          {/* Resumen total de pagos */}
          <ResumenTotal data={d} />

        </div>
      </div>
    </div>
  );
}

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────

function ServicioExternoToggle({ linea, costoLocal, onCostoChange, onSave }: {
  linea: any; costoLocal: string; onCostoChange: (v: string) => void;
  onSave: (activo: boolean, costo: number) => void;
}) {
  const activo = linea.esServicioExterno;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <button
        title={activo ? "Desactivar servicio externo" : "Activar servicio externo"}
        onClick={() => {
          if (activo) {
            onSave(false, 0);
          } else {
            onSave(true, Number(costoLocal) || 0);
          }
        }}
        style={{ background: "none", border: "none", cursor: "pointer", color: activo ? "#16a34a" : "#94a3b8", padding: 2 }}
      >
        {activo ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
      </button>
      {activo && (
        <input
          type="number"
          value={costoLocal}
          onChange={(e) => onCostoChange(e.target.value)}
          onBlur={() => onSave(true, Number(costoLocal) || 0)}
          placeholder="$0"
          style={{ width: 72, padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, textAlign: "right" }}
        />
      )}
    </div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
        {titulo}
      </div>
      {children}
    </div>
  );
}

function CatBadge({ label, curvaKey, esPead }: { label: string; curvaKey?: string | null; esPead?: boolean }) {
  const colors: Record<string, string> = {
    manguera34: "#16a34a", manguera13: "#15803d",
    azul: "#2563eb", gris: "#64748b",
    negro_elec: "#374151", blanco_elec: "#7c3aed",
    "pead/aguas negras": "#d97706", pead: "#d97706",
  };
  const bg = label.startsWith("curva:") ? "#e0f2fe"
    : esPead ? "#fef3c7"
    : colors[label] ? `${colors[label]}18`
    : "#f1f5f9";
  const fg = label.startsWith("curva:") ? "#0369a1"
    : esPead ? "#92400e"
    : colors[label] ?? "#475569";
  return (
    <span style={{ fontSize: 10, background: bg, color: fg, padding: "2px 7px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap" }}>
      {label === "—" ? <span style={{ color: "#cbd5e1" }}>sin categoría</span> : label}
    </span>
  );
}

function FilaCosto({ label, valor, detalle, dim }: { label: string; valor: string; detalle?: string; dim?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 16px", borderBottom: "1px solid #f1f5f9", opacity: dim ? 0.4 : 1 }}>
      <span style={{ fontSize: 13, color: "#475569" }}>{label}{detalle && <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>({detalle})</span>}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{valor}</span>
    </div>
  );
}

function FilaCostoTotal({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#374151" }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{valor}</span>
    </div>
  );
}

function PagoLinea({ label, monto, color, badge, detalle }: { label: string; monto: number; color: string; badge?: string; detalle?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 4, height: 28, borderRadius: 2, background: color }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{label}</div>
          {badge && <div style={{ fontSize: 10, color: "#94a3b8" }}>celda {badge}</div>}
          {detalle && <div style={{ fontSize: 10, color: "#94a3b8" }}>{detalle}</div>}
        </div>
      </div>
      <span style={{ fontSize: 16, fontWeight: 800, color }}>{usd(monto)}</span>
    </div>
  );
}

function ResumenTotal({ data: d }: { data: any }) {
  const pagos = [
    { label: "Obreros",                     monto: d.gastos.obreros },
    { label: "Pigmento",                    monto: d.gastos.pigmento },
    { label: "Electricidad y Gasoil",       monto: d.gastos.electricidad },
    { label: "Sr. Alberto Gral",            monto: d.gananciaGeneral.srAlbertoGral },
    { label: "Capital",                     monto: d.gananciaGeneral.capital },
    ...(d.gananciaAguasNegras.total > 0 ? [
      { label: "Sr. Alberto Amarillo",      monto: d.gananciaAguasNegras.srAlbertoAmarillo },
      { label: "Danny Amarillo",            monto: d.gananciaAguasNegras.dannyAmarillo },
      { label: "Darwin Amarillo",           monto: d.gananciaAguasNegras.darwinAmarillo },
    ] : []),
    { label: "SBUG",                        monto: d.ganancias2.sbug },
    { label: "Yolanda",                     monto: d.ganancias2.yolanda },
    { label: "Sandra",                      monto: d.ganancias2.sandra },
    { label: "Comisiones",                   monto: d.ganancias2.comisiones },
    ...(d.curvas.pagoFabrica > 0 ? [
      { label: "Pago Fábrica (Curvas)",     monto: d.curvas.pagoFabrica },
      { label: "Pago Muchachas (Curvas)",   monto: d.curvas.pagoMuchachas },
      { label: "Ganancia Alberto (Curvas)", monto: d.curvas.gananciaAlberto },
    ] : []),
    ...((d.comisionesVendedores?.detalle ?? []) as any[]).map((c: any) => ({
      label: `Comisión ${c.nombre} (${c.pct}%)`, monto: c.monto,
    })),
    ...(d.servicioExterno as any[]).map((s: any) => ({
      label: `Mano de obra — ${s.nombre}`,  monto: s.costo,
    })),
  ];

  const totalPagos = pagos.reduce((s, p) => s + p.monto, 0);
  const extraMat   = d.extraMaterial ?? 0;

  return (
    <div style={{ background: "#1e293b", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", background: "#0f172a", borderBottom: "1px solid #334155", fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>
        Resumen de Todos los Pagos
      </div>
      {pagos.filter(p => p.monto > 0).map((p, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #334155" }}>
          <span style={{ fontSize: 13, color: "#94a3b8" }}>{p.label}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#f8fafc" }}>{usd(p.monto)}</span>
        </div>
      ))}
      {extraMat !== 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #334155", background: extraMat >= 0 ? "#14532d22" : "#7f1d1d22" }}>
          <span style={{ fontSize: 13, color: extraMat >= 0 ? "#4ade80" : "#f87171" }}>Extra de Material (reserva)</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: extraMat >= 0 ? "#4ade80" : "#f87171" }}>{usd(extraMat)}</span>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px" }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc" }}>Total distribuido</span>
        <span style={{ fontSize: 16, fontWeight: 800, color: "#4ade80" }}>{usd(totalPagos + extraMat)}</span>
      </div>
    </div>
  );
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────

const btnIcono: React.CSSProperties = {
  background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
  padding: "8px 10px", cursor: "pointer", display: "flex", alignItems: "center",
};
const btnSec: React.CSSProperties = {
  background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
  padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#475569",
};
const th: React.CSSProperties = { padding: "8px 10px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12, color: "#374151", borderBottom: "1px solid #f1f5f9" };
