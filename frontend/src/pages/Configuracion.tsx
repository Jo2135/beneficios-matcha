import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { empresasApi } from "../api/endpoints";
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight } from "lucide-react";

interface Empresa { id: number; nombre: string; rif: string; activa: boolean }

export default function Configuracion() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<"crear" | Empresa | null>(null);
  const [form, setForm] = useState({ nombre: "", rif: "" });
  const [error, setError] = useState("");

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ["empresas"],
    queryFn: empresasApi.listar,
  });

  const abrirCrear = () => { setForm({ nombre: "", rif: "" }); setError(""); setModal("crear"); };
  const abrirEditar = (e: Empresa) => { setForm({ nombre: e.nombre, rif: e.rif }); setError(""); setModal(e); };
  const cerrar = () => { setModal(null); setError(""); };

  const crearMutation = useMutation({
    mutationFn: () => empresasApi.crear(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["empresas"] }); cerrar(); },
    onError: (e: any) => setError(e.response?.data?.error ?? "Error al crear empresa"),
  });

  const editarMutation = useMutation({
    mutationFn: () => empresasApi.actualizar((modal as Empresa).id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["empresas"] }); cerrar(); },
    onError: (e: any) => setError(e.response?.data?.error ?? "Error al actualizar"),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, activa }: { id: number; activa: boolean }) =>
      empresasApi.toggleActiva(id, activa),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["empresas"] }),
  });

  const esEditar = modal && modal !== "crear";

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Configuración</h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Empresas emisoras de facturas y cotizaciones</p>
      </div>

      {/* Sección Empresas */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden", maxWidth: 680 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Building2 size={18} style={{ color: "#2563eb" }} />
            <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b" }}>Empresas</span>
            <span style={{ fontSize: 12, color: "#94a3b8" }}>({(empresas as Empresa[]).length} registradas)</span>
          </div>
          <button
            onClick={abrirCrear}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Nueva Empresa
          </button>
        </div>

        {(empresas as Empresa[]).length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "#94a3b8" }}>
            <Building2 size={32} style={{ display: "block", margin: "0 auto 12px", opacity: 0.3 }} />
            <div style={{ fontSize: 14 }}>No hay empresas registradas</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Agrega la empresa con la que emites tus facturas</div>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                {["Nombre", "RIF", "Estado", ""].map((h) => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(empresas as Empresa[]).map((e) => (
                <tr key={e.id} style={{ borderBottom: "1px solid #f1f5f9", opacity: e.activa ? 1 : 0.5 }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{e.nombre}</div>
                  </td>
                  <td style={{ ...tdStyle, color: "#64748b", fontFamily: "monospace", fontSize: 13 }}>{e.rif}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600,
                      color: e.activa ? "#16a34a" : "#dc2626",
                      background: e.activa ? "#dcfce7" : "#fee2e2",
                    }}>
                      {e.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button
                        onClick={() => abrirEditar(e)}
                        style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" }}
                        title="Editar"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => toggleMutation.mutate({ id: e.id, activa: !e.activa })}
                        style={{ background: "none", border: "none", cursor: "pointer", color: e.activa ? "#16a34a" : "#94a3b8", display: "flex", alignItems: "center" }}
                        title={e.activa ? "Desactivar" : "Activar"}
                      >
                        {e.activa ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear / editar */}
      {modal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={cerrar}>
          <div style={{ background: "#fff", borderRadius: 14, padding: 28, width: "min(440px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 700 }}>
              {esEditar ? "Editar Empresa" : "Nueva Empresa"}
            </h2>
            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "9px 14px", fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}
            <div style={{ display: "grid", gap: 14 }}>
              <label style={lbl}>
                Nombre de la empresa
                <input
                  style={inp}
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  placeholder="Ej: MAXPLASTIC F.P."
                />
              </label>
              <label style={lbl}>
                RIF
                <input
                  style={inp}
                  value={form.rif}
                  onChange={(e) => setForm({ ...form, rif: e.target.value })}
                  placeholder="Ej: J-12345678-9"
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "flex-end" }}>
              <button onClick={cerrar} style={{ padding: "9px 18px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#f8fafc", cursor: "pointer", fontSize: 14 }}>
                Cancelar
              </button>
              <button
                onClick={() => esEditar ? editarMutation.mutate() : crearMutation.mutate()}
                disabled={!form.nombre || !form.rif || crearMutation.isPending || editarMutation.isPending}
                style={{ padding: "9px 18px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, fontWeight: 600, cursor: "pointer", fontSize: 14 }}
              >
                {crearMutation.isPending || editarMutation.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = { padding: "9px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 13, fontWeight: 600, color: "#374151" };
const inp: React.CSSProperties = { padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#f8fafc", width: "100%", boxSizing: "border-box" };
