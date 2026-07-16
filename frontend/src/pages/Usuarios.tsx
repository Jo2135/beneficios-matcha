import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { authApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { UserPlus, Shield, Users, Briefcase, Percent, Edit2 } from "lucide-react";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: "MASTER" | "ADMIN" | "VENDEDOR";
  vendedorId: number | null;
  puedeVerCurvas?: boolean;
  vendedor?: { id: number; nombre: string; comisionPct: string | number | null } | null;
  activo: boolean;
  ultimoAcceso: string | null;
}

const ROL_INFO = {
  MASTER:   { label: "Master",   color: "#7c3aed", bg: "#f3e8ff", icon: Shield },
  ADMIN:    { label: "Admin",    color: "#2563eb", bg: "#dbeafe", icon: Briefcase },
  VENDEDOR: { label: "Vendedor", color: "#16a34a", bg: "#dcfce7", icon: Users },
};

function fecha(raw: string | null) {
  if (!raw) return "Nunca";
  return new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function Usuarios() {
  const { esMaster, usuario: yo } = useAuth();
  const qc = useQueryClient();
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ nombre: "", email: "", password: "", rol: "VENDEDOR" as "MASTER" | "ADMIN" | "VENDEDOR", vendedorId: "" });
  const [error, setError] = useState("");
  const [editComision, setEditComision] = useState<{ usuarioId: number; nombre: string; valor: string } | null>(null);
  const [editUsuario, setEditUsuario] = useState<any>(null);
  const [editForm, setEditForm] = useState({ nombre: "", email: "", rol: "VENDEDOR" as "MASTER" | "ADMIN" | "VENDEDOR", vendedorId: "", password: "", puedeVerCurvas: false });

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ["usuarios"],
    queryFn: () => api.get("/auth/usuarios").then((r) => r.data),
  });

  const { data: vendedores = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ["vendedores"],
    queryFn: authApi.listarVendedores,
    enabled: esMaster,
  });

  const crearMutation = useMutation({
    mutationFn: (data: typeof form) => api.post("/auth/usuarios", {
      nombre: data.nombre,
      email: data.email,
      password: data.password,
      rol: data.rol,
      vendedorId: data.vendedorId ? Number(data.vendedorId) : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setModalAbierto(false);
      setForm({ nombre: "", email: "", password: "", rol: "VENDEDOR", vendedorId: "" });
      setError("");
    },
    onError: (err: any) => setError(err?.response?.data?.error ?? "Error al crear usuario"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, activo }: { id: number; activo: boolean }) =>
      api.patch(`/auth/usuarios/${id}/activo`, { activo }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
  });

  const comisionMutation = useMutation({
    mutationFn: ({ id, comisionPct }: { id: number; comisionPct: number }) =>
      authApi.actualizarComision(id, comisionPct),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setEditComision(null);
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? "Error al actualizar comisión"),
  });

  const vincularMutation = useMutation({
    mutationFn: (id: number) => authApi.vincularVendedor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (err: any) => alert(err?.response?.data?.error ?? "Error al vincular vendedor"),
  });

  const editarMutation = useMutation({
    mutationFn: (data: typeof editForm & { id: number }) =>
      api.put(`/auth/usuarios/${data.id}`, { nombre: data.nombre, email: data.email, rol: data.rol, vendedorId: data.vendedorId || null, password: data.password || undefined, puedeVerCurvas: data.puedeVerCurvas }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["usuarios"] });
      setEditUsuario(null);
    },
    onError: (err: any) => alert(err?.response?.data?.error ?? "Error al actualizar usuario"),
  });

  const abrirEditar = (u: Usuario) => {
    setEditUsuario(u);
    setEditForm({ nombre: u.nombre, email: u.email, rol: u.rol, vendedorId: String(u.vendedorId ?? ""), password: "", puedeVerCurvas: !!u.puedeVerCurvas });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Usuarios del Sistema</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{usuarios.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: "pointer" }}
        >
          <UserPlus size={16} /> Nuevo Usuario
        </button>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Nombre", "Email", "Rol", "Comisión", "Último acceso", "Estado", ""].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const ri = ROL_INFO[u.rol];
              const Icon = ri.icon;
              const esSelf = u.id === yo?.id;
              const comisionPct = u.vendedor?.comisionPct != null ? Number(u.vendedor.comisionPct) : null;
              return (
                <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: u.activo ? 1 : 0.5 }}>
                  <td style={{ padding: "12px 16px", fontWeight: 600, fontSize: 14 }}>
                    {u.nombre} {esSelf && <span style={{ fontSize: 11, color: "#94a3b8" }}>(tú)</span>}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 13, color: "#64748b" }}>{u.email}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600, color: ri.color, background: ri.bg }}>
                      <Icon size={11} /> {ri.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {(u.rol === "VENDEDOR" || (esMaster && esSelf)) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {u.vendedorId ? (
                          <>
                            <span style={{ fontSize: 13, fontWeight: 600, color: comisionPct && comisionPct > 0 ? "#16a34a" : "#94a3b8" }}>
                              {comisionPct != null ? `${comisionPct}%` : "0%"}
                            </span>
                            {esMaster && (
                              <button
                                onClick={() => setEditComision({ usuarioId: u.id, nombre: u.nombre, valor: String(comisionPct ?? 0) })}
                                style={{ background: "#f1f5f9", border: "none", borderRadius: 4, padding: "3px 6px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center" }}
                                title="Editar comisión"
                              >
                                <Percent size={11} />
                              </button>
                            )}
                          </>
                        ) : esMaster ? (
                          <button
                            onClick={() => vincularMutation.mutate(u.id)}
                            disabled={vincularMutation.isPending}
                            style={{ fontSize: 11, padding: "4px 10px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, cursor: "pointer", color: "#92400e", fontWeight: 600 }}
                          >
                            {esSelf ? "Vincularme" : "Vincular"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 12, color: "#94a3b8" }}>Sin vincular</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{fecha(u.ultimoAcceso)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: u.activo ? "#16a34a" : "#dc2626" }}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {esMaster && (
                        <button
                          onClick={() => abrirEditar(u)}
                          style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" }}
                          title="Editar usuario"
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      {esMaster && !esSelf && u.rol !== "MASTER" && (
                        <button
                          onClick={() => toggleMutation.mutate({ id: u.id, activo: !u.activo })}
                          style={{ fontSize: 12, padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", background: "#f8fafc", color: "#64748b" }}
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal editar comisión */}
      {editComision && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "min(380px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700 }}>Editar Comisión</h2>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>{editComision.nombre}</p>
            <label style={lbl}>
              Comisión (%)
              <input
                style={inp}
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={editComision.valor}
                onChange={(e) => setEditComision({ ...editComision, valor: e.target.value })}
              />
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button onClick={() => setEditComision(null)} style={{ padding: "9px 18px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => comisionMutation.mutate({ id: editComision.usuarioId, comisionPct: Number(editComision.valor) })}
                disabled={comisionMutation.isPending}
                style={{ padding: "9px 18px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                {comisionMutation.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar usuario */}
      {editUsuario && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "min(480px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>Editar Usuario</h2>
            <p style={{ margin: "0 0 20px", color: "#64748b", fontSize: 13 }}>{editUsuario.email}</p>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={lbl}>
                Nombre completo
                <input style={inp} value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} />
              </label>
              <label style={lbl}>
                Usuario o correo electrónico
                <input style={inp} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </label>
              <label style={lbl}>
                Nueva contraseña <span style={{ fontWeight: 400, color: "#94a3b8" }}>(dejar vacío para no cambiar)</span>
                <input style={inp} type="password" value={editForm.password} onChange={(e) => setEditForm({ ...editForm, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
              </label>
              <label style={lbl}>
                Rol
                <select
                  style={{ ...inp, opacity: editUsuario?.id === yo?.id ? 0.6 : 1 }}
                  value={editForm.rol}
                  disabled={editUsuario?.id === yo?.id}
                  onChange={(e) => setEditForm({ ...editForm, rol: e.target.value as any, vendedorId: "" })}
                >
                  <option value="MASTER">Master — Acceso total</option>
                  <option value="ADMIN">Admin — Precios, estadísticas, vendedores</option>
                  <option value="VENDEDOR">Vendedor — Cotizaciones y notas</option>
                </select>
              </label>
              <label style={lbl}>
                Vincular a Vendedor <span style={{ fontWeight: 400, color: "#94a3b8" }}>(para comisiones)</span>
                <select style={inp} value={editForm.vendedorId} onChange={(e) => setEditForm({ ...editForm, vendedorId: e.target.value })}>
                  <option value="">Sin vincular</option>
                  {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </label>
              {editForm.rol === "VENDEDOR" && (
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={editForm.puedeVerCurvas}
                    onChange={(e) => setEditForm({ ...editForm, puedeVerCurvas: e.target.checked })}
                    style={{ width: 15, height: 15, marginTop: 1, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: "#1e3a8a" }}>Puede ver pedidos de curvas</span>
                    <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 2 }}>
                      Le habilita la pantalla "Pedidos Producción", donde ve cuántas curvas hay pedidas y qué cliente las pide. No ve niples ni conexiones.
                    </span>
                  </span>
                </label>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => setEditUsuario(null)} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => editarMutation.mutate({ ...editForm, id: editUsuario.id })}
                disabled={editarMutation.isPending || !editForm.nombre || !editForm.email}
                style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                {editarMutation.isPending ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal crear usuario */}
      {modalAbierto && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "min(480px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700 }}>Nuevo Usuario</h2>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}

            <div style={{ display: "grid", gap: 14 }}>
              <label style={lbl}>
                Nombre completo
                <input style={inp} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: María González" />
              </label>
              <label style={lbl}>
                Usuario o correo electrónico
                <input style={inp} type="text" autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="miguel o correo@empresa.com" />
              </label>
              <label style={lbl}>
                Contraseña inicial
                <input style={inp} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Mínimo 6 caracteres" />
              </label>
              <label style={lbl}>
                Rol
                <select style={inp} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as any, vendedorId: "" })}>
                  {esMaster && <option value="MASTER">Master — Acceso total</option>}
                  <option value="ADMIN">Admin — Precios, estadísticas, vendedores</option>
                  <option value="VENDEDOR">Vendedor — Cotizaciones y notas</option>
                </select>
              </label>
              {form.rol === "VENDEDOR" && (
                <>
                  <label style={lbl}>
                    Vincular a Vendedor
                    <select style={inp} value={form.vendedorId} onChange={(e) => setForm({ ...form, vendedorId: e.target.value })}>
                      <option value="">Sin vincular</option>
                      {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  </label>
                  <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#0369a1" }}>
                    El vendedor verá solo sus propios clientes y cotizaciones, y su comisión en cada cotización.
                  </div>
                </>
              )}
            </div>

            {(!form.nombre || !form.email || !form.password) && (
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "#dc2626" }}>
                * Completa los campos: {[!form.nombre && "Nombre", !form.email && "Usuario/Correo", !form.password && "Contraseña"].filter(Boolean).join(", ")}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => { setModalAbierto(false); setError(""); }} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => crearMutation.mutate(form)}
                disabled={crearMutation.isPending || !form.nombre || !form.email || !form.password}
                style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14, opacity: (!form.nombre || !form.email || !form.password) ? 0.5 : 1 }}
              >
                {crearMutation.isPending ? "Creando..." : "Crear Usuario"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#374151" };
const inp: React.CSSProperties = { padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", width: "100%", boxSizing: "border-box" };
