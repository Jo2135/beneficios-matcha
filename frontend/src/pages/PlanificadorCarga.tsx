import { useState, useMemo, useRef } from "react";
import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { planesCargaApi, productosApi, clientesApi, listasApi, despachosApi } from "../api/endpoints";
import { LayoutGrid, Plus, Save, Trash2, X, Search, FileSpreadsheet, FileText, Truck, AlertTriangle, CheckCircle, GripVertical, RefreshCw } from "lucide-react";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const numf = (n: any) => Number(n ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 2 });
const cellKey = (cId: number, pId: number) => `${cId}_${pId}`;

// Detección de conexión (aprox. del backend) para separar el flete tubería vs conexiones
const CONEX_CODE = /^(CO-|SC-|SI-|TE-|YE-|YR-|ABS-|TR-|UR-|URR-|AM-|AH-|TAR-|COR-|ASP-|CA-)/i;
function esConexionFront(p: any): boolean {
  if (!p) return false;
  if (String(p.categoria?.nombre ?? "").toLowerCase() === "conexiones") return true;
  if (p.codigo && CONEX_CODE.test(p.codigo)) return true;
  const n = String(p.nombre ?? "").toLowerCase();
  return /(abrazadera|codo|sif[oó]n|\btee\b|\byee\b|uni[oó]n|adaptador|tap[oó]n|reducci)/.test(n);
}

