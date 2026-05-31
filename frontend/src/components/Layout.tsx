import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Users, Package, FileText, Truck, Receipt, Banknote,
  BarChart3, Settings, ChevronLeft, ChevronRight, DollarSign
} from "lucide-react";

const nav = [
  { path: "/clientes", label: "Clientes", icon: Users },
  { path: "/catalogo", label: "Catálogo", icon: Package },
  { path: "/precios", label: "Listas de Precios", icon: DollarSign },
  { path: "/cotizaciones", label: "Cotizaciones", icon: FileText },
  { path: "/despachos", label: "Despachos", icon: Truck },
  { path: "/facturas", label: "Facturas", icon: Receipt },
  { path: "/pagos", label: "Pagos", icon: Banknote },
  { path: "/reportes", label: "Reportes", icon: BarChart3 },
  { path: "/configuracion", label: "Configuración", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 60 : 220,
        background: "#1a2332",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s",
        overflow: "hidden",
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          padding: "16px 12px",
          borderBottom: "1px solid #2d3f55",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}>
          <div style={{
            width: 36, height: 36, background: "#2563eb",
            borderRadius: 8, display: "flex", alignItems: "center",
            justifyContent: "center", fontSize: 18, flexShrink: 0,
          }}>E</div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>ECOPLAST</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Sistema de Gestión</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {nav.map(({ path, label, icon: Icon }) => {
            const active = location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  color: active ? "#60a5fa" : "#94a3b8",
                  background: active ? "#2d3f55" : "transparent",
                  textDecoration: "none",
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            padding: "12px 16px",
            background: "none",
            border: "none",
            color: "#94a3b8",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            borderTop: "1px solid #2d3f55",
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} />Contraer</>}
        </button>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflow: "auto", background: "#f8fafc" }}>
        {children}
      </main>
    </div>
  );
}
