import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientesApi, productosApi, listasApi, cotizacionesApi, authApi, categoriasApi } from "../api/endpoints";
import { Search, Trash2, ArrowLeft, FileText, Truck, PackagePlus, X } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { esConexionProducto } from "../utils/conexiones";

interface Linea {
  productoId: number;
  nombre: string;
  medida: string;
  origen: string;
  codigo?: string | null;
  categoriaNombre?: string;
  precioUnitario: number;
  cantidad: number;
  descuentoPct: number;
  notaCantidad: string;
}

// Regla única (utils/conexiones.ts, espejo del motor): los codos 2"/4"
// fabricados cuentan como conexión — el vendedor no ve aquí una ganancia
// de tubería que el motor no le va a pagar.
function esConexionExterna(linea: Linea): boolean {
  return esConexionProducto({ codigo: linea.codigo, nombre: linea.nombre, origen: linea.origen, categoria: { nombre: linea.categoriaNombre } });
}

// Redondeo hacia arriba: Curvas → 3 decimales, resto → 2 decimales
function redondearPrecio(precio: number, nombreProducto: string): number {
  if (nombreProducto.toLowerCase().includes("curva"))
    return Math.ceil(precio * 1000) / 1000;
  return Math.ceil(precio * 100) / 100;
}

