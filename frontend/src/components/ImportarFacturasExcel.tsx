import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { facturasApi } from "../api/endpoints";
import { Upload, X, CheckCircle, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Hoja = {
  archivo: string; hoja: string; multi: boolean;
  cliente: string; fecha: string; lineas: any[];
  sel: boolean; error?: boolean;
};

const fmtCelda = (v: any): string => {
  if (v == null || v === "") return "";
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).trim();
};

const norm = (v: any) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Localiza la fila de encabezado y QUÉ columna es cada dato leyendo los títulos.
// Así da igual el orden real de las columnas: sirve tanto para la plantilla de
// cotización (Cantidad después de la descripción) como para las notas de despacho
// (Cantidad en la primera columna). Devuelve null si la hoja no tiene tabla de productos.
function detectarColumnas(rows: any[][]):
  | { hdr: number; cProd: number; cMedida: number; cCant: number; cMonto: number }
  | null {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i]; if (!r) continue;
    let cProd = -1, cMedida = -1, cCant = -1, cMonto = -1;
    for (let c = 0; c < r.length; c++) {
      const t = norm(r[c]);
      if (!t) continue;
      if (cProd < 0 && t.includes("descripcion")) cProd = c;
      else if (cMedida < 0 && t === "medida") cMedida = c;
      else if (cCant < 0 && t.includes("cantidad")) cCant = c;
      // Monto = el TOTAL de la línea (no el precio unitario). Tomo la primera que aparezca.
      else if (cMonto < 0 && /monto|costo\s*total|costo\s*x|importe|sub\s*total/.test(t)) cMonto = c;
    }
    // Una tabla válida necesita al menos descripción, cantidad y monto.
    if (cProd >= 0 && cCant >= 0 && cMonto >= 0) {
      return { hdr: i, cProd, cMedida: cMedida >= 0 ? cMedida : cProd + 1, cCant, cMonto };
    }
  }
  return null;
}

// Lee UNA hoja y extrae cliente, fecha y líneas vendidas.
function parsePlantilla(rows: any[][]): { cliente: string; fecha: string; lineas: any[] } {
  const col = detectarColumnas(rows);
  if (!col) return { cliente: "", fecha: "", lineas: [] };

  // Cliente y Fecha: busco las etiquetas en CUALQUIER columna por encima de la tabla,
  // y tomo el valor de la primera celda no vacía a su derecha.
  let cliente = "", fecha = "";
  for (let i = 0; i < col.hdr; i++) {
    const r = rows[i]; if (!r) continue;
    for (let c = 0; c < r.length; c++) {
      const lbl = norm(r[c]);
      if (lbl !== "cliente" && lbl !== "fecha") continue;
      let val: any = "";
      for (let k = c + 1; k < r.length; k++) { if (String(r[k] ?? "").trim() !== "") { val = r[k]; break; } }
      if (lbl === "cliente" && !cliente) cliente = String(val ?? "").trim();
      if (lbl === "fecha" && !fecha) fecha = fmtCelda(val);
    }
  }

  const lineas: any[] = [];
  for (let i = col.hdr + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const producto = String(r[col.cProd] ?? "").trim();
    const medida = String(r[col.cMedida] ?? "").trim();
    const cantidad = Number(r[col.cCant]);
    const monto = Number(r[col.cMonto]);
    if (!producto || norm(producto).includes("descripcion")) continue;
    if (!(cantidad > 0) || !(monto > 0)) continue;
    lineas.push({ producto, medida, cantidad, monto });
  }
  return { cliente, fecha, lineas };
}

const totalDe = (l: any[]) => (l ?? []).reduce((a: number, x: any) => a + Number(x.monto), 0);

