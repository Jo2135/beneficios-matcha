import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { despachosApi, cotizacionesApi, productosApi } from "../api/endpoints";
import { Truck, CheckCircle, AlertTriangle, Clock, Package, Download, Trash2, Search, X, BarChart2, Plus } from "lucide-react";
import { pdfDespacho, pdfDespachoGandica } from "../utils/pdf";
import { useAuth } from "../contexts/AuthContext";

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
  const navigate = useNavigate();
  const { esMaster } = useAuth();
  const [despachoId, setDespachoId] = useState<number | null>(null);
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [busqueda, setBusqueda] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [agregarCotModal, setAgregarCotModal] = useState(false);
  // Agregar un producto que no se habia cotizado (se sumo al camion a ultima hora)
  const [addProdModal, setAddProdModal] = useState(false);
  const [apCotId, setApCotId] = useState<number | "">("");
  const [apBusca, setApBusca] = useState("");
  const [apProd, setApProd] = useState<any>(null);
  const [apCant, setApCant] = useState("");
  const [apPrecio, setApPrecio] = useState("");

  // Gandica PDF modal
  const [gandicaModal, setGandicaModal] = useState(false);
  const [gFechaRef, setGFechaRef] = useState("");
  const [gMes, setGMes] = useState("");
  const [gPrestamo, setGPrestamo] = useState("");
  const [gComision, setGComision] = useState("");
  const [gAbonos, setGAbonos] = useState<{ label: string; monto: string }[]>([
    { label: "Abono Fact Anterior USDT", monto: "" },
  ]);


  const { data: despachos = [] } = useQuery({
    queryKey: ["despachos"],
    queryFn: despachosApi.listar,
  });

  const hayFiltros = busqueda || desde || hasta;
  const despachosFiltrados = useMemo(() => {
    let lista = despachos as any[];
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      lista = lista.filter((d) =>
        d.numero?.toLowerCase().includes(q) ||
        d.chofer?.toLowerCase().includes(q) ||
        (d.clientes ?? []).some((c: string) => c.toLowerCase().includes(q)) ||
        d.lineas?.[0]?.cotizacion?.cliente?.nombre?.toLowerCase().includes(q)
      );
    }
    if (desde) {
      const d = new Date(desde);
      lista = lista.filter((d2) => new Date(d2.creadoEn ?? d2.fechaCreacion ?? 0) >= d);
    }
    if (hasta) {
      const h = new Date(hasta);
      h.setHours(23, 59, 59);
      lista = lista.filter((d2) => new Date(d2.creadoEn ?? d2.fechaCreacion ?? 0) <= h);
    }
    return lista;
  }, [despachos, busqueda, desde, hasta]);

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
    const despachada = Number(linea.cantidadDespachada);
    return despachada > 0 ? despachada : Number(linea.cantidadPedida);
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
    mutationFn: () => {
      const lineas = (despacho?.lineas ?? []).map((l: any) => ({
        id: l.id,
        cantidadDespachada: getCantidad(l),
      }));
      return despachosApi.finalizar(despachoId!, lineas);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["despachos"] });
      qc.invalidateQueries({ queryKey: ["despacho", despachoId] });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      const est = data.estadoDespacho === "PARCIAL" ? "PARCIAL (con faltantes)" : "ENTREGADO";
      const facturas: any[] = data.facturas ?? (data.factura ? [data.factura] : []);
      const numeros = facturas.map((f: any) => f.numero).join(", ");
      alert(`Despacho finalizado como ${est}.\nFactura(s) generada(s): ${numeros}`);
      cerrar();
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al finalizar"),
  });

  const eliminarDesp = useMutation({
    mutationFn: (id: number) => despachosApi.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["despachos"] }); cerrar(); },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al eliminar"),
  });

  // ── Cotizaciones aprobadas disponibles para agregar al despacho ──────────────
  const { data: cotsAprobadas = [] } = useQuery({
    queryKey: ["cotizaciones-aprobadas"],
    queryFn: () => cotizacionesApi.listar({ estado: "APROBADA" }),
    enabled: agregarCotModal,
  });

  const cotIdsEnDespacho = useMemo(
    () => new Set((despacho?.lineas ?? []).map((l: any) => l.cotizacion?.id).filter(Boolean)),
    [despacho]
  );
  const cotsFiltradas = useMemo(
    () => (cotsAprobadas as any[]).filter((c: any) => !cotIdsEnDespacho.has(c.id)),
    [cotsAprobadas, cotIdsEnDespacho]
  );

  const agregarCot = useMutation({
    mutationFn: (cotizacionId: number) => despachosApi.agregarCotizacion(despachoId!, cotizacionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["despacho", despachoId] });
      qc.invalidateQueries({ queryKey: ["despachos"] });
      qc.invalidateQueries({ queryKey: ["cotizaciones"] });
      qc.invalidateQueries({ queryKey: ["cotizaciones-aprobadas"] });
      setAgregarCotModal(false);
    },
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al agregar cotización"),
  });

  const hayEdits = Object.keys(cantidades).length > 0;
  const yaFinalizado = despacho?.estado === "ENTREGADO";
  const clienteNombre = despacho?.lineas?.[0]?.cotizacion?.cliente?.nombre ?? "—";
  const esGandica = clienteNombre.toLowerCase().includes("gandica");

  const { data: productosCat = [] } = useQuery({
    queryKey: ["productos"], queryFn: () => productosApi.listar(), enabled: addProdModal,
  });
  const agregarProducto = useMutation({
    mutationFn: () => despachosApi.agregarLinea(despachoId!, {
      cotizacionId: Number(apCotId), productoId: apProd.id, cantidad: Number(apCant),
      precioUnitario: Number(apPrecio) > 0 ? Number(apPrecio) : undefined,
    }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ["despacho", despachoId] });
      qc.invalidateQueries({ queryKey: ["despachos"] });
      setAddProdModal(false); setApProd(null); setApCant(""); setApPrecio(""); setApBusca("");
      alert(`"${r.producto}" agregado a ${r.cotizacion} a $${Number(r.precio).toFixed(2)}.`);
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo agregar el producto"),
  });

  // Agrupar líneas por cotización para mostrar separadas en la tabla
  const lineasAgrupadas = useMemo(() => {
    const grupos = new Map<number, { cotizacion: any; lineas: any[] }>();
    for (const l of (despacho?.lineas ?? [])) {
      const cotId = l.cotizacion?.id ?? 0;
      if (!grupos.has(cotId)) grupos.set(cotId, { cotizacion: l.cotizacion, lineas: [] });
      grupos.get(cotId)!.lineas.push(l);
    }
    return [...grupos.values()];
  }, [despacho]);

  const generarPdfGandica = () => {
    if (!despacho) return;
    try {
      const cliente = despacho.lineas?.[0]?.cotizacion?.cliente ?? {};
      pdfDespachoGandica({
        lineas: despacho.lineas ?? [],
        cliente,
        fecha: despacho.fechaSalida
          ? new Date(despacho.fechaSalida).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" })
          : undefined,
        fechaRef: gFechaRef || "—",
        mesDespacho: gMes || "—",
        prestamo: gPrestamo ? Number(gPrestamo) : 0,
        comision: gComision ? Number(gComision) : 0,
        abonos: gAbonos
          .filter(a => a.label && a.monto)
          .map(a => ({ label: a.label, monto: Number(a.monto) })),
      });
      setGandicaModal(false);
    } catch (e: any) {
      alert("Error al generar PDF: " + (e?.message ?? String(e)));
    }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Despachos</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
          {hayFiltros ? `${despachosFiltrados.length} de ${(despachos as any[]).length}` : `${(despachos as any[]).length}`} órdenes registradas
        </p>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por número, chofer o cliente..."
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
            {despachosFiltrados.map((d) => {
              const est = ESTADO_DESPACHO[d.estado];
              const EstIcon = est?.icon;
              // Un despacho consolidado lleva varios clientes: se muestran todos
              const listaClientes: string[] = d.clientes ?? (d.lineas?.[0]?.cotizacion?.cliente?.nombre ? [d.lineas[0].cotizacion.cliente.nombre] : []);
              const cliente = listaClientes.length ? listaClientes.join(" · ") : "—";
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
                  <td style={{ ...tdStyle, color: "#64748b" }}>
                    {d.totalLineas ?? d.lineas?.length ?? 0} líneas
                    {listaClientes.length > 1 && (
                      <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>{listaClientes.length} clientes</div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {d.facturas?.length > 0
                      ? <span style={{ ...badge, color: "#16a34a", background: "#dcfce7" }}>{d.facturas[0].numero}</span>
                      : <span style={{ color: "#94a3b8", fontSize: 12 }}>Pendiente</span>}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>Ver →</span>
                      {d.facturas?.length > 0 && (
                        <>
                          <button
                            title="Ver distribución de ganancias"
                            onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${d.id}/ganancias`); }}
                            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 6, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#16a34a" }}
                          >
                            <BarChart2 size={12} /> Ganancias
                          </button>
                          {esMaster && (
                            <button
                              title="Ver balance de pagos"
                              onClick={(e) => { e.stopPropagation(); navigate(`/despachos/${d.id}/balance`); }}
                              style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, color: "#2563eb" }}
                            >
                              <BarChart2 size={12} /> Balance
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal PDF Gandica — zIndex 100 so it renders above the despacho modal */}
      {gandicaModal && (
        <div style={{ ...modalOverlay, zIndex: 100 }} onClick={() => setGandicaModal(false)}>
          <div style={{ ...modalBox, width: "min(520px, 96vw)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>PDF Despacho — Formato Gandica</h3>
              <button onClick={() => setGandicaModal(false)} style={btnClose}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Fecha referencia (título)</label>
                <input value={gFechaRef} onChange={e => setGFechaRef(e.target.value)}
                  placeholder="ej. 27-03"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Mes despacho (resumen)</label>
                <input value={gMes} onChange={e => setGMes(e.target.value)}
                  placeholder="ej. Marzo"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Más Préstamo / Viáticos ($)</label>
                <input type="number" min={0} value={gPrestamo} onChange={e => setGPrestamo(e.target.value)}
                  placeholder="0  (dejar vacío si no aplica)"
                  style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Comisión ($)</label>
                <input type="number" min={0} value={gComision} onChange={e => setGComision(e.target.value)}
                  placeholder="ej. 300"
                  style={inputStyle} />
              </div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ ...labelStyle, display: "block", marginBottom: 8 }}>
                Abonos anteriores
                <button onClick={() => setGAbonos(prev => [...prev, { label: "", monto: "" }])}
                  style={{ marginLeft: 10, fontSize: 12, padding: "2px 10px", background: "#dbeafe", color: "#1d4ed8", border: "none", borderRadius: 6, cursor: "pointer" }}>
                  + Añadir
                </button>
              </label>
              {gAbonos.map((ab, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                  <input value={ab.label} onChange={e => setGAbonos(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                    placeholder="ej. Abono Fact Anterior USDT"
                    style={{ ...inputStyle, flex: 2 }} />
                  <input type="number" min={0} value={ab.monto} onChange={e => setGAbonos(prev => prev.map((x, j) => j === i ? { ...x, monto: e.target.value } : x))}
                    placeholder="Monto"
                    style={{ ...inputStyle, flex: 1 }} />
                  <button onClick={() => setGAbonos(prev => prev.filter((_, j) => j !== i))}
                    style={{ background: "#fee2e2", color: "#991b1b", border: "none", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 13 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setGandicaModal(false)} style={{ ...btnAction, background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
              <button onClick={generarPdfGandica} style={{ ...btnAction, background: "#166534", color: "#fff" }}>
                <Download size={14} /> Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: agregar un producto no cotizado (se sumó al camión a última hora) */}
      {addProdModal && (
        <div style={{ ...modalOverlay, zIndex: 100 }} onClick={() => setAddProdModal(false)}>
          <div style={{ ...modalBox, width: "min(560px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Agregar producto al despacho</h3>
              <button onClick={() => setAddProdModal(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 18 }}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 14 }}>
              Para lo que se sumó a última hora y no estaba cotizado. También se agrega a la cotización del cliente, para que entre en la factura y en la comisión.
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Cliente / cotización
                <select value={apCotId} onChange={(e) => { setApCotId(Number(e.target.value) || ""); setApProd(null); setApPrecio(""); }}
                  style={{ display: "block", marginTop: 3, width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }}>
                  {lineasAgrupadas.map((g: any) => (
                    <option key={g.cotizacion?.id} value={g.cotizacion?.id}>
                      {g.cotizacion?.numero} — {g.cotizacion?.cliente?.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Producto
                <input value={apProd ? `${apProd.nombre} ${apProd.medida}` : apBusca}
                  onChange={(e) => { setApBusca(e.target.value); setApProd(null); }}
                  placeholder="Escribe para buscar..."
                  style={{ display: "block", marginTop: 3, width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
              </label>
              {!apProd && apBusca.length >= 2 && (
                <div style={{ maxHeight: 170, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                  {(productosCat as any[])
                    .filter((p: any) => `${p.codigo ?? ""} ${p.nombre} ${p.medida}`.toLowerCase().includes(apBusca.toLowerCase()))
                    .slice(0, 12)
                    .map((p: any) => (
                      <div key={p.id} onClick={() => { setApProd(p); setApBusca(""); }}
                        style={{ padding: "7px 11px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ fontWeight: 600 }}>{p.nombre}</span>{" "}
                        <span style={{ color: "#64748b" }}>{p.medida}</span>
                        {p.codigo && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>{p.codigo}</span>}
                      </div>
                    ))}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Cantidad despachada
                  <input type="number" min="0" step="0.01" value={apCant} onChange={(e) => setApCant(e.target.value)} placeholder="0"
                    style={{ display: "block", marginTop: 3, width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
                </label>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Precio $ <span style={{ fontWeight: 400, color: "#94a3b8" }}>(vacío = lista)</span>
                  <input type="number" min="0" step="0.0001" value={apPrecio} onChange={(e) => setApPrecio(e.target.value)} placeholder="de la lista"
                    style={{ display: "block", marginTop: 3, width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, boxSizing: "border-box" }} />
                </label>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button onClick={() => setAddProdModal(false)} style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button onClick={() => agregarProducto.mutate()}
                disabled={!apProd || !apCotId || !(Number(apCant) > 0) || agregarProducto.isPending}
                style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!apProd || !apCotId || !(Number(apCant) > 0)) ? 0.5 : 1 }}>
                {agregarProducto.isPending ? "Agregando..." : "Agregar al despacho"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal seleccionar cotización a agregar */}
      {agregarCotModal && (
        <div style={{ ...modalOverlay, zIndex: 100 }} onClick={() => setAgregarCotModal(false)}>
          <div style={{ ...modalBox, width: "min(620px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Agregar Cotización al Despacho</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Cotizaciones aprobadas disponibles</p>
              </div>
              <button onClick={() => setAgregarCotModal(false)} style={btnClose}>✕</button>
            </div>
            {cotsFiltradas.length === 0 ? (
              <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                No hay cotizaciones aprobadas disponibles para agregar
              </div>
            ) : (
              <div style={{ maxHeight: 420, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                {cotsFiltradas.map((c: any) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ fontWeight: 700, color: "#7c3aed", fontSize: 14 }}>{c.numero}</div>
                      <div style={{ fontSize: 13, color: "#374151", marginTop: 2 }}>{c.cliente?.nombre ?? `Cliente #${c.clienteId}`}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>
                        {c.lineas?.length ?? 0} productos · ${Number(c.total ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                    <button
                      onClick={() => agregarCot.mutate(c.id)}
                      disabled={agregarCot.isPending}
                      style={{ ...btnAction, background: "#2563eb", color: "#fff", fontSize: 13 }}
                    >
                      <Plus size={13} /> Agregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                  ✓ {despacho.facturas.length > 1 ? `${despacho.facturas.length} facturas` : `Factura: ${despacho.facturas[0].numero}`}
                  {despacho.facturas.length > 1 && (
                    <span style={{ marginLeft: 6 }}>
                      {despacho.facturas.map((f: any) => f.numero).join(", ")}
                    </span>
                  )}
                </div>
              )}
              <button
                onClick={() => pdfDespacho(despacho)}
                style={{ ...btnAction, background: "#f1f5f9", color: "#475569" }}
              >
                <Download size={14} /> Manifiesto PDF
              </button>
              {!yaFinalizado && (
                <button
                  onClick={() => setAgregarCotModal(true)}
                  style={{ ...btnAction, background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe" }}
                >
                  <Plus size={14} /> Agregar Cotización
                </button>
              )}
              {!yaFinalizado && (
                <button
                  onClick={() => { setAddProdModal(true); setApCotId(lineasAgrupadas[0]?.cotizacion?.id ?? ""); }}
                  title="Sumar un producto que no se había cotizado"
                  style={{ ...btnAction, background: "#f5f3ff", color: "#6d28d9", border: "1px solid #ddd6fe" }}
                >
                  <Plus size={14} /> Agregar Producto
                </button>
              )}
              {esGandica && (
                <button
                  onClick={() => setGandicaModal(true)}
                  style={{ ...btnAction, background: "#dcfce7", color: "#166534" }}
                >
                  <Download size={14} /> PDF Despacho Gandica
                </button>
              )}
            </div>

            {/* Tabla de líneas — agrupadas por cotización */}
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
                  {lineasAgrupadas.map((grupo, gi) => (
                    <React.Fragment key={grupo.cotizacion?.id ?? gi}>
                      {/* Encabezado de grupo — solo si hay más de una cotización */}
                      {lineasAgrupadas.length > 1 && (
                        <tr key={`g-${gi}`}>
                          <td colSpan={5} style={{ padding: "8px 14px", background: "#eff6ff", borderTop: gi > 0 ? "2px solid #bfdbfe" : undefined, fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
                            {grupo.cotizacion?.numero ?? "Sin cotización"} — {grupo.cotizacion?.cliente?.nombre ?? "—"}
                          </td>
                        </tr>
                      )}
                      {grupo.lineas.map((l: any) => {
                        const cantDesp = getCantidad(l);
                        const cantPedida = Number(l.cantidadPedida);
                        const faltante = Math.max(0, cantPedida - cantDesp);
                        const editado = cantidades[l.id] !== undefined;
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
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Eliminar — solo MASTER, no si ya fue entregado */}
            {esMaster && !yaFinalizado && (
              <div style={{ marginTop: 14 }}>
                <button
                  onClick={() => {
                    if (!window.confirm(`¿Eliminar ${despacho.numero} permanentemente?`)) return;
                    eliminarDesp.mutate(despachoId!);
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#fee2e2", color: "#991b1b", border: "none", padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
                >
                  <Trash2 size={14} /> Eliminar Despacho
                </button>
              </div>
            )}

            {/* Acciones — pegadas al fondo: en un despacho de 45 líneas el botón
                de finalizar quedaba tan abajo que parecía que no existía. */}
            {!yaFinalizado && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginTop: 20, paddingTop: 16, paddingBottom: 8, borderTop: "1px solid #e2e8f0",
                position: "sticky", bottom: 0, background: "#fff", zIndex: 5,
                boxShadow: "0 -8px 16px -8px rgba(15,23,42,0.12)",
              }}>
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
const btnAction: React.CSSProperties = { border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 };
const btnClose: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#64748b", fontSize: 14 };
const inputCant: React.CSSProperties = { width: 72, padding: "5px 8px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, textAlign: "center", outline: "none" };
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" };
