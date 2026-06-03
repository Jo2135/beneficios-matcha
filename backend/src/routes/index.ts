import { Router, Request, Response, NextFunction } from "express";
import * as clientes from "../controllers/clientes.controller";
import * as productos from "../controllers/productos.controller";
import * as listaPrecios from "../controllers/listaPrecios.controller";
import * as cotizaciones from "../controllers/cotizaciones.controller";
import * as facturas from "../controllers/facturas.controller";
import * as pagos from "../controllers/pagos.controller";
import * as despachos from "../controllers/despachos.controller";
import * as auth from "../controllers/auth.controller";
import * as cuentas from "../controllers/cuentas.controller";
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
router.get("/productos/:id", w(productos.obtener));
router.post("/productos", requireRol("MASTER", "ADMIN"), w(productos.crear));
router.put("/productos/:id", requireRol("MASTER", "ADMIN"), w(productos.actualizar));
router.delete("/productos/:id", requireRol("MASTER"), w(productos.eliminar));
router.post("/productos/:id/imagen", requireRol("MASTER", "ADMIN"), uploadMiddleware, w(subirImagen));
router.delete("/productos/:id/imagen", requireRol("MASTER", "ADMIN"), w(eliminarImagen));

// ─── Listas de precios ────────────────────────────────────────────────────
router.get("/listas-precios", w(listaPrecios.listar));
router.get("/listas-precios/precio/:clienteId/:productoId", w(listaPrecios.precioParaCliente));
router.get("/listas-precios/:id", w(listaPrecios.obtener));
router.post("/listas-precios", requireRol("MASTER", "ADMIN"), w(listaPrecios.crear));
router.put("/listas-precios/:id/detalle", requireRol("MASTER", "ADMIN"), w(listaPrecios.upsertDetalle));
router.post("/listas-precios/:id/importar", requireRol("MASTER", "ADMIN"), w(listaPrecios.importarPrecios));
router.delete("/listas-precios/:id", requireRol("MASTER"), w(listaPrecios.eliminar));

// ─── Cotizaciones ─────────────────────────────────────────────────────────
router.get("/cotizaciones", w(cotizaciones.listar));
router.get("/cotizaciones/orden-produccion", requireRol("MASTER", "ADMIN"), w(cotizaciones.ordenProduccion));
router.get("/cotizaciones/reporte-comisiones", requireRol("MASTER", "ADMIN"), w(cotizaciones.reporteComisiones));
router.get("/cotizaciones/:id", w(cotizaciones.obtener));
router.post("/cotizaciones", w(cotizaciones.crear));
router.patch("/cotizaciones/:id/estado", w(cotizaciones.cambiarEstado)); // controller valida permisos por rol
router.post("/cotizaciones/:id/generar-factura", requireRol("MASTER", "ADMIN"), w(cotizaciones.generarFactura));

// ─── Facturas ─────────────────────────────────────────────────────────────
router.get("/facturas", requireRol("MASTER", "ADMIN"), w(facturas.listar));
router.get("/facturas/balance", requireRol("MASTER", "ADMIN"), w(facturas.balanceGeneral));
router.get("/facturas/cliente/:clienteId/resumen", requireRol("MASTER", "ADMIN"), w(facturas.resumenCliente));
router.get("/facturas/:id", requireRol("MASTER", "ADMIN"), w(facturas.obtener));
router.patch("/facturas/:id/notas", requireRol("MASTER", "ADMIN"), w(facturas.actualizarNotas));

// ─── Cuentas bancarias ────────────────────────────────────────────────────
router.get("/cuentas", w(cuentas.listar));
router.get("/cuentas/todas", requireRol("MASTER", "ADMIN"), w(cuentas.listarTodas));
router.post("/cuentas", requireRol("MASTER", "ADMIN"), w(cuentas.crear));
router.put("/cuentas/:id", requireRol("MASTER", "ADMIN"), w(cuentas.actualizar));
router.patch("/cuentas/:id/activa", requireRol("MASTER"), w(cuentas.toggleActiva));
router.post("/cuentas/seed", requireRol("MASTER"), w(cuentas.seedCuentas));

// ─── Pagos ────────────────────────────────────────────────────────────────
router.get("/pagos", requireRol("MASTER", "ADMIN"), w(pagos.listar));
router.get("/pagos/pendientes", requireRol("MASTER", "ADMIN"), w(pagos.pagosPendientes));
router.post("/pagos", requireRol("MASTER", "ADMIN"), w(pagos.registrar));
router.post("/pagos/:id/asignar", requireRol("MASTER", "ADMIN"), w(pagos.asignarAFactura));

// ─── Despachos ────────────────────────────────────────────────────────────
router.get("/despachos", w(despachos.listar));
router.post("/despachos/desde-cotizacion/:cotizacionId", requireRol("MASTER", "ADMIN"), w(despachos.crearDesdeCotizacion));
router.post("/despachos/:id/finalizar", requireRol("MASTER", "ADMIN"), w(despachos.finalizar));
router.put("/despachos/:id/lineas", requireRol("MASTER", "ADMIN"), w(despachos.actualizarLineas));
router.get("/despachos/:id", w(despachos.obtener));

// ─── Categorías y seed ────────────────────────────────────────────────────
router.use("/categorias", categoriasRouter);
router.use("/seed", requireRol("MASTER"), seedRouter);
router.use("/seed-productos", requireRol("MASTER"), seedProductosRouter);

export { router };
