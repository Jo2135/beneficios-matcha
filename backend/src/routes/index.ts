import { Router, Request, Response, NextFunction } from "express";
import * as clientes from "../controllers/clientes.controller";
import * as productos from "../controllers/productos.controller";
import * as listaPrecios from "../controllers/listaPrecios.controller";
import * as cotizaciones from "../controllers/cotizaciones.controller";
import * as facturas from "../controllers/facturas.controller";
import * as pagos from "../controllers/pagos.controller";
import * as despachos from "../controllers/despachos.controller";
import { seedRouter } from "./seed.routes";
import { seedProductosRouter } from "./seed-productos.routes";
import { categoriasRouter } from "./categorias.routes";

// Wrapper que captura errores de async controllers y los pasa al error handler global
type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<any>;
function w(fn: AsyncFn) {
  return (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);
}

const router = Router();

// Clientes
router.get("/clientes", w(clientes.listar));
router.get("/clientes/buscar", w(clientes.buscar));
router.get("/clientes/:id", w(clientes.obtener));
router.post("/clientes", w(clientes.crear));
router.put("/clientes/:id", w(clientes.actualizar));
router.delete("/clientes/:id", w(clientes.eliminar));

// Productos
router.get("/productos", w(productos.listar));
router.get("/productos/buscar", w(productos.buscar));
router.get("/productos/:id", w(productos.obtener));
router.post("/productos", w(productos.crear));
router.put("/productos/:id", w(productos.actualizar));
router.delete("/productos/:id", w(productos.eliminar));

// Listas de precios — rutas específicas ANTES de /:id
router.get("/listas-precios", w(listaPrecios.listar));
router.get("/listas-precios/precio/:clienteId/:productoId", w(listaPrecios.precioParaCliente));
router.get("/listas-precios/:id", w(listaPrecios.obtener));
router.post("/listas-precios", w(listaPrecios.crear));
router.put("/listas-precios/:id/detalle", w(listaPrecios.upsertDetalle));
router.post("/listas-precios/:id/importar", w(listaPrecios.importarPrecios));
router.delete("/listas-precios/:id", w(listaPrecios.eliminar));

// Cotizaciones
router.get("/cotizaciones", w(cotizaciones.listar));
router.get("/cotizaciones/:id", w(cotizaciones.obtener));
router.post("/cotizaciones", w(cotizaciones.crear));
router.patch("/cotizaciones/:id/estado", w(cotizaciones.cambiarEstado));
router.post("/cotizaciones/:id/generar-factura", w(cotizaciones.generarFactura));

// Facturas — rutas específicas ANTES de /:id
router.get("/facturas", w(facturas.listar));
router.get("/facturas/balance", w(facturas.balanceGeneral));
router.get("/facturas/cliente/:clienteId/resumen", w(facturas.resumenCliente));
router.get("/facturas/:id", w(facturas.obtener));
router.patch("/facturas/:id/notas", w(facturas.actualizarNotas));

// Pagos
router.get("/pagos", w(pagos.listar));
router.get("/pagos/pendientes", w(pagos.pagosPendientes));
router.post("/pagos", w(pagos.registrar));
router.post("/pagos/:id/asignar", w(pagos.asignarAFactura));

// Despachos
router.get("/despachos", w(despachos.listar));
router.post("/despachos/desde-cotizacion/:cotizacionId", w(despachos.crearDesdeCotizacion));
router.post("/despachos/:id/finalizar", w(despachos.finalizar));
router.put("/despachos/:id/lineas", w(despachos.actualizarLineas));
router.get("/despachos/:id", w(despachos.obtener));

// Categorías y seed
router.use("/categorias", categoriasRouter);
router.use("/seed", seedRouter);
router.use("/seed-productos", seedProductosRouter);

export { router };
