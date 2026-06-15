import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { reportesApi, facturasApi } from "../api/endpoints";
import { Upload, BarChart3, X, CheckCircle, AlertCircle } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import * as XLSX from "xlsx";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesLabel = (k: string) => { const [y, m] = k.split("-"); return `${MESES[Number(m) - 1]} ${y.slice(2)}`; };

// Lee un archivo "PLANTILLA GENERAL" y extrae cliente, fecha y líneas vendidas
function parsePlantilla(rows: any[][]): { cliente: string; fecha: string; lineas: any[] } {
  let cliente = "", fecha = "";
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const b = String(rows[i]?.[1] ?? "").toLowerCase().trim();
    if (b === "cliente" && !cliente) cliente = String(rows[i]?.[2] ?? "").trim();
    if (b === "fecha" && !fecha) fecha = String(rows[i]?.[2] ?? "").trim();
  }
  const lineas: any[] = [];
  for (let i = 8; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const producto = String(r[1] ?? "").trim();
    const medida = String(r[2] ?? "").trim();
    const cantidad = Number(r[3]);
    const monto = Number(r[5]);
    if (!producto || producto.toLowerCase() === "descripcion producto") continue;
    if (!(cantidad > 0) || !(monto > 0)) continue;
    lineas.push({ producto, medida, cantidad, monto });
  }
  return { cliente, fecha, lineas };
}

