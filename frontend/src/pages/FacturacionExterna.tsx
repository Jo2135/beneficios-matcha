import { useState, useMemo } from "react";
import { API_BASE } from "../api/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { comprasExternasApi, productosApi, cuentasApi, facturasApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import {
  ShoppingCart, Plus, Minus, X, Search, Trash2, Upload, Image as ImageIcon,
  FileText, Package, Banknote, Link2, AlertTriangle,
} from "lucide-react";

const usd = (n: any) => {
  const v = Number(n ?? 0);
  return isNaN(v) ? "$0,00" : `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const num = (n: any) => Number(n ?? 0).toLocaleString("es-VE", { maximumFractionDigits: 2 });
const fecha = (raw: any) => (raw ? new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const hoyISO = () => new Date().toISOString().slice(0, 10);

export default function FacturacionExterna() {
  const qc = useQueryClient();
  const { esMaster } = useAuth();
  const [q, setQ] = useState("");
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: compras = [] } = useQuery({ queryKey: ["compras-externas", q], queryFn: () => comprasExternasApi.listar({ q: q || undefined }) });
  const { data: detalle } = useQuery({ queryKey: ["compra-externa", detalleId], queryFn: () => comprasExternasApi.obtener(detalleId!), enabled: !!detalleId });
  const { data: productos = [] } = useQuery({ queryKey: ["productos"], queryFn: () => productosApi.listar() });
  const { data: cuentas = [] } = useQuery({ queryKey: ["cuentas-todas"], queryFn: cuentasApi.listarTodas });
  const { data: balanceFac } = useQuery({ queryKey: ["facturas-balance"], queryFn: facturasApi.balance });
  const facturas: any[] = balanceFac?.facturas ?? [];

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["compras-externas"] });
    // La lista de facturas se vuelve a pedir: si se cayó al cargar (por ejemplo
    // por un reinicio del servidor) el buscador quedaría vacío para siempre.
    qc.invalidateQueries({ queryKey: ["facturas-balance"] });
    if (detalleId) qc.invalidateQueries({ queryKey: ["compra-externa", detalleId] });
  };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try { await fn(); refrescar(); }
    catch (e: any) { alert(e?.response?.data?.error ?? e?.message ?? "Error"); }
    finally { setBusy(false); }
  };

  const totalComprasCosto = compras.reduce((s: number, c: any) => s + Number(c.totalCosto), 0);
  const totalPagado = compras.reduce((s: number, c: any) => s + Number(c.totalPagado), 0);
  const totalSaldo = compras.reduce((s: number, c: any) => s + Number(c.saldoProveedor), 0);

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
            <ShoppingCart size={22} /> Facturación Externa
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            Compras a proveedores — reparte cantidades y registra pagos · {compras.length} compras
          </p>
        </div>
        <button
          onClick={() => setModalNueva(true)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "#7c3aed", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}
        >
          <Plus size={15} /> Nueva compra externa
        </button>
      </div>

      {/* Resumen */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
        <div style={cardStat}>
          <div style={statLbl}>Costo Total Comprado</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{usd(totalComprasCosto)}</div>
        </div>
        <div style={{ ...cardStat, borderLeft: "4px solid #16a34a" }}>
          <div style={statLbl}>Pagado al Proveedor</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{usd(totalPagado)}</div>
        </div>
        <div style={{ ...cardStat, borderLeft: "4px solid #f59e0b" }}>
          <div style={statLbl}>Saldo por Pagar</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#d97706" }}>{usd(totalSaldo)}</div>
        </div>
      </div>

      {/* Búsqueda */}
      <div style={{ position: "relative", maxWidth: 360, marginBottom: 14 }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por proveedor o número..."
          style={{ width: "100%", padding: "8px 10px 8px 32px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" }} />
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Proveedor", "N° Factura", "Fecha", "Productos", "Costo", "Pagado", "Saldo", ""].map((h) => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {compras.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: "center", padding: "48px 0", color: "#94a3b8" }}>
                <ShoppingCart size={32} style={{ display: "block", margin: "0 auto 10px", opacity: 0.3 }} />
                No hay compras externas registradas
              </td></tr>
            )}
            {compras.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }} onClick={() => setDetalleId(c.id)}>
                <td style={tdStyle}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 600, color: "#1e293b" }}>
                    {c.imagenUrl && <ImageIcon size={13} style={{ color: "#7c3aed" }} />}
                    {c.proveedor}
                  </span>
                </td>
                <td style={{ ...tdStyle, color: "#64748b" }}>{c.numero ?? "—"}</td>
                <td style={{ ...tdStyle, color: "#64748b" }}>{fecha(c.fecha)}</td>
                <td style={{ ...tdStyle, textAlign: "center" }}>{c.lineas?.length ?? 0}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{usd(c.totalCosto)}</td>
                <td style={{ ...tdStyle, color: "#16a34a" }}>{usd(c.totalPagado)}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: Number(c.saldoProveedor) > 0 ? "#dc2626" : "#16a34a" }}>
                  {Number(c.saldoProveedor) > 0 ? usd(c.saldoProveedor) : "✓ Pagada"}
                </td>
                <td style={tdStyle}><span style={{ fontSize: 12, color: "#94a3b8" }}>Ver →</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalNueva && (
        <ModalNueva
          productos={productos}
          onClose={() => setModalNueva(false)}
          onCreada={(nueva: any) => { setModalNueva(false); refrescar(); setDetalleId(nueva.id); }}
        />
      )}

      {detalleId && detalle && (
        <ModalDetalle
          compra={detalle}
          productos={productos}
          facturas={facturas}
          cuentas={cuentas}
          esMaster={esMaster}
          busy={busy}
          run={run}
          onClose={() => setDetalleId(null)}
          onEliminada={() => { setDetalleId(null); refrescar(); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── Modal: Nueva compra ─────────────────────────── */
function ModalNueva({ productos, onClose, onCreada }: any) {
  const [form, setForm] = useState<any>({ proveedor: "", numero: "", fecha: hoyISO(), notas: "", descuento1Pct: "", descuento2Pct: "" });
  const [lineas, setLineas] = useState<any[]>([{ producto: null, cantidad: "", costoUnitario: "" }]);
  const [saving, setSaving] = useState(false);

  const setLinea = (i: number, patch: any) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const addLinea = () => setLineas((ls) => [...ls, { producto: null, cantidad: "", costoUnitario: "" }]);
  const delLinea = (i: number) => setLineas((ls) => ls.filter((_, j) => j !== i));

  const lineasValidas = lineas.filter((l) => l.producto && Number(l.cantidad) > 0);
  const bruto = lineasValidas.reduce((s, l) => s + Number(l.cantidad) * (Number(l.costoUnitario) || 0), 0);
  // Los descuentos se aplican en cadena, igual que los factura el proveedor.
  const d1 = Number(form.descuento1Pct) || 0;
  const d2 = Number(form.descuento2Pct) || 0;
  const tras1 = bruto * (1 - d1 / 100);
  const total = tras1 * (1 - d2 / 100);

  const guardar = async () => {
    setSaving(true);
    try {
      const nueva = await comprasExternasApi.crear({
        ...form,
        descuento1Pct: d1,
        descuento2Pct: d2,
        lineas: lineasValidas.map((l) => ({ productoId: l.producto.id, cantidad: Number(l.cantidad), costoUnitario: Number(l.costoUnitario) || 0 })),
      });
      onCreada(nueva);
    } catch (e: any) { alert(e?.response?.data?.error ?? "Error al crear"); }
    finally { setSaving(false); }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: "min(760px, 96vw)" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Nueva compra externa</h2>
          <button onClick={onClose} style={btnClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div><label style={lbSt}>Proveedor *</label>
            <input style={inSt} value={form.proveedor} placeholder="Ej: Tubos del Sur C.A." onChange={(e) => setForm({ ...form, proveedor: e.target.value })} /></div>
          <div><label style={lbSt}>N° Factura</label>
            <input style={inSt} value={form.numero} placeholder="Opcional" onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
          <div><label style={lbSt}>Fecha</label>
            <input type="date" style={inSt} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
        </div>

        <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: "#374151" }}>Productos comprados</div>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          {lineas.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 110px 130px auto", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
              <div>
                {i === 0 && <label style={lbSt}>Producto</label>}
                <BuscadorProducto productos={productos} value={l.producto} onChange={(p: any) => setLinea(i, { producto: p })} />
              </div>
              <div>
                {i === 0 && <label style={lbSt}>Cantidad</label>}
                <input type="number" min="0" step="0.01" style={inSt} placeholder="0" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: e.target.value })} />
              </div>
              <div>
                {i === 0 && <label style={lbSt}>Costo Unit. (USD)</label>}
                <input type="number" min="0" step="0.0001" style={inSt} placeholder="0.00" value={l.costoUnitario} onChange={(e) => setLinea(i, { costoUnitario: e.target.value })} />
              </div>
              <button onClick={() => delLinea(i)} disabled={lineas.length === 1} style={{ background: "#fee2e2", border: "none", borderRadius: 6, padding: "8px 9px", cursor: "pointer", color: "#dc2626", opacity: lineas.length === 1 ? 0.4 : 1 }}>
                <Minus size={14} />
              </button>
            </div>
          ))}
          <button onClick={addLinea} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "#475569" }}>
            <Plus size={12} /> Agregar producto
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={lbSt}>Descuento 1 (%)</label>
            <input type="number" min="0" max="100" step="0.01" style={inSt} placeholder="0"
              value={form.descuento1Pct} onChange={(e) => setForm({ ...form, descuento1Pct: e.target.value })} /></div>
          <div><label style={lbSt}>Descuento 2 (%)</label>
            <input type="number" min="0" max="100" step="0.01" style={inSt} placeholder="0"
              value={form.descuento2Pct} onChange={(e) => setForm({ ...form, descuento2Pct: e.target.value })} /></div>
        </div>
        <p style={{ fontSize: 11.5, color: "#94a3b8", margin: "6px 0 0" }}>
          Se aplican uno detrás del otro, como los cobra el proveedor: primero el 1 sobre el total, y el 2 sobre lo que queda.
        </p>

        <div><label style={lbSt}>Notas</label>
          <textarea rows={2} style={{ ...inSt, resize: "vertical", height: 52, fontFamily: "inherit" }} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>

        {(d1 > 0 || d2 > 0) && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", padding: "2px 0" }}>
              <span>Precio de lista del proveedor</span><span>{usd(bruto)}</span>
            </div>
            {d1 > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", padding: "2px 0" }}>
                <span>Descuento 1 — {d1}%</span><span>− {usd(bruto - tras1)}</span>
              </div>
            )}
            {d2 > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", padding: "2px 0" }}>
                <span>Descuento 2 — {d2}% (sobre {usd(tras1)})</span><span>− {usd(tras1 - total)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#1e293b", borderTop: "1px solid #e2e8f0", marginTop: 6, paddingTop: 8, fontSize: 15 }}>
              <span>A pagar al proveedor</span><span>{usd(total)}</span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
          <div style={{ fontSize: 14, color: "#64748b" }}>
            {d1 > 0 || d2 > 0 ? "A pagar: " : "Costo total: "}
            <strong style={{ color: "#1e293b" }}>{usd(total)}</strong>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ ...btnAction, background: "#f1f5f9", color: "#64748b" }}>Cancelar</button>
            <button onClick={guardar} disabled={!form.proveedor.trim() || lineasValidas.length === 0 || saving}
              style={{ ...btnAction, background: "#7c3aed", color: "#fff", opacity: (!form.proveedor.trim() || lineasValidas.length === 0) ? 0.5 : 1 }}>
              {saving ? "Guardando..." : "Crear compra"}
            </button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, marginBottom: 0 }}>La foto de la factura se sube luego desde el detalle de la compra.</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Modal: Detalle ─────────────────────────── */
function ModalDetalle({ compra, productos, facturas, cuentas, esMaster, busy, run, onClose, onEliminada }: any) {
  const [asignarLineaId, setAsignarLineaId] = useState<number | null>(null);
  const [asgForm, setAsgForm] = useState<any>({ factura: null, cantidad: "", notas: "" });
  const [pagoForm, setPagoForm] = useState<any>({ monto: "", fecha: hoyISO(), cuentaId: "", origenFondos: "", notas: "" });
  const [addLinea, setAddLinea] = useState<any>({ producto: null, cantidad: "", costoUnitario: "" });
  const [mostrarAddLinea, setMostrarAddLinea] = useState(false);
  const [desc, setDesc] = useState({
    d1: String(Number(compra.descuento1Pct) || ""),
    d2: String(Number(compra.descuento2Pct) || ""),
  });

  const guardarDescuentos = () =>
    run(() => comprasExternasApi.actualizar(compra.id, {
      descuento1Pct: Number(desc.d1) || 0,
      descuento2Pct: Number(desc.d2) || 0,
    }));
  const descCambiados =
    (Number(desc.d1) || 0) !== (Number(compra.descuento1Pct) || 0) ||
    (Number(desc.d2) || 0) !== (Number(compra.descuento2Pct) || 0);

  const subirImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = "";
    if (file) run(() => comprasExternasApi.subirImagen(compra.id, file));
  };

  const enviarAsignacion = (lineaId: number) => {
    if (!asgForm.factura || !(Number(asgForm.cantidad) > 0)) return;
    run(() => comprasExternasApi.asignar({ lineaId, facturaId: asgForm.factura.id, cantidad: Number(asgForm.cantidad), notas: asgForm.notas }))
      .then(() => { setAsignarLineaId(null); setAsgForm({ factura: null, cantidad: "", notas: "" }); });
  };

  const enviarPago = () => {
    if (!(Number(pagoForm.monto) > 0)) return;
    run(() => comprasExternasApi.registrarPago(compra.id, { ...pagoForm, cuentaId: pagoForm.cuentaId || undefined }))
      .then(() => setPagoForm({ monto: "", fecha: hoyISO(), cuentaId: "", origenFondos: "", notas: "" }));
  };

  const enviarLinea = () => {
    if (!addLinea.producto || !(Number(addLinea.cantidad) > 0)) return;
    run(() => comprasExternasApi.agregarLinea(compra.id, { productoId: addLinea.producto.id, cantidad: Number(addLinea.cantidad), costoUnitario: Number(addLinea.costoUnitario) || 0 }))
      .then(() => { setAddLinea({ producto: null, cantidad: "", costoUnitario: "" }); setMostrarAddLinea(false); });
  };

  const esPdf = compra.imagenUrl?.toLowerCase().endsWith(".pdf");

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={{ ...modalStyle, width: "min(960px, 98vw)" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{compra.proveedor}</h2>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
              {compra.numero ? `Factura ${compra.numero} · ` : ""}{fecha(compra.fecha)}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {esMaster && (
              <button onClick={() => { if (window.confirm(`¿Eliminar la compra de ${compra.proveedor}? Se borran sus líneas, asignaciones y pagos.`)) run(() => comprasExternasApi.eliminar(compra.id)).then(onEliminada); }}
                style={{ ...btnAction, background: "#fee2e2", color: "#991b1b", display: "flex", alignItems: "center", gap: 6 }}>
                <Trash2 size={13} /> Eliminar
              </button>
            )}
            <button onClick={onClose} style={btnClose}>✕</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 18 }}>
          {/* Columna izquierda: productos + pagos */}
          <div>
            {/* Productos / reparto */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Package size={15} /> Productos y reparto
            </div>
            {/* El recorte redondea las esquinas, pero tapa la lista desplegable
                del buscador cuando se asigna la ÚLTIMA línea (cae fuera del
                recuadro). Mientras hay un buscador abierto se deja ver. */}
            <div style={{
              border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 8,
              overflow: (asignarLineaId !== null || mostrarAddLinea) ? "visible" : "hidden",
            }}>
              {(compra.lineas ?? []).map((l: any) => (
                <div key={l.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#fafafa" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {l.producto?.codigo && <span style={{ color: "#7c3aed" }}>{l.producto.codigo} · </span>}
                        {l.producto?.nombre} <span style={{ color: "#94a3b8" }}>{l.producto?.medida}</span>
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        Comprado <strong>{num(l.cantidad)}</strong> · Asignado <strong style={{ color: "#2563eb" }}>{num(l.asignado)}</strong> ·
                        Disponible <strong style={{ color: l.disponible > 0 ? "#16a34a" : "#94a3b8" }}>{num(l.disponible)}</strong>
                        {Number(l.costoUnitario) > 0 && <> · {usd(l.costoUnitario)}/u</>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => { setAsignarLineaId(asignarLineaId === l.id ? null : l.id); setAsgForm({ factura: null, cantidad: "", notas: "" }); }}
                        disabled={l.disponible <= 0}
                        style={{ ...btnMini, background: "#eef2ff", color: "#4338ca", opacity: l.disponible <= 0 ? 0.4 : 1 }}>
                        <Link2 size={12} /> Asignar
                      </button>
                      <button onClick={() => run(() => comprasExternasApi.eliminarLinea(l.id))} title="Eliminar producto"
                        style={{ ...btnMini, background: "#fee2e2", color: "#dc2626" }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>

                  {/* Formulario de asignación */}
                  {asignarLineaId === l.id && (
                    <div style={{ padding: "10px 12px", background: "#f8fafc", borderTop: "1px dashed #e2e8f0" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px auto", gap: 8, alignItems: "flex-end" }}>
                        <div>
                          <label style={lbSt}>Factura del cliente</label>
                          <BuscadorFactura facturas={facturas} value={asgForm.factura} onChange={(f: any) => setAsgForm({ ...asgForm, factura: f })} />
                        </div>
                        <div>
                          <label style={lbSt}>Cantidad</label>
                          <input type="number" min="0" step="0.01" style={inSt} placeholder={`máx ${num(l.disponible)}`} value={asgForm.cantidad} onChange={(e) => setAsgForm({ ...asgForm, cantidad: e.target.value })} />
                        </div>
                        <button onClick={() => enviarAsignacion(l.id)} disabled={busy || !asgForm.factura || !(Number(asgForm.cantidad) > 0)}
                          style={{ ...btnAction, background: "#4338ca", color: "#fff", padding: "8px 14px" }}>Asignar</button>
                      </div>
                    </div>
                  )}

                  {/* Asignaciones existentes */}
                  {(l.asignaciones ?? []).length > 0 && (
                    <div style={{ padding: "4px 12px 10px" }}>
                      {l.asignaciones.map((a: any) => (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 8px", fontSize: 12, borderBottom: "1px solid #f8fafc" }}>
                          <span style={{ color: "#374151" }}>
                            <strong style={{ color: "#2563eb" }}>{num(a.cantidad)}</strong> → {a.factura?.cliente?.nombre ?? "—"}
                            <span style={{ color: "#94a3b8" }}> · {a.factura?.numero}</span>
                          </span>
                          <button onClick={() => run(() => comprasExternasApi.eliminarAsignacion(a.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1" }}>
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {(compra.lineas ?? []).length === 0 && (
                <div style={{ padding: 14, color: "#94a3b8", fontSize: 13 }}>Sin productos en esta compra</div>
              )}
            </div>

            {/* Agregar producto */}
            {mostrarAddLinea ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 120px auto auto", gap: 8, alignItems: "flex-end", marginBottom: 18 }}>
                <BuscadorProducto productos={productos} value={addLinea.producto} onChange={(p: any) => setAddLinea({ ...addLinea, producto: p })} />
                <input type="number" min="0" step="0.01" style={inSt} placeholder="Cant." value={addLinea.cantidad} onChange={(e) => setAddLinea({ ...addLinea, cantidad: e.target.value })} />
                <input type="number" min="0" step="0.0001" style={inSt} placeholder="Costo/u" value={addLinea.costoUnitario} onChange={(e) => setAddLinea({ ...addLinea, costoUnitario: e.target.value })} />
                <button onClick={enviarLinea} disabled={busy} style={{ ...btnAction, background: "#16a34a", color: "#fff", padding: "8px 12px" }}>Añadir</button>
                <button onClick={() => setMostrarAddLinea(false)} style={{ ...btnAction, background: "#f1f5f9", color: "#64748b", padding: "8px 12px" }}>✕</button>
              </div>
            ) : (
              <button onClick={() => setMostrarAddLinea(true)} style={{ display: "flex", alignItems: "center", gap: 4, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", cursor: "pointer", fontSize: 12, color: "#475569", marginBottom: 18 }}>
                <Plus size={12} /> Agregar producto
              </button>
            )}

            {/* Pagos al proveedor */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <Banknote size={15} /> Pagos al proveedor
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
              {/* Descuentos del proveedor — editables aquí, porque una factura
                  puede cargarse antes de saber qué descuento aplicó. */}
              <div style={{ padding: "9px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 12.5, color: "#64748b" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "1px 0", marginBottom: 6 }}>
                  <span>Precio de lista del proveedor</span>
                  <span style={{ fontWeight: 600 }}>{usd(compra.totalBruto ?? compra.totalCosto)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                  <span>Descuentos:</span>
                  <input type="number" min="0" max="100" step="0.01" placeholder="0" value={desc.d1}
                    onChange={(e) => setDesc({ ...desc, d1: e.target.value })}
                    style={{ width: 56, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12.5, textAlign: "right" }} />
                  <span>% +</span>
                  <input type="number" min="0" max="100" step="0.01" placeholder="0" value={desc.d2}
                    onChange={(e) => setDesc({ ...desc, d2: e.target.value })}
                    style={{ width: 56, padding: "3px 6px", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 12.5, textAlign: "right" }} />
                  <span>%</span>
                  {descCambiados && (
                    <button onClick={guardarDescuentos} disabled={busy}
                      style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                      Aplicar
                    </button>
                  )}
                  {!descCambiados && Number(compra.ahorroDescuentos) > 0.005 && (
                    <span style={{ color: "#16a34a", fontWeight: 600, marginLeft: "auto" }}>− {usd(compra.ahorroDescuentos)}</span>
                  )}
                </div>
                {descCambiados && (
                  <div style={{ marginTop: 5, fontSize: 11.5, color: "#a16207" }}>
                    Se aplican uno detrás del otro. Toca Aplicar para recalcular el saldo.
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#FDB913" }}>
                <span style={{ fontWeight: 700, color: "#713f12", fontSize: 13 }}>
                  {Number(compra.ahorroDescuentos) > 0.005 ? "A pagar al proveedor" : "Costo total de la compra"}
                </span>
                <span style={{ fontWeight: 800, color: "#713f12", fontSize: 14 }}>{usd(compra.totalCosto)}</span>
              </div>
              {(compra.pagos ?? []).length === 0 && (
                <div style={{ padding: "10px 12px", color: "#94a3b8", fontSize: 13 }}>Sin pagos registrados</div>
              )}
              {(compra.pagos ?? []).map((p: any) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderTop: "1px solid #f1f5f9" }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ fontWeight: 500, color: "#374151" }}>{p.cuenta?.nombre ?? p.origenFondos ?? "Pago"}</span>
                    <span style={{ color: "#94a3b8" }}> · {fecha(p.fecha)}{p.cuenta?.moneda ? ` · ${p.cuenta.moneda}` : ""}</span>
                    {p.notas && <div style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{p.notas}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontWeight: 700, color: "#16a34a", fontSize: 14 }}>{usd(p.monto)}</span>
                    <button onClick={() => run(() => comprasExternasApi.eliminarPago(p.id))} style={{ background: "none", border: "none", cursor: "pointer", color: "#cbd5e1" }}><X size={14} /></button>
                  </div>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: Number(compra.saldoProveedor) <= 0.005 ? "#16a34a" : "#dc2626" }}>
                <span style={{ fontWeight: 800, color: "#fff", fontSize: 13 }}>{Number(compra.saldoProveedor) <= 0.005 ? "✓ PAGADA AL PROVEEDOR" : "SALDO POR PAGAR"}</span>
                <span style={{ fontWeight: 800, color: "#fff", fontSize: 14 }}>{usd(compra.saldoProveedor)}</span>
              </div>
            </div>

            {/* Agregar pago */}
            <div style={{ display: "grid", gridTemplateColumns: "110px 130px 1fr auto", gap: 8, alignItems: "flex-end" }}>
              <div><label style={lbSt}>Monto (USD)</label>
                <input type="number" min="0" step="0.01" style={inSt} placeholder="0.00" value={pagoForm.monto} onChange={(e) => setPagoForm({ ...pagoForm, monto: e.target.value })} /></div>
              <div><label style={lbSt}>Fecha</label>
                <input type="date" style={inSt} value={pagoForm.fecha} onChange={(e) => setPagoForm({ ...pagoForm, fecha: e.target.value })} /></div>
              <div><label style={lbSt}>¿De qué cuenta salió?</label>
                <select style={inSt} value={pagoForm.cuentaId} onChange={(e) => setPagoForm({ ...pagoForm, cuentaId: e.target.value })}>
                  <option value="">— Otra / efectivo —</option>
                  {(cuentas as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>)}
                </select></div>
              <button onClick={enviarPago} disabled={busy || !(Number(pagoForm.monto) > 0)} style={{ ...btnAction, background: "#16a34a", color: "#fff" }}>Pagar</button>
            </div>
            {!pagoForm.cuentaId && (
              <input style={{ ...inSt, marginTop: 8 }} placeholder="Origen del dinero (si no es una cuenta de la lista)" value={pagoForm.origenFondos} onChange={(e) => setPagoForm({ ...pagoForm, origenFondos: e.target.value })} />
            )}
          </div>

          {/* Columna derecha: imagen de la factura */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={15} /> Factura del proveedor
            </div>
            <div style={{ border: "1px dashed #cbd5e1", borderRadius: 8, padding: 10, textAlign: "center", background: "#f8fafc" }}>
              {compra.imagenUrl ? (
                <>
                  {esPdf ? (
                    <a href={`${API_BASE}${compra.imagenUrl}`} target="_blank" rel="noreferrer" style={{ display: "block", padding: 24, color: "#7c3aed", fontWeight: 600, textDecoration: "none" }}>
                      <FileText size={40} style={{ display: "block", margin: "0 auto 8px" }} /> Ver PDF
                    </a>
                  ) : (
                    <a href={`${API_BASE}${compra.imagenUrl}`} target="_blank" rel="noreferrer">
                      <img src={`${API_BASE}${compra.imagenUrl}`} alt="Factura externa" style={{ maxWidth: "100%", borderRadius: 6, cursor: "zoom-in" }} />
                    </a>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
                    <label style={{ ...btnMini, background: "#eef2ff", color: "#4338ca", cursor: "pointer" }}>
                      <Upload size={12} /> Cambiar
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }} onChange={subirImg} />
                    </label>
                    <button onClick={() => run(() => comprasExternasApi.eliminarImagen(compra.id))} style={{ ...btnMini, background: "#fee2e2", color: "#dc2626" }}>
                      <Trash2 size={12} /> Quitar
                    </button>
                  </div>
                </>
              ) : (
                <label style={{ cursor: "pointer", display: "block", padding: "24px 8px", color: "#64748b" }}>
                  <Upload size={28} style={{ display: "block", margin: "0 auto 8px", opacity: 0.5 }} />
                  <span style={{ fontSize: 13 }}>Subir foto o PDF de la factura</span>
                  <input type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" style={{ display: "none" }} onChange={subirImg} />
                </label>
              )}
            </div>
            {compra.notas && (
              <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#374151", whiteSpace: "pre-wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4, fontWeight: 600, marginBottom: 2 }}><AlertTriangle size={12} /> Notas</div>
                {compra.notas}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Buscadores ─────────────────────────── */
function BuscadorProducto({ productos, value, onChange }: { productos: any[]; value: any; onChange: (p: any) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return productos.filter((p) => `${p.codigo ?? ""} ${p.nombre} ${p.medida}`.toLowerCase().includes(t)).slice(0, 12);
  }, [q, productos]);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...inSt, padding: "6px 8px" }}>
        <span style={{ flex: 1, fontSize: 12, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value.codigo ? `${value.codigo} · ` : ""}{value.nombre} {value.medida}
        </span>
        <button onClick={() => { onChange(null); setQ(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={13} /></button>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <input style={inSt} placeholder="Buscar producto..." value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div style={dropdown}>
          {matches.map((p) => (
            <div key={p.id} onMouseDown={() => { onChange(p); setQ(""); setOpen(false); }} style={dropItem}>
              {p.codigo && <span style={{ color: "#7c3aed", fontWeight: 600 }}>{p.codigo} · </span>}{p.nombre} <span style={{ color: "#94a3b8" }}>{p.medida}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuscadorFactura({ facturas, value, onChange }: { facturas: any[]; value: any; onChange: (f: any) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return facturas.filter((f) => `${f.numero ?? ""} ${f.cliente?.nombre ?? ""}`.toLowerCase().includes(t)).slice(0, 12);
  }, [q, facturas]);

  if (value) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, ...inSt, padding: "6px 8px" }}>
        <span style={{ flex: 1, fontSize: 12, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value.cliente?.nombre} · {value.numero}
        </span>
        <button onClick={() => { onChange(null); setQ(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8" }}><X size={13} /></button>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <input style={inSt} placeholder="Cliente o N° factura..." value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && matches.length > 0 && (
        <div style={dropdown}>
          {matches.map((f) => (
            <div key={f.id} onMouseDown={() => { onChange(f); setQ(""); setOpen(false); }} style={dropItem}>
              <strong>{f.cliente?.nombre}</strong> <span style={{ color: "#94a3b8" }}>· {f.numero}</span>
            </div>
          ))}
        </div>
      )}
      {/* Sin esto el buscador se queda mudo y no se sabe si es que no existe la
          factura o si la lista no llegó a cargar. */}
      {open && q.trim().length > 0 && matches.length === 0 && (
        <div style={{ ...dropdown, padding: "10px 12px", fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d" }}>
          {facturas.length === 0 ? (
            <>
              <b>No se pudieron cargar las facturas.</b>
              <div style={{ marginTop: 3 }}>Recarga la página (Ctrl+F5) y vuelve a intentar.</div>
            </>
          ) : (
            <>
              <b>Ninguna factura coincide con “{q.trim()}”.</b>
              <div style={{ marginTop: 3 }}>Se buscó en {facturas.length} facturas, por nombre del cliente y por número.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Estilos ─────────────────────────── */
const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", overflow: "hidden" };
const cardStat: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "16px 20px", borderLeft: "4px solid #e2e8f0" };
const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: 4 };
const thStyle: React.CSSProperties = { padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" };
const tdStyle: React.CSSProperties = { padding: "11px 14px", fontSize: 13, color: "#374151", verticalAlign: "middle" };
const overlayStyle: React.CSSProperties = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 };
const modalStyle: React.CSSProperties = { background: "#fff", borderRadius: 16, padding: 28, maxHeight: "94vh", overflow: "auto" };
const btnAction: React.CSSProperties = { border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 };
const btnMini: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, border: "none", padding: "5px 9px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 };
const btnClose: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#64748b" };
const lbSt: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 3 };
const inSt: React.CSSProperties = { width: "100%", padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 7, fontSize: 13, outline: "none", boxSizing: "border-box" };
const dropdown: React.CSSProperties = { position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 2, maxHeight: 220, overflowY: "auto", zIndex: 70, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" };
const dropItem: React.CSSProperties = { padding: "7px 10px", fontSize: 12, cursor: "pointer", borderBottom: "1px solid #f8fafc" };
