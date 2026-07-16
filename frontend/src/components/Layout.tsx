import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Users, Package, FileText, Truck, Receipt, Banknote,
  BarChart3, Settings, ChevronLeft, ChevronRight, DollarSign,
  UserCog, LogOut, Shield, Briefcase, Factory, Calendar, ShoppingCart, SlidersHorizontal, LayoutGrid, Wallet, LayoutDashboard, Boxes,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const ROL_BADGE = {
  MASTER:   { label: "Master",   color: "#a78bfa", icon: Shield },
  ADMIN:    { label: "Admin",    color: "#60a5fa", icon: Briefcase },
  VENDEDOR: { label: "Vendedor", color: "#34d399", icon: Users },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { usuario, logout, esMaster, puedeEditar } = useAuth();

  const nav = [
    { path: "/dashboard",   label: "Panel Principal",   icon: LayoutDashboard, roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/clientes",    label: "Clientes",          icon: Users,     roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/catalogo",    label: "Catálogo",           icon: Package,   roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/precios",     label: "Listas de Precios",  icon: DollarSign,roles: ["MASTER","ADMIN"] },
    { path: "/cotizaciones",label: "Cotizaciones",        icon: FileText,  roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/calendario",  label: "Calendario",          icon: Calendar,  roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/despachos",        label: "Despachos",         icon: Truck,    roles: ["MASTER","ADMIN"] },
    { path: "/planificador-carga", label: "Planificador Carga", icon: LayoutGrid, roles: ["MASTER","ADMIN"] },
    { path: "/orden-produccion", label: "Orden Producción",  icon: Factory,  roles: ["MASTER","ADMIN"] },
    { path: "/pedidos-produccion", label: "Pedidos Producción", icon: Boxes, roles: ["MASTER","ADMIN","VENDEDOR"], soloSiVeCurvas: true },
    { path: "/facturas",    label: "Facturas",            icon: Receipt,   roles: ["MASTER","ADMIN"] },
    { path: "/facturacion-externa", label: "Facturación Externa", icon: ShoppingCart, roles: ["MASTER","ADMIN"] },
    { path: "/pagos",       label: "Pagos",               icon: Banknote,  roles: ["MASTER","ADMIN"] },
    { path: "/pagos-vendedores", label: "Pagos Vendedores", icon: Wallet,  roles: ["MASTER","ADMIN","VENDEDOR"] },
    { path: "/reportes",    label: "Reportes",            icon: BarChart3, roles: ["MASTER","ADMIN"] },
    { path: "/estadisticas",label: "Estadísticas",        icon: BarChart3, roles: ["MASTER","ADMIN"] },
    { path: "/usuarios",    label: "Usuarios",            icon: UserCog,   roles: ["MASTER","ADMIN"] },
    { path: "/vendedores",  label: "Vendedores",          icon: Users,     roles: ["MASTER","ADMIN"] },
    { path: "/tablas-ganancias", label: "Tablas de Ganancias", icon: SlidersHorizontal, roles: ["MASTER"] },
    { path: "/configuracion",label: "Configuración",     icon: Settings,  roles: ["MASTER"] },
  ].filter((item) => {
    if (!usuario) return true;
    if (!item.roles.includes(usuario.rol)) return false;
    // Un vendedor solo ve Pedidos Producción si le marcaron la casilla en Usuarios.
    if ((item as any).soloSiVeCurvas && usuario.rol === "VENDEDOR" && !usuario.puedeVerCurvas) return false;
    return true;
  });

  const rolInfo = usuario ? ROL_BADGE[usuario.rol] : null;
  const RolIcon = rolInfo?.icon ?? Shield;

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
        {/* Logo (clic → Panel Principal) */}
        <Link to="/dashboard" title="Ir al Panel Principal" style={{ padding: "16px 12px", borderBottom: "1px solid #2d3f55", display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
          <div style={{ width: 36, height: 36, background: "#2563eb", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0, fontWeight: 700 }}>
            E
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>ECOPLAST</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>Sistema de Gestión</div>
            </div>
          )}
        </Link>

        {/* Nav items */}
        <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
          {nav.map(({ path, label, icon: Icon }) => {
            const active = location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                title={collapsed ? label : undefined}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 16px",
                  color: active ? "#60a5fa" : "#94a3b8",
                  background: active ? "#2d3f55" : "transparent",
                  textDecoration: "none", fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  borderLeft: active ? "3px solid #3b82f6" : "3px solid transparent",
                  transition: "all 0.15s", whiteSpace: "nowrap",
                }}
              >
                <Icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        {/* Usuario actual */}
        {usuario && (
          <div style={{ borderTop: "1px solid #2d3f55", padding: "10px 12px" }}>
            {!collapsed && (
              <div style={{ marginBottom: 8, padding: "8px 10px", background: "#2d3f55", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 2 }}>{usuario.nombre}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <RolIcon size={10} style={{ color: rolInfo?.color }} />
                  <span style={{ fontSize: 11, color: rolInfo?.color }}>{rolInfo?.label}</span>
                </div>
              </div>
            )}
            <button
              onClick={logout}
              title="Cerrar sesión"
              style={{
                width: "100%", padding: collapsed ? "8px" : "8px 12px",
                background: "none", border: "none", color: "#94a3b8",
                cursor: "pointer", display: "flex", alignItems: "center",
                gap: 8, fontSize: 13, borderRadius: 6,
              }}
            >
              <LogOut size={16} style={{ flexShrink: 0 }} />
              {!collapsed && "Cerrar sesión"}
            </button>
          </div>
        )}

        {/* Toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ padding: "12px 16px", background: "none", border: "none", color: "#94a3b8", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, borderTop: "1px solid #2d3f55" }}
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
