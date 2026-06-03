import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { cotizacionesApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { Factory, ChevronLeft, ChevronRight, FileDown, X, RotateCcw } from "lucide-react";
import { pdfOrdenDespachos } from "../utils/pdf";

// Product family priority order (name-based pattern matching)
const FAMILIAS = [
  { patron: /manguera.*(riego|agr|3\/4|1[\s-]3)/i, prio: 1, label: "Manguera Riego" },
  { patron: /tubo azul agua blanca/i, prio: 2, label: "Tubo Azul Agua Blanca" },
  { patron: /tubo gris pead/i, prio: 3, label: "Tubo Gris PEAD" },
  { patron: /tubo el[eé]ctrico negro|tubería agua negra gris/i, prio: 4, label: "Tubo Negro" },
  { patron: /tubo el[eé]ctrico blanco/i, prio: 5, label: "Tubo Eléctrico Blanco" },
  { patron: /tuber[ií]a agua negra amarilla|pead.*amarill/i, prio: 6, label: "Tubería Amarilla PEAD" },
  { patron: /tubo naranja pvc|tubo amarillo pvc/i, prio: 7, label: "Tubo PVC Amarillo/Naranja" },
  { patron: /tubo gris agua blanca pvc/i, prio: 8, label: "Tubo Gris Agua Blanca PVC" },
  { patron: /manguera verde|manguera gas/i, prio: 9, label: "Manguera Verde/Gas" },
  { patron: /curva el[eé]ctrica/i, prio: 10, label: "Curva Eléctrica" },
  { patron: /niple azul/i, prio: 11, label: "Niple Azul" },
  { patron: /codo pvc/i, prio: 12, label: "Codo PVC (fabricado)" },
];

function familiaProd(nombre: string): { prio: number; label: string } {
  for (const f of FAMILIAS) {
    if (f.patron.test(nombre)) return f;
  }
  return { prio: 99, label: "Otros" };
}

function medidaOrdinal(m: string): number {
  if (!m) return 9999;
  // Handle mixed fractions like "1½" or "1 1/2"
  const mixed = m.match(/^(\d+)\s*[½⅓⅔¼¾]|^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) {
    const whole = Number(mixed[1] ?? mixed[2]);
    return whole + 0.5;
  }
  // Handle plain fractions like "1/2", "3/4"
  const frac = m.match(/^(\d+)\/(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  // Handle decimal/integer
  const num = parseFloat(m);
  return isNaN(num) ? 9999 : num;
}

function esConexionExterna(p: any): boolean {
  const origen = (p?.origen ?? "INTERNO").toUpperCase();
  const nombre = (p?.nombre ?? "").toLowerCase();
  return origen === "EXTERNO" && !nombre.includes("manguera");
}

type RowItem =
  | { type: "header"; label: string }
  | { type: "product"; p: any };

export default function OrdenDespachos() {
  const { puedeEditar } = useAuth();
  const [orden, setOrden] = useState<number[]>([]);

  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ["orden-produccion"],
    queryFn: cotizacionesApi.ordenProduccion,
  });

  useEffect(() => {
    if ((cotizaciones as any[]).length > 0 && orden.length === 0) {
      setOrden((cotizaciones as any[]).map((c: any) => c.id));
    }
  }, [cotizaciones]);

  const cotOrdenadas = useMemo(() => {
    if (orden.length === 0) return cotizaciones as any[];
    return orden
      .map((id) => (cotizaciones as any[]).find((c: any) => c.id === id))
      .filter(Boolean) as any[];
  }, [cotizaciones, orden]);

  // Collect unique NON-connection products, sorted by family priority then medida
  const productos = useMemo(() => {
    const map = new Map<number, any>();
    for (const cot of cotOrdenadas) {
      for (const l of cot.lineas ?? []) {
        if (!map.has(l.productoId)) {
          const prod = {
            id: l.productoId,
            nombre: l.producto?.nombre ?? "—",
            medida: l.producto?.medida ?? "—",
            origen: l.producto?.origen ?? "INTERNO",
            categoria: l.producto?.categoria?.nombre ?? "",
          };
          if (!esConexionExterna(prod)) {
            map.set(l.productoId, prod);
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const fa = familiaProd(a.nombre);
      const fb = familiaProd(b.nombre);
      if (fa.prio !== fb.prio) return fa.prio - fb.prio;
      const ma = medidaOrdinal(a.medida);
      const mb = medidaOrdinal(b.medida);
      return ma - mb;
    });
  }, [cotOrdenadas]);

  // Flat list with group header rows intercalated
  const filas = useMemo((): RowItem[] => {
    const result: RowItem[] = [];
    let lastLabel = "";
    for (const p of productos) {
      const { label } = familiaProd(p.nombre);
      if (label !== lastLabel) {
        result.push({ type: "header", label });
        lastLabel = label;
      }
      result.push({ type: "product", p });
    }
    return result;
  }, [productos]);

  // Build quantity lookup: productId → cotId → quantity
  const lookup = useMemo(() => {
    const m = new Map<number, Map<number, number>>();
    for (const cot of cotOrdenadas) {
      for (const l of cot.lineas ?? []) {
        if (!m.has(l.productoId)) m.set(l.productoId, new Map());
        m.get(l.productoId)!.set(cot.id, Number(l.cantidad));
      }
    }
    return m;
  }, [cotOrdenadas]);

  const moverColumna = (idx: number, dir: -1 | 1) => {
    const newOrden = [...orden];
    const target = idx + dir;
    if (target < 0 || target >= newOrden.length) return;
    [newOrden[idx], newOrden[target]] = [newOrden[target], newOrden[idx]];
    setOrden(newOrden);
  };

  const eliminarColumna = (cotId: number) => {
    setOrden((prev) => prev.filter((id) => id !== cotId));
  };

  const restaurarTodo = () => {
    setOrden((cotizaciones as any[]).map((c: any) => c.id));
  };

  const eliminadas = (cotizaciones as any[]).length - orden.length;

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>
        Cargando orden de producción...
      </div>
    );
  }

  const colCount = cotOrdenadas.length + 3; // Producto + Medida + cots + TOTAL

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
            <Factory size={22} color="#16a34a" /> Orden de Producción
          </h1>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
            {cotOrdenadas.length} cotizaciones aprobadas · {productos.length} productos a producir
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {eliminadas > 0 && (
            <button onClick={restaurarTodo} style={btnSecondary} title="Volver a mostrar todas las cotizaciones">
              <RotateCcw size={15} /> Restaurar ({eliminadas})
            </button>
          )}
          <button
            onClick={() => pdfOrdenDespachos(cotizaciones as any[], orden)}
            disabled={cotOrdenadas.length === 0}
            style={{ ...btnPrimary, opacity: cotOrdenadas.length === 0 ? 0.5 : 1 }}
          >
            <FileDown size={16} /> Generar PDF
          </button>
        </div>
      </div>

      {cotOrdenadas.length === 0 ? (
        <div style={{ ...cardStyle, padding: 60, textAlign: "center", color: "#94a3b8" }}>
          <Factory size={44} style={{ display: "block", margin: "0 auto 14px", opacity: 0.25 }} />
          <div style={{ fontSize: 16, fontWeight: 600, color: "#64748b" }}>Sin cotizaciones aprobadas</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Las cotizaciones aprobadas aparecerán aquí para planificar la producción</div>
        </div>
      ) : (
        <>
          {puedeEditar && cotOrdenadas.length > 1 && (
            <div style={{ marginBottom: 12, fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 6 }}>
              <ChevronLeft size={13} /> Usa las flechas en los encabezados para ordenar la prioridad de despachos
            </div>
          )}

          <div style={{ ...cardStyle, overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", minWidth: 300 + cotOrdenadas.length * 120 }}>
              <thead>
                <tr style={{ background: "#1e293b" }}>
                  <th style={{ ...thFixed, width: 220 }}>Producto</th>
                  <th style={{ ...thFixed, width: 80, textAlign: "center" }}>Medida</th>
                  {cotOrdenadas.map((cot: any, idx: number) => (
                    <th key={cot.id} style={{ ...thDyn, minWidth: 110 }}>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 1 }}>{cot.numero}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.3 }}>
                        {cot.cliente?.nombre}
                      </div>
                      {cot.vendedor?.nombre && (
                        <div style={{ fontSize: 9, color: "#64748b", marginTop: 1 }}>{cot.vendedor.nombre}</div>
                      )}
                      {puedeEditar && (
                        <div style={{ display: "flex", gap: 3, justifyContent: "center", marginTop: 5 }}>
                          {cotOrdenadas.length > 1 && (
                            <>
                              <button
                                onClick={() => moverColumna(idx, -1)}
                                disabled={idx === 0}
                                title="Mover izquierda"
                                style={{ ...btnMover, opacity: idx === 0 ? 0.3 : 1 }}
                              >
                                <ChevronLeft size={11} />
                              </button>
                              <button
                                onClick={() => moverColumna(idx, 1)}
                                disabled={idx === cotOrdenadas.length - 1}
                                title="Mover derecha"
                                style={{ ...btnMover, opacity: idx === cotOrdenadas.length - 1 ? 0.3 : 1 }}
                              >
                                <ChevronRight size={11} />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => eliminarColumna(cot.id)}
                            title="Quitar de la vista (ya despachado)"
                            style={{ ...btnMover, background: "rgba(220,38,38,0.25)", color: "#fca5a5" }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      )}
                    </th>
                  ))}
                  <th style={{ ...thDyn, minWidth: 80, color: "#4ade80", fontWeight: 800 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((fila, i) => {
                  if (fila.type === "header") {
                    return (
                      <tr key={`h-${i}`}>
                        <td
                          colSpan={colCount}
                          style={{
                            padding: "6px 14px",
                            fontSize: 10,
                            fontWeight: 700,
                            color: "#166534",
                            background: "#f0fdf4",
                            borderTop: i === 0 ? undefined : "2px solid #86efac",
                            borderBottom: "1px solid #bbf7d0",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {fila.label}
                        </td>
                      </tr>
                    );
                  }

                  const { p } = fila;
                  const qtMap = lookup.get(p.id);
                  const total = cotOrdenadas.reduce(
                    (s: number, c: any) => s + (qtMap?.get(c.id) ?? 0),
                    0
                  );
                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        background: "#fff",
                      }}
                    >
                      <td style={{ ...tdStyle, fontWeight: 600, color: "#1e293b" }}>
                        {p.nombre}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={tagStyle}>{p.medida}</span>
                      </td>
                      {cotOrdenadas.map((cot: any) => {
                        const q = qtMap?.get(cot.id);
                        return (
                          <td
                            key={cot.id}
                            style={{
                              ...tdStyle,
                              textAlign: "center",
                              fontWeight: q ? 700 : 400,
                              color: q ? "#1e293b" : "#e2e8f0",
                              fontSize: 14,
                            }}
                          >
                            {q ?? "—"}
                          </td>
                        );
                      })}
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: "center",
                          fontWeight: 800,
                          fontSize: 15,
                          color: total > 0 ? "#16a34a" : "#e2e8f0",
                          background: total > 0 ? "#f0fdf4" : undefined,
                          borderLeft: "2px solid #dcfce7",
                        }}
                      >
                        {total > 0 ? total : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const btnSecondary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "#fff", color: "#374151",
  border: "1px solid #d1d5db",
  padding: "9px 14px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontWeight: 500,
};
const btnPrimary: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 6,
  background: "#16a34a", color: "#fff", border: "none",
  padding: "9px 16px", borderRadius: 8, cursor: "pointer",
  fontSize: 14, fontWeight: 600,
};
const btnMover: React.CSSProperties = {
  background: "rgba(255,255,255,0.12)", border: "none",
  borderRadius: 4, padding: "3px 6px", cursor: "pointer",
  color: "#e2e8f0", display: "flex", alignItems: "center",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 12,
  border: "1px solid #e2e8f0", overflow: "hidden",
};
const thBase: React.CSSProperties = {
  padding: "12px 14px", textAlign: "left",
  fontSize: 11, fontWeight: 600, color: "#94a3b8",
  textTransform: "uppercase", background: "#1e293b",
  position: "sticky", top: 0,
};
const thFixed: React.CSSProperties = { ...thBase };
const thDyn: React.CSSProperties = { ...thBase, textAlign: "center" };
const tdStyle: React.CSSProperties = {
  padding: "10px 14px", fontSize: 13, color: "#374151",
  verticalAlign: "middle",
};
const tagStyle: React.CSSProperties = {
  display: "inline-block", padding: "2px 8px",
  background: "#f1f5f9", borderRadius: 4,
  fontSize: 11, color: "#475569",
};
