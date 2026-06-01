import { Router } from "express";
import { prisma } from "../lib/prisma";

export const seedProductosRouter = Router();

seedProductosRouter.post("/", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "No disponible en producción" });
  }

  // Obtener IDs de categorías
  const cats = await prisma.categoriaCosto.findMany();
  const catId = (nombre: string) => {
    const c = cats.find((c) => c.nombre === nombre);
    if (!c) throw new Error(`Categoría no encontrada: ${nombre}`);
    return c.id;
  };

  const productos = [
    // ─── MANGUERAS DE RIEGO (INTERNO) ───────────────────────────────────────
    { nombre: "Manguera Riego", medida: '1/2" x 60Lbs', origen: "INTERNO", catNombre: "Manguera_3/4", peso: 27.22 },
    { nombre: "Manguera Riego", medida: '1/2" x 90Lbs', origen: "INTERNO", catNombre: "Manguera_3/4", peso: 40.82 },
    { nombre: "Manguera Riego", medida: '3/4" x 90Lbs', origen: "INTERNO", catNombre: "Manguera_3/4", peso: 40.82 },
    { nombre: "Manguera Riego", medida: '1" x 60Lbs',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 27.22 },
    { nombre: "Manguera Riego", medida: '1" x 90Lbs',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 40.82 },
    { nombre: "Manguera Riego", medida: '1½" x 60Lbs',  origen: "INTERNO", catNombre: "Manguera_1-3", peso: 27.22 },
    { nombre: "Manguera Riego", medida: '2" x 60Lbs',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 27.22 },
    { nombre: "Manguera Riego", medida: '2½" x 60Lbs',  origen: "INTERNO", catNombre: "Manguera_1-3", peso: 27.22 },
    { nombre: "Manguera Riego", medida: '3" x 60Lbs',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 27.22 },

    // ─── TUBO AZUL AGUAS BLANCAS (INTERNO) ─────────────────────────────────
    { nombre: "Tubo Azul Agua Blanca", medida: '1/2" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 1.08 },
    { nombre: "Tubo Azul Agua Blanca", medida: '3/4" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 1.50 },
    { nombre: "Tubo Azul Agua Blanca", medida: '1" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 2.50 },
    { nombre: "Tubo Azul Agua Blanca", medida: '1½" x 400Lbs x 6mts',  origen: "INTERNO", catNombre: "Azul", peso: 3.80 },
    { nombre: "Tubo Azul Agua Blanca", medida: '2" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 5.60 },
    { nombre: "Tubo Azul Agua Blanca", medida: '3" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 9.50 },
    { nombre: "Tubo Azul Agua Blanca", medida: '4" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 15.00 },

    // ─── TUBO GRIS AGUAS BLANCAS (categoría NEGRO por regla especial) ───────
    { nombre: "Tubo Gris Agua Blanca PVC", medida: '1/2" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Negro", peso: 1.08 },
    { nombre: "Tubo Gris Agua Blanca PVC", medida: '3/4" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Negro", peso: 1.50 },
    { nombre: "Tubo Gris Agua Blanca PVC", medida: '1" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Negro", peso: 2.50 },
    { nombre: "Tubo Gris Agua Blanca PVC", medida: '1½" x 400Lbs x 6mts',  origen: "INTERNO", catNombre: "Negro", peso: 3.80 },
    { nombre: "Tubo Gris Agua Blanca PVC", medida: '2" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Negro", peso: 5.60 },

    // ─── TUBO ELÉCTRICO NEGRO (INTERNO) ─────────────────────────────────────
    { nombre: "Tubo Eléctrico Negro", medida: '1/2" x 3mts', origen: "INTERNO", catNombre: "Negro", peso: 0.18 },
    { nombre: "Tubo Eléctrico Negro", medida: '3/4" x 3mts', origen: "INTERNO", catNombre: "Negro", peso: 0.25 },
    { nombre: "Tubo Eléctrico Negro", medida: '1" x 3mts',   origen: "INTERNO", catNombre: "Negro", peso: 0.42 },

    // ─── TUBO ELÉCTRICO BLANCO LIVIANO (INTERNO) ────────────────────────────
    { nombre: "Tubo Eléctrico Blanco Liviano", medida: '1/2" x 3mts', origen: "INTERNO", catNombre: "Blanco", peso: 0.18 },
    { nombre: "Tubo Eléctrico Blanco Liviano", medida: '3/4" x 3mts', origen: "INTERNO", catNombre: "Blanco", peso: 0.25 },
    { nombre: "Tubo Eléctrico Blanco Liviano", medida: '1" x 3mts',   origen: "INTERNO", catNombre: "Blanco", peso: 0.42 },

    // ─── CURVAS ELÉCTRICAS (INTERNO) ─────────────────────────────────────────
    { nombre: "Curva Eléctrica Negra", medida: '1/2"', origen: "INTERNO", catNombre: "Negro", peso: null },
    { nombre: "Curva Eléctrica Negra", medida: '3/4"', origen: "INTERNO", catNombre: "Negro", peso: null },
    { nombre: "Curva Eléctrica Negra", medida: '1"',   origen: "INTERNO", catNombre: "Negro", peso: null },
    { nombre: "Curva Eléctrica Blanca", medida: '1/2"', origen: "INTERNO", catNombre: "Blanco", peso: null },
    { nombre: "Curva Eléctrica Blanca", medida: '3/4"', origen: "INTERNO", catNombre: "Blanco", peso: null },
    { nombre: "Curva Eléctrica Blanca", medida: '1"',   origen: "INTERNO", catNombre: "Blanco", peso: null },

    // ─── TUBERÍA PEAD AMARILLA (INTERNO) ────────────────────────────────────
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '2" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 1.50 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '3" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 2.50 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 4.00 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '6" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 8.00 },

    // ─── TUBERÍA AGUA NEGRA GRIS (categoría NEGRO por regla especial) ────────
    { nombre: "Tubería Agua Negra Gris", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Negro", peso: 4.00 },

    // ─── NIPLES AZUL (INTERNO) ───────────────────────────────────────────────
    { nombre: "Niple Azul", medida: '1/2" x 20cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1/2" x 25cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1/2" x 50cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1/2" x 60cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '3/4" x 15cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '3/4" x 20cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '3/4" x 25cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '3/4" x 50cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '3/4" x 60cm', origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1" x 15cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1" x 20cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1" x 25cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { nombre: "Niple Azul", medida: '1" x 50cm',   origen: "INTERNO", catNombre: "Azul", peso: null },

    // ─── CONEXIONES PVC — INTERNOS (Darwin) ──────────────────────────────────
    { nombre: "Codo PVC", medida: '2" x 90°', origen: "INTERNO", catNombre: "Negro", peso: 0.12 },
    { nombre: "Codo PVC", medida: '4" x 90°', origen: "INTERNO", catNombre: "Negro", peso: 0.45 },

    // ─── CONEXIONES PVC — EXTERNOS ───────────────────────────────────────────
    { nombre: "Codo PVC",       medida: '3" x 90°',    origen: "EXTERNO", catNombre: "Externo", peso: 0.28 },
    { nombre: "Semi Codo PVC",  medida: '2" x 45°',    origen: "EXTERNO", catNombre: "Externo", peso: 0.10 },
    { nombre: "Semi Codo PVC",  medida: '3" x 45°',    origen: "EXTERNO", catNombre: "Externo", peso: 0.22 },
    { nombre: "Semi Codo PVC",  medida: '4" x 45°',    origen: "EXTERNO", catNombre: "Externo", peso: 0.40 },
    { nombre: "Sifón PVC",      medida: '2"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.18 },
    { nombre: "Sifón PVC",      medida: '3"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.35 },
    { nombre: "Sifón PVC",      medida: '4"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.70 },
    { nombre: "Tee PVC",        medida: '2"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.15 },
    { nombre: "Tee PVC",        medida: '3"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.30 },
    { nombre: "Tee PVC",        medida: '4"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.55 },
    { nombre: "Yee PVC",        medida: '2"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.18 },
    { nombre: "Yee PVC",        medida: '3"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.35 },
    { nombre: "Yee PVC",        medida: '4"',           origen: "EXTERNO", catNombre: "Externo", peso: 0.65 },
    { nombre: "Yee Reducida PVC", medida: '4" a 2"',   origen: "EXTERNO", catNombre: "Externo", peso: 0.50 },

    // ─── MANGUERAS EXTERNAS ───────────────────────────────────────────────────
    { nombre: "Manguera Verde Jardín",  medida: '1/2" x 100mts', origen: "EXTERNO", catNombre: "Externo", peso: null },
    { nombre: "Manguera Gas Amarilla",  medida: '1/2" x 100mts', origen: "EXTERNO", catNombre: "Externo", peso: null },
  ];

  let creados = 0;
  let omitidos = 0;

  for (const p of productos) {
    const existe = await prisma.producto.findFirst({
      where: { nombre: p.nombre, medida: p.medida },
    });
    if (!existe) {
      await prisma.producto.create({
        data: {
          nombre: p.nombre,
          medida: p.medida,
          origen: p.origen as any,
          categoriaId: catId(p.catNombre),
          pesoUnitarioKg: p.peso,
        },
      });
      creados++;
    } else {
      omitidos++;
    }
  }

  // ─── PRECIOS FERRETERÍA INFINITO (Lista ID=3) ─────────────────────────────
  const preciosInfinito: { nombre: string; medida: string; precio: number }[] = [
    { nombre: "Tubo Azul Agua Blanca",            medida: '1/2" x 400Lbs x 6mts', precio: 3.11 },
    { nombre: "Tubo Azul Agua Blanca",            medida: '3/4" x 400Lbs x 6mts', precio: 4.22 },
    { nombre: "Tubo Azul Agua Blanca",            medida: '1" x 400Lbs x 6mts',   precio: 6.17 },
    { nombre: "Tubo Eléctrico Blanco Liviano",    medida: '1/2" x 3mts',           precio: 0.68 },
    { nombre: "Tubo Eléctrico Blanco Liviano",    medida: '3/4" x 3mts',           precio: 0.89 },
    { nombre: "Tubo Eléctrico Blanco Liviano",    medida: '1" x 3mts',             precio: 1.28 },
    { nombre: "Tubo Eléctrico Negro",             medida: '1/2" x 3mts',           precio: 0.47 },
    { nombre: "Tubo Eléctrico Negro",             medida: '3/4" x 3mts',           precio: 0.59 },
    { nombre: "Curva Eléctrica Negra",            medida: '1/2"',                  precio: 0.151 },
    { nombre: "Curva Eléctrica Negra",            medida: '3/4"',                  precio: 0.167 },
    { nombre: "Curva Eléctrica Blanca",           medida: '1/2"',                  precio: 0.167 },
    { nombre: "Curva Eléctrica Blanca",           medida: '3/4"',                  precio: 0.193 },
    { nombre: "Curva Eléctrica Blanca",           medida: '1"',                    precio: 0.284 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '2" x 3mts',             precio: 2.15 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '3" x 3mts',             precio: 3.59 },
    { nombre: "Tubería Agua Negra Amarilla PEAD", medida: '4" x 3mts',             precio: 5.92 },
    { nombre: "Manguera Riego",                   medida: '1/2" x 60Lbs',          precio: 18.43 },
    { nombre: "Manguera Riego",                   medida: '1/2" x 90Lbs',          precio: 22.11 },
    { nombre: "Manguera Riego",                   medida: '3/4" x 90Lbs',          precio: 30.15 },
    { nombre: "Manguera Riego",                   medida: '1" x 60Lbs',            precio: 44.30 },
    { nombre: "Niple Azul",                       medida: '1/2" x 20cm',           precio: 0.39 },
    { nombre: "Niple Azul",                       medida: '1/2" x 25cm',           precio: 0.49 },
    { nombre: "Niple Azul",                       medida: '1/2" x 50cm',           precio: 0.98 },
    { nombre: "Niple Azul",                       medida: '1/2" x 60cm',           precio: 1.18 },
    { nombre: "Niple Azul",                       medida: '3/4" x 15cm',           precio: 0.39 },
    { nombre: "Niple Azul",                       medida: '3/4" x 20cm',           precio: 0.52 },
    { nombre: "Niple Azul",                       medida: '3/4" x 25cm',           precio: 0.66 },
    { nombre: "Niple Azul",                       medida: '3/4" x 50cm',           precio: 1.31 },
    { nombre: "Niple Azul",                       medida: '3/4" x 60cm',           precio: 1.57 },
    { nombre: "Niple Azul",                       medida: '1" x 15cm',             precio: 0.69 },
    { nombre: "Niple Azul",                       medida: '1" x 20cm',             precio: 0.92 },
    { nombre: "Niple Azul",                       medida: '1" x 25cm',             precio: 1.15 },
    { nombre: "Niple Azul",                       medida: '1" x 50cm',             precio: 2.29 },
    { nombre: "Manguera Verde Jardín",            medida: '1/2" x 100mts',         precio: 26.10 },
    { nombre: "Manguera Gas Amarilla",            medida: '1/2" x 100mts',         precio: 39.00 },
    { nombre: "Tubo Gris Agua Blanca PVC",        medida: '1/2" x 400Lbs x 6mts', precio: 3.53 },
    { nombre: "Tubo Gris Agua Blanca PVC",        medida: '3/4" x 400Lbs x 6mts', precio: 4.50 },
    { nombre: "Tubo Gris Agua Blanca PVC",        medida: '1" x 400Lbs x 6mts',   precio: 8.00 },
    { nombre: "Codo PVC",                         medida: '2" x 90°',              precio: 0.39 },
    { nombre: "Codo PVC",                         medida: '3" x 90°',              precio: 1.08 },
    { nombre: "Codo PVC",                         medida: '4" x 90°',              precio: 2.00 },
    { nombre: "Semi Codo PVC",                    medida: '2" x 45°',              precio: 0.39 },
    { nombre: "Semi Codo PVC",                    medida: '3" x 45°',              precio: 0.73 },
    { nombre: "Semi Codo PVC",                    medida: '4" x 45°',              precio: 1.99 },
    { nombre: "Sifón PVC",                        medida: '2"',                    precio: 0.69 },
    { nombre: "Sifón PVC",                        medida: '3"',                    precio: 1.39 },
    { nombre: "Sifón PVC",                        medida: '4"',                    precio: 3.45 },
    { nombre: "Tee PVC",                          medida: '2"',                    precio: 0.66 },
    { nombre: "Tee PVC",                          medida: '3"',                    precio: 1.22 },
    { nombre: "Tee PVC",                          medida: '4"',                    precio: 3.18 },
    { nombre: "Yee PVC",                          medida: '2"',                    precio: 0.76 },
    { nombre: "Yee PVC",                          medida: '3"',                    precio: 1.45 },
    { nombre: "Yee PVC",                          medida: '4"',                    precio: 3.59 },
    { nombre: "Yee Reducida PVC",                 medida: '4" a 2"',               precio: 2.26 },
  ];

  let preciosCargados = 0;
  for (const p of preciosInfinito) {
    const producto = await prisma.producto.findFirst({
      where: { nombre: p.nombre, medida: p.medida },
    });
    if (producto) {
      await prisma.listaPrecioDetalle.upsert({
        where: { listaPrecioId_productoId: { listaPrecioId: 3, productoId: producto.id } },
        update: { precioUnitario: p.precio },
        create: { listaPrecioId: 3, productoId: producto.id, precioUnitario: p.precio },
      });
      preciosCargados++;
    }
  }

  res.json({
    mensaje: "Productos cargados correctamente",
    productosCreados: creados,
    productosOmitidos: omitidos,
    preciosFerreteria: preciosCargados,
  });
});
