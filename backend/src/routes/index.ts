import { Router, Request, Response, NextFunction } from "express";
import * as clientes from "../controllers/clientes.controller";
import * as productos from "../controllers/productos.controller";
import * as listaPrecios from "../controllers/listaPrecios.controller";
import * as cotizaciones from "../controllers/cotizaciones.controller";
import * as facturas from "../controllers/facturas.controller";
import * as devoluciones from "../controllers/devoluciones.controller";
import * as controlDespachos from "../controllers/controlDespachos.controller";
import * as pagos from "../controllers/pagos.controller";
import * as pagosVendedor from "../controllers/pagosVendedor.controller";
import * as despachos from "../controllers/despachos.controller";
import * as auth from "../controllers/auth.controller";
import * as cuentas from "../controllers/cuentas.controller";
import * as reportes from "../controllers/reportes.controller";
import * as empresas from "../controllers/empresas.controller";
import * as tasaCambio from "../controllers/tasaCambio.controller";
import * as seguimiento from "../controllers/seguimiento.controller";
import * as ganancias from "../controllers/ganancias.controller";
import * as balance from "../controllers/balance.controller";
import * as tablas from "../controllers/tablas.controller";
import * as comprasExternas from "../controllers/comprasExternas.controller";
import * as planCarga from "../controllers/planCarga.controller";
import * as pedidos from "../controllers/pedidos.controller";
import * as conceptosExtra from "../controllers/conceptosExtra.controller";
import { uploadMiddleware, subirImagen, eliminarImagen } from "../controllers/imagenes.controller";
import { requireAuth, requireRol } from "../middleware/auth";
import { seedRouter } from "./seed.routes";
import { seedProductosRouter } from "./seed-productos.routes";
import { categoriasRouter } from "./categorias.routes";

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<any>;
function w(fn: AsyncFn) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

const router = Router();

// ─── AUTH (público) ───────────────────────────────────────────────────────
router.post("/auth/login", w(auth.login));
router.post("/auth/setup", w(auth.setup));  // solo funciona si no hay usuarios

// A partir de aquí todo requiere token válido
router.use(requireAuth);

// ─── AUTH (privado) ───────────────────────────────────────────────────────
router.get("/auth/me", w(auth.me));
router.get("/auth/vendedores", w(auth.listarVendedores));
router.get("/auth/vendedores/admin", requireRol("MASTER", "ADMIN"), w(auth.listarVendedoresAdmin));
router.post("/auth/vendedores", requireRol("MASTER", "ADMIN"), w(auth.crearVendedor));
router.patch("/auth/vendedores/:id", requireRol("MASTER"), w(auth.actualizarVendedor));
router.post("/auth/vendedores/:id/fusionar", requireRol("MASTER"), w(auth.fusionarVendedor));
router.get("/auth/usuarios", requireRol("MASTER", "ADMIN"), w(auth.listarUsuarios));
router.post("/auth/usuarios", requireRol("MASTER", "ADMIN"), w(auth.crearUsuario));
router.put("/auth/usuarios/:id", requireRol("MASTER"), w(auth.actualizarUsuario));
router.patch("/auth/usuarios/:id/password", w(auth.cambiarPassword));
router.patch("/auth/usuarios/:id/activo", requireRol("MASTER"), w(auth.toggleActivo));
router.patch("/auth/usuarios/:id/comision", requireRol("MASTER"), w(auth.actualizarComision));
router.post("/auth/usuarios/:id/vincular-vendedor", requireRol("MASTER"), w(auth.vincularVendedor));

// ─── Clientes ─────────────────────────────────────────────────────────────
router.get("/clientes", w(clientes.listar));
router.get("/clientes/buscar", w(clientes.buscar));
router.get("/clientes/:id", w(clientes.obtener));
router.post("/clientes", requireRol("MASTER", "ADMIN"), w(clientes.crear));
router.put("/clientes/:id", requireRol("MASTER", "ADMIN"), w(clientes.actualizar));
router.delete("/clientes/:id", requireRol("MASTER"), w(clientes.eliminar));

