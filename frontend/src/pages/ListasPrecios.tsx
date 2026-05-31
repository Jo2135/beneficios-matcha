import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listasApi, productosApi } from "../api/endpoints";
import { Plus, ChevronRight, Save, DollarSign } from "lucide-react";

export default function ListasPrecios() {
  const qc = useQueryClient();
  const [seleccionada, setSeleccionada] = useState<number | null>(null);
  const [editandoPrecios, setEditandoPrecios] = useState<Record<number, string>>({});
  const [nuevaLista, setNuevaLista] = useState(false);
  const [nombreNueva, setNombreNueva] = useState("");

  const { data: listas = [] } = useQuery({ queryKey: ["listas-precios"], queryFn: listasApi.listar });
  const { data: listaDetalle } = useQuery({
    queryKey: ["lista-detalle", seleccionada],
    queryFn: () => listasApi.obtener(seleccionada!),
    enabled: !!seleccionada,
  });
  const { data: productos = [] } = useQuery({ queryKey: ["productos"], queryFn: () => productosApi.listar() });

  const crearLista = useMutation({
    mutationFn: (nombre: string) => listasApi.crear({ nombre }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["listas-precios"] });
      setNuevaLista(false);
      setNombreNueva("");
      setSeleccionada(data.id);
    },
  });

  const guardarPrecios = useMutation({
    mutationFn: () => {
      const lineas = Object.entries(editandoPrecios)
        .filter(([, v]) => v !== "")
        .map(([productoId, precio]) => ({ productoId: Number(productoId), precioUnitario: Number(precio) }));
      return listasApi.actualizarDetalle(seleccionada!, lineas);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lista-detalle", seleccionada] });
      setEditandoPrecios({});
    },
  });

  // Mezcla precios existentes con todos los productos
  const preciosPorProducto: Record<number, number> = {};
  listaDetalle?.detalle?.forEach((d: any) => {
    preciosPorProducto[d.productoId] = Number(d.precioUnitario);
  });

  const getDisplayPrecio = (productoId: number) => {
    if (editandoPrecios[productoId] !== undefined) return editandoPrecios[productoId];
    return preciosPorProducto[productoId]?.toFixed(4) ?? "";
  };

  const categorias = [...new Set(productos.map((p: any) => p.categoria?.nombre))].filter(Boolean).sort();

  const hayCambios = Object.keys(editandoPrecios).length > 0;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Listas de Precios</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Gestión de precios por cliente</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20 }}>
        {/* Panel izquierdo: lista de listas */}
        <div style={cardStyle}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Listas ({listas.length})</span>
            <button onClick={() => setNuevaLista(true)} style={{ ...btnIcon, background: "#dbeafe", color: "#1d4ed8" }}><Plus size={14} /></button>
          </div>

          {nuevaLista && (
            <div style={{ padding: 12, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <input
                autoFocus
                style={{ ...inputStyle, marginBottom: 8 }}
                value={nombreNueva}
                onChange={(e) => setNombreNueva(e.target.value)}
                placeholder="Nombre de la lista"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nombreNueva) crearLista.mutate(nombreNueva);
                  if (e.key === "Escape") { setNuevaLista(false); setNombreNueva(""); }
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => crearLista.mutate(nombreNueva)} disabled={!nombreNueva} style={{ ...btnPrimary, fontSize: 12, padding: "5px 10px" }}>Crear</button>
                <button onClick={() => { setNuevaLista(false); setNombreNueva(""); }} style={{ ...btnSecondary, fontSize: 12, padding: "5px 10px" }}>Cancelar</button>
              </div>
            </div>
          )}

          {listas.map((l: any) => (
            <div
              key={l.id}
              onClick={() => setSeleccionada(l.id)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                background: seleccionada === l.id ? "#eff6ff" : "transparent",
                borderLeft: seleccionada === l.id ? "3px solid #2563eb" : "3px solid transparent",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: seleccionada === l.id ? 600 : 400, color: "#1e293b" }}>{l.nombre}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{l._count?.detalle ?? 0} precios cargados</div>
              </div>
              <ChevronRight size={14} style={{ color: "#94a3b8" }} />
            </div>
          ))}
        </div>

        {/* Panel derecho: precios */}
        {seleccionada ? (
          <div style={cardStyle}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span style={{ fontSize: 15, fontWeight: 600, color: "#1e293b" }}>{listaDetalle?.nombre}</span>
                <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>Editar precios</span>
              </div>
              {hayCambios && (
                <button onClick={() => guardarPrecios.mutate()} disabled={guardarPrecios.isPending} style={{ ...btnPrimary, gap: 6 }}>
                  <Save size={14} />{guardarPrecios.isPending ? "Guardando..." : `Guardar (${Object.keys(editandoPrecios).length} cambios)`}
                </button>
              )}
            </div>

            <div style={{ padding: 20 }}>
              {categorias.map((cat) => {
                const prodsCat = productos.filter((p: any) => p.categoria?.nombre === cat && p.activo);
                return (
                  <div key={cat as string} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#7c3aed", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 6 }}>
                      <DollarSign size={13} />{cat as string}
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#f8fafc" }}>
                          <th style={thStyle}>Producto</th>
                          <th style={thStyle}>Medida</th>
                          <th style={{ ...thStyle, width: 180 }}>Precio USD</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prodsCat.map((p: any) => {
                          const valor = getDisplayPrecio(p.id);
                          const tienePrecio = !!preciosPorProducto[p.id];
                          const modificado = editandoPrecios[p.id] !== undefined;
                          return (
                            <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9", background: modificado ? "#fffbeb" : "transparent" }}>
                              <td style={tdStyle}>{p.nombre}</td>
                              <td style={tdStyle}><span style={tagStyle}>{p.medida}</span></td>
                              <td style={{ ...tdStyle, position: "relative" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ color: "#64748b", fontSize: 13 }}>$</span>
                                  <input
                                    type="number"
                                    value={valor}
                                    step="0.0001"
                                    placeholder="0.0000"
                                    onChange={(e) => setEditandoPrecios({ ...editandoPrecios, [p.id]: e.target.value })}
                                    style={{
                                      ...inputStyle,
                                      width: 130,
                                      textAlign: "right",
                                      border: modificado ? "2px solid #f59e0b" : tienePrecio ? "1px solid #d1d5db" : "1px dashed #d1d5db",
                                      background: tienePrecio && !modificado ? "#fff" : "#fffbeb",
                                    }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 14 }}>
            Selecciona una lista para editar sus precios
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const btnIcon: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" };
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const thStyle: React.CSSProperties = { padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "8px 12px", fontSize: 13, color: "#374151" };
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", background: "#f1f5f9", borderRadius: 4, fontSize: 11, color: "#475569" };
const inputStyle: React.CSSProperties = { padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, outline: "none", boxSizing: "border-box" };
