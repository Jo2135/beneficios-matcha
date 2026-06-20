import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportesApi } from "../api/endpoints";
import { BarChart3 } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import ImportarFacturasExcel from "../components/ImportarFacturasExcel";

const usd = (n: any) => `$${Number(n ?? 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const mesLabel = (k: string) => { const [y, m] = k.split("-"); return `${MESES[Number(m) - 1]} ${y.slice(2)}`; };

export default function EstadisticasVentas() {
  const hoy = new Date();
  const [desde, setDesde] = useState(`${hoy.getFullYear()}-01-01`);
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));

  const { data, isLoading } = useQuery({
    queryKey: ["ventas-facturas", desde, hasta],
    queryFn: () => reportesApi.ventasFacturas({ desde, hasta }),
  });

  const d: any = data ?? {};

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
          <ImportarFacturasExcel label="Importar histórico" />
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Cargando...</div>
      ) : (d.totalFacturas ?? 0) === 0 ? (
        <div style={{ ...card, padding: 40, textAlign: "center", color: "#94a3b8" }}>
          No hay facturas en este rango. Usa <strong>Importar histórico</strong> para cargar tus despachos.
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
                  <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => usd(v)} labelFormatter={(_l, p: any) => p?.[0]?.payload?.nombre ?? ""} />
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
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any) => `${Number(v).toLocaleString("es-VE")} u`} labelFormatter={(_l, p: any) => p?.[0]?.payload?.nombre ?? ""} />
                <Bar dataKey="unidades" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

const card: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };
const cardTitle: React.CSSProperties = { margin: "0 0 12px", fontSize: 14, fontWeight: 700, color: "#1e293b" };
const inputSt: React.CSSProperties = { padding: "7px 10px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 13, outline: "none" };
