import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { vendedoresApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Plus, Edit2, UserCheck, UserX, GitMerge, X } from "lucide-react";

interface Vendedor {
  id: number; nombre: string; comisionPct: number; comisionReferidoPct: number;
  gananciaMuchachosPct: number; activo: boolean;
  usuario?: { id: number; nombre: string; email: string } | null;
  _count: { clientes: number; cotizaciones: number };
}

export default function Vendedores() {
  const qc = useQueryClient();
  const { esMaster, puedeEditar } = useAuth();
  const [modal, setModal] = useState<{ abierto: boolean; datos: any } | null>(null);
  const [form, setForm] = useState<any>({});
  const [fusion, setFusion] = useState<{ origen: Vendedor; destinoId: number | null } | null>(null);

  const { data: vendedores = [] } = useQuery<Vendedor[]>({
    queryKey: ["vendedores-admin"],
    queryFn: vendedoresApi.listarAdmin,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["vendedores-admin"] });
    qc.invalidateQueries({ queryKey: ["vendedores"] });
  };

  const guardar = useMutation({
    mutationFn: (data: any) => data.id ? vendedoresApi.actualizar(data.id, data) : vendedoresApi.crear(data),
    onSuccess: () => { invalidar(); setModal(null); setForm({}); },
    onError: (e: any) => alert(e.response?.data?.error ?? e.message),
  });

  const toggleActivo = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) => vendedoresApi.actualizar(id, { activo }),
    onSuccess: invalidar,
    onError: (e: any) => alert(e.response?.data?.error ?? e.message),
  });

  const fusionar = useMutation({
    mutationFn: ({ id, destinoId }: { id: number; destinoId: number }) => vendedoresApi.fusionar(id, destinoId),
    onSuccess: (data: any) => {
      invalidar(); setFusion(null);
      alert(`Fusionado. Se movieron ${data.clientesMovidos} cliente(s) y ${data.cotizacionesMovidas} cotización(es) a ${data.destino}.`);
    },
    onError: (e: any) => alert(e.response?.data?.error ?? e.message),
  });

  const abrir = (v?: Vendedor) => {
    setForm(v ? { ...v } : { nombre: "", comisionPct: 0, comisionReferidoPct: 0, gananciaMuchachosPct: 0 });
    setModal({ abierto: true, datos: v ?? null });
  };

  const activos = vendedores.filter(v => v.activo);
  const otrosActivos = (id: number) => activos.filter(v => v.id !== id);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Vendedores</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {activos.length} activos · {vendedores.length - activos.length} inactivos
          </p>
        </div>
        {puedeEditar && (
          <button onClick={() => abrir()} style={btnPrimary}><Plus size={16} /> Nuevo Vendedor</button>
        )}
      </div>

      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["Vendedor", "Usuario", "Comisión", "% Muchachos", "Clientes", "Cotiz.", "Estado", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => (
              <tr key={v.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: v.activo ? 1 : 0.5 }}>
                <td style={tdStyle}><span style={{ fontWeight: 600, color: "#1e293b" }}>{v.nombre}</span></td>
                <td style={tdStyle}>
                  {v.usuario
                    ? <span style={{ fontSize: 13, color: "#475569" }}>{v.usuario.email}</span>
                    : <span style={{ fontSize: 12, color: "#cbd5e1" }}>sin cuenta</span>}
                </td>
                <td style={tdStyle}>{Number(v.comisionPct)}%</td>
                <td style={tdStyle}>{Number(v.gananciaMuchachosPct) > 0 ? `${Number(v.gananciaMuchachosPct)}%` : "—"}</td>
                <td style={tdStyle}>{v._count.clientes}</td>
                <td style={tdStyle}>{v._count.cotizaciones}</td>
                <td style={tdStyle}>
                  <span style={{
                    ...tagStyle,
                    background: v.activo ? "#dcfce7" : "#fee2e2",
                    color: v.activo ? "#166534" : "#dc2626",
                  }}>{v.activo ? "Activo" : "Inactivo"}</span>
                </td>
                <td style={{ ...tdStyle, width: 130 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    {esMaster && (
                      <button onClick={() => abrir(v)} title="Editar" style={btnIcon}><Edit2 size={14} /></button>
                    )}
                    {esMaster && v.activo && (
                      <button
                        onClick={() => setFusion({ origen: v, destinoId: null })}
                        title="Fusionar en otro vendedor"
                        style={{ ...btnIcon, color: "#7c3aed" }}
                      ><GitMerge size={14} /></button>
                    )}
                    {esMaster && (
                      <button
                        onClick={() => {
                          if (v.activo && (v._count.clientes > 0 || v._count.cotizaciones > 0)) {
                            if (!window.confirm(`${v.nombre} tiene ${v._count.clientes} cliente(s) y ${v._count.cotizaciones} cotización(es). Si lo desactivas seguirán asignados a él pero no aparecerá para nuevas cotizaciones. ¿Continuar?\n\nTip: usa "Fusionar" si quieres pasar sus datos a otro vendedor.`)) return;
                          }
                          toggleActivo.mutate({ id: v.id, activo: !v.activo });
                        }}
                        title={v.activo ? "Desactivar" : "Activar"}
                        style={{ ...btnIcon, color: v.activo ? "#dc2626" : "#16a34a" }}
                      >{v.activo ? <UserX size={14} /> : <UserCheck size={14} />}</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {vendedores.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>No hay vendedores</div>
        )}
      </div>

      {/* Modal crear/editar */}
      {modal?.abierto && (
        <div style={modalOverlay} onClick={() => setModal(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>
              {modal.datos ? "Editar Vendedor" : "Nuevo Vendedor"}
            </h2>
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <label style={labelStyle}>Nombre *</label>
                <input style={inputStyle} value={form.nombre || ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Comisión %</label>
                  <input type="number" step="0.5" style={inputStyle} value={form.comisionPct ?? 0} onChange={(e) => setForm({ ...form, comisionPct: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={labelStyle}>% Ganancia Muchachos</label>
                  <input type="number" step="0.5" style={inputStyle} value={form.gananciaMuchachosPct ?? 0} onChange={(e) => setForm({ ...form, gananciaMuchachosPct: Number(e.target.value) })} />
                  <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>2% para el equipo de flete (ej: Henry)</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setModal(null)} style={btnSecondary}>Cancelar</button>
              <button onClick={() => guardar.mutate(form)} disabled={!form.nombre || guardar.isPending} style={btnPrimary}>
                {guardar.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal fusionar */}
      {fusion && (
        <div style={modalOverlay} onClick={() => setFusion(null)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Fusionar Vendedor</h2>
              <button onClick={() => setFusion(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: 14, color: "#475569", marginTop: 0 }}>
              Mover los clientes y cotizaciones de <strong>{fusion.origen.nombre}</strong> a otro vendedor, y desactivarlo. Útil para unir duplicados.
            </p>
            <label style={labelStyle}>Mover todo a:</label>
            <select
              style={inputStyle}
              value={fusion.destinoId ?? ""}
              onChange={(e) => setFusion({ ...fusion, destinoId: Number(e.target.value) || null })}
            >
              <option value="">— Seleccionar vendedor destino —</option>
              {otrosActivos(fusion.origen.id).map((v) => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setFusion(null)} style={btnSecondary}>Cancelar</button>
              <button
                onClick={() => fusion.destinoId && fusionar.mutate({ id: fusion.origen.id, destinoId: fusion.destinoId })}
                disabled={!fusion.destinoId || fusionar.isPending}
                style={{ ...btnPrimary, background: "#7c3aed" }}
              >
                {fusionar.isPending ? "Fusionando..." : "Fusionar y desactivar"}
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
const tagStyle: React.CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 };
const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4 };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, width: "min(520px, 95vw)", maxHeight: "90vh", overflow: "auto" };
