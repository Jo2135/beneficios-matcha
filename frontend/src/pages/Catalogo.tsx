import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productosApi, categoriasApi } from "../api/endpoints";
import { Plus, Search, Edit2, Weight, ImagePlus, Trash2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

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

  const { data: productos = [] } = useQuery({
    queryKey: ["productos"],
    queryFn: () => productosApi.listar(),
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias"],
    queryFn: categoriasApi.listar,
  });

  const guardar = useMutation({
    mutationFn: (data: any) =>
      data.id ? productosApi.actualizar(data.id, data) : productosApi.crear(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productos"] });
      setModal(false);
      setForm({});
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
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.medida.toLowerCase().includes(busqueda.toLowerCase());
    const matchOrigen = !filtroOrigen || p.origen === filtroOrigen;
    const matchCat = !filtroCategoria || p.categoriaId === Number(filtroCategoria);
    return matchBusq && matchOrigen && matchCat;
  });

  const abrir = (prod?: any) => {
    setForm(prod ?? { origen: "INTERNO", activo: true });
    setModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && form.id) {
      subirImagen.mutate({ id: form.id, file });
    }
    e.target.value = "";
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Catálogo de Productos</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{productos.length} productos</p>
        </div>
        {puedeEditar && (
          <button onClick={() => abrir()} style={btnPrimary}><Plus size={16} /> Nuevo Producto</button>
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
              {["", "Producto", "Medida", "Categoría", "Origen", "Peso/unid (kg)", "Factor Costo/kg", ""].map((h, i) => (
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
                <input style={inputStyle} value={form.nombre || ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Medida *</label>
                <input style={inputStyle} value={form.medida || ""} placeholder='Ej: 1/2" x 6mts' onChange={(e) => setForm({ ...form, medida: e.target.value })} />
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
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" };
