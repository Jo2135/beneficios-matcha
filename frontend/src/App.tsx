import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Catalogo from "./pages/Catalogo";
import ListasPrecios from "./pages/ListasPrecios";
import Cotizaciones from "./pages/Cotizaciones";
import NuevaCotizacion from "./pages/NuevaCotizacion";
import Despachos from "./pages/Despachos";
import Pagos from "./pages/Pagos";
import Facturas from "./pages/Facturas";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/catalogo" element={<Catalogo />} />
            <Route path="/precios" element={<ListasPrecios />} />
            <Route path="/cotizaciones" element={<Cotizaciones />} />
            <Route path="/cotizaciones/nueva" element={<NuevaCotizacion />} />
            <Route path="/pagos" element={<Pagos />} />
            <Route path="/despachos" element={<Despachos />} />
            <Route path="/facturas" element={<Facturas />} />
            <Route path="/reportes" element={<Placeholder titulo="Reportes" desc="Balance de pagos, distribución de ganancias" />} />
            <Route path="/configuracion" element={<Placeholder titulo="Configuración" desc="Usuarios, factores de costo, porcentajes de ganancias" />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </QueryClientProvider>
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
