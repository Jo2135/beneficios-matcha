import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { clientesApi, listasApi, authApi, cotizacionesApi, facturasApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Plus, Search, Edit2, MapPin, User, History, X, BookOpen } from "lucide-react";

const EMPRESAS = ["ECOPLAST F.P.", "MAXPLASTIC F.P."];

export default function Clientes() {
  const qc = useQueryClient();
  const { puedeEditar } = useAuth();
  const navigate = useNavigate();
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState<{ abierto: boolean; datos: any }>({ abierto: false, datos: null });
  const [form, setForm] = useState<any>({});
  const [historialId, setHistorialId] = useState<number | null>(null);
  const [historialNombre, setHistorialNombre] = useState("");

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

  const { data: histCotizaciones = [] } = useQuery({
    queryKey: ["historial-cots", historialId],
    queryFn: () => cotizacionesApi.listar({ clienteId: historialId }),
    enabled: historialId !== null,
  });
  const { data: histFacturas } = useQuery({
    queryKey: ["historial-facts", historialId],
    queryFn: () => facturasApi.resumenCliente(historialId!),
    enabled: historialId !== null && puedeEditar,
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
    const listasIds = cliente
      ? (cliente.listasAsignadas ?? []).map((a: any) => a.listaPrecio.id)
      : [];
    setForm(cliente
      ? { ...cliente, listasIds }
      : { empresaFactura: "ECOPLAST F.P.", diasCredito: 0, fleteTuberiaPct: 0, fleteConexionesPct: 0, comisionTuberiaPct: 0, comisionConexionesPct: 0, socioEquivalente: null, vendedorEsMaster: false, listasIds: [] });
    setModal({ abierto: true, datos: cliente ?? null });
  };

  const toggleLista = (listaId: number) => {
    const current: number[] = form.listasIds ?? [];
    if (current.includes(listaId)) {
      setForm({ ...form, listasIds: current.filter((id: number) => id !== listaId) });
    } else {
      setForm({ ...form, listasIds: [...current, listaId] });
    }
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
                  {(c.listasAsignadas ?? []).length === 0
                    ? <span style={{ ...tagStyle, background: "#fee2e2", color: "#dc2626" }}>Sin asignar</span>
                    : (c.listasAsignadas as any[]).map((a: any) => (
                      <span key={a.listaPrecio.id} style={{ ...tagStyle, background: "#dbeafe", color: "#1d4ed8", marginRight: 4, marginBottom: 2, display: "inline-block" }}>
                        {a.listaPrecio.nombre}
                      </span>
                    ))
                  }
                </td>
                <td style={tdStyle}>
                  <span style={{ ...tagStyle, background: c.empresaFactura === "MAXPLASTIC F.P." ? "#fef3c7" : "#dcfce7", color: c.empresaFactura === "MAXPLASTIC F.P." ? "#92400e" : "#166534", fontSize: 11 }}>
                    {c.empresaFactura}
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{ fontSize: 13, color: "#475569" }}>{c.diasCredito} días</span>
                </td>
                <td style={{ ...tdStyle, width: 80 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => { setHistorialId(c.id); setHistorialNombre(c.nombre); }}
                      style={{ ...btnIcon, color: "#7c3aed" }}
                      title="Ver historial"
                    >
                      <History size={14} />
                    </button>
                    {puedeEditar && (
                      <button
                        onClick={() => navigate(`/clientes/${c.id}/estado-cuenta`)}
                        style={{ ...btnIcon, color: "#0369a1" }}
                        title="Estado de cuenta"
                      >
                        <BookOpen size={14} />
                      </button>
                    )}
                    {puedeEditar && (
                      <button onClick={() => abrir(c)} style={btnIcon}><Edit2 size={14} /></button>
                    )}
                  </div>
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

      {/* Modal Historial de Cliente */}
      {historialId !== null && (
        <div style={modalOverlay} onClick={() => setHistorialId(null)}>
          <div style={{ ...modalBox, width: "min(760px, 95vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>Historial: {historialNombre}</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b" }}>Cotizaciones y facturas del cliente</p>
              </div>
              <button onClick={() => setHistorialId(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}>
                <X size={20} />
              </button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={{ background: "#f3e8ff", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600, textTransform: "uppercase" }}>Cotizaciones</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{(histCotizaciones as any[]).length}</div>
              </div>
              <div style={{ background: "#dbeafe", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600, textTransform: "uppercase" }}>Facturas</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{histFacturas ? (histFacturas as any).facturas.length : "—"}</div>
              </div>
              <div style={{ background: histFacturas && (histFacturas as any).totalDeuda > 0 ? "#fee2e2" : "#dcfce7", borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 11, color: histFacturas && (histFacturas as any).totalDeuda > 0 ? "#dc2626" : "#16a34a", fontWeight: 600, textTransform: "uppercase" }}>Saldo Pendiente</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>
                  {histFacturas ? `$${Number((histFacturas as any).totalDeuda).toLocaleString("es-VE", { minimumFractionDigits: 2 })}` : "—"}
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Cotizaciones */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Cotizaciones recientes</div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
                  {(histCotizaciones as any[]).length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sin cotizaciones</div>
                  ) : (histCotizaciones as any[]).map((c: any) => (
                    <div key={c.id} style={{ padding: "8px 12px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#7c3aed" }}>{c.numero}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(c.creadoEn).toLocaleDateString("es-VE")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{
                          fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: 600,
                          background: c.estado === "APROBADA" ? "#dcfce7" : c.estado === "ENVIADA" ? "#dbeafe" : c.estado === "RECHAZADA" ? "#fee2e2" : "#f1f5f9",
                          color: c.estado === "APROBADA" ? "#16a34a" : c.estado === "ENVIADA" ? "#1d4ed8" : c.estado === "RECHAZADA" ? "#dc2626" : "#64748b",
                        }}>{c.estado}</span>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", marginTop: 2 }}>${Number(c.total).toLocaleString("es-VE", { minimumFractionDigits: 2 })}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Facturas */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Facturas</div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto" }}>
                  {!histFacturas ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sin acceso</div>
                  ) : (histFacturas as any).facturas.length === 0 ? (
                    <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sin facturas</div>
                  ) : (histFacturas as any).facturas.map((f: any) => (
                    <div key={f.id} style={{ padding: "8px 12px", borderBottom: "1px solid #f8fafc", display: "flex", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{f.numero}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{new Date(f.creadoEn).toLocaleDateString("es-VE")}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#0369a1" }}>${Number(f.saldoPendiente).toLocaleString("es-VE", { minimumFractionDigits: 2 })}</div>
                        <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.estado}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setHistorialId(null)} style={btnSecondary}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ gridColumn: "1/-1" }}>
                <label style={labelStyle}>Listas de Precios</label>
                <div style={{ border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 12px", background: "#fafafa", display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {(listas as any[]).length === 0 && (
                    <span style={{ fontSize: 13, color: "#94a3b8" }}>No hay listas de precios registradas</span>
                  )}
                  {(listas as any[]).map((l: any) => {
                    const seleccionada = (form.listasIds ?? []).includes(l.id);
                    return (
                      <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "4px 10px", borderRadius: 6, background: seleccionada ? "#dbeafe" : "#fff", border: `1px solid ${seleccionada ? "#3b82f6" : "#e2e8f0"}`, fontSize: 13, fontWeight: seleccionada ? 600 : 400, color: seleccionada ? "#1d4ed8" : "#374151" }}>
                        <input
                          type="checkbox"
                          checked={seleccionada}
                          onChange={() => toggleLista(l.id)}
                          style={{ cursor: "pointer" }}
                        />
                        {l.nombre}
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>({l._count?.detalle ?? 0} prod.)</span>
                      </label>
                    );
                  })}
                </div>
                {(form.listasIds ?? []).length === 0 && (
                  <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                    Sin listas asignadas — el cliente no tendrá precios disponibles en cotizaciones.
                  </div>
                )}
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
              {/* Reglas especiales de ganancias */}
              <div style={{ gridColumn: "1/-1" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#1d4ed8", background: "#dbeafe", border: "1px solid #bfdbfe", borderRadius: 6, padding: "6px 10px", marginBottom: 10 }}>
                  Reglas especiales de distribución de ganancias
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Socio equivalente al vendedor</label>
                    <select style={inputStyle} value={form.socioEquivalente || ""} onChange={(e) => setForm({ ...form, socioEquivalente: e.target.value || null })}>
                      <option value="">Ninguno (normal)</option>
                      <option value="sbug">SBUG</option>
                      <option value="yolanda">Yolanda</option>
                      <option value="sandra">Sandra</option>
                      <option value="comisiones">Comisiones</option>
                    </select>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                      La parte de G2 de ese socio en facturas de este cliente va a Extra de Material
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-start", flexDirection: "column", gap: 6, paddingTop: 2 }}>
                    <label style={labelStyle}>Vendedor MASTER</label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(form.vendedorEsMaster)}
                        onChange={(e) => setForm({ ...form, vendedorEsMaster: e.target.checked })}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                      />
                      <span style={{ fontSize: 13, color: "#374151" }}>Su comisión ya está en el 2.2% de Comisiones</span>
                    </label>
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      Ej: Casa del Tubo, FERCA, Infinito, Gloria Center
                    </div>
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
