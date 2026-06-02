import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Catalogo from "./pages/Catalogo";
import ListasPrecios from "./pages/ListasPrecios";
import Cotizaciones from "./pages/Cotizaciones";
import NuevaCotizacion from "./pages/NuevaCotizacion";
import Despachos from "./pages/Despachos";
import Pagos from "./pages/Pagos";
import Facturas from "./pages/Facturas";
import Usuarios from "./pages/Usuarios";
import OrdenDespachos from "./pages/OrdenDespachos";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

function AppRoutes() {
  const { usuario, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#1a2332", fontFamily: "'Segoe UI', sans-serif" }}>
        <div style={{ textAlign: "center", color: "#94a3b8" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>E</div>
          <div style={{ fontSize: 14 }}>Cargando sistema...</div>
        </div>
      </div>
    );
  }

  if (!usuario) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const { rol } = usuario;
  const esMaster = rol === "MASTER";
  const puedeEditar = rol === "MASTER" || rol === "ADMIN";

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/clientes" element={<Clientes />} />
        <Route path="/catalogo" element={<Catalogo />} />

        {/* Solo MASTER y ADMIN */}
        {puedeEditar && <Route path="/precios" element={<ListasPrecios />} />}
        {puedeEditar && <Route path="/despachos" element={<Despachos />} />}
        {puedeEditar && <Route path="/orden-produccion" element={<OrdenDespachos />} />}
        {puedeEditar && <Route path="/facturas" element={<Facturas />} />}
        {puedeEditar && <Route path="/pagos" element={<Pagos />} />}
        {puedeEditar && <Route path="/reportes" element={<Placeholder titulo="Reportes" desc="Balance de pagos, ventas por período, cobranzas por cliente y método de pago" />} />}
        {puedeEditar && <Route path="/usuarios" element={<Usuarios />} />}

        {/* Solo MASTER */}
        {esMaster && <Route path="/configuracion" element={<Placeholder titulo="Configuración" desc="Empresas, cuentas bancarias, porcentajes de costos y ganancias" />} />}

        {/* Cotizaciones para todos */}
        <Route path="/cotizaciones" element={<Cotizaciones />} />
        <Route path="/cotizaciones/nueva" element={<NuevaCotizacion />} />

        {/* Redirigir rutas no permitidas */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

function Placeholder({ titulo, desc }: { titulo: string; desc: string }) {
  return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🚧</div>
      <h2 style={{ margin: "0 0 8px", color: "#1e293b", fontSize: 22 }}>{titulo}</h2>
      <p style={{ color: "#64748b", maxWidth: 400, margin: "0 auto" }}>{desc} — Próxima fase de desarrollo</p>
    </div>
  );
}