export default function PlanificadorCarga() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [planId, setPlanId] = useState<number | null>(null);
  const [abierto, setAbierto] = useState(false); // hay un plan en edición
  const [nombre, setNombre] = useState("");
  const [fecha, setFecha] = useState("");
  const [notas, setNotas] = useState("");
  const [columnas, setColumnas] = useState<number[]>([]);            // clienteIds (columnas)
  const [filas, setFilas] = useState<{ id: number; costo: number }[]>([]); // productos (filas)
  const [celdas, setCeldas] = useState<Record<string, number>>({});  // cantidades
  const [dirty, setDirty] = useState(false);
  const [estado, setEstado] = useState("BORRADOR");
  const [despachoId, setDespachoId] = useState<number | null>(null);
  const [genResult, setGenResult] = useState<any>(null);

  // Panel de flete arrastrable (null = posición por defecto, arriba a la derecha)
  const [fletePos, setFletePos] = useState<{ x: number; y: number } | null>(null);
  const dragOff = useRef<{ dx: number; dy: number } | null>(null);
  const iniciarArrastre = (e: React.MouseEvent) => {
    const panel = (e.currentTarget as HTMLElement).closest("[data-flete-panel]") as HTMLElement | null;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragOff.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    const mover = (ev: MouseEvent) => {
      if (!dragOff.current) return;
      const x = Math.max(4, Math.min(window.innerWidth - rect.width - 4, ev.clientX - dragOff.current.dx));
      const y = Math.max(4, Math.min(window.innerHeight - 40, ev.clientY - dragOff.current.dy));
      setFletePos({ x, y });
    };
    const soltar = () => { dragOff.current = null; window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    e.preventDefault();
  };

  const { data: planes = [] } = useQuery({ queryKey: ["planes-carga"], queryFn: planesCargaApi.listar });
  const { data: productos = [] } = useQuery({ queryKey: ["productos"], queryFn: () => productosApi.listar() });
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: clientesApi.listar });

  const prodById = useMemo(() => Object.fromEntries((productos as any[]).map((p) => [p.id, p])), [productos]);
  const cliById = useMemo(() => Object.fromEntries((clientes as any[]).map((c) => [c.id, c])), [clientes]);

  // Precio de la lista de cada cliente (automático). Un catálogo por cliente en columna.
  const catalogos = useQueries({
    queries: columnas.map((cId) => ({
      queryKey: ["catalogo-cliente", cId],
      queryFn: () => listasApi.catalogoParaCliente(cId),
      staleTime: 60_000,
    })),
  });
  const precioPorCliente = useMemo(() => {
    const m: Record<number, Map<number, number>> = {};
    columnas.forEach((cId, i) => {
      const map = new Map<number, number>();
      for (const d of ((catalogos[i]?.data as any)?.detalle ?? [])) {
        const pu = Number(d.precioUnitario), desc = Number(d.descuentoPct ?? 0);
        map.set(d.productoId, pu * (1 - desc / 100)); // precio efectivo (con descuento de lista)
      }
      m[cId] = map;
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnas, catalogos.map((c) => (c.data ? 1 : 0)).join(",")]);
  const precioCelda = (cId: number, pId: number) => precioPorCliente[cId]?.get(pId) ?? 0;

  const abrirPlan = async (id: number) => {
    const p = await planesCargaApi.obtener(id);
    setPlanId(p.id); setNombre(p.nombre); setFecha(p.fecha ? String(p.fecha).slice(0, 10) : ""); setNotas(p.notas ?? "");
    setColumnas(p.clientes ?? []); setFilas(p.productos ?? []); setCeldas(p.cantidades ?? {});
    setEstado(p.estado ?? "BORRADOR"); setDespachoId(p.despachoId ?? null); setGenResult(null);
    setDirty(false); setAbierto(true);
  };
  const nuevoPlan = () => {
    setPlanId(null); setNombre(`Plan ${new Date().toLocaleDateString("es-VE")}`); setFecha(""); setNotas("");
    setColumnas([]); setFilas([]); setCeldas({}); setEstado("BORRADOR"); setDespachoId(null); setGenResult(null);
    setDirty(true); setAbierto(true);
  };

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { nombre, fecha: fecha || null, notas, clientes: columnas, productos: filas, cantidades: celdas };
      return planId ? planesCargaApi.actualizar(planId, payload) : planesCargaApi.crear(payload);
    },
    onSuccess: (p: any) => { setPlanId(p.id); setEstado(p.estado ?? estado); qc.invalidateQueries({ queryKey: ["planes-carga"] }); setDirty(false); },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al guardar"),
  });
  const eliminar = useMutation({
    mutationFn: (id: number) => planesCargaApi.eliminar(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["planes-carga"] }); setAbierto(false); setPlanId(null); },
  });

  const generarMut = useMutation({
    mutationFn: async () => {
      let pid = planId;
      if (!pid || dirty) { const saved = await guardar.mutateAsync(); pid = saved.id; }
      return planesCargaApi.generar(pid!);
    },
    onSuccess: (r: any) => {
      setGenResult(r);
      if (r.creadas?.length) setEstado("GENERADO");
      qc.invalidateQueries({ queryKey: ["planes-carga"] });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al generar"),
  });
  const aprobarMut = useMutation({
    mutationFn: () => planesCargaApi.aprobar(planId!),
    onSuccess: (r: any) => { qc.invalidateQueries({ queryKey: ["planes-carga"] }); alert(`${r.aprobadas} cotización(es) aprobada(s). Ya puedes consolidar en despacho.`); },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al aprobar"),
  });
  const consolidarMut = useMutation({
    mutationFn: () => planesCargaApi.consolidar(planId!),
    onSuccess: (r: any) => { setEstado("DESPACHADO"); setDespachoId(r.despachoId); qc.invalidateQueries({ queryKey: ["planes-carga"] }); alert(`Despacho ${r.numero} creado con ${r.cotizaciones} cotizaciones.`); },
    onError: (e: any) => alert(e?.response?.data?.error ?? "Error al consolidar"),
  });

  // ── edición de matriz ──
  const mark = () => setDirty(true);
  const getCelda = (cId: number, pId: number) => celdas[cellKey(cId, pId)] ?? 0;
  const setCelda = (cId: number, pId: number, v: number) => {
    setCeldas((prev) => { const n = { ...prev }; if (v > 0) n[cellKey(cId, pId)] = v; else delete n[cellKey(cId, pId)]; return n; });
    mark();
  };
  const agregarCliente = (cId: number) => { if (!columnas.includes(cId)) { setColumnas([...columnas, cId]); mark(); } };
  const quitarCliente = (cId: number) => {
    setColumnas(columnas.filter((x) => x !== cId));
    setCeldas((prev) => { const n = { ...prev }; for (const k of Object.keys(n)) if (k.startsWith(cId + "_")) delete n[k]; return n; });
    mark();
  };
  const agregarProducto = (p: any) => {
    if (!filas.some((f) => f.id === p.id)) { setFilas([...filas, { id: p.id, costo: Number(p.costoCompra ?? 0) }]); mark(); }
  };
  const quitarProducto = (pId: number) => {
    setFilas(filas.filter((f) => f.id !== pId));
    setCeldas((prev) => { const n = { ...prev }; for (const k of Object.keys(n)) if (k.endsWith("_" + pId)) delete n[k]; return n; });
    mark();
  };
  // ── totales ──
  const rowTotal = (pId: number) => columnas.reduce((s, c) => s + getCelda(c, pId), 0);
  const colTotal = (cId: number) => filas.reduce((s, f) => s + getCelda(cId, f.id), 0);
  // Valor = cantidad × precio de la lista de cada cliente
  const valorCelda = (cId: number, pId: number) => getCelda(cId, pId) * precioCelda(cId, pId);
  const rowValor = (pId: number) => columnas.reduce((s, c) => s + valorCelda(c, pId), 0);
  const colValor = (cId: number) => filas.reduce((s, f) => s + valorCelda(cId, f.id), 0);
  const grandQty = filas.reduce((s, f) => s + rowTotal(f.id), 0);
  const grandValor = filas.reduce((s, f) => s + rowValor(f.id), 0);
  // Flete que pagan los clientes (según su % tubería/conexiones sobre el valor)
  const fletePorCliente = (cId: number) => {
    const cli = cliById[cId];
    const ft = Number(cli?.fleteTuberiaPct ?? 0), fc = Number(cli?.fleteConexionesPct ?? 0);
    let vTub = 0, vCon = 0;
    for (const f of filas) {
      const val = valorCelda(cId, f.id);
      if (val <= 0) continue;
      if (esConexionFront(prodById[f.id])) vCon += val; else vTub += val;
    }
    return (ft > 0 ? vTub * ft / (100 + ft) : 0) + (fc > 0 ? vCon * fc / (100 + fc) : 0);
  };
  const fleteTotal = columnas.reduce((s, c) => s + fletePorCliente(c), 0);

  const clientesDisponibles = (clientes as any[]).filter((c) => !columnas.includes(c.id));

  return (
    <div style={{ padding: 24 }}>
      {/* Panel flotante y arrastrable: flete estimado (que pagan los clientes) */}
      {abierto && filas.length > 0 && columnas.length > 0 && (
        <div data-flete-panel style={{ position: "fixed", ...(fletePos ? { top: fletePos.y, left: fletePos.x, right: "auto" as const } : { top: 210, right: 22 }), width: 236, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.14)", padding: 14, zIndex: 45 }}>
          <div onMouseDown={iniciarArrastre} title="Arrastra para mover"
            style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 6, marginBottom: 6, cursor: "move", userSelect: "none" }}>
            <Truck size={14} /> Flete estimado
            <GripVertical size={13} style={{ marginLeft: "auto", color: "#cbd5e1" }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#0891b2", marginBottom: 2 }}>{usd(fleteTotal)}</div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8 }}>
            {grandValor > 0 ? `${(fleteTotal / grandValor * 100).toFixed(1)}% del valor de la carga` : ""}
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", borderTop: "1px solid #f1f5f9", paddingTop: 6 }}>
            {columnas.map((cId) => (
              <div key={cId} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", padding: "2px 0", gap: 8 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliById[cId]?.nombre ?? `#${cId}`}</span>
                <span style={{ fontWeight: 600, color: "#334155", whiteSpace: "nowrap" }}>{usd(fletePorCliente(cId))}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 8, lineHeight: 1.3 }}>
            Flete que pagan los clientes (según su %). Compáralo con el costo del camión.
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
            <LayoutGrid size={22} /> Planificador de Carga
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            Reparte cantidades por cliente para dimensionar la carga del camión antes de cotizar.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={planId ?? ""} onChange={(e) => { const v = Number(e.target.value); if (v) abrirPlan(v); }} style={{ ...inSt, width: "auto" }}>
            <option value="">— Abrir plan guardado —</option>
            {(planes as any[]).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.fecha ? ` · ${new Date(p.fecha).toLocaleDateString("es-VE")}` : ""}</option>)}
          </select>
          <button onClick={nuevoPlan} style={btnPrimary}><Plus size={15} /> Nuevo plan</button>
        </div>
      </div>

      {!abierto ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#94a3b8" }}>
          <FileSpreadsheet size={34} style={{ display: "block", margin: "0 auto 10px", opacity: 0.4 }} />
          Abre un plan guardado o crea uno nuevo para empezar a cuadrar la carga.
        </div>
      ) : (
        <>
          {/* Encabezado del plan */}
          <div style={{ ...card, padding: 16, marginBottom: 14, display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 12, alignItems: "flex-end" }}>
            <div><label style={lbl}>Nombre del plan</label>
              <input style={inSt} value={nombre} onChange={(e) => { setNombre(e.target.value); mark(); }} /></div>
            <div><label style={lbl}>Fecha estimada</label>
              <input type="date" style={inSt} value={fecha} onChange={(e) => { setFecha(e.target.value); mark(); }} /></div>
            <div><label style={lbl}>Notas</label>
              <input style={inSt} value={notas} placeholder="Vehículo, chofer, observaciones..." onChange={(e) => { setNotas(e.target.value); mark(); }} /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => guardar.mutate()} disabled={guardar.isPending || !dirty} style={{ ...btnPrimary, background: dirty ? "#16a34a" : "#94a3b8" }}>
                <Save size={15} /> {guardar.isPending ? "Guardando..." : dirty ? "Guardar" : "Guardado"}
              </button>
              {planId && (
                <button onClick={() => { if (window.confirm("¿Eliminar este plan?")) eliminar.mutate(planId); }} style={{ ...btnPrimary, background: "#fee2e2", color: "#991b1b" }}><Trash2 size={15} /></button>
              )}
            </div>
          </div>

          {/* Barra de añadir */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 13, color: "#64748b" }}>Agregar cliente:</span>
            <select value="" onChange={(e) => { const v = Number(e.target.value); if (v) agregarCliente(v); e.target.value = ""; }} style={{ ...inSt, width: "auto" }}>
              <option value="">— Elegir cliente —</option>
              {clientesDisponibles.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <span style={{ width: 1, height: 20, background: "#e2e8f0" }} />
            <AgregarProducto productos={productos as any[]} excluidos={filas.map((f) => f.id)} onAdd={agregarProducto} />
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["catalogo-cliente"] })}
              title="Vuelve a leer los precios de la lista de cada cliente (úsalo si corregiste precios en Listas de Precios)"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, marginLeft: "auto", padding: "7px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#16a34a" }}
            >
              <RefreshCw size={13} /> Actualizar precios
            </button>
          </div>

          {/* Matriz */}
          {columnas.length === 0 ? (
            <div style={{ ...card, padding: 30, textAlign: "center", color: "#94a3b8" }}>
              Agrega al menos un <strong>cliente</strong> con el selector de arriba para empezar a armar la carga.
            </div>
          ) : (
            <div style={{ ...card, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={{ ...th, position: "sticky", left: 0, background: "#f8fafc", minWidth: 220 }}>Producto</th>
                    {columnas.map((cId) => (
                      <th key={cId} style={{ ...th, textAlign: "center", minWidth: 96 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliById[cId]?.nombre ?? `#${cId}`}</span>
                          <button onClick={() => quitarCliente(cId)} title="Quitar cliente" style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1" }}><X size={12} /></button>
                        </div>
                      </th>
                    ))}
                    <th style={{ ...th, textAlign: "center", minWidth: 80, background: "#eff6ff", color: "#1d4ed8" }}>TOTAL</th>
                    <th style={{ ...th, textAlign: "right", minWidth: 110 }}>Valor Venta</th>
                    <th style={{ ...th, width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.length === 0 && (
                    <tr>
                      <td colSpan={columnas.length + 4} style={{ ...td, textAlign: "center", color: "#94a3b8", padding: "22px 12px" }}>
                        Clientes listos ({columnas.length}). Ahora agrega <strong>productos</strong> con el buscador de arriba para asignar cantidades.
                      </td>
                    </tr>
                  )}
                  {filas.map((f) => {
                    const p = prodById[f.id];
                    const tot = rowTotal(f.id);
                    return (
                      <tr key={f.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ ...td, position: "sticky", left: 0, background: "#fff", fontWeight: 500 }}>
                          {p?.codigo && <span style={{ color: "#7c3aed", fontWeight: 600 }}>{p.codigo} · </span>}
                          {p?.nombre} <span style={{ color: "#94a3b8" }}>{p?.medida}</span>
                        </td>
                        {columnas.map((cId) => {
                          const precio = precioCelda(cId, f.id);
                          const qty = getCelda(cId, f.id);
                          return (
                            <td key={cId} style={{ ...td, textAlign: "center", padding: "4px 6px" }}>
                              <input type="number" min="0" value={qty || ""} placeholder="0"
                                onChange={(e) => setCelda(cId, f.id, Number(e.target.value) || 0)}
                                style={{ ...inMini, width: 74, textAlign: "center" }} />
                              <div style={{ fontSize: 10, marginTop: 2, color: precio > 0 ? "#94a3b8" : "#f59e0b" }}>
                                {precio > 0 ? usd(precio) : "sin precio"}
                                {qty > 0 && precio > 0 && <div style={{ color: "#16a34a", fontWeight: 600 }}>{usd(qty * precio)}</div>}
                              </div>
                            </td>
                          );
                        })}
                        <td style={{ ...td, textAlign: "center", fontWeight: 700, background: "#eff6ff", color: "#1d4ed8" }}>{numf(tot)}</td>
                        <td style={{ ...td, textAlign: "right", color: "#16a34a", fontWeight: 600 }}>{usd(rowValor(f.id))}</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button onClick={() => quitarProducto(f.id)} title="Quitar producto" style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1" }}><X size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {filas.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid #e2e8f0", background: "#f8fafc", fontWeight: 700 }}>
                    <td style={{ ...td, position: "sticky", left: 0, background: "#f8fafc" }}>Totales</td>
                    {columnas.map((cId) => (
                      <td key={cId} style={{ ...td, textAlign: "center", color: "#1e293b" }}>
                        {numf(colTotal(cId))}
                        <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{usd(colValor(cId))}</div>
                      </td>
                    ))}
                    <td style={{ ...td, textAlign: "center", background: "#dbeafe", color: "#1d4ed8" }}>{numf(grandQty)}</td>
                    <td style={{ ...td, textAlign: "right", color: "#16a34a" }}>{usd(grandValor)}</td>
                    <td style={td}></td>
                  </tr>
                </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Resumen */}
          {filas.length > 0 && columnas.length > 0 && (
            <div style={{ display: "flex", gap: 14, marginTop: 14, flexWrap: "wrap" }}>
              <Resumen label="Clientes en la carga" valor={String(columnas.length)} />
              <Resumen label="Productos" valor={String(filas.length)} />
              <Resumen label="Unidades totales" valor={numf(grandQty)} />
              <Resumen label="Valor de venta de la carga" valor={usd(grandValor)} accent />
            </div>
          )}

          {/* Acciones: generar y consolidar */}
          {filas.length > 0 && columnas.length > 0 && (
            <div style={{ ...card, padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Convertir el plan</div>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
                Con estos totales decides si el flete es adecuado. Cuando esté cuadrado, genera una cotización por cliente (con su precio de lista) y luego consolídalas en un solo despacho.
              </div>

              {estado === "DESPACHADO" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", flexWrap: "wrap" }}>
                  <CheckCircle size={18} style={{ color: "#16a34a" }} />
                  <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>Despacho consolidado creado.</span>
                  <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
                    {despachoId && (
                      <button onClick={() => navigate(`/despachos/${despachoId}/ganancias`)} style={{ ...btnPrimary, background: "#7c3aed" }}>
                        <FileText size={15} /> Abrir vista completa
                      </button>
                    )}
                    <button onClick={() => navigate("/despachos")} style={{ ...btnPrimary, background: "#16a34a" }}><Truck size={15} /> Ver en Despachos</button>
                  </div>
                </div>
              ) : estado === "GENERADO" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => navigate("/cotizaciones")} style={{ ...btnPrimary, background: "#64748b" }}><FileText size={15} /> Revisar en Cotizaciones</button>
                  <button onClick={() => aprobarMut.mutate()} disabled={aprobarMut.isPending} style={{ ...btnPrimary, background: "#7c3aed" }}>
                    <CheckCircle size={15} /> {aprobarMut.isPending ? "Aprobando..." : "Aprobar todas"}
                  </button>
                  <button onClick={() => consolidarMut.mutate()} disabled={consolidarMut.isPending} style={{ ...btnPrimary, background: "#0891b2" }}>
                    <Truck size={15} /> {consolidarMut.isPending ? "Consolidando..." : "Consolidar en despacho"}
                  </button>
                  <span style={{ fontSize: 12, color: "#64748b" }}>Aprueba todo el conjunto de una vez y consolida en un solo despacho.</span>
                </div>
              ) : (
                <button onClick={() => generarMut.mutate()} disabled={generarMut.isPending} style={{ ...btnPrimary, background: "#16a34a" }}>
                  <FileText size={15} /> {generarMut.isPending ? "Generando..." : "Generar cotizaciones (borrador)"}
                </button>
              )}

              {/* Resultado de la generación */}
              {genResult && (
                <div style={{ marginTop: 14, borderTop: "1px solid #f1f5f9", paddingTop: 12 }}>
                  <div style={{ fontSize: 13, color: "#166534", fontWeight: 600, marginBottom: 6 }}>
                    {genResult.creadas?.length ?? 0} cotización(es) creada(s) en Borrador:
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {(genResult.creadas ?? []).map((c: any) => (
                      <span key={c.id} style={{ fontSize: 12, background: "#dbeafe", color: "#1d4ed8", borderRadius: 6, padding: "3px 8px" }}>
                        {c.numero} · {c.cliente} ({c.lineas} líneas · {usd(c.totalNeto)})
                      </span>
                    ))}
                  </div>
                  {(genResult.omitidos ?? []).length > 0 && (
                    <div style={{ fontSize: 12, color: "#b45309", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginTop: 6 }}>
                      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}><AlertTriangle size={13} /> Productos omitidos (el cliente no los tiene en su lista de precios):</div>
                      {(genResult.omitidos as any[]).map((o, i) => <div key={i}>· {o.cliente}: {o.producto}</div>)}
                    </div>
                  )}
                  {(genResult.clientesSinLineas ?? []).length > 0 && (
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 6 }}>Clientes sin cotización (ningún producto con precio): {genResult.clientesSinLineas.join(", ")}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Balance consolidado embebido (cuando ya se consolidó el despacho) */}
          {estado === "DESPACHADO" && despachoId && <BalanceConsolidado despachoId={despachoId} />}
        </>
      )}
    </div>
  );
}

function AgregarProducto({ productos, excluidos, onAdd }: { productos: any[]; excluidos: number[]; onAdd: (p: any) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return productos
      .filter((p) => !excluidos.includes(p.id) && `${p.codigo ?? ""} ${p.nombre} ${p.medida}`.toLowerCase().includes(t))
      .slice(0, 12);
  }, [q, productos, excluidos]);

  return (
    <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, color: "#64748b" }}>Agregar producto:</span>
      <div style={{ position: "relative" }}>
        <Search size={13} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
        <input value={q} placeholder="Buscar producto..." onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ ...inSt, width: 220, paddingLeft: 28 }} />
        {open && matches.length > 0 && (
          <div style={dropdown}>
            {matches.map((p) => (
              <div key={p.id} onMouseDown={() => { onAdd(p); setQ(""); setOpen(false); }} style={dropItem}>
                {p.codigo && <span style={{ color: "#7c3aed", fontWeight: 600 }}>{p.codigo} · </span>}{p.nombre} <span style={{ color: "#94a3b8" }}>{p.medida}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Balance/Ganancias consolidado del despacho, embebido (solo lectura)
function BalanceConsolidado({ despachoId }: { despachoId: number }) {
  const { data: d, isLoading } = useQuery({
    queryKey: ["ganancias-despacho", despachoId],
    queryFn: () => despachosApi.calcularGanancias(despachoId),
    enabled: !!despachoId,
  });
  if (isLoading) return <div style={{ ...card, padding: 20, marginTop: 16, color: "#94a3b8" }}>Calculando balance consolidado...</div>;
  if (!d) return <div style={{ ...card, padding: 20, marginTop: 16, color: "#dc2626" }}>No se pudo cargar el balance.</div>;

  const nz = (n: any) => Math.abs(Number(n ?? 0)) > 0.005;
  const costos = [
    ["Materia prima", d.costoMateria?.total],
    ["Gastos generales (obreros, pigmento, electricidad)", d.gastos?.total],
    ["Costo Tubo Gris (proveedor)", d.grisPVC?.costoTubo],
    ["Costo Tubo Amarillo (proveedor)", d.amarilloPVC?.costoTubo],
    ["Materiales de Niples", d.niples?.materiales],
    ["Costo Manguera Verde", d.mangueraVerde?.costo],
  ].filter(([, m]) => nz(m));
  const ganancias = [
    ["Sr. Alberto (General 60%)", d.gananciaGeneral?.srAlbertoGral],
    ["Capital (40%)", d.gananciaGeneral?.capital],
    ["Sr. Alberto Amarillo (PEAD)", d.gananciaAguasNegras?.srAlbertoAmarillo],
    ["Danny Amarillo (PEAD)", d.gananciaAguasNegras?.dannyAmarillo],
    ["Darwin Amarillo (PEAD)", d.gananciaAguasNegras?.darwinAmarillo],
    ["SBUG", d.ganancias2?.sbug],
    ["Yolanda", d.ganancias2?.yolanda],
    ["Sandra", d.ganancias2?.sandra],
    ["Comisiones (2.2% + 5% conex.)", d.ganancias2?.comisionesConCinco],
    ["Comisión vendedores", d.comisionesVendedores?.total],
    ["Flete", d.fletesCliente?.total],
    ["Ganancia Muchachos (flete)", d.gananciaMuchachos?.total],
    ["Ganancia Conexiones", d.gananciaConexiones?.ganancia],
    ["Ganancia Tubo Gris", d.grisPVC?.ganancia],
    ["Ganancia Fábrica Tubo Gris", d.grisPVC?.gananciaFabrica],
    ["Ganancia Tubo Amarillo", d.amarilloPVC?.ganancia],
    ["Ganancia Fábrica Tubo Amarillo", d.amarilloPVC?.gananciaFabrica],
    ["Ganancia Niples (sub-empresa)", d.niples?.ganancia],
    ["Curvas – Pago Fábrica", d.curvas?.pagoFabrica],
    ["Curvas – Muchachas", d.curvas?.pagoMuchachas],
    ["Curvas – Sr. Alberto", d.curvas?.gananciaAlberto],
  ].filter(([, m]) => nz(m));

  const Fila = ({ label, monto, color }: { label: string; monto: any; color?: string }) => (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #f8fafc", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#475569" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? "#1e293b", whiteSpace: "nowrap" }}>{usd(monto)}</span>
    </div>
  );

  return (
    <div style={{ ...card, padding: 18, marginTop: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>Balance y Ganancias (conjunto)</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>Todas las facturas del despacho tomadas como una sola.</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FDB913", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
        <span style={{ fontWeight: 700, color: "#713f12" }}>Venta Total</span>
        <span style={{ fontWeight: 800, color: "#713f12", fontSize: 16 }}>{usd(d.facturaTotal)}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", marginBottom: 4 }}>Costos y materiales</div>
          {costos.length ? costos.map(([l, m]) => <Fila key={l as string} label={l as string} monto={m} color="#b91c1c" />) : <div style={{ fontSize: 12, color: "#94a3b8" }}>—</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", marginBottom: 4 }}>Distribución de ganancias</div>
          {ganancias.map(([l, m]) => <Fila key={l as string} label={l as string} monto={m} />)}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginTop: 14 }}>
        <span style={{ fontWeight: 700, color: "#166534" }}>Extra de Material (Ganancias Extras)</span>
        <span style={{ fontWeight: 800, color: "#166534", fontSize: 15 }}>{usd(d.extraMaterial)}</span>
      </div>
    </div>
  );
}

function Resumen({ label, valor, accent }: { label: string; valor: string; accent?: boolean }) {
  return (
    <div style={{ background: accent ? "#f0fdf4" : "#fff", border: `1px solid ${accent ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 12, padding: "12px 18px", flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: accent ? "#166534" : "#1e293b" }}>{valor}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" };
const inSt: React.CSSProperties = { padding: "8px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", width: "100%", background: "#fff" };
const inMini: React.CSSProperties = { padding: "5px 6px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none" };
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 4 };
const th: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" };
const td: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const dropdown: React.CSSProperties = { position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 2, maxHeight: 240, overflowY: "auto", zIndex: 70, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", minWidth: 280 };
const dropItem: React.CSSProperties = { padding: "7px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid #f8fafc" };
