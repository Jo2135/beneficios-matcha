import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { facturasApi } from "../api/endpoints";
import { Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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

export default function ImportarFacturasExcel({ label = "Importar histórico (Excel)", style }: { label?: string; style?: React.CSSProperties }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [anio, setAnio] = useState(2025);
  const [preview, setPreview] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);

  const importar = useMutation({
    mutationFn: () => facturasApi.importarHistorico({ anio, facturas: preview }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["ventas-facturas"] });
      qc.invalidateQueries({ queryKey: ["facturas"] });
      qc.invalidateQueries({ queryKey: ["facturas-balance"] });
    },
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

  const totalLineas = preview.reduce((s, f) => s + (f.lineas?.length ?? 0), 0);
  const totalMonto = preview.reduce((s, f) => s + (f.lineas ?? []).reduce((a: number, l: any) => a + Number(l.monto), 0), 0);

  return (
    <>
      <label style={{ ...btnPrimary, cursor: "pointer", ...style }}>
        <Upload size={16} /> {label}
        <input type="file" accept=".xlsx,.xls" multiple style={{ display: "none" }} onChange={onArchivos} />
      </label>

      {modal && (
        <div style={modalOverlay} onClick={() => { setModal(false); setResult(null); }}>
          <div style={{ ...modalBox, width: "min(720px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Importar facturas históricas (Excel)</h2>
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
                    {result.errores.map((er: any, i: number) => (
                      <div key={i} style={{ fontSize: 12, color: "#dc2626", display: "flex", gap: 6, marginBottom: 3 }}>
                        <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {er.archivo}: {er.mensaje}
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
                  <strong>{preview.length}</strong> archivos · <strong>{totalLineas}</strong> líneas · total {usd(totalMonto)}
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
    </>
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

const inputSt: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none" };
const btnPrimary: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, background: "#2563eb", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 };
const btnSecondary: React.CSSProperties = { background: "#fff", color: "#374151", border: "1px solid #d1d5db", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 14 };
const avisoRojo: React.CSSProperties = { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#b91c1c" };
const modalOverlay: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 };
const modalBox: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 24, maxHeight: "92vh", overflow: "auto" };
