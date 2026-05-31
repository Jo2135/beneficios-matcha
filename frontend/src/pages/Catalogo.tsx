import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { productosApi, categoriasApi } from "../api/endpoints";
import { Plus, Search, Edit2, Weight } from "lucide-react";

const ORIGENES = ["INTERNO", "EXTERNO"];

export default function Catalogo() {
  const qc = useQueryClient();
  const [busqueda, setBusqueda] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<any>({});

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

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Catálogo de Productos</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{productos.length} productos</p>
        </div>
        <button onClick={() => abrir()} style={btnPrimary}><Plus size={16} /> Nuevo Producto</button>
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
              {["Producto", "Medida", "Categoría", "Origen", "Peso/unid (kg)", "Factor Costo/kg", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p: any) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
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
                  <button onClick={() => abrir(p)} style={btnIcon}><Edit2 size={14} /></button>
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
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setModal(false)} style={btnSecondary}>Cancelar</button>
              <button onClick={() => guardar.mutate(form)} disabled={!form.nombre || !form.medida || !form.categoriaId || guardar.isPending} style={btnPrimary}>
                {guardar.isPending ? "Guardando..." : "Guardar"}
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
const btnIcon: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "10px 16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#f1f5f9", borderRadius: 4, fontSize: 12, color: "#475569" };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" };
