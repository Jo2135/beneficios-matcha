import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { despachosApi } from "../api/endpoints";
import { Truck, CheckCircle, AlertTriangle, Clock, Package, Download } from "lucide-react";
import { pdfDespacho } from "../utils/pdf";

const ESTADO_DESPACHO: Record<string, { label: string; color: string; icon: any }> = {
  PENDIENTE:  { label: "Pendiente",  color: "#6b7280", icon: Clock },
  EN_RUTA:    { label: "En Ruta",    color: "#2563eb", icon: Truck },
  ENTREGADO:  { label: "Entregado",  color: "#16a34a", icon: CheckCircle },
  PARCIAL:    { label: "Parcial",    color: "#d97706", icon: AlertTriangle },
};

const ESTADO_LINEA: Record<string, { label: string; color: string }> = {
  PENDIENTE:  { label: "Pendiente",  color: "#6b7280" },
  DESPACHADO: { label: "Completo",   color: "#16a34a" },
  FALTO:      { label: "Faltó",      color: "#dc2626" },
  PARCIAL:    { label: "Parcial",    color: "#d97706" },
};

export default function Despachos() {
  const qc = useQueryClient();
  const [despachoId, setDespachoId] = useState<number | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});


  const { data: despachos = [] } = useQuery({
    queryKey: ["despachos"],
    queryFn: despachosApi.listar,
  });

  const { data: despacho } = useQuery({
    queryKey: ["despacho", despachoId],
    queryFn: () => despachosApi.obtener(despachoId!),
    enabled: !!despachoId,
  });

  const abrirDespacho = (id: number) => {
    setDespachoId(id);
    setCantidades({});
  };

  const cerrar = () => {
    setDespachoId(null);
    setCantidades({});
  };

  // Merge: saved DB values + local edits
  const getCantidad = (linea: any): number => {
    if (cantidades[linea.id] !== undefined) return cantidades[linea.id];
    return Number(linea.cantidadDespachada);
  };

  const guardarLineas = useMutation({
    mutationFn: () => {
      const lineas = (despacho?.lineas ?? []).map((l: any) => ({
        id: l.id,
        cantidadDespachada: getCantidad(l),
      }));
      return despachosApi.actualizarLineas(despachoId!, lineas);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["despacho", despachoId] });
      qc.invalidateQueries({ queryKey: ["despachos"] });
      setCantidades({});
    },
  });

  const finalizar = useMutation({
    mutationFn: () => despachosApi.finalizar(despachoId!),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["despachos"] });
      qc.invalidateQueries({ queryKey: ["despacho", despachoId] });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      const est = data.estadoDespacho === "PARCIAL" ? "PARCIAL (con faltantes)" : "ENTREGADO";
      alert(`Despacho finalizado como ${est}.\nFactura ${data.factura.numero} generada.`);
      cerrar();
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al finalizar"),
  });

  const hayEdits = Object.keys(cantidades).length > 0;
  const yaFinalizado = despacho?.estado === "ENTREGADO";
  const clienteNombre =
    despacho?.lineas?.[0]?.cotizacion?.cliente?.nombre ?? "—";

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Despachos</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{despachos.length} órdenes registradas</p>
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Número", "Cliente", "Chofer / Vehículo", "Estado", "Productos", "Factura", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {despachos.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                  <Package size={32} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
                  No hay despachos — crea uno desde una Cotización Aprobada
                </td>
              </tr>
            )}
            {(despachos as any[]).map((d) => {
              const est = ESTADO_DESPACHO[d.estado];
              const EstIcon = est?.icon;
              const cliente = d.lineas?.[0]?.cotizacion?.cliente?.nombre ?? "—";
              return (
                <tr key={d.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => abrirDespacho(d.id)}>
                  <td style={tdStyle}><span style={{ fontWeight: 700, color: "#2563eb" }}>{d.numero}</span></td>
                  <td style={tdStyle}>{cliente}</td>
                  <td style={tdStyle}>
                    <div style={{ fontSize: 13, color: "#374151" }}>{d.chofer || "—"}</div>
                    {d.vehiculo && <div style={{ fontSize: 11, color: "#94a3b8" }}>{d.vehiculo}</div>}
                  </td>
                  <td style={tdStyle}>
                    <span style={{ ...badge, color: est?.color, background: est?.color + "18", display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {EstIcon && <EstIcon size={11} />} {est?.label}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b" }}>{d.lineas?.length ?? 0} líneas</td>
                  <td style={tdStyle}>
                    {d.facturas?.length > 0
                      ? <span style={{ ...badge, color: "#16a34a", background: "#dcfce7" }}>{d.facturas[0].numero}</span>
                      : <span style={{ color: "#94a3b8", fontSize: 12 }}>Pendiente</span>}
                  </td>
                  <td style={tdStyle}><span style={{ fontSize: 12, color: "#94a3b8" }}>Ver →</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal de detalle / edición */}
      {despachoId && despacho && (
        <div style={modalOverlay} onClick={cerrar}>
          <div style={{ ...modalBox, width: "min(860px, 98vw)" }} onClick={(e) => e.stopPropagation()}>
            {/* Header modal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{despacho.numero}</h2>
                  <span style={{ ...badge, color: ESTADO_DESPACHO[despacho.estado]?.color, background: ESTADO_DESPACHO[despacho.estado]?.color + "18" }}>
                    {ESTADO_DESPACHO[despacho.estado]?.label}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Cliente: <strong>{clienteNombre}</strong>
                  {despacho.chofer && <> · Chofer: <strong>{despacho.chofer}</strong></>}
                  {despacho.vehiculo && <> · <span style={{ color: "#94a3b8" }}>{despacho.vehiculo}</span></>}
                </div>
              </div>
              <button onClick={cerrar} style={btnClose}>✕</button>
            </div>

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              {despacho.facturas?.length > 0 && (
                <div style={{ flex: 1, background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#166534" }}>
                  ✓ Factura generada: <strong>{despacho.facturas[0].numero}</strong>
                </div>
              )}
              <button
                onClick={() => pdfDespacho(despacho)}
                style={{ ...btnAction, background: "#f1f5f9", color: "#475569" }}
              >
                <Download size={14} /> Manifiesto PDF
              </button>
            </div>

            {/* Tabla de líneas */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={thStyle}>Producto</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Pedido</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Despachado</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Faltante</th>
                    <th style={{ ...thStyle, textAlign: "center" }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(despacho.lineas ?? []).map((l: any) => {
                    const cantDesp = getCantidad(l);
                    const cantPedida = Number(l.cantidadPedida);
                    const faltante = Math.max(0, cantPedida - cantDesp);
                    const editado = cantidades[l.id] !== undefined;

                    // Determinar estado visual en tiempo real
                    let estLinea = "PENDIENTE";
                    if (cantDesp === 0) estLinea = "FALTO";
                    else if (cantDesp >= cantPedida) estLinea = "DESPACHADO";
                    else if (cantDesp > 0) estLinea = "PARCIAL";

                    const colorLinea = ESTADO_LINEA[estLinea]?.color;

                    return (
                      <tr key={l.id} style={{ borderBottom: "1px solid #f1f5f9", background: editado ? "#fffbeb" : "transparent" }}>
                        <td style={tdStyle}>
                          <div style={{ fontWeight: 600, color: "#1e293b" }}>{l.producto?.nombre}</div>
                          {l.producto?.medida && <div style={{ fontSize: 11, color: "#94a3b8" }}>{l.producto.medida}</div>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }}>{cantPedida}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {yaFinalizado ? (
                            <span style={{ fontWeight: 700, color: colorLinea }}>{Number(l.cantidadDespachada)}</span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              max={cantPedida * 2}
                              value={cantDesp}
                              onChange={(e) => setCantidades((prev) => ({ ...prev, [l.id]: Math.max(0, Number(e.target.value)) }))}
                              style={inputCant}
                            />
                          )}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ fontWeight: faltante > 0 ? 700 : 400, color: faltante > 0 ? "#dc2626" : "#94a3b8" }}>
                            {faltante > 0 ? faltante : "—"}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ ...badge, color: colorLinea, background: colorLinea + "18" }}>
                            {ESTADO_LINEA[estLinea]?.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Acciones */}
            {!yaFinalizado && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid #f1f5f9" }}>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  {hayEdits ? "Hay cambios sin guardar" : "Modifica las cantidades despachadas por producto"}
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => guardarLineas.mutate()}
                    disabled={!hayEdits || guardarLineas.isPending}
                    style={{ ...btnAction, background: "#dbeafe", color: "#1d4ed8", opacity: !hayEdits ? 0.4 : 1 }}
                  >
                    {guardarLineas.isPending ? "Guardando..." : "Guardar Cambios"}
                  </button>
                  <button
                    onClick={() => {
                      if (hayEdits) {
                        const ok = window.confirm("Hay cambios sin guardar. ¿Finalizar de todas formas?\n(Se usarán los valores guardados)");
                        if (!ok) return;
                      }
                      if (!window.confirm("¿Finalizar el despacho y generar la factura con las cantidades despachadas?")) return;
                      finalizar.mutate();
                    }}
                    disabled={finalizar.isPending}
                    style={{ ...btnAction, background: "#16a34a", color: "#fff" }}
                  >
                    {finalizar.isPending ? "Finalizando..." : "Finalizar Despacho →"}
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

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const badge: React.CSSProperties = { display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "92vh", overflow: "auto" };
const btnAction: React.CSSProperties = { border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnClose: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#64748b", fontSize: 14 };
const inputCant: React.CSSProperties = { width: 72, padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, textAlign: "center", outline: "none" };