export default function NuevaCotizacion() {
  const navigate = useNavigate();
  const { id: editIdStr } = useParams<{ id?: string }>();
  const editId = editIdStr ? Number(editIdStr) : null;
  const { usuario, esVendedor, puedeEditar } = useAuth();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = useState<number | null>(null);
  // true = el usuario acaba de cambiar de cliente y hay que re-precificar las lineas
  const [reprecificarPend, setReprecificarPend] = useState(false);
  const [vendedorIdSel, setVendedorIdSel] = useState<number | null>(null);
  const [notas, setNotas] = useState("");
  const [validezDias, setValidezDias] = useState(30);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [dropdownAbierto, setDropdownAbierto] = useState(false);

  // Vendedores (solo MASTER/ADMIN pueden elegir el vendedor de la cotización)
  const { data: vendedores = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ["vendedores"],
    queryFn: authApi.listarVendedores,
    enabled: puedeEditar,
  });

  // Cargar cotización existente si estamos en modo edición
  const { data: cotExistente } = useQuery({
    queryKey: ["cotizacion-editar", editId],
    queryFn: () => cotizacionesApi.obtener(editId!),
    enabled: !!editId,
  });

  useEffect(() => {
    if (!cotExistente) return;
    setClienteId(cotExistente.clienteId);
    setVendedorIdSel(cotExistente.vendedorId ?? null);
    setNotas(cotExistente.notas ?? "");
    setValidezDias(cotExistente.validezDias ?? 30);
    setLineas((cotExistente.lineas ?? []).map((l: any) => {
      const nombre = l.producto?.nombre ?? "";
      return {
        productoId: l.productoId,
        nombre,
        medida: l.producto?.medida ?? "",
        origen: l.producto?.origen ?? "INTERNO",
        codigo: l.producto?.codigo ?? null,
        categoriaNombre: l.producto?.categoria?.nombre,
        precioUnitario: redondearPrecio(Number(l.precioUnitarioAplicado), nombre),
        cantidad: Number(l.cantidad),
        descuentoPct: Number(l.descuentoPct),
        notaCantidad: l.notaCantidad ?? "",
      };
    }));
  }, [cotExistente]);

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: clientesApi.listar,
  });

  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => productosApi.listar(),
  });

  const clienteSeleccionado: any = clientes.find((c: any) => c.id === clienteId);
  const tieneListasAsignadas = (clienteSeleccionado?.listasAsignadas ?? []).length > 0;

  const { data: catalogoCliente } = useQuery({
    queryKey: ["catalogo-cliente", clienteId],
    queryFn: () => listasApi.catalogoParaCliente(clienteId!),
    enabled: !!clienteId && tieneListasAsignadas,
  });

  const productosFiltrados = useMemo(() => {
    if (!busqueda.trim() || busqueda.length < 2) return [];
    const q = busqueda.toLowerCase();
    return (productos as any[])
      .filter((p) => p.nombre.toLowerCase().includes(q) || (p.medida ?? "").toLowerCase().includes(q))
      .slice(0, 30);
  }, [productos, busqueda]);

  const getPrecio = (productoId: number): number | null => {
    const d = (catalogoCliente?.detalle ?? []).find((x: any) => x.productoId === productoId);
    return d ? Number(d.precioUnitario) : null;
  };

  // Al cambiar de cliente se conservan los productos y se les pone el precio de
  // la lista del cliente nuevo. Los que ese cliente no tenga en lista quedan en
  // $0 y se avisan: la validacion de "precio $0" ya impide guardar asi.
  useEffect(() => {
    if (!reprecificarPend || !clienteId) return;
    // Si el cliente tiene listas, se espera a que llegue su catalogo
    if (tieneListasAsignadas && !catalogoCliente) return;

    const sinPrecio: string[] = [];
    setLineas((prev) => prev.map((l) => {
      const raw = getPrecio(l.productoId);
      if (raw === null) {
        sinPrecio.push(`${l.nombre} ${l.medida}`.trim());
        return { ...l, precioUnitario: 0 };
      }
      return { ...l, precioUnitario: redondearPrecio(raw, l.nombre) };
    }));
    setReprecificarPend(false);

    if (sinPrecio.length > 0) {
      const NL = String.fromCharCode(10);
      const nombreCli = clienteSeleccionado?.nombre ?? "este cliente";
      const masCortos = sinPrecio.slice(0, 8).map((n) => "· " + n).join(NL);
      const resto = sinPrecio.length > 8 ? NL + "… y " + (sinPrecio.length - 8) + " más" : "";
      alert(
        "Se conservaron los productos y se les puso el precio de " + nombreCli + "." + NL + NL +
        sinPrecio.length + " sin precio en su lista (quedaron en $0):" + NL + masCortos + resto + NL + NL +
        "Escribe su precio en la columna Precio Unit. o quita esas líneas."
      );
    }
  }, [reprecificarPend, clienteId, catalogoCliente, tieneListasAsignadas]);

  // ── Crear producto sobre la marcha (solo master/admin) ────────────────────
  const [modalProducto, setModalProducto] = useState(false);
  const [nuevoProd, setNuevoProd] = useState({ nombre: "", medida: "", categoriaId: "", origen: "INTERNO", pesoUnitarioKg: "", precio: "" });
  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: categoriasApi.listar,
    enabled: modalProducto,
  });
  const crearProducto = useMutation({
    mutationFn: () => productosApi.crear({
      nombre: nuevoProd.nombre.trim(),
      medida: nuevoProd.medida.trim(),
      categoriaId: Number(nuevoProd.categoriaId),
      origen: nuevoProd.origen,
      pesoUnitarioKg: nuevoProd.pesoUnitarioKg ? Number(nuevoProd.pesoUnitarioKg) : undefined,
    }),
    onSuccess: (p: any) => {
      // Entra directo a la cotización con el precio indicado (precio manual);
      // para dejarlo fijo, agregarlo luego a la lista de precios del cliente.
      const catNombre = (categorias as any[]).find((c: any) => c.id === Number(nuevoProd.categoriaId))?.nombre;
      agregarProducto({ ...p, categoria: p.categoria ?? (catNombre ? { nombre: catNombre } : undefined) }, Number(nuevoProd.precio) > 0 ? Number(nuevoProd.precio) : 0);
      qc.invalidateQueries({ queryKey: ["productos"] });
      setModalProducto(false);
      setNuevoProd({ nombre: "", medida: "", categoriaId: "", origen: "INTERNO", pesoUnitarioKg: "", precio: "" });
    },
    onError: (e: any) => alert(e?.response?.data?.error ?? "No se pudo crear el producto"),
  });

  // Cargar cantidades es lo que mas se repite al armar una cotizacion: se
  // agregan todos los productos y despues se baja escribiendo cantidad tras
  // cantidad. Con el TAB normal el cursor pasaba por Desc %, la nota y el boton
  // de borrar antes de llegar a la siguiente cantidad. Estas referencias
  // permiten que TAB (y Enter) salten derecho de una cantidad a la de abajo.
  const cantidadRefs = useRef<(HTMLInputElement | null)[]>([]);

  const saltarACantidad = (destino: number) => {
    const el = cantidadRefs.current[destino];
    if (!el || !el.isConnected) return false;
    el.focus();
    el.select();
    return true;
  };

  const agregarProducto = (p: any, precioForzado?: number) => {
    const rawPrecio = precioForzado ?? getPrecio(p.id);
    if (rawPrecio === null) {
      // Master/Admin puede agregarlo con precio manual (lo escribe en la línea);
      // el vendedor sigue necesitando que esté en la lista.
      if (puedeEditar) {
        if (!confirm(`"${p.nombre} ${p.medida}" no tiene precio en la lista de este cliente.\n\n¿Agregarlo con PRECIO MANUAL? (escríbelo en la columna Precio Unit.)`)) {
          setBusqueda(""); setDropdownAbierto(false); return;
        }
      } else {
        alert(`"${p.nombre} ${p.medida}" no tiene precio en la lista de este cliente.\n\nAgrégalo en Listas de Precios.`);
        setBusqueda(""); setDropdownAbierto(false); return;
      }
    }
    const precio = rawPrecio === null ? 0 : redondearPrecio(rawPrecio, p.nombre);
    setLineas((prev) => {
      const existe = prev.find((l) => l.productoId === p.id);
      if (existe) {
        return prev.map((l) => l.productoId === p.id ? { ...l, cantidad: l.cantidad + 1 } : l);
      }
      return [...prev, { productoId: p.id, nombre: p.nombre, medida: p.medida ?? "", origen: p.origen ?? "INTERNO", codigo: p.codigo ?? null, categoriaNombre: p.categoria?.nombre, precioUnitario: precio, cantidad: 1, descuentoPct: 0, notaCantidad: "" }];
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

  const lineasPayload = lineas.map((l) => {
    // Si master/admin escribió un precio distinto al de la lista (o el producto
    // no tiene lista), viaja como precio pactado de ESTA cotización.
    const deLista = getPrecio(l.productoId);
    const listaRedondeada = deLista !== null ? redondearPrecio(deLista, l.nombre) : null;
    const esManual = puedeEditar && (listaRedondeada === null || l.precioUnitario !== listaRedondeada);
    return {
      productoId: l.productoId,
      cantidad: l.cantidad,
      descuentoPct: l.descuentoPct || undefined,
      notaCantidad: l.notaCantidad || undefined,
      precioManual: esManual ? l.precioUnitario : undefined,
    };
  });

  const crear = useMutation({
    mutationFn: () => cotizacionesApi.crear({ clienteId, vendedorId: vendedorIdSel || undefined, notas: notas || undefined, validezDias, lineas: lineasPayload }),
    onSuccess: () => navigate("/cotizaciones"),
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al crear la cotización"),
  });

  const guardarEdicion = useMutation({
    mutationFn: () => cotizacionesApi.actualizar(editId!, { clienteId, vendedorId: vendedorIdSel || undefined, notas: notas || undefined, validezDias, lineas: lineasPayload }),
    onSuccess: () => navigate("/cotizaciones"),
    onError: (e: any) => alert(e.response?.data?.error ?? "Error al guardar la cotización"),
  });

  const isPending = crear.isPending || guardarEdicion.isPending;
  const hayPrecioCero = lineas.some((l) => !(l.precioUnitario > 0));
  const puedeCrear = !!clienteId && lineas.length > 0 && !isPending && !hayPrecioCero;
  const handleSubmit = () => editId ? guardarEdicion.mutate() : crear.mutate();

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
        <button onClick={() => navigate("/cotizaciones")} style={btnBack}>
          <ArrowLeft size={15} /> Volver
        </button>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
            {editId ? `Editando ${cotExistente?.numero ?? "…"}` : "Nueva Cotización"}
          </h1>
          <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: 13 }}>
            {editId ? "Modifica los productos o cantidades y guarda los cambios" : "Selecciona cliente y agrega los productos"}
          </p>
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
                const nuevoCliente = Number(e.target.value) || null;
                setClienteId(nuevoCliente);
                setBusqueda("");
                // Antes se borraban las lineas al cambiar de cliente (los precios
                // dependen de su lista). Ahora se conservan y se re-precifican con
                // la lista del cliente nuevo: duplicar y cambiar el cliente es el
                // caso normal cuando otro pide casi lo mismo.
                if (nuevoCliente && lineas.length > 0) setReprecificarPend(true);
                else if (!nuevoCliente) setLineas([]);
              }}
            >
              <option value="">— Seleccionar cliente —</option>
              {(clientes as any[]).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
            {clienteSeleccionado && (
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                {tieneListasAsignadas ? (
                  <>
                    Listas:{" "}
                    {(clienteSeleccionado.listasAsignadas as any[]).map((a: any) => (
                      <strong key={a.listaPrecio.id} style={{ color: "#1d4ed8", marginRight: 6 }}>
                        {a.listaPrecio.nombre}
                      </strong>
                    ))}
                  </>
                ) : (
                  <strong style={{ color: "#dc2626" }}>Sin lista — asígnale una en Clientes</strong>
                )}
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
          {puedeEditar && (
            <div>
              <label style={labelStyle}>Vendedor</label>
              <select
                style={inputStyle}
                value={vendedorIdSel ?? ""}
                onChange={(e) => setVendedorIdSel(Number(e.target.value) || null)}
              >
                <option value="">Yo ({usuario?.nombre ?? "Master/Admin"})</option>
                {(vendedores as any[]).map((v) => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                Si no eliges, tú quedas como vendedor
              </div>
            </div>
          )}
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
          {clienteId && puedeEditar && (
            <button
              onClick={() => setModalProducto(true)}
              title="Crear un producto que no está en el catálogo y agregarlo a esta cotización"
              style={{ display: "flex", alignItems: "center", gap: 6, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#16a34a" }}
            >
              <PackagePlus size={14} /> Crear producto
            </button>
          )}
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
                        {precio !== null ? `$${redondearPrecio(precio, p.nombre).toFixed(p.nombre.toLowerCase().includes("curva") ? 3 : 2)}` : "Sin precio"}
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

        {/* Modal: crear producto sobre la marcha */}
        {modalProducto && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}
            onClick={() => setModalProducto(false)}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "min(480px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Crear producto</h3>
                <button onClick={() => setModalProducto(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={18} /></button>
              </div>
              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Nombre *
                  <input style={inputStyle} value={nuevoProd.nombre} placeholder="Ej: Tubo Gris PVC" onChange={(e) => setNuevoProd({ ...nuevoProd, nombre: e.target.value })} />
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Medida *
                    <input style={inputStyle} value={nuevoProd.medida} placeholder={'Ej: 1/2" x 6mts'} onChange={(e) => setNuevoProd({ ...nuevoProd, medida: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Categoría *
                    <select style={inputStyle} value={nuevoProd.categoriaId} onChange={(e) => setNuevoProd({ ...nuevoProd, categoriaId: e.target.value })}>
                      <option value="">— Elegir —</option>
                      {(categorias as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                  </label>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Origen
                    <select style={inputStyle} value={nuevoProd.origen} onChange={(e) => setNuevoProd({ ...nuevoProd, origen: e.target.value })}>
                      <option value="INTERNO">Fabricado (interno)</option>
                      <option value="EXTERNO">Comprado (externo)</option>
                    </select>
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Peso kg/u
                    <input type="number" min="0" step="0.0001" style={inputStyle} value={nuevoProd.pesoUnitarioKg} placeholder="opcional" onChange={(e) => setNuevoProd({ ...nuevoProd, pesoUnitarioKg: e.target.value })} />
                  </label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>Precio $ *
                    <input type="number" min="0" step="0.01" style={inputStyle} value={nuevoProd.precio} placeholder="0.00" onChange={(e) => setNuevoProd({ ...nuevoProd, precio: e.target.value })} />
                  </label>
                </div>
                <div style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "7px 10px" }}>
                  El precio vale para ESTA cotización (precio manual). Para dejarlo fijo, agrégalo después en Listas de Precios. El peso kg/u se usa para materiales y ganancias: si lo dejas vacío, este producto no aporta kilos al cálculo.
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                <button onClick={() => setModalProducto(false)} style={{ background: "#fff", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                <button
                  onClick={() => crearProducto.mutate()}
                  disabled={!nuevoProd.nombre.trim() || !nuevoProd.medida.trim() || !nuevoProd.categoriaId || !(Number(nuevoProd.precio) > 0) || crearProducto.isPending}
                  style={{ background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: 600, opacity: (!nuevoProd.nombre.trim() || !nuevoProd.medida.trim() || !nuevoProd.categoriaId || !(Number(nuevoProd.precio) > 0)) ? 0.5 : 1 }}
                >
                  {crearProducto.isPending ? "Creando…" : "Crear y agregar"}
                </button>
              </div>
            </div>
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
                  <th style={{ ...thStyle, width: 90 }}>
                    Cantidad
                    {lineas.length > 1 && (
                      <div style={{ fontSize: 10, fontWeight: 400, color: "#94a3b8", marginTop: 1 }}>
                        TAB baja a la siguiente
                      </div>
                    )}
                  </th>
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
                      <td style={{ ...tdStyle, color: "#475569" }}>
                        {puedeEditar ? (() => {
                          const deLista = getPrecio(l.productoId);
                          const listaRed = deLista !== null ? redondearPrecio(deLista, l.nombre) : null;
                          const esManual = listaRed === null || l.precioUnitario !== listaRed;
                          return (
                            <div>
                              <input
                                type="number" min={0} step={l.nombre.toLowerCase().includes("curva") ? 0.001 : 0.01}
                                value={l.precioUnitario === 0 ? "" : l.precioUnitario}
                                placeholder="0.00"
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => actualizarLinea(idx, "precioUnitario", e.target.value === "" ? 0 : Math.max(0, Number(e.target.value)))}
                                style={{ ...inputSmall, width: 88, ...(esManual ? { border: "1.5px solid #f59e0b", background: "#fffbeb" } : {}) }}
                              />
                              {esManual && (
                                <div style={{ fontSize: 10, color: "#b45309", marginTop: 2, whiteSpace: "nowrap" }}>
                                  {listaRed !== null ? `lista: $${listaRed.toFixed(l.nombre.toLowerCase().includes("curva") ? 3 : 2)} · la diferencia va al Extra` : "precio manual (sin lista)"}
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                          <>${l.precioUnitario.toFixed(l.nombre.toLowerCase().includes("curva") ? 3 : 2)}</>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min={1}
                          ref={(el) => { cantidadRefs.current[idx] = el; }}
                          value={l.cantidad === 0 ? "" : l.cantidad}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            // TAB baja a la cantidad siguiente, Shift+TAB sube a
                            // la anterior, Enter hace lo mismo que TAB. En la
                            // ultima linea se deja pasar el TAB normal para
                            // poder salir de la tabla.
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (!saltarACantidad(idx + 1)) e.currentTarget.blur();
                              return;
                            }
                            if (e.key !== "Tab") return;
                            const destino = e.shiftKey ? idx - 1 : idx + 1;
                            if (destino < 0) return;
                            if (saltarACantidad(destino)) e.preventDefault();
                          }}
                          onChange={(e) => {
                            const v = e.target.value;
                            // Permite borrar y escribir libremente; vacío = 0 temporal
                            actualizarLinea(idx, "cantidad", v === "" ? 0 : Math.max(0, Number(v)));
                          }}
                          onBlur={(e) => {
                            // Al salir, si quedó vacío o 0, vuelve a 1
                            if (e.target.value === "" || Number(e.target.value) < 1) actualizarLinea(idx, "cantidad", 1);
                          }}
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
              {hayPrecioCero && (
                <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>Hay líneas con precio $0 — escribe el precio para poder guardar</span>
              )}
              <button
                onClick={handleSubmit}
                disabled={!puedeCrear}
                style={{ ...btnPrimary, opacity: puedeCrear ? 1 : 0.5, cursor: puedeCrear ? "pointer" : "not-allowed" }}
              >
                <FileText size={15} />
                {isPending ? "Guardando..." : editId ? "Guardar Cambios" : "Crear Cotización"}
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
          {ganancia.costoFlete > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7, padding: "6px 8px", background: "#f0fdf4", borderRadius: 7 }}>
              <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Costo Flete</div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>${ganancia.costoFlete.toFixed(2)}</span>
            </div>
          )}

          {ganancia.gananciaVendedor > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", background: "#f0fdf4", borderRadius: 7 }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Ganancia Vendedor</div>
                {ganancia.labelVendedor && <div style={{ fontSize: 10, color: "#94a3b8" }}>{ganancia.labelVendedor}</div>}
              </div>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#166534" }}>${ganancia.gananciaVendedor.toFixed(2)}</span>
            </div>
          )}
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
