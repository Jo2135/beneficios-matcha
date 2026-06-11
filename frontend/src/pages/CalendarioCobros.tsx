import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { facturasApi } from "../api/endpoints";
import { useAuth } from "../contexts/AuthContext";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

function usd(n: any) {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2 })}`;
}

export default function CalendarioCobros() {
  const { usuario, esVendedor } = useAuth();
  const [mes, setMes] = useState(() => {
    const hoy = new Date();
    return { year: hoy.getFullYear(), month: hoy.getMonth() };
  });

  const { data: balance } = useQuery({
    queryKey: ["facturas-balance"],
    queryFn: facturasApi.balance,
    enabled: !esVendedor,
  });

  const todasFacturas: any[] = balance?.facturas ?? [];

  const facturasPendientes = useMemo(() => {
    return todasFacturas.filter((f: any) => {
      if (Number(f.saldoPendiente) <= 0) return false;
      if (esVendedor && usuario?.vendedorId) {
        return f.cliente?.vendedorId === usuario.vendedorId;
      }
      return true;
    });
  }, [todasFacturas, esVendedor, usuario]);

  // Map each factura to a due date
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const f of facturasPendientes) {
      const base = new Date(f.fechaEmision ?? f.creadoEn);
      const diasCredito = f.cliente?.diasCredito ?? 0;
      const vence = new Date(base);
      vence.setDate(vence.getDate() + diasCredito);
      const key = `${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, "0")}-${String(vence.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [facturasPendientes]);

  const mesNombre = new Date(mes.year, mes.month, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });
  const primerDia = new Date(mes.year, mes.month, 1).getDay(); // 0=Sun
  const diasEnMes = new Date(mes.year, mes.month + 1, 0).getDate();
  const hoy = new Date();
  const hoyKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  const prevMes = () => setMes((m) => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
  const nextMes = () => setMes((m) => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

  const totalPendiente = facturasPendientes.reduce((s: number, f: any) => s + Number(f.saldoPendiente), 0);
  const vencidasHoy = facturasPendientes.filter((f: any) => {
    const base = new Date(f.fechaEmision ?? f.creadoEn);
    const dias = f.cliente?.diasCredito ?? 0;
    const vence = new Date(base); vence.setDate(vence.getDate() + dias);
    return vence < hoy;
  });

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 10 }}>
          <Calendar size={22} /> Calendario de Cobros
        </h1>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>
          Vencimientos de facturas pendientes · {facturasPendientes.length} facturas · {usd(totalPendiente)} total
        </p>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        <div style={cardSt}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" }}>Facturas Pendientes</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#1e293b" }}>{facturasPendientes.length}</div>
        </div>
        <div style={{ ...cardSt, borderLeft: "4px solid #dc2626" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#dc2626", textTransform: "uppercase" }}>Vencidas</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#dc2626" }}>{vencidasHoy.length}</div>
        </div>
        <div style={{ ...cardSt, borderLeft: "4px solid #d97706" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#d97706", textTransform: "uppercase" }}>Saldo Total</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: "#d97706" }}>{usd(totalPendiente)}</div>
        </div>
      </div>

      {/* Calendar navigation */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <button onClick={prevMes} style={navBtn}><ChevronLeft size={16} /></button>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", textTransform: "capitalize" }}>{mesNombre}</span>
          <button onClick={nextMes} style={navBtn}><ChevronRight size={16} /></button>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid #f1f5f9" }}>
          {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
            <div key={d} style={{ padding: "8px 4px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "#64748b" }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {/* Empty cells before first day */}
          {Array.from({ length: primerDia }).map((_, i) => (
            <div key={`e${i}`} style={{ minHeight: 90, borderBottom: "1px solid #f8fafc", borderRight: "1px solid #f8fafc", background: "#fafafa" }} />
          ))}

          {Array.from({ length: diasEnMes }).map((_, i) => {
            const dia = i + 1;
            const key = `${mes.year}-${String(mes.month + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
            const eventos = eventosPorDia.get(key) ?? [];
            const esHoy = key === hoyKey;
            const esPasado = new Date(mes.year, mes.month, dia) < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

            return (
              <div
                key={dia}
                style={{
                  minHeight: 90,
                  borderBottom: "1px solid #f1f5f9",
                  borderRight: "1px solid #f1f5f9",
                  padding: "6px 4px",
                  background: esHoy ? "#eff6ff" : "white",
                }}
              >
                <div style={{
                  fontSize: 12, fontWeight: 700, marginBottom: 4,
                  width: 22, height: 22, borderRadius: "50%",
                  background: esHoy ? "#2563eb" : "transparent",
                  color: esHoy ? "#fff" : "#374151",
                  display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "auto",
                } as React.CSSProperties}>{dia}</div>

                {eventos.map((f: any) => {
                  const bg = esPasado ? "#fee2e2" : "#dcfce7";
                  const col = esPasado ? "#dc2626" : "#16a34a";
                  return (
                    <div key={f.id} style={{ background: bg, borderRadius: 4, padding: "2px 4px", marginBottom: 2, fontSize: 10 }}>
                      <div style={{ fontWeight: 700, color: col, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.numero}</div>
                      <div style={{ color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.cliente?.nombre}</div>
                      <div style={{ fontWeight: 600, color: col }}>{usd(f.saldoPendiente)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const cardSt: React.CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", borderLeft: "4px solid #e2e8f0" };
const navBtn: React.CSSProperties = { background: "#f1f5f9", border: "none", borderRadius: 7, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center" };