// ─── Productos ────────────────────────────────────────────────────────────
router.get("/productos", w(productos.listar));
router.get("/productos/buscar", w(productos.buscar));
router.post("/productos/importar", requireRol("MASTER", "ADMIN"), w(productos.importar));
router.get("/productos/:id", w(productos.obtener));
router.post("/productos", requireRol("MASTER", "ADMIN"), w(productos.crear));
router.put("/productos/:id", requireRol("MASTER", "ADMIN"), w(productos.actualizar));
router.delete("/productos/:id", requireRol("MASTER"), w(productos.eliminar));
router.post("/productos/:id/imagen", requireRol("MASTER", "ADMIN"), uploadMiddleware, w(subirImagen));
router.delete("/productos/:id/imagen", requireRol("MASTER", "ADMIN"), w(eliminarImagen));

// ─── Listas de precios ────────────────────────────────────────────────────
router.get("/listas-precios", w(listaPrecios.listar));
router.get("/listas-precios/precio/:clienteId/:productoId", w(listaPrecios.precioParaCliente));
router.get("/listas-precios/cliente/:clienteId", w(listaPrecios.catalogoParaCliente));
router.get("/listas-precios/:id", w(listaPrecios.obtener));
router.post("/listas-precios", requireRol("MASTER", "ADMIN"), w(listaPrecios.crear));
router.put("/listas-precios/:id/detalle", requireRol("MASTER", "ADMIN"), w(listaPrecios.upsertDetalle));
router.post("/listas-precios/:id/importar", requireRol("MASTER", "ADMIN"), w(listaPrecios.importarPrecios));
router.delete("/listas-precios/:id", requireRol("MASTER"), w(listaPrecios.eliminar));

// ─── Cotizaciones ─────────────────────────────────────────────────────────
router.get("/cotizaciones", w(cotizaciones.listar));
router.get("/cotizaciones/orden-produccion", requireRol("MASTER", "ADMIN"), w(cotizaciones.ordenProduccion));
router.get("/cotizaciones/reporte-comisiones", requireRol("MASTER", "ADMIN"), w(cotizaciones.reporteComisiones));
router.patch("/cotizaciones/lineas/:lineaId/precio", requireRol("MASTER", "ADMIN"), w(cotizaciones.actualizarPrecioLinea));
router.post("/cotizaciones/:id/recalcular-precios", w(cotizaciones.recalcularDesdeListaPrecios)); // controller valida que sea dueño o admin
router.get("/cotizaciones/:id", w(cotizaciones.obtener));
router.post("/cotizaciones", w(cotizaciones.crear));
router.put("/cotizaciones/:id", w(cotizaciones.actualizar));
router.patch("/cotizaciones/:id/estado", w(cotizaciones.cambiarEstado)); // controller valida permisos por rol
router.post("/cotizaciones/:id/generar-factura", requireRol("MASTER", "ADMIN"), w(cotizaciones.generarFactura));
router.post("/cotizaciones/:id/duplicar", w(cotizaciones.duplicar));
router.delete("/cotizaciones/:id", requireRol("MASTER"), w(cotizaciones.eliminar));

// ─── Seguimiento Cotizaciones ─────────────────────────────────────────────
router.get("/cotizaciones/:cotizacionId/seguimiento", requireRol("MASTER", "ADMIN"), w(seguimiento.listar));
router.post("/cotizaciones/:cotizacionId/seguimiento", requireRol("MASTER", "ADMIN"), w(seguimiento.crear));
router.delete("/seguimiento/:id", requireRol("MASTER", "ADMIN"), w(seguimiento.eliminar));
router.get("/seguimiento/pendientes", requireRol("MASTER", "ADMIN"), w(seguimiento.pendientes));

// ─── Facturas ─────────────────────────────────────────────────────────────
router.get("/facturas", requireRol("MASTER", "ADMIN"), w(facturas.listar));
// ─── PEDIDOS DE PRODUCCIÓN (curvas / niples / conexiones) ─────────────────
// Sin requireRol: el propio controlador decide según rol + la casilla puedeVerCurvas.
router.get("/pedidos/demanda", w(pedidos.demandaPedidos));

