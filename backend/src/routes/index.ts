import { Router } from "express";
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

const router = Router();

// Clientes
router.get("/clientes", clientes.listar);
router.get("/clientes/buscar", clientes.buscar);
router.get("/clientes/:id", clientes.obtener);
router.post("/clientes", clientes.crear);
router.put("/clientes/:id", clientes.actualizar);
router.delete("/clientes/:id", clientes.eliminar);

// Productos
router.get("/productos", productos.listar);
router.get("/productos/buscar", productos.buscar);
router.get("/productos/:id", productos.obtener);
router.post("/productos", productos.crear);
router.put("/productos/:id", productos.actualizar);
router.delete("/productos/:id", productos.eliminar);

// Listas de precios
router.get("/listas-precios", listaPrecios.listar);
router.get("/listas-precios/:id", listaPrecios.obtener);
router.post("/listas-precios", listaPrecios.crear);
router.put("/listas-precios/:id/detalle", listaPrecios.upsertDetalle);
router.post("/listas-precios/:id/importar", listaPrecios.importarPrecios);
router.delete("/listas-precios/:id", listaPrecios.eliminar);
router.get("/listas-precios/precio/:clienteId/:productoId", listaPrecios.precioParaCliente);

// Cotizaciones
router.get("/cotizaciones", cotizaciones.listar);
router.get("/cotizaciones/:id", cotizaciones.obtener);
router.post("/cotizaciones", cotizaciones.crear);
router.patch("/cotizaciones/:id/estado", cotizaciones.cambiarEstado);
router.post("/cotizaciones/:id/generar-factura", cotizaciones.generarFactura);

// Facturas
router.get("/facturas", facturas.listar);
router.get("/facturas/balance", facturas.balanceGeneral);
router.get("/facturas/:id", facturas.obtener);
router.get("/facturas/cliente/:clienteId/resumen", facturas.resumenCliente);
router.patch("/facturas/:id/notas", facturas.actualizarNotas);

// Pagos
router.get("/pagos", pagos.listar);
router.get("/pagos/pendientes", pagos.pagosPendientes);
router.post("/pagos", pagos.registrar);
router.post("/pagos/:id/asignar", pagos.asignarAFactura);

// Despachos
router.get("/despachos", despachos.listar);
router.post("/despachos/desde-cotizacion/:cotizacionId", despachos.crearDesdeCotizacion);
router.post("/despachos/:id/finalizar", despachos.finalizar);
router.put("/despachos/:id/lineas", despachos.actualizarLineas);
router.get("/despachos/:id", despachos.obtener);

// Categorías y seed
router.use("/categorias", categoriasRouter);
router.use("/seed", seedRouter);
router.use("/seed-productos", seedProductosRouter);

export { router };