export default function EstadisticasVentas() {
  const qc = useQueryClient();
  const hoy = new Date();
  const [desde, setDesde] = useState(`${hoy.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

  const [modal, setModal] = useState(false);
  const [anio, setAnio] = useState(2025);
  const [preview, setPreview] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ventas-facturas", desde, hasta],
    queryFn: () => reportesApi.ventasFacturas({ desde, hasta }),
  });

  const importar = useMutation({
    mutationFn: () => facturasApi.importarHistorico({ anio, facturas: preview }),
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ["ventas-facturas"] }); },
    onError: (e: any) => alert(e.response?.data?.error ?? e.message),
  });

  const onArchivos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setResult(null);
    const facturas: any[] = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const { cliente, fecha, lineas } = parsePlantilla(rows);
        facturas.push({ archivo: file.name, cliente, fecha, lineas });
      } catch {
        facturas.push({ archivo: file.name, cliente: "", fecha: "", lineas: [], error: true });
      }
    }
    setPreview(facturas);
    setModal(true);
  };

  const d: any = data ?? {};
  const totalLineasPreview = preview.reduce((s, f) => s + (f.lineas?.length ?? 0), 0);
  const totalPreview = preview.reduce((s, f) => s + (f.lineas ?? []).reduce((a: number, l: any) => a + Number(l.monto), 0), 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={22} /> Estadísticas de Ventas
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Basado en facturas · {d.totalFacturas ?? 0} facturas · {usd(d.totalVentas)} en ventas</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={inputSt} />
          <span style={{ color: "#94a3b8" }}>→</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={inputSt} />
          <label style={{ ...btnPrimary, cursor: "pointer" }}>
            <Upload size={16} /> Importar histórico
            <input type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={onArchivos} />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando...</div>
      ) : (d.totalFacturas ?? 0) === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#94a3b8" }}>
          No hay facturas en este rango. Usa <strong>Importar histórico</strong> para cargar tus despachos de 2025.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {/* Ventas por mes */}
          <div style={card}>
            <h3 style={cardTitle}>Ventas por mes</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={(d.ventasPorMes ?? []).map((m: any) => ({ ...m, label: mesLabel(m.mes) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => usd(v)} />
                <Line type="monotone" dataKey="monto" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Top productos por monto */}
            <div style={card}>
              <h3 style={cardTitle}>Top productos (por monto)</h3>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={(d.topProductosMonto ?? []).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => usd(v)} />
                  <Bar dataKey="monto" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top clientes */}
            <div style={card}>
              <h3 style={cardTitle}>Top clientes (por monto)</h3>
              <ResponsiveContainer width="100%" height={340}>
                <BarChart data={(d.topClientes ?? []).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, _n: any, p: any) => [usd(v), `${p.payload.facturas} facturas`]} />
                  <Bar dataKey="monto" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                    {(d.topClientes ?? []).slice(0, 10).map((_: any, i: number) => <Cell key={i} fill="#7c3aed" />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top productos por unidades */}
          <div style={card}>
            <h3 style={cardTitle}>Top productos (por unidades vendidas)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={(d.topProductosUnidades ?? []).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nombre" width={150} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString("es-VE")} u`} />
                <Bar dataKey="unidades" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {modal && (
        <div style={modalOverlay} onClick={() => { setModal(false); setResult(null); }}>
          <div style={{ ...modalBox, width: "min(720px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Importar facturas históricas</h2>
              <button onClick={() => { setModal(false); setResult(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={20} /></button>
            </div>

            {result ? (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
                  <Stat label="Facturas creadas" valor={result.creadas} color="#16a34a" />
                  <Stat label="Omitidas (ya existían)" valor={result.omitidas} color="#64748b" />
                  <Stat label="Productos nuevos" valor={result.productosCreados.length} color="#2563eb" />
                </div>
                {result.clientesNoEncontrados.length > 0 && (
                  <div style={avisoRojo}>
                    <strong>Clientes no encontrados ({result.clientesNoEncontrados.length}):</strong> {result.clientesNoEncontrados.join(", ")}.
                    <div style={{ fontSize: 11, marginTop: 4 }}>Crea esos clientes (o corrige el nombre en el Excel) y vuelve a importar esos archivos.</div>
                  </div>
                )}
                {result.errores.length > 0 && (
                  <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 8 }}>
                    {result.errores.map((e: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: "#dc2626", display: "flex", gap: 6, marginBottom: 3 }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {e.archivo}: {e.mensaje}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
                  <button onClick={() => { setModal(false); setResult(null); setPreview([]); }} style={btnPrimary}><CheckCircle size={15} /> Listo</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#1e3a8a" }}>Año de estos despachos:</label>
                  <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} style={{ ...inputSt, width: "auto" }}>
                    {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span style={{ fontSize: 11, color: "#64748b" }}>(las facturas no traen el año, lo tomo de aquí)</span>
                </div>

                <div style={{ fontSize: 13, color: "#374151", marginBottom: 8 }}>
                  <strong>{preview.length}</strong> archivos · <strong>{totalLineasPreview}</strong> líneas de producto · total {usd(totalPreview)}
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto", marginBottom: 14 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                      {["Archivo", "Cliente", "Fecha", "Líneas", "Total"].map((h) => <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.map((f, i) => {
                        const tot = (f.lineas ?? []).reduce((a: number, l: any) => a + Number(l.monto), 0);
                        const ok = !f.error && f.cliente && (f.lineas?.length ?? 0) > 0;
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f8fafc", background: ok ? "#fff" : "#fef2f2" }}>
                            <td style={{ padding: "5px 10px" }}>{f.archivo}</td>
                            <td style={{ padding: "5px 10px", color: f.cliente ? "#1e293b" : "#dc2626" }}>{f.cliente || "— sin cliente —"}</td>
                            <td style={{ padding: "5px 10px" }}>{f.fecha || "—"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>{f.lineas?.length ?? 0}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right" }}>{usd(tot)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button onClick={() => { setModal(false); setPreview([]); }} style={btnSecondary}>Cancelar</button>
                  <button onClick={() => importar.mutate()} disabled={preview.length === 0 || importar.isPending} style={btnPrimary}>
                    {importar.isPending ? "Importando..." : `Importar ${preview.length} facturas`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", textAlign: "center", border: "1px solid #e2e8f0" }}>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{valor}</div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };
const cardTitle: React.CSSProperties = { margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#1e293b" };
const inputSt: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none" };
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const avisoRojo: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#b91c1c" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 24, maxHeight: "92vh", overflow: "auto" };
