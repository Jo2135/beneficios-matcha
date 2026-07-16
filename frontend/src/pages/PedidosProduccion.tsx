import { useState, useMemo, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { pedidosApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Boxes } from "lucide-react";

type Pedido = { cliente: string; vendedor: string | null; numero: string; estado: string; fecha: string; cantidad: number };
type Item = { productoId: number; codigo: string | null; nombre: string; medida: string; cantidad: number; pedidos: Pedido[] };

// Aprobada = el pedido está EN FABRICACIÓN: es lo que de verdad hay que producir.
// En Despacho = ya está producido y se está cargando. Completada = ya se entregó.
// Por eso el filtro arranca solo en Aprobadas; los otros dos son para consultar.
const ESTADOS = [
  { key: "APROBADA", label: "Aprobadas", ayuda: "En fabricación — esto es lo que falta por producir" },
  { key: "EN_DESPACHO", label: "En Despacho", ayuda: "Ya producido, cargando mercancía" },
  { key: "COMPLETADA", label: "Completadas", ayuda: "Ya entregado" },
];

// Mismos colores del Excel: curvas en blanco, niples en azul, conexiones en durazno.
const INFO: Record<string, { titulo: string; fila: string; franja: string }> = {
  curvas:     { titulo: "Curvas Eléctricas", fila: "#ffffff", franja: "#e2efda" },
  niples:     { titulo: "Niples",            fila: "#bdd7ee", franja: "#9fc5e8" },
  conexiones: { titulo: "Conexiones (solo las que se compran)", fila: "#fce4d6", franja: "#f8cbad" },
};

const VERDE = "#548235";
const DURAZNO = "#f8cbad";

const num = (n: number) => (n ? Number(n).toLocaleString("es-VE", { maximumFractionDigits: 2 }) : "");

type Fila = { grupo: string; nombre: string; medida: string; porCliente: Map<string, number>; total: number };

export default function PedidosProduccion() {
  const { usuario } = useAuth();
  const [estados, setEstados] = useState<string[]>(["APROBADA"]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["pedidos-demanda", estados],
    queryFn: () => pedidosApi.demanda(estados),
    enabled: estados.length > 0,
  });

  // Cruce productos × clientes
  const { clientes, porGrupo } = useMemo(() => {
    const cli = new Set<string>();
    const porGrupo: { grupo: string; filas: Fila[] }[] = [];
    for (const g of (data?.puedeVer ?? []) as string[]) {
      const filas: Fila[] = [];
      for (const it of (data.grupos[g].items ?? []) as Item[]) {
        const m = new Map<string, number>();
        for (const p of it.pedidos) {
          m.set(p.cliente, (m.get(p.cliente) ?? 0) + p.cantidad);
          cli.add(p.cliente);
        }
        filas.push({ grupo: g, nombre: it.nombre, medida: it.medida, porCliente: m, total: it.cantidad });
      }
      porGrupo.push({ grupo: g, filas });
    }
    return { clientes: [...cli].sort((a, b) => a.localeCompare(b, "es")), porGrupo };
  }, [data]);

  const toggleEstado = (k: string) =>
    setEstados((e) => (e.includes(k) ? e.filter((x) => x !== k) : [...e, k]));

  const hayDatos = porGrupo.some((g) => g.filas.length > 0);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <Boxes size={22} color="#1e293b" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b" }}>Pedidos de Producción</h1>
      </div>
      <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748b" }}>
        {usuario?.rol === "VENDEDOR"
          ? "Cuántas curvas hay pedidas y qué cliente las está pidiendo."
          : "Cuánto hay pedido de curvas, niples y conexiones, y qué cliente lo pide."}
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Contar pedidos:</span>
        {ESTADOS.map((e) => {
          const on = estados.includes(e.key);
          return (
            <button key={e.key} onClick={() => toggleEstado(e.key)} title={e.ayuda}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
                border: on ? `1px solid ${VERDE}` : "1px solid #d1d5db",
                background: on ? VERDE : "#fff", color: on ? "#fff" : "#64748b",
              }}>
              {e.label}
            </button>
          );
        })}
      </div>

      {estados.length === 0 && <Aviso texto="Selecciona al menos un estado para contar." />}
      {isLoading && <Aviso texto="Cargando..." />}
      {error && <Aviso texto="No tienes permiso para ver esta pantalla." color="#dc2626" />}

      {data && !hayDatos && (
        <Aviso texto={
          estados.length === 1 && estados[0] === "APROBADA"
            ? "No hay nada en fabricación en este momento: ningún pedido está en estado Aprobada. En cuanto apruebes un pedido, aquí verás qué hay que producir."
            : `No hay curvas, niples ni conexiones en: ${estados.map((e) => ESTADOS.find((x) => x.key === e)?.label).join(", ")}.`
        } />
      )}

      {data && hayDatos && (
        <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, overflowX: "auto", background: "#fff" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 13, minWidth: "100%" }}>
            <thead>
              <tr>
                <th style={{ ...thBase, ...pegajosa(0), zIndex: 3, background: "#fff", minWidth: 210 }} />
                <th style={{ ...thBase, ...pegajosa(210), zIndex: 3, background: "#fff", minWidth: 120 }} />
                {clientes.map((c) => (
                  <th key={c} style={{ ...thBase, background: VERDE, color: "#fff", minWidth: 96, textAlign: "center" }}>{c}</th>
                ))}
                <th style={{ ...thBase, background: VERDE, color: "#fff", minWidth: 96, textAlign: "center" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {porGrupo.map(({ grupo, filas }) => {
                if (filas.length === 0) return null;
                const info = INFO[grupo];
                const subt = (c: string) => filas.reduce((s, f) => s + (f.porCliente.get(c) ?? 0), 0);
                const totGrupo = filas.reduce((s, f) => s + f.total, 0);
                return (
                  <Fragment key={grupo}>
                    <tr>
                      <td colSpan={2 + clientes.length + 1}
                        style={{ background: info.franja, padding: "5px 10px", fontWeight: 700, fontSize: 11, color: "#1e293b", letterSpacing: 0.4, textTransform: "uppercase", borderTop: "1px solid #cbd5e1" }}>
                        {info.titulo}
                      </td>
                    </tr>
                    {filas.map((f, i) => (
                      <tr key={`${grupo}-${i}`}>
                        <td style={{ ...tdBase, ...pegajosa(0), background: info.fila, fontWeight: 700, color: "#1e293b" }}>{f.nombre}</td>
                        <td style={{ ...tdBase, ...pegajosa(210), background: info.fila, fontWeight: 700, color: "#1e293b" }}>{f.medida}</td>
                        {clientes.map((c) => (
                          <td key={c} style={{ ...tdBase, background: info.fila, textAlign: "center", color: "#334155" }}>
                            {num(f.porCliente.get(c) ?? 0)}
                          </td>
                        ))}
                        <td style={{ ...tdBase, background: DURAZNO, textAlign: "center", fontWeight: 700, color: "#1e293b" }}>{num(f.total)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ ...tdBase, ...pegajosa(0), background: info.franja, fontWeight: 700, fontSize: 12 }}>Total {info.titulo.split(" ")[0]}</td>
                      <td style={{ ...tdBase, ...pegajosa(210), background: info.franja }} />
                      {clientes.map((c) => (
                        <td key={c} style={{ ...tdBase, background: info.franja, textAlign: "center", fontWeight: 700 }}>{num(subt(c))}</td>
                      ))}
                      <td style={{ ...tdBase, background: DURAZNO, textAlign: "center", fontWeight: 800 }}>{num(totGrupo)}</td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const thBase: React.CSSProperties = {
  padding: "7px 10px", fontWeight: 700, fontSize: 12, border: "1px solid #cbd5e1",
  position: "sticky", top: 0, zIndex: 2, whiteSpace: "nowrap",
};
const tdBase: React.CSSProperties = { padding: "5px 10px", border: "1px solid #cbd5e1", whiteSpace: "nowrap" };
const pegajosa = (left: number): React.CSSProperties => ({ position: "sticky", left, zIndex: 1 });

function Aviso({ texto, color = "#64748b" }: { texto: string; color?: string }) {
  return (
    <div style={{ padding: 18, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, fontSize: 13, color, textAlign: "center" }}>
      {texto}
    </div>
  );
}