router.get("/facturas/balance", requireRol("MASTER", "ADMIN"), w(facturas.balanceGeneral));
router.get("/facturas/cliente/:clienteId/resumen", requireRol("MASTER", "ADMIN"), w(facturas.resumenCliente));
router.get("/facturas/cliente/:clienteId/con-pagos", requireRol("MASTER", "ADMIN"), w(facturas.listarClienteConPagos));
router.post("/facturas/manual", requireRol("MASTER", "ADMIN"), w(facturas.crearManual));
router.post("/facturas/importar-historico", requireRol("MASTER", "ADMIN"), w(facturas.importarHistorico));
router.get("/facturas/:id", requireRol("MASTER", "ADMIN"), w(facturas.obtener));
router.patch("/facturas/:id/notas", requireRol("MASTER", "ADMIN"), w(facturas.actualizarNotas));
router.patch("/facturas/:id/comision-vendedor", requireRol("MASTER"), w(facturas.actualizarComisionVendedor));
router.delete("/facturas/:id", requireRol("MASTER"), w(facturas.eliminar));
// Devoluciones de producto sobre una línea ya facturada
router.post("/facturas/:facturaId/lineas/:lineaId/devolucion", requireRol("MASTER", "ADMIN"), w(devoluciones.crear));
router.delete("/devoluciones/:id", requireRol("MASTER", "ADMIN"), w(devoluciones.eliminar));

// ─── Cuentas bancarias ────────────────────────────────────────────────────
router.get("/cuentas", w(cuentas.listar));
router.get("/cuentas/todas", requireRol("MASTER", "ADMIN"), w(cuentas.listarTodas));
router.post("/cuentas", requireRol("MASTER", "ADMIN"), w(cuentas.crear));
router.put("/cuentas/:id", requireRol("MASTER", "ADMIN"), w(cuentas.actualizar));
router.patch("/cuentas/:id/activa", requireRol("MASTER"), w(cuentas.toggleActiva));
router.post("/cuentas/seed", requireRol("MASTER"), w(cuentas.seedCuentas));

// ─── Pagos de Vendedores (con aprobación) ─────────────────────────────────
// El VENDEDOR puede cargar y ver los suyos; MASTER/ADMIN aprueban y ven todos.
router.get("/pagos-vendedor", w(pagosVendedor.listar));
router.get("/pagos-vendedor/facturas-pendientes", w(pagosVendedor.facturasPendientes));
router.post("/pagos-vendedor", w(pagosVendedor.crear));
router.post("/pagos-vendedor/:id/aprobar", requireRol("MASTER", "ADMIN"), w(pagosVendedor.aprobar));
router.post("/pagos-vendedor/:id/rechazar", requireRol("MASTER", "ADMIN"), w(pagosVendedor.rechazar));
// Comprobante: lo anexa el vendedor dueño o un admin (el controlador valida); borra solo admin/master
router.post("/pagos-vendedor/:id/comprobante", pagosVendedor.uploadComprobanteMiddleware, w(pagosVendedor.subirComprobante));
router.delete("/pagos-vendedor/:id/comprobante", requireRol("MASTER", "ADMIN"), w(pagosVendedor.eliminarComprobante));

// ─── Pagos ────────────────────────────────────────────────────────────────
router.get("/pagos", requireRol("MASTER", "ADMIN"), w(pagos.listar));
router.get("/pagos/pendientes", requireRol("MASTER", "ADMIN"), w(pagos.pagosPendientes));
router.post("/pagos", requireRol("MASTER", "ADMIN"), w(pagos.registrar));
router.post("/pagos/:id/asignar", requireRol("MASTER", "ADMIN"), w(pagos.asignarAFactura));