export default function ImportarFacturasExcel({ label = "Importar histórico (Excel)", style }: { label?: string; style?: React.CSSProperties }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [anio, setAnio] = useState(2025);
  const [preview, setPreview] = useState<Hoja[]>([]);
  const [result, setResult] = useState<any>(null);

  const seleccionadas = preview.filter((f) => f.sel && !f.error);

  const importar = useMutation({
    mutationFn: () => facturasApi.importarHistorico({
      anio,
      facturas: seleccionadas.map((f) => ({
        archivo: f.archivo,
        // La hoja solo viaja si el archivo trae varias: así el número de las
        // facturas ya importadas (un archivo = una hoja) no cambia.
        hoja: f.multi ? f.hoja : undefined,
        cliente: f.cliente, fecha: f.fecha, lineas: f.lineas,
      })),
    }),
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
    const hojas: Hoja[] = [];
    for (const file of files) {
      const fallido = (): Hoja => ({ archivo: file.name, hoja: "", multi: false, cliente: "", fecha: "", lineas: [], sel: false, error: true });
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(new Uint8Array(buf), { type: "array", cellDates: true });
        // Reviso TODAS las pestañas: me quedo con las que parecen un despacho
        const delArchivo: Hoja[] = [];
        for (const hoja of wb.SheetNames) {
          const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "" });
          const { cliente, fecha, lineas } = parsePlantilla(rows);
          if (!cliente || lineas.length === 0) continue;
          delArchivo.push({ archivo: file.name, hoja, multi: false, cliente, fecha, lineas, sel: false });
        }
        if (delArchivo.length === 0) { hojas.push(fallido()); continue; }
        // Dejo marcada solo la hoja de mayor monto (la principal). El resto se omite salvo que José la marque.
        const multi = delArchivo.length > 1;
        let mejor = 0;
        delArchivo.forEach((c, i) => { if (totalDe(c.lineas) > totalDe(delArchivo[mejor].lineas)) mejor = i; });
        delArchivo.forEach((c, i) => { c.multi = multi; c.sel = i === mejor; });
        hojas.push(...delArchivo);
      } catch {
        hojas.push(fallido());
      }
    }
    setPreview(hojas);
    setModal(true);
  };

  const toggle = (i: number) => setPreview((p) => p.map((c, j) => (j === i ? { ...c, sel: !c.sel } : c)));

  const totalLineas = seleccionadas.reduce((s, f) => s + f.lineas.length, 0);
  const totalMonto = seleccionadas.reduce((s, f) => s + totalDe(f.lineas), 0);

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
                  Marca las pestañas que quieres cargar. <strong>{seleccionadas.length}</strong> de {preview.filter((f) => !f.error).length} · <strong>{totalLineas}</strong> líneas · total {usd(totalMonto)}
                </div>
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", maxHeight: 280, overflowY: "auto", marginBottom: 14 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: "#f1f5f9", position: "sticky", top: 0 }}>
                      {["", "Archivo", "Pestaña", "Cliente", "Fecha", "Líneas", "Total"].map((h, i) => <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: "#64748b" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {preview.map((f, i) => {
                        const ok = !f.error;
                        const repetido = i > 0 && preview[i - 1].archivo === f.archivo;
                        return (
                          <tr key={i} style={{ borderBottom: "1px solid #f8fafc", background: !ok ? "#fef2f2" : f.sel ? "#fff" : "#f8fafc", opacity: ok && !f.sel ? 0.6 : 1 }}>
                            <td style={{ padding: "5px 10px" }}>
                              {ok && <input type="checkbox" checked={f.sel} onChange={() => toggle(i)} style={{ cursor: "pointer", width: 15, height: 15 }} />}
                            </td>
                            <td style={{ padding: "5px 10px", color: repetido ? "#cbd5e1" : "#1e293b" }}>{repetido ? "↳" : f.archivo}</td>
                            <td style={{ padding: "5px 10px", fontWeight: f.sel ? 600 : 400 }}>{f.hoja || "—"}</td>
                            <td style={{ padding: "5px 10px", color: f.cliente ? "#1e293b" : "#dc2626" }}>{f.cliente || "— sin cliente —"}</td>
                            <td style={{ padding: "5px 10px" }}>{f.fecha || "—"}</td>
                            <td style={{ padding: "5px 10px", textAlign: "center" }}>{f.lineas.length}</td>
                            <td style={{ padding: "5px 10px", textAlign: "right" }}>{usd(totalDe(f.lineas))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                  <button onClick={() => { setModal(false); setPreview([]); }} style={btnSecondary}>Cancelar</button>
                  <button onClick={() => importar.mutate()} disabled={seleccionadas.length === 0 || importar.isPending} style={btnPrimary}>
                    {importar.isPending ? "Importando..." : `Importar ${seleccionadas.length} factura${seleccionadas.length === 1 ? "" : "s"}`}
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
