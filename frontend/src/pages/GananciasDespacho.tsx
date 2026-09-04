import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { despachosApi, facturasApi } from "../api/endpoints";
import { ArrowLeft, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

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

  // Costo/proveedor del tubo PVC (gris/amarillo) editable en local
  const updateGris = useMutation({
    mutationFn: ({ lineaId, proveedorGris, costoGrisUnit }: any) =>
      despachosApi.actualizarGris(lineaId, { proveedorGris, costoGrisUnit }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ganancias-despacho", despachoId] }),
  });
  const [costosGris, setCostosGris] = useState<Record<number, string>>({});

  // Ajuste de comisión del vendedor por factura (descuento pactado) — solo MASTER
  const { esMaster } = useAuth();
  const updateComision = useMutation({
    mutationFn: ({ facturaId, tub, conex }: { facturaId: number; tub: number | null; conex: number | null }) =>
      facturasApi.actualizarComisionVendedor(facturaId, { comisionTuberiaPct: tub, comisionConexionesPct: conex }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ganancias-despacho", despachoId] }),
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al guardar el ajuste"),
  });

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
                  {["Producto", "Cant.", "Kg/u", "Total Kg", "Categoría detectada", "Serv. Externo", "Tubo PVC (prov./costo)"].map(h => (
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
                    <td style={{ ...td, textAlign: "center" }}>
                      {(linea.esGrisPVC || linea.esAmarilloPVC) ? (
                        <GrisPvcControl
                          linea={linea}
                          costoLocal={costosGris[linea.id] ?? (linea.costoGrisUnit != null ? String(linea.costoGrisUnit) : "")}
                          onCostoChange={(v) => setCostosGris(prev => ({ ...prev, [linea.id]: v }))}
                          onSave={(proveedorGris, costoGrisUnit) =>
                            updateGris.mutate({ lineaId: linea.id, proveedorGris, costoGrisUnit })
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
            <FilaCosto label={`Obreros${d.gastos.ajustado?.obreros ? " (monto manual de la carga)" : ""}`}              valor={usd(d.gastos.obreros)} />
            <FilaCosto label={`Pigmento${d.gastos.ajustado?.pigmento ? " (monto manual de la carga)" : ""}`}             valor={usd(d.gastos.pigmento)} />
            <FilaCosto label={`Electricidad y Gasoil${d.gastos.ajustado?.electricidad ? " (monto manual de la carga)" : ""}`} valor={usd(d.gastos.electricidad)} />
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

                {/* La venta se parte en DOS: muchachas y fábrica. La ganancia
                    del Sr. Alberto sale de dentro del pago a la fábrica, no
                    encima — mostrarla al mismo nivel hacía parecer que la suma
                    se pasaba de la venta. */}
                <div style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", padding: "9px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#334155" }}>Venta de curvas · se reparte así</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#1e293b" }}>{usd(d.curvas.totalVenta)}</span>
                </div>

                <PagoLinea label="Pago Muchachas" monto={d.curvas.pagoMuchachas} color="#d97706" />
                <PagoLinea label="Pago Fábrica" monto={d.curvas.pagoFabrica} color="#dc2626" />

                <div style={{ paddingLeft: 22, borderLeft: "3px solid #fecaca", marginLeft: 16 }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", padding: "6px 0 2px" }}>
                    Dentro del pago a la fábrica:
                  </div>
                  <FilaCosto label="Material (resina)" valor={usd(d.curvas.costoMaterial)} />
                  <FilaCosto label="Ganancia Sr. Alberto" valor={usd(d.curvas.gananciaAlberto)} />
                </div>

                <div style={{ padding: "8px 16px", fontSize: 11.5, color: "#64748b", background: "#f8fafc", borderTop: "1px solid #f1f5f9" }}>
                  {usd(d.curvas.pagoMuchachas)} + {usd(d.curvas.pagoFabrica)} = {usd(d.curvas.totalVenta)}.
                  La ganancia del Sr. Alberto ya está incluida en el pago a la fábrica.
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
            <PagoLinea
              label="Comisiones"
              monto={d.ganancias2.comisionesConCinco ?? d.ganancias2.comisiones}
              color="#7c3aed"
            />
          </Section>

          {/* Ganancia Conexiones */}
          {d.gananciaConexiones && d.gananciaConexiones.facturado > 0 && (
            <Section titulo="Ganancia Conexiones">
              <div style={{ padding: "6px 12px 8px", fontSize: 12, color: "#64748b" }}>
                Costo de compra con descuento mayorista (5% + se paga 60% del resto). Comisión y flete por cliente.
              </div>
              <FilaCosto label="1 · Facturado conexiones"          valor={usd(d.gananciaConexiones.facturado)} />
              <FilaCosto label="2 · Costo donde Alirio  (−)"       valor={usd(d.gananciaConexiones.costoAlirio)} />
              <FilaCosto label="3 · Descuento 5% → Comisiones (−)" valor={usd(d.gananciaConexiones.cinco)} />
              <FilaCosto label="4 · Comisión vendedor  (−)"        valor={usd(d.gananciaConexiones.comisionVendedor)} />
              <FilaCosto label="5 · Flete  (−)"                    valor={usd(d.gananciaConexiones.flete)} />
              {(d.gananciaConexiones.muchachos ?? 0) > 0 && (
                <FilaCosto label="6 · Muchachos 2%  (−)"           valor={usd(d.gananciaConexiones.muchachos)} />
              )}
              <FilaCosto label={'7 · Codos 2" y 4" interno (−)'}   valor={usd(d.gananciaConexiones.codosInternos)} />
              <PagoLinea label="Ganancia Conexiones" monto={d.gananciaConexiones.ganancia} color="#16a34a" />
              {(d.gananciaConexiones.clientes as any[]).length > 0 && (
                <div style={{ padding: "8px 16px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>Comisión / Flete por cliente</div>
                  {(d.gananciaConexiones.clientes as any[]).map((c: any, i: number) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", padding: "2px 0" }}>
                      <span>{c.cliente} ({usd(c.facturado)})</span>
                      <span>com {c.ccPct}% · flete {c.fcPct}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Redirección de socio a Extra de Material */}
          {(d.socioRedireccion?.detalle?.length ?? 0) > 0 && (
            <Section titulo="Redirección a Extra de Material (Socio Equivalente)">
              <div style={{ padding: "4px 12px 8px", fontSize: 12, color: "#64748b" }}>
                La parte de Ganancias_2 de estos socios va a Extra de Material porque el vendedor ya cobró como vendedor
              </div>
              {(d.socioRedireccion.detalle as any[]).map((r: any, i: number) => (
                <PagoLinea
                  key={i}
                  label={`${r.socio.toUpperCase()} → Extra Material (${r.clienteNombre})`}
                  monto={r.monto}
                  color="#16a34a"
                />
              ))}
            </Section>
          )}

          {/* Flete por cliente */}
          {(d.fletesCliente?.detalle?.length ?? 0) > 0 && (
            <Section titulo="Flete">
              {(d.fletesCliente.detalle as any[]).map((f: any, i: number) => (
                <PagoLinea
                  key={i}
                  label={`Flete — ${f.clienteNombre}`}
                  monto={f.monto}
                  color="#7c3aed"
                  detalle={[
                    f.ftPct > 0 && f.totalTuberia > 0   ? `${f.ftPct}% tub (${usd(f.totalTuberia)})` : "",
                    f.fcPct > 0 && f.totalConexiones > 0 ? `${f.fcPct}% con (${usd(f.totalConexiones)})` : "",
                  ].filter(Boolean).join(" · ")}
                />
              ))}
            </Section>
          )}

          {/* Costo Manguera Verde / Amarilla */}
          {(d.mangueraVerde?.venta ?? 0) > 0 && (
            <Section titulo="Manguera Verde / Amarilla (externa)">
              <div style={{ padding: "4px 12px 8px", fontSize: 12, color: "#64748b" }}>
                Lógica de tubería · solo gana el vendedor · resta flete y SBUG/Yolanda/Sandra/Comisiones
              </div>
              <FilaCosto label="Venta"                 valor={usd(d.mangueraVerde.venta)} />
              <FilaCosto label="Flete  (−)"            valor={usd(d.mangueraVerde.flete)} />
              <FilaCosto label="Comisión vendedor  (−)" valor={usd(d.mangueraVerde.comisionVendedor)} />
              <FilaCosto label="SBUG  (−)"             valor={usd(d.mangueraVerde.sbug)} />
              <FilaCosto label="Yolanda  (−)"          valor={usd(d.mangueraVerde.yolanda)} />
              <FilaCosto label="Sandra  (−)"           valor={usd(d.mangueraVerde.sandra)} />
              <FilaCosto label="Comisiones  (−)"       valor={usd(d.mangueraVerde.comisiones)} />
              <PagoLinea label="Costo Manguera Verde" monto={d.mangueraVerde.costo} color="#16a34a" />
            </Section>
          )}

          {/* Ganancia Muchachos (flete) */}
          {(d.gananciaMuchachos?.detalle?.length ?? 0) > 0 && (
            <Section titulo="Ganancia Muchachos (equipo de flete)">
              <div style={{ padding: "4px 12px 8px", fontSize: 12, color: "#64748b" }}>
                Pago extra independiente sobre toda la venta del vendedor · fórmula x − x/(1+%)
              </div>
              {(d.gananciaMuchachos.detalle as any[]).map((m: any, i: number) => (
                <PagoLinea
                  key={i}
                  label={`Muchachos — ${m.clienteNombre}`}
                  monto={m.monto}
                  color="#0d9488"
                  detalle={`${m.pct}% sobre ${usd(m.ventaTotal)} · Vendedor: ${m.vendedorNombre}`}
                />
              ))}
            </Section>
          )}

          {/* Comisiones por cliente */}
          {(d.comisionesVendedores?.detalle?.length ?? 0) > 0 && (
            <Section titulo="Comisiones Vendedores">
              {(d.comisionesVendedores.detalle as any[]).map((c: any, i: number) => (
                <div key={i}>
                  <PagoLinea
                    label={`Comisión — ${c.clienteNombre}${c.ajustada ? "  ● ajustada" : ""}`}
                    monto={c.monto}
                    color={c.ajustada ? "#d97706" : "#0891b2"}
                    detalle={[
                      c.ctPct > 0 && c.totalTuberia > 0 ? `${c.ctPct}% tub (${usd(c.totalTuberia)})` : "",
                      c.ccPct > 0 && c.totalConexiones > 0 ? `${c.ccPct}% con (${usd(c.totalConexiones)})` : "",
                      c.ajustada ? `normal: ${c.ctPctNormal}% / ${c.ccPctNormal}%` : "",
                      c.vendedorNombre !== "—" ? `Vendedor: ${c.vendedorNombre}` : "",
                    ].filter(Boolean).join(" · ")}
                  />
                  {esMaster && c.facturaId && (
                    <ComisionAjuste
                      item={c}
                      busy={updateComision.isPending}
                      onSave={(tub, conex) => updateComision.mutate({ facturaId: c.facturaId, tub, conex })}
                      onClear={() => updateComision.mutate({ facturaId: c.facturaId, tub: null, conex: null })}
                    />
                  )}
                </div>
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

// Editor del descuento pactado de comisión (solo MASTER): % distinto solo en esta factura
function ComisionAjuste({ item, busy, onSave, onClear }: {
  item: any; busy: boolean;
  onSave: (tub: number | null, conex: number | null) => void;
  onClear: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [tub, setTub] = useState(String(item.ctPct ?? ""));
  const [conex, setConex] = useState(String(item.ccPct ?? ""));

  if (!abierto) {
    return (
      <div style={{ padding: "2px 16px 8px", display: "flex", gap: 8 }}>
        <button onClick={() => { setTub(String(item.ctPct ?? "")); setConex(String(item.ccPct ?? "")); setAbierto(true); }}
          style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          Ajustar % solo en esta factura
        </button>
        {item.ajustada && (
          <button onClick={onClear} disabled={busy}
            style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            Quitar ajuste (volver a {item.ctPctNormal}% / {item.ccPctNormal}%)
          </button>
        )}
      </div>
    );
  }
  return (
    <div style={{ margin: "0 16px 10px", padding: "8px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>% Tubería</div>
        <input type="number" min="0" max="100" step="0.1" value={tub} onChange={(e) => setTub(e.target.value)}
          style={{ width: 70, padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }} />
      </div>
      <div>
        <div style={{ fontSize: 10, color: "#92400e", fontWeight: 600 }}>% Conexiones</div>
        <input type="number" min="0" max="100" step="0.1" value={conex} onChange={(e) => setConex(e.target.value)}
          style={{ width: 70, padding: "4px 7px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12 }} />
      </div>
      <span style={{ fontSize: 10, color: "#92400e" }}>normal: {item.ctPctNormal}% / {item.ccPctNormal}%</span>
      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button onClick={() => { onSave(tub === "" ? null : Number(tub), conex === "" ? null : Number(conex)); setAbierto(false); }}
          disabled={busy}
          style={{ fontSize: 12, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
          Guardar
        </button>
        <button onClick={() => setAbierto(false)}
          style={{ fontSize: 12, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function GrisPvcControl({ linea, costoLocal, onCostoChange, onSave }: {
  linea: any; costoLocal: string; onCostoChange: (v: string) => void;
  onSave: (proveedor: string | null, costo: number | null) => void;
}) {
  // Amarillo tiene 3 proveedores; gris solo 2 (sin OCC)
  const opciones = linea.esAmarilloPVC
    ? [["casa_del_tubo", "Casa del Tubo"], ["alirio", "Alirio"], ["occ", "OCC"]]
    : [["casa_del_tubo", "Casa del Tubo"], ["alirio", "Alirio"]];
  const prov = linea.proveedorGris ?? "";
  const sugerido = linea.costoGrisSugerido;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <select
        value={prov}
        onChange={(e) => onSave(e.target.value || null, Number(costoLocal) || (linea.costoGrisUnit ?? 0))}
        style={{ width: 118, padding: "3px 4px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 11 }}
      >
        <option value="">— Proveedor —</option>
        {opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input
        type="number" step="0.0001" min="0"
        value={costoLocal}
        onChange={(e) => onCostoChange(e.target.value)}
        onBlur={() => onSave(prov || null, costoLocal === "" ? null : Number(costoLocal) || 0)}
        placeholder="costo/u"
        style={{ width: 78, padding: "3px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 12, textAlign: "right" }}
      />
      {sugerido != null && (Number(costoLocal) || 0) !== Number(sugerido) && (
        <button
          onClick={() => { onCostoChange(String(sugerido)); onSave(prov || linea.proveedorGrisSugerido || null, Number(sugerido)); }}
          title="Usar el último costo cargado para este producto"
          style={{ fontSize: 10, color: "#2563eb", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          usar anterior (${Number(sugerido).toLocaleString("es-VE", { maximumFractionDigits: 4 })})
        </button>
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
    { label: "Comisiones",                   monto: d.ganancias2.comisionesConCinco ?? d.ganancias2.comisiones },
    // El pago a la fábrica NO se lista aparte: es la suma del material más la
    // ganancia del Sr. Alberto, y sumarlo aquí contaría ese dinero dos veces.
    // Así, Muchachas + Material + Alberto da exacto la venta de curvas.
    ...(d.curvas.totalVenta > 0 ? [
      { label: "Pago Muchachas (Curvas)",   monto: d.curvas.pagoMuchachas },
      { label: "Material (Curvas)",         monto: d.curvas.costoMaterial },
      { label: "Ganancia Alberto (Curvas)", monto: d.curvas.gananciaAlberto },
    ] : []),
    ...((d.fletesCliente?.detalle ?? []) as any[]).map((f: any) => ({
      label: `Flete — ${f.clienteNombre}`, monto: f.monto,
    })),
    ...((d.comisionesVendedores?.detalle ?? []) as any[]).map((c: any) => ({
      label: `Comisión — ${c.clienteNombre}`, monto: c.monto,
    })),
    ...((d.gananciaMuchachos?.detalle ?? []) as any[]).map((m: any) => ({
      label: `Muchachos — ${m.clienteNombre}`, monto: m.monto,
    })),
    ...(d.servicioExterno as any[]).map((s: any) => ({
      label: `Mano de obra — ${s.nombre}`,  monto: s.costo,
    })),
    ...(d.gananciaConexiones && d.gananciaConexiones.facturado > 0 ? [
      { label: "Ganancia Conexiones",          monto: d.gananciaConexiones.ganancia },
      { label: "Costo Conexiones (Alirio)",    monto: d.gananciaConexiones.costoAlirio },
      { label: 'Codos 2" y 4" (interno)',      monto: d.gananciaConexiones.codosInternos },
    ] : []),
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
          <div>
            <span style={{ fontSize: 13, color: extraMat >= 0 ? "#4ade80" : "#f87171" }}>Extra de Material (reserva)</span>
            {(d.socioRedireccion?.total ?? 0) > 0 && (
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 1 }}>
                Incluye redireccion socios: {usd(d.socioRedireccion.total)}
              </div>
            )}
          </div>
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
