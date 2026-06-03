import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { clientesApi, productosApi, listasApi, cotizacionesApi } from "../api/endpoints";
import { Search, Trash2, ArrowLeft, FileText, TrendingUp, Truck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

interface Linea {
  productoId: number;
  nombre: string;
  medida: string;
  origen: string;
  precioUnitario: number;
  cantidad: number;
  descuentoPct: number;
  notaCantidad: string;
}

function esConexionExterna(linea: Linea): boolean {
  return linea.origen === "EXTERNO" && !linea.nombre.toLowerCase().includes("manguera");
}

export default function NuevaCotizacion() {
  const navigate = useNavigate();
  const { usuario, esVendedor } = useAuth();
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [validezDias, setValidezDias] = useState(30);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [dropdownAbierto, setDropdownAbierto] = useState(false);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: clientesApi.listar,
  });

  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => productosApi.listar(),
  });

  const clienteSeleccionado: any = clientes.find((c: any) => c.id === clienteId);

  const { data: listaPrecio } = useQuery({
    queryKey: ["lista-precio-detalle", clienteSeleccionado?.listaPrecioId],
    queryFn: () => listasApi.obtener(clienteSeleccionado.listaPrecioId),
    enabled: !!clienteSeleccionado?.listaPrecioId,
  });

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim() || busqueda.length < 2) return [];
    const q = busqueda.toLowerCase();
    return (productos as any[])
      .filter((p) => p.nombre.toLowerCase().includes(q) || (p.medida ?? "").toLowerCase().includes(q))
      .slice(0, 12);
  }, [productos, busqueda]);

  const getPrecio = (productoId: number): number | null => {
    const d = (listaPrecio?.detalle ?? []).find((x: any) => x.productoId === productoId);
    return d ? Number(d.precioUnitario) : null;
  };

  const agregarProducto = (p: any) => {
    const precio = getPrecio(p.id);
    if (precio === null) {
      alert(`"${p.nombre} ${p.medida}" no tiene precio en la lista de este cliente.\n\nAgrégalo en Listas de Precios.`);
      setBusqueda("");
      setDropdownAbierto(false);
      return;
    }
    setLineas((prev) => {
      const existe = prev.find((l) => l.productoId === p.id);
      if (existe) {
        return prev.map((l) => l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l);
      }
      return [...prev, { productoId: p.id, nombre: p.nombre, medida: p.medida ?? "", origen: p.origen ?? "INTERNO", precioUnitario: precio, cantidad: 1, descuentoPct: 0, notaCantidad: "" }];
    });
    setBusqueda("");
    setDropdownAbierto(false);
  };

  const actualizarLinea = (idx: number, campo: keyof Linea, valor: any) => {
    setLineas((prev) => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l));
  };

  const totales = useMemo(() => {
    const bruto = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
    const neto = lineas.reduce((s, l) => s + l.precioUnitario * l.cantidad * (1 - l.descuentoPct / 100), 0);
    return { bruto, descuento: bruto - neto, neto };
  }, [lineas]);

  const ganancia = useMemo(() => {
    if (!clienteSeleccionado) return null;
    const ftPct = Number(clienteSeleccionado.fleteTuberiaPct ?? 0);
    const fcPct = Number(clienteSeleccionado.fleteConexionesPct ?? 0);
    const ctPct = Number(clienteSeleccionado.comisionTuberiaPct ?? 0);
    const ccPct = Number(clienteSeleccionado.comisionConexionesPct ?? 0);
    if (ftPct + fcPct + ctPct + ccPct === 0) return null;

    const totalTuberia = lineas
      .filter((l) => !esConexionExterna(l))
      .reduce((s, l) => s + l.precioUnitario * l.cantidad * (1 - l.descuentoPct / 100), 0);
    const totalConexiones = lineas
      .filter((l) => esConexionExterna(l))
      .reduce((s, l) => s + l.precioUnitario * l.cantidad * (1 - l.descuentoPct / 100), 0);

    const costoFlete =
      (ftPct > 0 ? totalTuberia * ftPct / (100 + ftPct) : 0) +
      (fcPct > 0 ? totalConexiones * fcPct / (100 + fcPct) : 0);
    const gananciaVendedor =
      (ctPct > 0 ? totalTuberia * ctPct / (100 + ctPct) : 0) +
      (ccPct > 0 ? totalConexiones * ccPct / (100 + ccPct) : 0);
    const labelVendedor = [
      ctPct > 0 && totalTuberia > 0 ? `${ctPct}% tub` : "",
      ccPct > 0 && totalConexiones > 0 ? `${ccPct}% con` : "",
    ].filter(Boolean).join(" · ");

    return {
      totalTuberia, totalConexiones,
      ftPct, fcPct, ctPct, ccPct,
      costoFlete, gananciaVendedor, labelVendedor,
      total: costoFlete + gananciaVendedor,
    };
  }, [lineas, clienteSeleccionado]);

  const crear = useMutation({
    mutationFn: () =>
      cotizacionesApi.crear({
        clienteId,
        notas: notas || undefined,
        validezDias,
        lineas: lineas.map((l) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          descuentoPct: l.descuentoPct || undefined,
          notaCantidad: l.notaCantidad || undefined,
        })),
      }),
    onSuccess: () => navigate("/cotizaciones"),
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al crear la cotización"),
  });

  const puedeCrear = !!clienteId && lineas.length > 0 && !crear.isPending;

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate("/cotizaciones")} style={btnBack}>
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Nueva Cotización</h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>Selecciona cliente y agrega los productos</p>
        </div>
      </div>

      {/* Datos generales */}
      <div style={card}>
        <p style={sectionLabel}>Datos de la Cotización</p>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 14 }}>
          <div>
            <label style={labelStyle}>Cliente *</label>
            <select
              style={inputStyle}
              value={clienteId ?? ""}
              onChange={(e) => {
                setClienteId(Number(e.target.value) || null);
                setLineas([]);
                setBusqueda("");
              }}
            >
              <option value="">— Seleccionar cliente —</option>
              {(clientes as any[]).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {clienteSeleccionado && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                Lista:{" "}
                <strong style={{ color: clienteSeleccionado.listaPrecioId ? "#1d4ed8" : "#dc2626" }}>
                  {clienteSeleccionado.listaPrecio?.nombre ?? "Sin lista — asígnale una en Clientes"}
                </strong>
              </div>
            )}
          </div>
          <div>
            <label style={labelStyle}>Validez (días)</label>
            <input
              type="number"
              min={1}
              style={inputStyle}
              value={validezDias}
              onChange={(e) => setValidezDias(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div>
            <label style={labelStyle}>Empresa en Factura</label>
            <input
              style={{ ...inputStyle, background: "#f8fafc", color: "#64748b" }}
              value={clienteSeleccionado?.empresaFactura ?? "—"}
              readOnly
            />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <label style={labelStyle}>Notas / Condiciones de Pago</label>
            <textarea
              style={{ ...inputStyle, height: 58, resize: "vertical" }}
              value={notas}
              placeholder="Ej: 30% al despachar, saldo a 15 días..."
              onChange={(e) => setNotas(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Líneas de productos */}
      <div style={{ ...card, marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <p style={{ ...sectionLabel, marginBottom: 0 }}>Productos</p>
          {!clienteId && <span style={{ fontSize: 13, color: "#94a3b8" }}>Selecciona un cliente primero</span>}
        </div>

        {/* Buscador */}
        {clienteId && (
          <div style={{ position: "relative", marginBottom: 16 }}>
            <Search size={15} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
            <input
              style={{ ...inputStyle, paddingLeft: 34, maxWidth: 480 }}
              placeholder="Escribe nombre o medida para buscar producto..."
              value={busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setDropdownAbierto(true); }}
              onFocus={() => setDropdownAbierto(true)}
              onBlur={() => setTimeout(() => setDropdownAbierto(false), 160)}
            />
            {dropdownAbierto && productosFiltrados.length > 0 && (
              <div style={dropdown}>
                {productosFiltrados.map((p: any) => {
                  const precio = getPrecio(p.id);
                  return (
                    <div
                      key={p.id}
                      style={dropdownItem}
                      onMouseDown={() => agregarProducto(p)}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>{p.nombre}</span>
                        {p.medida && <span style={{ color: "#64748b", fontSize: 13 }}> — {p.medida}</span>}
                        <span style={{ fontSize: 11, color: "#94a3b8", marginLeft: 6 }}>{p.categoria?.nombre}</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 13, color: precio !== null ? "#16a34a" : "#dc2626", whiteSpace: "nowrap" }}>
                        {precio !== null ? `$${precio.toFixed(2)}` : "Sin precio"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {dropdownAbierto && busqueda.length >= 2 && productosFiltrados.length === 0 && (
              <div style={{ ...dropdown, padding: "14px 16px", color: "#94a3b8", fontSize: 13 }}>
                No se encontraron productos con "{busqueda}"
              </div>
            )}
          </div>
        )}

        {/* Tabla */}
        {lineas.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Producto</th>
                  <th style={thStyle}>Precio Unit.</th>
                  <th style={{ ...thStyle, width: 90 }}>Cantidad</th>
                  <th style={{ ...thStyle, width: 80 }}>Desc %</th>
                  <th style={thStyle}>Nota de cantidad</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={{ ...thStyle, width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => {
                  const subtotal = l.precioUnitario * l.cantidad * (1 - l.descuentoPct / 100);
                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ ...tdStyle, color: "#94a3b8", fontSize: 12 }}>{idx + 1}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: "#1e293b" }}>{l.nombre}</div>
                        {l.medida && <div style={{ fontSize: 11, color: "#94a3b8" }}>{l.medida}</div>}
                      </td>
                      <td style={{ ...tdStyle, color: "#475569" }}>${l.precioUnitario.toFixed(2)}</td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={1}
                          value={l.cantidad}
                          onChange={(e) => actualizarLinea(idx, "cantidad", Math.max(1, Number(e.target.value)))}
                          style={{ ...inputSmall, width: 70 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={l.descuentoPct}
                          onChange={(e) => actualizarLinea(idx, "descuentoPct", Number(e.target.value))}
                          style={{ ...inputSmall, width: 62 }}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={l.notaCantidad}
                          placeholder="ej: 3 rollos x 60m"
                          onChange={(e) => actualizarLinea(idx, "notaCantidad", e.target.value)}
                          style={{ ...inputSmall, minWidth: 130, width: "100%" }}
                        />
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap" }}>
                        ${subtotal.toFixed(2)}
                      </td>
                      <td style={tdStyle}>
                        <button onClick={() => setLineas((p) => p.filter((_, i) => i !== idx))} style={btnDelete}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {lineas.length === 0 && clienteId && (
          <div style={{ padding: "36px 0", textAlign: "center", color: "#94a3b8", background: "#f8fafc", borderRadius: 8 }}>
            <Search size={30} style={{ display: "block", margin: "0 auto 10px", opacity: 0.35 }} />
            <div style={{ fontSize: 14 }}>Busca productos arriba para agregarlos</div>
          </div>
        )}
      </div>

      {/* Totales y botón crear */}
      {lineas.length > 0 && (
        <div style={{ ...card, marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 24 }}>
            <div style={{ fontSize: 13, color: "#64748b" }}>
              {lineas.length} {lineas.length === 1 ? "línea" : "líneas"} · {lineas.reduce((s, l) => s + l.cantidad, 0)} unidades
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
              <TotalStat label="Total Bruto" value={`$${totales.bruto.toFixed(2)}`} />
              {totales.descuento > 0 && (
                <TotalStat label="Descuento" value={`-$${totales.descuento.toFixed(2)}`} color="#dc2626" />
              )}
              <TotalStat label="Total Neto" value={`$${totales.neto.toFixed(2)}`} big />
              <button
                onClick={() => crear.mutate()}
                disabled={!puedeCrear}
                style={{ ...btnPrimary, opacity: puedeCrear ? 1 : 0.5, cursor: puedeCrear ? "pointer" : "not-allowed" }}
              >
                <FileText size={15} />
                {crear.isPending ? "Creando..." : "Crear Cotización"}
              </button>
            </div>
          </div>

          {/* espacio reservado — ganancia se muestra en panel flotante */}
        </div>
      )}
      {/* Panel flotante de ganancia — top-right, visible mientras se construye la cotización */}
      {ganancia && lineas.length > 0 && (
        <div style={{
          position: "fixed", top: 76, right: 20, zIndex: 300,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14,
          boxShadow: "0 8px 30px rgba(0,0,0,0.13)", padding: "14px 16px", width: 230,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#166534", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5 }}>
            <TrendingUp size={12} /> Ganancia estimada
          </div>

          {ganancia.costoFlete > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "6px 8px", background: "#f0fdf4", borderRadius: 7 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Costo Flete</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>${ganancia.costoFlete.toFixed(2)}</span>
            </div>
          )}

          {ganancia.gananciaVendedor > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "6px 8px", background: "#f0fdf4", borderRadius: 7 }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Ganancia Vendedor</div>
                {ganancia.labelVendedor && <div style={{ fontSize: 10, color: "#94a3b8" }}>{ganancia.labelVendedor}</div>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>${ganancia.gananciaVendedor.toFixed(2)}</span>
            </div>
          )}

          <div style={{ borderTop: "1.5px solid #dcfce7", paddingTop: 8, marginTop: 4, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#166534" }}>Total Ganancia</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#166534" }}>${ganancia.total.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TotalStat({ label, value, big, color }: { label: string; value: string; big?: boolean; color?: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: big ? 20 : 15, fontWeight: big ? 700 : 500, color: color ?? "#1e293b" }}>{value}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 22 };
const sectionLabel: React.CSSProperties = { margin: "0 0 14px", fontSize: 14, fontWeight: 600, color: "#374151" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const inputSmall: React.CSSProperties = { padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
const thStyle: React.CSSProperties = { padding: "9px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "9px 12px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 7, background: "#2563eb", color: "#fff", border: "none", padding: "10px 18px", borderRadius: 8, fontSize: 14, fontWeight: 600 };
const btnBack: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#f1f5f9", color: "#475569", border: "none", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer" };
const btnDelete: React.CSSProperties = { background: "#fee2e2", border: "none", borderRadius: 6, padding: "5px 7px", cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center" };
const dropdown: React.CSSProperties = { position: "absolute", top: "calc(100% + 4px)", left: 0, width: "min(520px, 100%)", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, maxHeight: 320, overflow: "auto" };
const dropdownItem: React.CSSProperties = { padding: "10px 14px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, borderBottom: "1px solid #f8fafc" };
