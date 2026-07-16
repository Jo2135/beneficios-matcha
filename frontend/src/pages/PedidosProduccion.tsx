import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { pedidosApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Boxes, ChevronDown, ChevronRight, Zap, Wrench, Link2 } from "lucide-react";

type Pedido = { cliente: string; vendedor: string | null; numero: string; estado: string; fecha: string; cantidad: number };
type Item = { productoId: number; codigo: string | null; nombre: string; medida: string; cantidad: number; pedidos: Pedido[] };
type Grupo = { total: number; items: Item[] };

const ESTADOS = [
  { key: "APROBADA", label: "Aprobadas" },
  { key: "EN_DESPACHO", label: "En Despacho" },
  { key: "COMPLETADA", label: "Completadas" },
];

const INFO: Record<string, { titulo: string; sub: string; color: string; icono: any }> = {
  curvas:     { titulo: "Curvas",     sub: "Curva Eléctrica Blanca y Negra — se fabrican",     color: "#2563eb", icono: Zap },
  niples:     { titulo: "Niples",     sub: "Niple Azul — se fabrican",                          color: "#7c3aed", icono: Wrench },
  conexiones: { titulo: "Conexiones", sub: "Solo las que se compran (los codos 2\" y 4\" que fabrica Ecoplast no cuentan)", color: "#ea580c", icono: Link2 },
};

const num = (n: number) => Number(n).toLocaleString("es-VE", { maximumFractionDigits: 2 });
const fecha = (f: string) => new Date(f).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });

export default function PedidosProduccion() {
  const { usuario } = useAuth();
  const [estados, setEstados] = useState<string[]>(["APROBADA"]);
  const [abierto, setAbierto] = useState<Record<string, boolean>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedidos-demanda", estados],
    queryFn: () => pedidosApi.demanda(estados),
    enabled: estados.length > 0,
  });

  const toggleEstado = (k: string) =>
    setEstados((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));

  const soloCurvas = usuario?.rol === "VENDEDOR";

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Boxes size={22} color="#1e293b" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Pedidos de Producción</h1>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
        {soloCurvas
          ? "Cuántas curvas hay pedidas y qué cliente las está pidiendo."
          : "Cuánto hay pedido de curvas, niples y conexiones, y qué cliente lo pide."}
      </p>

      {/* Filtro de estado del pedido */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Contar pedidos:</span>
        {ESTADOS.map((e) => {
          const on = estados.includes(e.key);
          return (
            <button key={e.key} onClick={() => toggleEstado(e.key)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: on ? "1px solid #2563eb" : "1px solid #d1d5db",
                background: on ? "#2563eb" : "#fff", color: on ? "#fff" : "#64748b",
              }}>
              {e.label}
            </button>
          );
        })}
      </div>

      {estados.length === 0 && <Aviso texto="Selecciona al menos un estado para contar." />}
      {isLoading && <Aviso texto="Cargando..." />}
      {error && <Aviso texto="No tienes permiso para ver esta pantalla." color="#dc2626" />}

      {data && (
        <div style={{ display: "grid", gap: 16 }}>
          {(data.puedeVer as string[]).map((g) => {
            const grupo: Grupo = data.grupos[g];
            const info = INFO[g];
            const Icono = info.icono;
            return (
              <div key={g} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: info.color + "18", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icono size={19} color={info.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>{info.titulo}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8" }}>{info.sub}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 24, fontWeight: 800, color: info.color }}>{num(grupo.total)}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>unidades pedidas</div>
                  </div>
                </div>

                {grupo.items.length === 0 ? (
                  <div style={{ padding: "18px", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                    No hay {info.titulo.toLowerCase()} en los pedidos seleccionados.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["", "Código", "Producto", "Medida", "Cantidad", "Clientes"].map((h, i) => (
                          <th key={i} style={{ padding: "7px 12px", textAlign: i >= 4 ? "right" : "left", fontWeight: 600, color: "#64748b", fontSize: 11 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.items.map((it) => {
                        const k = `${g}-${it.productoId}`;
                        const open = !!abierto[k];
                        return (
                          <Fragment key={k}>
                            <tr onClick={() => setAbierto((a) => ({ ...a, [k]: !open }))}
                              style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer", background: open ? "#f8fafc" : "#fff" }}>
                              <td style={{ padding: "7px 12px", width: 28 }}>
                                {open ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
                              </td>
                              <td style={{ padding: "7px 12px", color: "#94a3b8", fontSize: 12 }}>{it.codigo ?? "—"}</td>
                              <td style={{ padding: "7px 12px", color: "#1e293b", fontWeight: 500 }}>{it.nombre}</td>
                              <td style={{ padding: "7px 12px", color: "#64748b" }}>{it.medida}</td>
                              <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: info.color }}>{num(it.cantidad)}</td>
                              <td style={{ padding: "7px 12px", textAlign: "right", color: "#94a3b8", fontSize: 12 }}>{it.pedidos.length}</td>
                            </tr>
                            {open && it.pedidos.map((p, i) => (
                              <tr key={`${k}-${i}`} style={{ background: "#f8fafc", fontSize: 12 }}>
                                <td />
                                <td style={{ padding: "5px 12px", color: "#94a3b8" }}>{p.numero}</td>
                                <td style={{ padding: "5px 12px", color: "#1e293b", fontWeight: 600 }}>{p.cliente}</td>
                                <td style={{ padding: "5px 12px", color: "#64748b" }}>
                                  {p.vendedor ?? "—"} · {fecha(p.fecha)}
                                </td>
                                <td style={{ padding: "5px 12px", textAlign: "right", color: "#475569", fontWeight: 600 }}>{num(p.cantidad)}</td>
                                <td style={{ padding: "5px 12px", textAlign: "right" }}>
                                  <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 999, background: "#e2e8f0", color: "#475569", fontWeight: 600 }}>
                                    {p.estado.replace("_", " ")}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Aviso({ texto, color = "#64748b" }: { texto: string; color?: string }) {
  return (
    <div style={{ padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 13, color, textAlign: "center" }}>
      {texto}
    </div>
  );
}
