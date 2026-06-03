import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { clientesApi, listasApi, authApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Plus, Search, Edit2, MapPin, User } from "lucide-react";

const EMPRESAS = ["ECOPLAST F.P.", "MAXPLASTIC F.P."];

export default function Clientes() {
  const qc = useQueryClient();
  const { puedeEditar } = useAuth();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState<{ abierto: boolean; datos: any }>({ abierto: false, datos: null });
  const [form, setForm] = useState<any>({});

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: clientesApi.listar,
  });

  const { data: listas = [] } = useQuery({
    queryKey: ["listas-precios"],
    queryFn: listasApi.listar,
  });

  const { data: vendedores = [] } = useQuery<{ id: number; nombre: string }[]>({
    queryKey: ["vendedores"],
    queryFn: authApi.listarVendedores,
    enabled: puedeEditar,
  });

  const guardar = useMutation({
    mutationFn: (data: any) =>
      data.id ? clientesApi.actualizar(data.id, data) : clientesApi.crear(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setModal({ abierto: false, datos: null });
      setForm({});
    },
    onError: (e: any) => alert(e.response?.data?.error ?? e.message ?? "Error al guardar el cliente"),
  });

  const filtrados = clientes.filter((c: any) =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const abrir = (cliente?: any) => {
    setForm(cliente ?? { empresaFactura: "ECOPLAST F.P.", diasCredito: 0, fleteTuberiaPct: 0, fleteConexionesPct: 0, comisionTuberiaPct: 0, comisionConexionesPct: 0 });
    setModal({ abierto: true, datos: cliente ?? null });
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Clientes</h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{clientes.length} clientes registrados</p>
        </div>
        {puedeEditar && (
          <button onClick={() => abrir()} style={btnPrimary}>
            <Plus size={16} /> Nuevo Cliente
          </button>
        )}
      </div>

      {/* Búsqueda */}
      <div style={{ position: "relative", marginBottom: 20, maxWidth: 360 }}>
        <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente..."
          style={{ ...inputStyle, paddingLeft: 38 }}
        />
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {["Cliente", "RIF", "Vendedor", "Lista de Precios", "Empresa", "Crédito", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={tdStyle}>
                  <div style={{ fontWeight: 600, color: "#1e293b" }}>{c.nombre}</div>
                  {c.direccion && (
                    <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
                      <MapPin size={11} /> {c.direccion}
                    </div>
                  )}
                </td>
                <td style={tdStyle}><span style={tagStyle}>{c.rif || "—"}</span></td>
                <td style={tdStyle}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: "#475569" }}>
                    <User size={13} />{c.vendedor?.nombre || "—"}
                  </div>
                </td>
                <td style={tdStyle}>
                  <span style={{ ...tagStyle, background: "#dbeafe", color: "#1d4ed8" }}>
                    {c.listaPrecio?.nombre || "Sin asignar"}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ ...tagStyle, background: c.empresaFactura === "MAXPLASTIC F.P." ? "#fef3c7" : "#dcfce7", color: c.empresaFactura === "MAXPLASTIC F.P." ? "#92400e" : "#166534", fontSize: 11 }}>
                    {c.empresaFactura}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{c.diasCredito} días</span>
                </td>
                <td style={{ ...tdStyle, width: 40 }}>
                  {puedeEditar && <button onClick={() => abrir(c)} style={btnIcon}><Edit2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtrados.length === 0 && (
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
            No se encontraron clientes
          </div>
        )}
      </div>

      {/* Modal */}
      {modal.abierto && (
        <div style={modalOverlay} onClick={() => setModal({ abierto: false, datos: null })}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: "0 0 20px", fontSize: 18, fontWeight: 700 }}>
              {modal.datos ? "Editar Cliente" : "Nuevo Cliente"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Nombre *</label>
                <input style={inputStyle} value={form.nombre || ""} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>RIF</label>
                <input style={inputStyle} value={form.rif || ""} onChange={(e) => setForm({ ...form, rif: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Teléfono</label>
                <input style={inputStyle} value={form.telefono || ""} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Dirección</label>
                <input style={inputStyle} value={form.direccion || ""} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Vendedor</label>
                <select style={inputStyle} value={form.vendedorId || ""} onChange={(e) => setForm({ ...form, vendedorId: Number(e.target.value) || null })}>
                  <option value="">Sin asignar</option>
                  {(vendedores as any[]).map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Lista de Precios</label>
                <select style={inputStyle} value={form.listaPrecioId || ""} onChange={(e) => setForm({ ...form, listaPrecioId: Number(e.target.value) || null })}>
                  <option value="">Sin asignar</option>
                  {listas.map((l: any) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Empresa en Factura</label>
                <select style={inputStyle} value={form.empresaFactura || "ECOPLAST F.P."} onChange={(e) => setForm({ ...form, empresaFactura: e.target.value })}>
                  {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Días de Crédito</label>
                <input type="number" style={inputStyle} value={form.diasCredito || 0} onChange={(e) => setForm({ ...form, diasCredito: Number(e.target.value) })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#92400e", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
                  Flete (transporte) y Comisión del Vendedor — se calculan sobre el Total Neto, no aparecen en el PDF del cliente
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Flete Tubería %</label>
                    <input type="number" style={inputStyle} value={form.fleteTuberiaPct ?? 0} step="0.5" min="0" max="100" onChange={(e) => setForm({ ...form, fleteTuberiaPct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Flete Conexiones %</label>
                    <input type="number" style={inputStyle} value={form.fleteConexionesPct ?? 0} step="0.5" min="0" max="100" onChange={(e) => setForm({ ...form, fleteConexionesPct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Comisión Tubería %</label>
                    <input type="number" style={inputStyle} value={form.comisionTuberiaPct ?? 0} step="0.5" min="0" max="100" onChange={(e) => setForm({ ...form, comisionTuberiaPct: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Comisión Conexiones %</label>
                    <input type="number" style={inputStyle} value={form.comisionConexionesPct ?? 0} step="0.5" min="0" max="100" onChange={(e) => setForm({ ...form, comisionConexionesPct: Number(e.target.value) })} />
                  </div>
                </div>
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Condición de Pago</label>
                <input style={inputStyle} value={form.condicionPago || ""} placeholder="Ej: 30% al despachar + 15 días" onChange={(e) => setForm({ ...form, condicionPago: e.target.value })} />
              </div>
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Observaciones</label>
                <textarea style={{ ...inputStyle, height: 70, resize: "vertical" }} value={form.observaciones || ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setModal({ abierto: false, datos: null })} style={btnSecondary}>Cancelar</button>
              <button
                onClick={() => guardar.mutate(form)}
                disabled={!form.nombre || guardar.isPending}
                style={btnPrimary}
              >
                {guardar.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "#2563eb", color: "#fff", border: "none",
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  fontSize: 14, fontWeight: 600,
};
const btnSecondary: React.CSSProperties = {
  background: "#fff", color: "#374151", border: "1px solid #d1d5db",
  padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14,
};
const btnIcon: React.CSSProperties = {
  background: "#f1f5f9", border: "none", borderRadius: 6,
  padding: "6px 8px", cursor: "pointer", color: "#475569",
  display: "flex", alignItems: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden",
};
const thStyle: React.CSSProperties = {
  padding: "10px 16px", textAlign: "left", fontSize: 12,
  fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em",
};
const tdStyle: React.CSSProperties = { padding: "12px 16px", fontSize: 14, color: "#374151" };
const tagStyle: React.CSSProperties = {
  display: "inline-block", padding: "2px 8px", background: "#f1f5f9",
  borderRadius: 4, fontSize: 12, color: "#475569",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", border: "1px solid #d1d5db",
  borderRadius: 8, fontSize: 14, outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 4,
};
const modalOverlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
};
const modalBox: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 28,
  width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto",
};
