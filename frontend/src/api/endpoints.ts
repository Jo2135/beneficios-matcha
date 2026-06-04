import { api } from "./client";

// Auth / Vendedores
export const authApi = {
  listarVendedores: () => api.get("/auth/vendedores").then((r) => r.data),
  actualizarComision: (id: number, comisionPct: number) =>
    api.patch(`/auth/usuarios/${id}/comision`, { comisionPct }).then((r) => r.data),
  vincularVendedor: (id: number) =>
    api.post(`/auth/usuarios/${id}/vincular-vendedor`).then((r) => r.data),
};

// Clientes
export const clientesApi = {
  listar: () => api.get("/clientes").then((r) => r.data),
  buscar: (q: string) => api.get(`/clientes/buscar?q=${q}`).then((r) => r.data),
  obtener: (id: number) => api.get(`/clientes/${id}`).then((r) => r.data),
  crear: (data: any) => api.post("/clientes", data).then((r) => r.data),
  actualizar: (id: number, data: any) => api.put(`/clientes/${id}`, data).then((r) => r.data),
};

// Productos
export const productosApi = {
  listar: (params?: { categoria?: number; origen?: string }) =>
    api.get("/productos", { params }).then((r) => r.data),
  buscar: (q: string) => api.get(`/productos/buscar?q=${q}`).then((r) => r.data),
  crear: (data: any) => api.post("/productos", data).then((r) => r.data),
  actualizar: (id: number, data: any) => api.put(`/productos/${id}`, data).then((r) => r.data),
  subirImagen: (id: number, file: File) => {
    const form = new FormData();
    form.append("imagen", file);
    return api.post(`/productos/${id}/imagen`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data);
  },
  eliminarImagen: (id: number) => api.delete(`/productos/${id}/imagen`).then((r) => r.data),
};

// Categorías
export const categoriasApi = {
  listar: () => api.get("/categorias").then((r) => r.data),
};

// Listas de precios
export const listasApi = {
  listar: () => api.get("/listas-precios").then((r) => r.data),
  obtener: (id: number) => api.get(`/listas-precios/${id}`).then((r) => r.data),
  crear: (data: any) => api.post("/listas-precios", data).then((r) => r.data),
  actualizarDetalle: (id: number, lineas: any[]) =>
    api.put(`/listas-precios/${id}/detalle`, lineas).then((r) => r.data),
  importarPrecios: (id: number, lineas: { nombre: string; medida: string; precio: number }[]) =>
    api.post(`/listas-precios/${id}/importar`, lineas).then((r) => r.data),
  precioParaCliente: (clienteId: number, productoId: number) =>
    api.get(`/listas-precios/precio/${clienteId}/${productoId}`).then((r) => r.data),
};

// Cotizaciones
export const cotizacionesApi = {
  listar: (params?: any) => api.get("/cotizaciones", { params }).then((r) => r.data),
  obtener: (id: number) => api.get(`/cotizaciones/${id}`).then((r) => r.data),
  crear: (data: any) => api.post("/cotizaciones", data).then((r) => r.data),
  actualizar: (id: number, data: any) => api.put(`/cotizaciones/${id}`, data).then((r) => r.data),
  cambiarEstado: (id: number, estado: string) =>
    api.patch(`/cotizaciones/${id}/estado`, { estado }).then((r) => r.data),
  generarFactura: (id: number) =>
    api.post(`/cotizaciones/${id}/generar-factura`).then((r) => r.data),
  ordenProduccion: () => api.get("/cotizaciones/orden-produccion").then((r) => r.data),
  reporteComisiones: (mes?: string) =>
    api.get("/cotizaciones/reporte-comisiones", { params: mes ? { mes } : {} }).then((r) => r.data),
  eliminar: (id: number) => api.delete(`/cotizaciones/${id}`).then((r) => r.data),
  duplicar: (id: number) => api.post(`/cotizaciones/${id}/duplicar`).then((r) => r.data),
};

