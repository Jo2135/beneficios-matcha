import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { UserPlus, Shield, Users, Briefcase } from "lucide-react";

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: "MASTER" | "ADMIN" | "VENDEDOR";
  vendedorId: number | null;
  vendedor?: { id: number; nombre: string } | null;
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

  const { data: usuarios = [] } = useQuery<Usuario[]>({
    queryKey: ["usuarios"],
    queryFn: () => api.get("/auth/usuarios").then((r) => r.data),
  });

  const { data: vendedores = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ["vendedores-lista"],
    queryFn: () => api.get("/clientes").then(() => api.get("/auth/usuarios")).then(() =>
      api.get("/cotizaciones").then(() => fetch("/api/vendedores-lista").then(() => []))
    ).catch(() => []),
    enabled: false,
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
              {["Nombre", "Email", "Rol", "Último acceso", "Estado", ""].map((h) => (
                <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => {
              const ri = ROL_INFO[u.rol];
              const Icon = ri.icon;
              const esSelf = u.id === yo?.id;
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
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8" }}>{fecha(u.ultimoAcceso)}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: u.activo ? "#16a34a" : "#dc2626" }}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {esMaster && !esSelf && u.rol !== "MASTER" && (
                      <button
                        onClick={() => toggleMutation.mutate({ id: u.id, activo: !u.activo })}
                        style={{ fontSize: 12, padding: "5px 12px", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", background: "#f8fafc", color: "#64748b" }}
                      >
                        {u.activo ? "Desactivar" : "Activar"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
                <select style={inp} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as any })}>
                  {esMaster && <option value="MASTER">Master — Acceso total</option>}
                  <option value="ADMIN">Admin — Precios, estadísticas, vendedores</option>
                  <option value="VENDEDOR">Vendedor — Cotizaciones y notas</option>
                </select>
              </label>
              {form.rol === "VENDEDOR" && (
                <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#0369a1" }}>
                  El vendedor podrá ver solo sus propias cotizaciones, agregar notas en pagos y ver el costo de flete y su comisión.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 24, justifyContent: "flex-end" }}>
              <button onClick={() => { setModalAbierto(false); setError(""); }} style={{ padding: "10px 20px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => crearMutation.mutate(form)}
                disabled={crearMutation.isPending || !form.nombre || !form.email || !form.password}
                style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
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