// ─── Despachos ────────────────────────────────────────────────────────────
router.get("/despachos", w(despachos.listar));
router.post("/despachos/desde-cotizacion/:cotizacionId", requireRol("MASTER", "ADMIN"), w(despachos.crearDesdeCotizacion));
router.post("/despachos/:id/agregar-cotizacion", requireRol("MASTER", "ADMIN"), w(despachos.agregarCotizacion));
router.post("/despachos/:id/finalizar", requireRol("MASTER", "ADMIN"), w(despachos.finalizar));
router.put("/despachos/:id/lineas", requireRol("MASTER", "ADMIN"), w(despachos.actualizarLineas));
router.delete("/despachos/:id", requireRol("MASTER"), w(despachos.eliminar));
router.get("/despachos/:id/ganancias", requireRol("MASTER", "ADMIN"), w(ganancias.calcular));
router.patch("/despachos/lineas/:lineaId/servicio-externo", requireRol("MASTER", "ADMIN"), w(ganancias.actualizarServicioExterno));
router.patch("/despachos/lineas/:lineaId/gris", requireRol("MASTER", "ADMIN"), w(ganancias.actualizarGris));
// Balance de Pagos — solo MASTER (los administradores no pueden ver el balance)
router.post("/despachos/:id/balance/generar", requireRol("MASTER"), w(balance.generarBalance));
// Control de Despachos + Deudas (por cobrar y deuda de materia prima) — solo MASTER
router.get("/control-despachos", requireRol("MASTER"), w(controlDespachos.listar));

router.get("/despachos/:id/balance", requireRol("MASTER"), w(balance.getBalance));
router.get("/despachos/:id/balance/snapshot", requireRol("MASTER"), w(balance.getSnapshot));
// Conceptos adicionales del despacho (Comisión 2, Viáticos, Carga Externa, Ayudante)
router.get("/despachos/:id/conceptos", requireRol("MASTER"), w(conceptosExtra.listar));
router.post("/despachos/:id/conceptos", requireRol("MASTER"), w(conceptosExtra.crear));
router.patch("/conceptos/:conceptoId", requireRol("MASTER"), w(conceptosExtra.actualizar));
router.delete("/conceptos/:conceptoId", requireRol("MASTER"), w(conceptosExtra.eliminar));

router.patch("/balance/items/:itemId", requireRol("MASTER"), w(balance.actualizarItem));
router.post("/balance/items/:itemId/cuotas", requireRol("MASTER"), w(balance.agregarCuota));
router.patch("/balance/cuotas/:cuotaId", requireRol("MASTER"), w(balance.actualizarCuota));
router.delete("/balance/cuotas/:cuotaId", requireRol("MASTER"), w(balance.eliminarCuota));
router.get("/despachos/:id", w(despachos.obtener));

// ─── Reportes ─────────────────────────────────────────────────────────────
router.get("/reportes/ventas-producto", requireRol("MASTER", "ADMIN"), w(reportes.ventasProducto));
router.get("/reportes/ventas-producto-facturas", requireRol("MASTER", "ADMIN"), w(reportes.ventasProductoFacturas));
router.get("/reportes/ventas-facturas", requireRol("MASTER", "ADMIN"), w(reportes.ventasFacturas));
router.get("/reportes/dinero-recibido", requireRol("MASTER", "ADMIN"), w(reportes.dineroRecibido));
router.get("/reportes/estado-cuenta/:clienteId", requireRol("MASTER", "ADMIN"), w(reportes.estadoCuenta));
router.get("/reportes/cuentas-cobrar", requireRol("MASTER", "ADMIN"), w(reportes.cuentasCobrar));