// Facturas
export const facturasApi = {
  listar: (params?: any) => api.get("/facturas", { params }).then((r) => r.data),
  obtener: (id: number) => api.get(`/facturas/${id}`).then((r) => r.data),
  balance: () => api.get("/facturas/balance").then((r) => r.data),
  resumenCliente: (clienteId: number) =>
    api.get(`/facturas/cliente/${clienteId}/resumen`).then((r) => r.data),
  actualizarNotas: (id: number, notas: string) =>
    api.patch(`/facturas/${id}/notas`, { notas }).then((r) => r.data),
  crearManual: (data: any) => api.post("/facturas/manual", data).then((r) => r.data),
  eliminar: (id: number) => api.delete(`/facturas/${id}`).then((r) => r.data),
  listarConPagos: (clienteId: number) =>
    api.get(`/facturas/cliente/${clienteId}/con-pagos`).then((r) => r.data),
};

// Empresas
export const empresasApi = {
  listar: () => api.get("/empresas").then((r) => r.data),
  crear: (data: { nombre: string; rif: string }) => api.post("/empresas", data).then((r) => r.data),
  actualizar: (id: number, data: { nombre: string; rif: string }) => api.put(`/empresas/${id}`, data).then((r) => r.data),
  toggleActiva: (id: number, activa: boolean) => api.patch(`/empresas/${id}/activa`, { activa }).then((r) => r.data),
};

// Tasa de Cambio
export const tasaCambioApi = {
  listar: () => api.get("/tasa-cambio").then((r) => r.data),
  vigente: () => api.get("/tasa-cambio/vigente").then((r) => r.data),
  upsertHoy: (data: { bsUSDT: number; copUSDT?: number; notas?: string }) =>
    api.post("/tasa-cambio", data).then((r) => r.data),
  eliminar: (id: number) => api.delete(`/tasa-cambio/${id}`).then((r) => r.data),
};

// Seguimiento de Cotizaciones
export const seguimientoApi = {
  listar: (cotizacionId: number) =>
    api.get(`/cotizaciones/${cotizacionId}/seguimiento`).then((r) => r.data),
  crear: (cotizacionId: number, data: { tipo: string; nota: string; fechaProxSeguimiento?: string }) =>
    api.post(`/cotizaciones/${cotizacionId}/seguimiento`, data).then((r) => r.data),
  eliminar: (id: number) => api.delete(`/seguimiento/${id}`).then((r) => r.data),
  pendientes: () => api.get("/seguimiento/pendientes").then((r) => r.data),
};

// Despachos
export const despachosApi = {
  listar: (params?: any) => api.get("/despachos", { params }).then((r) => r.data),
  obtener: (id: number) => api.get(`/despachos/${id}`).then((r) => r.data),
  crearDesdeCotizacion: (cotizacionId: number, data: any) =>
    api.post(`/despachos/desde-cotizacion/${cotizacionId}`, data).then((r) => r.data),
  actualizarLineas: (id: number, lineas: any[]) =>
    api.put(`/despachos/${id}/lineas`, lineas).then((r) => r.data),
  finalizar: (id: number) => api.post(`/despachos/${id}/finalizar`).then((r) => r.data),
  eliminar: (id: number) => api.delete(`/despachos/${id}`).then((r) => r.data),
};

// Pagos
export const pagosApi = {
  listar: (params?: any) => api.get("/pagos", { params }).then((r) => r.data),
  pendientes: () => api.get("/pagos/pendientes").then((r) => r.data),
  registrar: (data: any) => api.post("/pagos", data).then((r) => r.data),
  asignar: (id: number, asignaciones: any[]) =>
    api.post(`/pagos/${id}/asignar`, asignaciones).then((r) => r.data),
};

// Reportes
export const reportesApi = {
  ventasProducto: (params: { q?: string; desde?: string; hasta?: string }) =>
    api.get("/reportes/ventas-producto", { params }).then((r) => r.data),
  estadoCuenta: (clienteId: number, params: { desde?: string; hasta?: string }) =>
    api.get(`/reportes/estado-cuenta/${clienteId}`, { params }).then((r) => r.data),
  cuentasCobrar: (params?: { producto?: string }) =>
    api.get("/reportes/cuentas-cobrar", { params }).then((r) => r.data),
};

// Cuentas bancarias
export const cuentasApi = {
  listar: () => api.get("/cuentas").then((r) => r.data),
  listarTodas: () => api.get("/cuentas/todas").then((r) => r.data),
  crear: (data: any) => api.post("/cuentas", data).then((r) => r.data),
  actualizar: (id: number, data: any) => api.put(`/cuentas/${id}`, data).then((r) => r.data),
  seedIniciales: () => api.post("/cuentas/seed").then((r) => r.data),
  seedProductos: () => api.post("/seed-productos").then((r) => r.data),
};
