import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productosApi, categoriasApi } from "../api/endpoints";
import { Plus, Search, Edit2, Weight, ImagePlus, Trash2, Upload, FileText, CheckCircle, AlertCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import * as XLSX from "xlsx";

const ORIGENES = ["INTERNO", "EXTERNO"];
const API_BASE = import.meta.env.VITE_API_URL?.replace("/api", "") ?? "http://localhost:5101";

export default function Catalogo() {
  const qc = useQueryClient();
  const { puedeEditar } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [modalImport, setModalImport] = useState(false);
  const [filasPreview, setFilasPreview] = useState<any[]>([]);
  const [resultImport, setResultImport] = useState<any>(null);
  const [omitidasSinCodigo, setOmitidasSinCodigo] = useState(0);
  const [categoriaDefault, setCategoriaDefault] = useState("Externo");

  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => productosApi.listar(),
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: categoriasApi.listar,
  });

  // Aviso de producto repetido: se consulta mientras se escribe y el backend
  // vuelve a revisar al guardar (409) por si el aviso no llegó a tiempo.
  const [similares, setSimilares] = useState<any[]>([]);
  const [bloqueoDuplicado, setBloqueoDuplicado] = useState<any[] | null>(null);
  const timerSimil = useRef<any>(null);

  const revisarSimilares = (f: any) => {
    clearTimeout(timerSimil.current);
    if (!f.nombre || f.nombre.trim().length < 3) { setSimilares([]); return; }
    timerSimil.current = setTimeout(() => {
      productosApi.similares({ nombre: f.nombre, medida: f.medida, id: f.id })
        .then((r) => setSimilares(r.similares ?? []))
        .catch(() => setSimilares([]));
    }, 400);
  };

  const guardar = useMutation({
    mutationFn: (data: any) =>
      data.id ? productosApi.actualizar(data.id, data) : productosApi.crear(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      setModal(false);
      setForm({});
      setSimilares([]);
      setBloqueoDuplicado(null);
    },
    onError: (e: any) => {
      const d = e?.response?.data;
      if (d?.codigoError === "PRODUCTO_SIMILAR") setBloqueoDuplicado(d.similares);
      else alert(d?.error ?? "No se pudo guardar el producto");
    },
  });

  const subirImagen = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) =>
      productosApi.subirImagen(id, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      setForm((prev: any) => ({ ...prev, imagenUrl: data.imagenUrl }));
    },
  });

  const eliminarImagen = useMutation({
    mutationFn: (id: number) => productosApi.eliminarImagen(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      setForm((prev: any) => ({ ...prev, imagenUrl: null }));
    },
  });

  const filtrados = productos.filter((p: any) => {
    const matchBusq =
      (p.codigo?.toLowerCase() ?? "").includes(busqueda.toLowerCase()) ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.medida.toLowerCase().includes(busqueda.toLowerCase());
    const matchOrigen = !filtroOrigen || p.origen === filtroOrigen;
    const matchCat = !filtroCategoria || p.categoriaId === Number(filtroCategoria);
    return matchBusq && matchOrigen && matchCat;
  });

  const abrir = (prod?: any) => {
    setForm(prod ?? { origen: "INTERNO", activo: true });
    setSimilares([]);
    setBloqueoDuplicado(null);
    setModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && form.id) {
      subirImagen.mutate({ id: form.id, file });
    }
    e.target.value = "";
  };

  const importarMutation = useMutation({
    mutationFn: () => {
      // Resolver categoría: si la fila trae una válida la usa; si no, la categoría por defecto
      const validNames = new Map((categorias as any[]).map((c: any) => [c.nombre.toLowerCase().trim(), c.nombre]));
      const payload = filasPreview.map((f) => {
        const propia = validNames.get(String(f.categoria ?? "").toLowerCase().trim());
        return { ...f, categoria: propia ?? categoriaDefault };
      });
      return productosApi.importar(payload);
    },
    onSuccess: (data) => {
      setResultImport(data);
      qc.invalidateQueries({ queryKey: ["productos"] });
    },
    onError: (e: any) => alert(e.response?.data?.error ?? e.message),
  });

  // Normaliza texto: minúsculas, sin tildes, sin espacios extra
  const norm = (s: any) =>
    String(s ?? "").toLowerCase().trim()
      .replace(/[áàä]/g, "a").replace(/[éèë]/g, "e").replace(/[íìï]/g, "i")
      .replace(/[óòö]/g, "o").replace(/[úùü]/g, "u");

  const onArchivoImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setResultImport(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      if (rows.length === 0) { alert("El archivo está vacío."); return; }

      // 1) Detectar la fila de encabezados: la primera (de las primeras 15) que tenga la columna "codigo"
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const celdas = (rows[i] as any[]).map(norm);
        if (celdas.some((c) => c === "codigo" || c === "code")) { headerIdx = i; break; }
      }
      if (headerIdx === -1) {
        alert('No encontré una columna llamada "codigo".\n\nEl archivo debe tener una fila de encabezado que incluya la columna "codigo". Revisa el formato que se muestra en la ventana.');
        return;
      }

      const headers = (rows[headerIdx] as any[]).map(norm);
      const col = (key: string) => {
        const variantes: Record<string, string[]> = {
          codigo:       ["codigo", "code"],
          nombre:       ["nombre", "producto", "name", "conexion", "descripcion producto"],
          medida:       ["medida", "diametro", "tipo", "tamano", "size", "dimension", "pulgada", "pulgadas"],
          categoria:    ["categoria", "category", "cat"],
          origen:       ["origen", "origin"],
          peso:         ["peso", "kg", "peso kg", "peso unitario", "pesounitariokg"],
          costocompra:  ["costocompra", "costo compra", "costo", "costo $", "costo$", "precio compra", "costo de compra"],
          descripcion:  ["descripcion", "description", "desc", "observacion", "observaciones", "nota"],
        };
        for (const v of variantes[key] ?? [key]) {
          const idx = headers.indexOf(v);
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const cCod = col("codigo"), cNom = col("nombre"), cMed = col("medida"),
            cCat = col("categoria"), cOri = col("origen"), cPeso = col("peso"),
            cCosto = col("costocompra"), cDesc = col("descripcion");

      // 2) Tomar SOLO filas con código (después del encabezado). Las demás se ignoran.
      const dataRows = rows.slice(headerIdx + 1);
      let conContenidoSinCodigo = 0;
      const filas = dataRows.map((row: any[]) => {
        const get = (idx: number) => (idx !== -1 ? String(row[idx] ?? "").trim() : "");
        return {
          codigo: get(cCod),
          nombre: get(cNom),
          medida: get(cMed),
          categoria: get(cCat),
          origen: get(cOri) || "INTERNO",
          pesoUnitarioKg: get(cPeso) ? Number(get(cPeso)) || undefined : undefined,
          costoCompra: get(cCosto) ? Number(get(cCosto)) || undefined : undefined,
          descripcion: get(cDesc) || undefined,
        };
      }).filter((f) => {
        if (f.codigo) return true;
        if (f.nombre) conContenidoSinCodigo++; // filas con texto pero sin código (se ignoran)
        return false;
      });

      if (filas.length === 0) {
        alert("No encontré ninguna fila con código para importar.\n\nSolo se importan las filas que tengan un código en la columna 'codigo'.");
        return;
      }

      setOmitidasSinCodigo(conContenidoSinCodigo);
      setFilasPreview(filas);
      setModalImport(true);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Catálogo de Productos</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{productos.length} productos</p>
        </div>
        {puedeEditar && (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => importInputRef.current?.click()} style={btnSecondary}>
              <Upload size={16} /> Importar Excel
            </button>
            <input ref={importInputRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={onArchivoImport} />
            <button onClick={() => abrir()} style={btnPrimary}><Plus size={16} /> Nuevo Producto</button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1", minWidth: 200 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto o medida..." style={{ ...inputStyle, paddingLeft: 38 }} />
        </div>
        <select style={{ ...inputStyle, width: "auto" }} value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value)}>
          <option value="">Todos los orígenes</option>
          {ORIGENES.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select style={{ ...inputStyle, width: "auto" }} value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["", "Código", "Producto", "Medida", "Categoría", "Origen", "Peso/unid (kg)", "Factor Costo/kg", ""].map((h, i) => (
                <th key={i} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={{ ...tdStyle, width: 48, padding: "8px 12px" }}>
                  {p.imagenUrl ? (
                    <img
                      src={`${API_BASE}${p.imagenUrl}`}
                      alt={p.nombre}
                      style={{ width: 36, height: 36, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }}
                    />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 6, background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ImagePlus size={14} color="#cbd5e1" />
                    </div>
                  )}
                </td>
                <td style={tdStyle}>
                  {p.codigo
                    ? <span style={codigoStyle}>{p.codigo}</span>
                    : <span style={{ color: "#cbd5e1", fontSize: 12 }}>—</span>
                  }
                </td>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 500, color: "#1e293b" }}>{p.nombre}</div>
                  {p.descripcion && <div style={{ fontSize: 12, color: "#94a3b8" }}>{p.descripcion}</div>}
                </td>
                <td style={tdStyle}><span style={tagStyle}>{p.medida}</span></td>
                <td style={tdStyle}>
                  <span style={{ ...tagStyle, background: "#ede9fe", color: "#5b21b6" }}>{p.categoria?.nombre}</span>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    ...tagStyle,
                    background: p.origen === "INTERNO" ? "#dcfce7" : "#fef3c7",
                    color: p.origen === "INTERNO" ? "#166534" : "#92400e",
                  }}>{p.origen}</span>
                </td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#475569" }}>
                    <Weight size={13} />{p.pesoUnitarioKg ?? "—"}
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontWeight: 600, color: "#1e293b" }}>
                    {p.categoria?.factorCostoKg} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 12 }}>× kg</span>
                  </span>
                </td>
                <td style={{ ...tdStyle, width: 40 }}>
                  {puedeEditar && (
                    <button onClick={() => abrir(p)} style={btnIcon}><Edit2 size={14} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>No se encontraron productos</div>
        )}
      </div>

      {/* Modal Importar Excel */}
      {modalImport && (
        <div style={modalOverlay} onClick={() => { setModalImport(false); setResultImport(null); }}>
          <div style={{ ...modalBox, width: "min(680px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Importar Productos desde Excel</h2>
              <button onClick={() => { setModalImport(false); setResultImport(null); }} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>

            {/* Formato esperado — SIEMPRE visible */}
            <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><FileText size={13} /> Orden de columnas que debes seguir en el Excel:</div>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#dcfce7" }}>
                    {["codigo *", "nombre *", "medida", "categoria", "origen", "peso", "descripcion"].map((h) => (
                      <th key={h} style={{ padding: "3px 8px", fontSize: 11, fontFamily: "monospace", textAlign: "left", fontWeight: 700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {["TUAZ-1/2", "Tubo Azul", '1/2"', "Azul", "INTERNO", "0.25", "Agua fría"].map((v, i) => (
                      <td key={i} style={{ padding: "3px 8px", fontSize: 11, fontFamily: "monospace", color: "#166534" }}>{v}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "#374151", lineHeight: 1.6 }}>
                <li><strong>Solo se importan las filas que tengan código</strong> (las demás se ignoran: títulos, filas vacías, etc.).</li>
                <li>Si el <strong>código</strong> ya existe, el producto se <em>actualiza</em>; si no existe, se <em>crea</em>.</li>
                <li>Los encabezados pueden estar en cualquier fila. Acepta nombres flexibles: <code>diametro</code>/<code>tipo</code> = medida.</li>
                <li>Si una fila no trae <strong>categoria</strong> válida, se usa la <strong>categoría por defecto</strong> de abajo.</li>
              </ul>
            </div>

            {/* Resultado */}
            {resultImport ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: "#dcfce7", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#166534" }}>{resultImport.creados}</div>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Creados</div>
                  </div>
                  <div style={{ background: "#dbeafe", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#1d4ed8" }}>{resultImport.actualizados}</div>
                    <div style={{ fontSize: 12, color: "#1d4ed8", fontWeight: 600 }}>Actualizados</div>
                  </div>
                  <div style={{ background: resultImport.errores.length > 0 ? "#fee2e2" : "#f1f5f9", borderRadius: 8, padding: "12px 16px", textAlign: "center" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: resultImport.errores.length > 0 ? "#dc2626" : "#64748b" }}>{resultImport.errores.length}</div>
                    <div style={{ fontSize: 12, color: resultImport.errores.length > 0 ? "#dc2626" : "#64748b", fontWeight: 600 }}>Errores</div>
                  </div>
                </div>
                {resultImport.omitidasSinCodigo > 0 && (
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, textAlign: "center" }}>
                    {resultImport.omitidasSinCodigo} fila(s) sin código fueron ignoradas.
                  </div>
                )}
                {resultImport.errores.length > 0 && (
                  <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 12, maxHeight: 150, overflowY: "auto" }}>
                    {resultImport.errores.map((e: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: "#dc2626", marginBottom: 4, display: "flex", gap: 6 }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                        {e.mensaje}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => { setModalImport(false); setResultImport(null); }} style={{ ...btnPrimary }}>
                    <CheckCircle size={15} /> Listo
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Categoría por defecto */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a", whiteSpace: "nowrap" }}>Categoría por defecto:</label>
                  <select style={{ ...inputStyle, width: "auto", flex: 1 }} value={categoriaDefault} onChange={(e) => setCategoriaDefault(e.target.value)}>
                    {(categorias as any[]).map((c: any) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "#64748b" }}>se aplica a filas sin categoría válida</span>
                </div>

                {/* Aviso de filas ignoradas */}
                {omitidasSinCodigo > 0 && (
                  <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
                    {omitidasSinCodigo} fila(s) con texto pero <strong>sin código</strong> serán ignoradas (no se importan).
                  </div>
                )}

                {/* Preview de filas */}
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>
                  {filasPreview.length} productos con código — vista previa:
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 240, overflowY: "auto", marginBottom: 16 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                        {["#", "Código", "Nombre", "Medida", "Categoría", "Origen", "Peso"].map((h) => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filasPreview.slice(0, 50).map((f, i) => {
                        const catValida = (categorias as any[]).find((c: any) => c.nombre.toLowerCase().trim() === String(f.categoria ?? "").toLowerCase().trim());
                        const catFinal = catValida ? catValida.nombre : categoriaDefault;
                        return (
                        <tr key={i} style={{ borderBottom: "1px solid #f8fafc" }}>
                          <td style={{ padding: "5px 10px", color: "#94a3b8" }}>{i + 1}</td>
                          <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 11, color: "#1d4ed8" }}>{f.codigo || "—"}</td>
                          <td style={{ padding: "5px 10px", fontWeight: 500 }}>{f.nombre}</td>
                          <td style={{ padding: "5px 10px" }}>{f.medida}</td>
                          <td style={{ padding: "5px 10px", color: catValida ? "#7c3aed" : "#94a3b8" }}>{catFinal}{!catValida && " (def.)"}</td>
                          <td style={{ padding: "5px 10px" }}>{f.origen}</td>
                          <td style={{ padding: "5px 10px" }}>{f.pesoUnitarioKg ?? "—"}</td>
                        </tr>
                        );
                      })}
                      {filasPreview.length > 50 && (
                        <tr><td colSpan={7} style={{ padding: "8px 10px", color: "#94a3b8", textAlign: "center" }}>... y {filasPreview.length - 50} más</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button onClick={() => { setModalImport(false); setResultImport(null); }} style={btnSecondary}>Cancelar</button>
                  <button
                    onClick={() => importarMutation.mutate()}
                    disabled={filasPreview.length === 0 || importarMutation.isPending}
                    style={btnPrimary}
                  >
                    {importarMutation.isPending ? "Importando..." : `Importar ${filasPreview.length} productos`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={modalOverlay} onClick={() => setModal(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>
              {form.id ? "Editar Producto" : "Nuevo Producto"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Nombre del Producto *</label>
                <input
                  style={inputStyle}
                  value={form.nombre || ""}
                  onChange={(e) => { const f = { ...form, nombre: e.target.value }; setForm(f); revisarSimilares(f); }}
                />
              </div>

              {similares.length > 0 && (
                <div style={{ gridColumn: "1/-1", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: "#92400e", fontSize: 13, marginBottom: 8 }}>
                    <AlertCircle size={16} />
                    Ya hay {similares.length === 1 ? "un producto parecido" : `${similares.length} productos parecidos`} en el catálogo
                  </div>
                  {similares.map((s: any) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", borderTop: "1px solid #fde68a" }}>
                      <span style={{ fontFamily: "monospace", color: "#78350f", minWidth: 96 }}>{s.codigo ?? "sin código"}</span>
                      <span style={{ flex: 1 }}>{s.nombre} {s.medida}</span>
                      <span style={{ color: "#a16207", fontSize: 12 }}>{s.puntaje}%</span>
                      {!form.id && (
                        <button
                          type="button"
                          onClick={() => { setForm({ ...s, id: s.id }); setSimilares([]); }}
                          style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                        >
                          Usar este
                        </button>
                      )}
                    </div>
                  ))}
                  <div style={{ fontSize: 12, color: "#92400e", marginTop: 6 }}>
                    Si de verdad es un producto distinto, puedes guardarlo igual.
                  </div>
                </div>
              )}
              <div>
                <label style={labelStyle}>Código</label>
                <input style={{ ...inputStyle, fontFamily: "monospace", textTransform: "uppercase" }} value={form.codigo || ""} placeholder="Ej: TUAZ-1/2" onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() || null })} />
              </div>
              <div>
                <label style={labelStyle}>Medida *</label>
                <input style={inputStyle} value={form.medida || ""} placeholder='Ej: 1/2" x 6mts' onChange={(e) => { const f = { ...form, medida: e.target.value }; setForm(f); revisarSimilares(f); }} />
              </div>
              <div>
                <label style={labelStyle}>Origen *</label>
                <select style={inputStyle} value={form.origen || "INTERNO"} onChange={(e) => setForm({ ...form, origen: e.target.value })}>
                  <option value="INTERNO">INTERNO (fabricado en fábrica)</option>
                  <option value="EXTERNO">EXTERNO (comprado para reventa)</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Categoría de Costo *</label>
                <select style={inputStyle} value={form.categoriaId || ""} onChange={(e) => setForm({ ...form, categoriaId: Number(e.target.value) })}>
                  <option value="">Seleccionar...</option>
                  {categorias.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nombre} (×{c.factorCostoKg}/kg)</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Peso por Unidad (kg)</label>
                <input type="number" style={inputStyle} value={form.pesoUnitarioKg || ""} step="0.001" placeholder="0.000" onChange={(e) => setForm({ ...form, pesoUnitarioKg: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div>
                <label style={labelStyle}>Costo de Compra ($)</label>
                <input type="number" style={inputStyle} value={form.costoCompra ?? ""} step="0.0001" placeholder="0.0000" onChange={(e) => setForm({ ...form, costoCompra: e.target.value ? Number(e.target.value) : null })} />
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Precio publicado del proveedor (para conexiones)</div>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Descripción</label>
                <input style={inputStyle} value={form.descripcion || ""} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
              </div>

              {/* Imagen — solo si ya existe el producto y tiene permisos */}
              {form.id && puedeEditar && (
                <div style={{ gridColumn: "1/-1" }}>
                  <label style={labelStyle}>Imagen del Producto</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4 }}>
                    {form.imagenUrl ? (
                      <>
                        <img
                          src={`${API_BASE}${form.imagenUrl}`}
                          alt="producto"
                          style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={subirImagen.isPending}
                            style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                          >
                            <ImagePlus size={14} />
                            {subirImagen.isPending ? "Subiendo..." : "Cambiar imagen"}
                          </button>
                          <button
                            type="button"
                            onClick={() => eliminarImagen.mutate(form.id)}
                            disabled={eliminarImagen.isPending}
                            style={{ ...btnDanger, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                          >
                            <Trash2 size={14} />
                            {eliminarImagen.isPending ? "Eliminando..." : "Quitar imagen"}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={subirImagen.isPending}
                        style={{ ...btnSecondary, display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
                      >
                        <ImagePlus size={14} />
                        {subirImagen.isPending ? "Subiendo..." : "Agregar imagen"}
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.webp"
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>JPG, PNG o WEBP · máx 5 MB</span>
                  </div>
                  {!form.id && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#94a3b8" }}>Guarda el producto primero para poder agregar una imagen.</p>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setModal(false)} style={btnSecondary}>Cancelar</button>
              {puedeEditar && (
                <button onClick={() => guardar.mutate(form)} disabled={!form.nombre || !form.medida || !form.categoriaId || guardar.isPending} style={btnPrimary}>
                  {guardar.isPending ? "Guardando..." : "Guardar"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Confirmación cuando el backend detecta que el producto ya existe */}
      {bloqueoDuplicado && (
        <div style={{ ...modalOverlay, zIndex: 60 }} onClick={() => setBloqueoDuplicado(null)}>
          <div style={{ ...modalBox, width: "min(560px, 95vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <AlertCircle size={22} color="#d97706" />
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Este producto ya existe</h2>
            </div>
            <p style={{ margin: "0 0 14px", fontSize: 14, color: "#475569" }}>
              Estás por crear <b>{form.nombre} {form.medida}</b>, pero el catálogo ya tiene:
            </p>
            {bloqueoDuplicado.map((s: any) => (
              <div key={s.id} style={{ background: "#f8fafc", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <b style={{ fontSize: 14 }}>{s.nombre} {s.medida}</b>
                  <span style={{ fontSize: 12, color: "#64748b" }}>{s.puntaje}% parecido</span>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  {s.codigo ?? "sin código"} · {s.motivos?.join(" · ")}
                </div>
              </div>
            ))}
            <p style={{ fontSize: 13, color: "#92400e", background: "#fffbeb", borderRadius: 8, padding: "10px 12px" }}>
              Si creas otro registro, el precio y el costo de este producto quedarán repartidos entre dos fichas
              y los reportes de ganancias no lo sumarán junto.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 18 }}>
              <button
                onClick={() => { const s = bloqueoDuplicado[0]; setForm({ ...form, id: s.id }); setBloqueoDuplicado(null); }}
                style={btnSecondary}
              >
                Editar el existente
              </button>
              <button
                onClick={() => { setBloqueoDuplicado(null); guardar.mutate({ ...form, confirmarDuplicado: true }); }}
                style={{ ...btnPrimary, background: "#d97706" }}
              >
                Es distinto, crearlo igual
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnDanger: React.CSSProperties = { background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnIcon: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#f1f5f9", borderRadius: 4, fontSize: 12, color: "#475569" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const codigoStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, fontSize: 12, fontFamily: "monospace", fontWeight: 600 };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" };