// ─── Facturación Externa (compras a proveedores) ──────────────────────────
router.get("/compras-externas", requireRol("MASTER", "ADMIN"), w(comprasExternas.listar));
router.post("/compras-externas", requireRol("MASTER", "ADMIN"), w(comprasExternas.crear));
router.post("/compras-externas/asignaciones", requireRol("MASTER", "ADMIN"), w(comprasExternas.asignar));
router.delete("/compras-externas/asignaciones/:asignacionId", requireRol("MASTER", "ADMIN"), w(comprasExternas.eliminarAsignacion));
router.delete("/compras-externas/lineas/:lineaId", requireRol("MASTER", "ADMIN"), w(comprasExternas.eliminarLinea));
router.delete("/compras-externas/pagos/:pagoId", requireRol("MASTER", "ADMIN"), w(comprasExternas.eliminarPago));
router.post("/compras-externas/:id/imagen", requireRol("MASTER", "ADMIN"), comprasExternas.uploadCompraMiddleware, w(comprasExternas.subirImagen));
router.delete("/compras-externas/:id/imagen", requireRol("MASTER", "ADMIN"), w(comprasExternas.eliminarImagen));
router.post("/compras-externas/:id/lineas", requireRol("MASTER", "ADMIN"), w(comprasExternas.agregarLinea));
router.post("/compras-externas/:id/pagos", requireRol("MASTER", "ADMIN"), w(comprasExternas.registrarPago));
router.put("/compras-externas/:id", requireRol("MASTER", "ADMIN"), w(comprasExternas.actualizar));
router.delete("/compras-externas/:id", requireRol("MASTER"), w(comprasExternas.eliminar));
router.get("/compras-externas/:id", requireRol("MASTER", "ADMIN"), w(comprasExternas.obtener));

// ─── Planificador de Carga (consolidación de pedidos) ─────────────────────
router.get("/planes-carga", requireRol("MASTER", "ADMIN"), w(planCarga.listar));
router.post("/planes-carga", requireRol("MASTER", "ADMIN"), w(planCarga.crear));
router.get("/planes-carga/:id", requireRol("MASTER", "ADMIN"), w(planCarga.obtener));
router.put("/planes-carga/:id", requireRol("MASTER", "ADMIN"), w(planCarga.actualizar));
router.post("/planes-carga/:id/generar", requireRol("MASTER", "ADMIN"), w(planCarga.generar));
router.post("/planes-carga/:id/importar", requireRol("MASTER", "ADMIN"), w(planCarga.importar));
router.post("/planes-carga/:id/aprobar", requireRol("MASTER", "ADMIN"), w(planCarga.aprobar));
router.post("/planes-carga/:id/consolidar", requireRol("MASTER", "ADMIN"), w(planCarga.consolidar));
router.delete("/planes-carga/:id", requireRol("MASTER", "ADMIN"), w(planCarga.eliminar));

// ─── Empresas ─────────────────────────────────────────────────────────────
router.get("/empresas", w(empresas.listar));
router.post("/empresas", requireRol("MASTER"), w(empresas.crear));
router.put("/empresas/:id", requireRol("MASTER"), w(empresas.actualizar));
router.patch("/empresas/:id/activa", requireRol("MASTER"), w(empresas.toggleActiva));

// ─── Tasa de Cambio ───────────────────────────────────────────────────────
router.get("/tasa-cambio", w(tasaCambio.listar));
router.get("/tasa-cambio/vigente", w(tasaCambio.obtenerVigente));
router.post("/tasa-cambio", requireRol("MASTER", "ADMIN"), w(tasaCambio.upsertHoy));
router.delete("/tasa-cambio/:id", requireRol("MASTER"), w(tasaCambio.eliminar));

// ─── Tablas de distribución de ganancias ─────────────────────────────────
router.get("/tablas",              requireRol("MASTER", "ADMIN"), w(tablas.getTablasConOverrides));
router.patch("/tablas",            requireRol("MASTER"),          w(tablas.setTablaOverride));
router.get("/tablas/pin",          requireRol("MASTER"),          w(tablas.getPinEstado));
router.post("/tablas/pin/verificar", requireRol("MASTER"),        w(tablas.verificarPin));
router.post("/tablas/pin",         requireRol("MASTER"),          w(tablas.setPin));

// ─── Categorías y seed ────────────────────────────────────────────────────
router.use("/categorias", categoriasRouter);
router.use("/seed", requireRol("MASTER"), seedRouter);
router.use("/seed-productos", requireRol("MASTER"), seedProductosRouter);

export { router };
