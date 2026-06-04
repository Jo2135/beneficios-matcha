import { Router } from "express";
import { prisma } from "../lib/prisma";

export const seedProductosRouter = Router();

type ProductDef = {
  codigo?: string;
  nombre: string;
  medida: string;
  origen: "INTERNO" | "EXTERNO";
  catNombre: string;
  peso?: number | null;
};

seedProductosRouter.post("/", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "No disponible en producción" });
  }

  const cats = await prisma.categoriaCosto.findMany();
  const catId = (nombre: string) => {
    const c = cats.find((c) => c.nombre === nombre);
    if (!c) throw new Error(`Categoría no encontrada: ${nombre}`);
    return c.id;
  };

  const productos: ProductDef[] = [
    // ─── MANGUERA DE RIEGO (INTERNO) ────────────────────────────────────────
    { codigo: "MGR-1/2-60",   nombre: "Manguera Riego", medida: '1/2" x 60Lbs',    origen: "INTERNO", catNombre: "Manguera_3/4", peso: 8.8 },
    { codigo: "MGR-3/4-60",   nombre: "Manguera Riego", medida: '3/4" x 60Lbs',    origen: "INTERNO", catNombre: "Manguera_3/4", peso: 14 },
    { codigo: "MGR-1-60",     nombre: "Manguera Riego", medida: '1" x 60Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 20.5 },
    { codigo: "MGR-11/2-60",  nombre: "Manguera Riego", medida: '1½" x 60Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 30.4 },
    { codigo: "MGR-2-60",     nombre: "Manguera Riego", medida: '2" x 60Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 43.5 },
    { codigo: "MGR-21/2-60",  nombre: "Manguera Riego", medida: '2½" x 60Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 69 },
    { codigo: "MGR-3-60",     nombre: "Manguera Riego", medida: '3" x 60Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 100 },
    { codigo: "MGR-4-60",     nombre: "Manguera Riego", medida: '4" x 60Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 230 },
    { codigo: "MGR-1/2-90",   nombre: "Manguera Riego", medida: '1/2" x 90Lbs',    origen: "INTERNO", catNombre: "Manguera_3/4", peso: 10.8 },
    { codigo: "MGR-3/4-90",   nombre: "Manguera Riego", medida: '3/4" x 90Lbs',    origen: "INTERNO", catNombre: "Manguera_3/4", peso: 14.5 },
    { codigo: "MGR-1-90",     nombre: "Manguera Riego", medida: '1" x 90Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 22.4 },
    { codigo: "MGR-11/2-90",  nombre: "Manguera Riego", medida: '1½" x 90Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 34.4 },
    { codigo: "MGR-2-90",     nombre: "Manguera Riego", medida: '2" x 90Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 50.5 },
    { codigo: "MGR-21/2-90",  nombre: "Manguera Riego", medida: '2½" x 90Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 76 },
    { codigo: "MGR-3-90",     nombre: "Manguera Riego", medida: '3" x 90Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 125 },
    { codigo: "MGR-4-90",     nombre: "Manguera Riego", medida: '4" x 90Lbs',      origen: "INTERNO", catNombre: "Manguera_1-3", peso: 260 },
    { codigo: "MGR-1/2-150",  nombre: "Manguera Riego", medida: '1/2" x 150Lbs',   origen: "INTERNO", catNombre: "Manguera_3/4", peso: 12.9 },
    { codigo: "MGR-3/4-150",  nombre: "Manguera Riego", medida: '3/4" x 150Lbs',   origen: "INTERNO", catNombre: "Manguera_3/4", peso: 18 },
    { codigo: "MGR-1-150",    nombre: "Manguera Riego", medida: '1" x 150Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 28 },
    { codigo: "MGR-11/2-150", nombre: "Manguera Riego", medida: '1½" x 150Lbs',    origen: "INTERNO", catNombre: "Manguera_1-3", peso: 40.1 },
    { codigo: "MGR-2-150",    nombre: "Manguera Riego", medida: '2" x 150Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 60 },
    { codigo: "MGR-21/2-150", nombre: "Manguera Riego", medida: '2½" x 150Lbs',    origen: "INTERNO", catNombre: "Manguera_1-3", peso: 90 },
    { codigo: "MGR-3-150",    nombre: "Manguera Riego", medida: '3" x 150Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 145 },
    { codigo: "MGR-4-150",    nombre: "Manguera Riego", medida: '4" x 150Lbs',     origen: "INTERNO", catNombre: "Manguera_1-3", peso: 300 },

    // ─── TUBO AZUL ALTA PRESIÓN 400Lbs (INTERNO) ────────────────────────────
    { codigo: "TUAZ-1/2",   nombre: "Tubo Azul Agua Blanca", medida: '1/2" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 1.65 },
    { codigo: "TUAZ-3/4",   nombre: "Tubo Azul Agua Blanca", medida: '3/4" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 2.53 },
    { codigo: "TUAZ-1",     nombre: "Tubo Azul Agua Blanca", medida: '1" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 3.20 },
    { codigo: "TUAZ-11/2",  nombre: "Tubo Azul Agua Blanca", medida: '1½" x 400Lbs x 6mts',  origen: "INTERNO", catNombre: "Azul", peso: 4.90 },
    { codigo: "TUAZ-2",     nombre: "Tubo Azul Agua Blanca", medida: '2" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 9.60 },
    { codigo: "TUAZ-3",     nombre: "Tubo Azul Agua Blanca", medida: '3" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 9.50 },
    { codigo: "TUAZ-4",     nombre: "Tubo Azul Agua Blanca", medida: '4" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Azul", peso: 15.00 },

    // ─── TUBO AZUL BAJA PRESIÓN 200Lbs (INTERNO) ────────────────────────────
    { codigo: "TUAZ-1/2-B", nombre: "Tubo Azul Agua Blanca", medida: '1/2" x 200Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 1.44 },
    { codigo: "TUAZ-3/4-B", nombre: "Tubo Azul Agua Blanca", medida: '3/4" x 200Lbs x 6mts', origen: "INTERNO", catNombre: "Azul", peso: 2.10 },

    // ─── MANGUERA TUBO AZUL (INTERNO — rollo 100mts) ─────────────────────────
    { codigo: "MGAZ-1/2",  nombre: "Manguera Azul Agua Blanca", medida: '1/2" x 100mts', origen: "INTERNO", catNombre: "Manguera_3/4", peso: 25 },
    { codigo: "MGAZ-3/4",  nombre: "Manguera Azul Agua Blanca", medida: '3/4" x 100mts', origen: "INTERNO", catNombre: "Manguera_3/4", peso: 33 },
    { codigo: "MGAZ-1",    nombre: "Manguera Azul Agua Blanca", medida: '1" x 100mts',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 42 },
    { codigo: "MGAZ-11/2", nombre: "Manguera Azul Agua Blanca", medida: '1½" x 100mts',  origen: "INTERNO", catNombre: "Manguera_1-3", peso: 100 },
    { codigo: "MGAZ-2",    nombre: "Manguera Azul Agua Blanca", medida: '2" x 100mts',   origen: "INTERNO", catNombre: "Manguera_1-3", peso: 132 },

    // ─── TUBO GRIS AGUA BLANCA PVC (INTERNO) ────────────────────────────────
    { codigo: "TUGR-1/2",     nombre: "Tubo Gris Agua Blanca PVC", medida: '1/2" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Negro", peso: 1.70 },
    { codigo: "TUGR-3/4",     nombre: "Tubo Gris Agua Blanca PVC", medida: '3/4" x 400Lbs x 6mts', origen: "INTERNO", catNombre: "Negro", peso: 2.60 },
    { codigo: "TUGR-1",       nombre: "Tubo Gris Agua Blanca PVC", medida: '1" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Negro", peso: 3.20 },
    { codigo: "TUGR-11/2-PV", nombre: "Tubo Gris Agua Blanca PVC", medida: '1½" x 400Lbs x 6mts',  origen: "INTERNO", catNombre: "Negro", peso: 3.80 },
    { codigo: "TUGR-2-PV",    nombre: "Tubo Gris Agua Blanca PVC", medida: '2" x 400Lbs x 6mts',   origen: "INTERNO", catNombre: "Negro", peso: 5.60 },

    // ─── TUBO ELÉCTRICO NEGRO (INTERNO) ─────────────────────────────────────
    { codigo: "TUNG-1/2",  nombre: "Tubo Eléctrico Negro", medida: '1/2" x 3mts',  origen: "INTERNO", catNombre: "Negro", peso: 0.23 },
    { codigo: "TUNG-3/4",  nombre: "Tubo Eléctrico Negro", medida: '3/4" x 3mts',  origen: "INTERNO", catNombre: "Negro", peso: 0.29 },
    { codigo: "TUNG-1",    nombre: "Tubo Eléctrico Negro", medida: '1" x 3mts',    origen: "INTERNO", catNombre: "Negro", peso: 0.50 },
    { codigo: "TUNG-11/2", nombre: "Tubo Eléctrico Negro", medida: '1½" x 3mts',   origen: "INTERNO", catNombre: "Negro", peso: 0.73 },
    { codigo: "TUNG-2",    nombre: "Tubo Eléctrico Negro", medida: '2" x 3mts',    origen: "INTERNO", catNombre: "Negro", peso: 0.95 },

    // ─── TUBO ELÉCTRICO BLANCO LIVIANO (INTERNO) ────────────────────────────
    { codigo: "TUBL-1/2",  nombre: "Tubo Eléctrico Blanco Liviano", medida: '1/2" x 3mts',  origen: "INTERNO", catNombre: "Blanco", peso: 0.28 },
    { codigo: "TUBL-3/4",  nombre: "Tubo Eléctrico Blanco Liviano", medida: '3/4" x 3mts',  origen: "INTERNO", catNombre: "Blanco", peso: 0.37 },
    { codigo: "TUBL-1",    nombre: "Tubo Eléctrico Blanco Liviano", medida: '1" x 3mts',    origen: "INTERNO", catNombre: "Blanco", peso: 0.70 },
    { codigo: "TUBL-11/2", nombre: "Tubo Eléctrico Blanco Liviano", medida: '1½" x 3mts',   origen: "INTERNO", catNombre: "Blanco", peso: 1.25 },
    { codigo: "TUBL-2",    nombre: "Tubo Eléctrico Blanco Liviano", medida: '2" x 3mts',    origen: "INTERNO", catNombre: "Blanco", peso: 1.50 },

    // ─── TUBO ELÉCTRICO BLANCO PESADO (INTERNO) ─────────────────────────────
    { codigo: "TUBL-1/2-P",  nombre: "Tubo Eléctrico Blanco Pesado", medida: '1/2" x 3mts',  origen: "INTERNO", catNombre: "Blanco", peso: 0.30 },
    { codigo: "TUBL-3/4-P",  nombre: "Tubo Eléctrico Blanco Pesado", medida: '3/4" x 3mts',  origen: "INTERNO", catNombre: "Blanco", peso: 0.41 },
    { codigo: "TUBL-1-P",    nombre: "Tubo Eléctrico Blanco Pesado", medida: '1" x 3mts',    origen: "INTERNO", catNombre: "Blanco", peso: 0.85 },
    { codigo: "TUBL-11/2-P", nombre: "Tubo Eléctrico Blanco Pesado", medida: '1½" x 3mts',   origen: "INTERNO", catNombre: "Blanco", peso: 1.25 },
    { codigo: "TUBL-2-P",    nombre: "Tubo Eléctrico Blanco Pesado", medida: '2" x 3mts',    origen: "INTERNO", catNombre: "Blanco", peso: 1.50 },

    // ─── CURVAS ELÉCTRICAS NEGRAS (INTERNO) ─────────────────────────────────
    { codigo: "CVNG-1/2", nombre: "Curva Eléctrica Negra", medida: '1/2"', origen: "INTERNO", catNombre: "Negro", peso: null },
    { codigo: "CVNG-3/4", nombre: "Curva Eléctrica Negra", medida: '3/4"', origen: "INTERNO", catNombre: "Negro", peso: null },
    { codigo: "CVNG-1",   nombre: "Curva Eléctrica Negra", medida: '1"',   origen: "INTERNO", catNombre: "Negro", peso: null },

    // ─── CURVAS ELÉCTRICAS BLANCAS (INTERNO) ────────────────────────────────
    { codigo: "CVBL-1/2", nombre: "Curva Eléctrica Blanca", medida: '1/2"', origen: "INTERNO", catNombre: "Blanco", peso: null },
    { codigo: "CVBL-3/4", nombre: "Curva Eléctrica Blanca", medida: '3/4"', origen: "INTERNO", catNombre: "Blanco", peso: null },
    { codigo: "CVBL-1",   nombre: "Curva Eléctrica Blanca", medida: '1"',   origen: "INTERNO", catNombre: "Blanco", peso: null },

    // ─── TUBERÍA AGUA NEGRA AMARILLA PEAD ECONÓMICA (INTERNO) ───────────────
    { codigo: "TUAM-2-PEAD", nombre: "Tubería Agua Negra Amarilla PEAD", medida: '2" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 0.90 },
    { codigo: "TUAM-3-PEAD", nombre: "Tubería Agua Negra Amarilla PEAD", medida: '3" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 1.30 },
    { codigo: "TUAM-4-PEAD", nombre: "Tubería Agua Negra Amarilla PEAD", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 2.20 },
    { codigo: "TUAM-6-PEAD", nombre: "Tubería Agua Negra Amarilla PEAD", medida: '6" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 7.00 },

    // ─── TUBERÍA AGUA NEGRA AMARILLA PEAD REFORZADA (INTERNO) ───────────────
    { codigo: "TUAM-2-PEAD-R", nombre: "Tubería Agua Negra Amarilla PEAD Reforzada", medida: '2" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 1.20 },
    { codigo: "TUAM-3-PEAD-R", nombre: "Tubería Agua Negra Amarilla PEAD Reforzada", medida: '3" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 1.80 },
    { codigo: "TUAM-4-PEAD-R", nombre: "Tubería Agua Negra Amarilla PEAD Reforzada", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 2.80 },

    // ─── TUBERÍA AGUA NEGRA NARANJA PEAD REFORZADA (INTERNO) ────────────────
    { codigo: "TUNA-4-PEAD-R", nombre: "Tubería Agua Negra Naranja PEAD Reforzada", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Amarillo_PEAD", peso: 2.80 },

    // ─── TUBERÍA AGUA NEGRA GRIS PEAD (INTERNO) ─────────────────────────────
    { codigo: "TUGR-2-PEAD", nombre: "Tubería Agua Negra Gris", medida: '4" x 3mts', origen: "INTERNO", catNombre: "Negro", peso: 2.20 },

    // ─── NIPLES AZUL (INTERNO) ───────────────────────────────────────────────
    { codigo: "NI-1/2-15",   nombre: "Niple Azul", medida: '1/2" x 15cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1/2-20",   nombre: "Niple Azul", medida: '1/2" x 20cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1/2-25",   nombre: "Niple Azul", medida: '1/2" x 25cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1/2-50",   nombre: "Niple Azul", medida: '1/2" x 50cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1/2-60",   nombre: "Niple Azul", medida: '1/2" x 60cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-3/4-15",   nombre: "Niple Azul", medida: '3/4" x 15cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-3/4-20",   nombre: "Niple Azul", medida: '3/4" x 20cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-3/4-25",   nombre: "Niple Azul", medida: '3/4" x 25cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-3/4-50",   nombre: "Niple Azul", medida: '3/4" x 50cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-3/4-60",   nombre: "Niple Azul", medida: '3/4" x 60cm',  origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1-15",     nombre: "Niple Azul", medida: '1" x 15cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1-20",     nombre: "Niple Azul", medida: '1" x 20cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1-25",     nombre: "Niple Azul", medida: '1" x 25cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1-50",     nombre: "Niple Azul", medida: '1" x 50cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1-60",     nombre: "Niple Azul", medida: '1" x 60cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1 1/2-15", nombre: "Niple Azul", medida: '1½" x 15cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1 1/2-20", nombre: "Niple Azul", medida: '1½" x 20cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1 1/2-25", nombre: "Niple Azul", medida: '1½" x 25cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1 1/2-50", nombre: "Niple Azul", medida: '1½" x 50cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-1 1/2-60", nombre: "Niple Azul", medida: '1½" x 60cm',   origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-2-15",     nombre: "Niple Azul", medida: '2" x 15cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-2-20",     nombre: "Niple Azul", medida: '2" x 20cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-2-25",     nombre: "Niple Azul", medida: '2" x 25cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-2-50",     nombre: "Niple Azul", medida: '2" x 50cm',    origen: "INTERNO", catNombre: "Azul", peso: null },
    { codigo: "NI-2-60",     nombre: "Niple Azul", medida: '2" x 60cm',    origen: "INTERNO", catNombre: "Azul", peso: null },

    // ─── CONEXIONES PVC INTERNAS (Darwin) ───────────────────────────────────
    { codigo: "CO-2-90", nombre: "Codo PVC", medida: '2" x 90°', origen: "INTERNO", catNombre: "Negro", peso: 0.12 },
    { codigo: "CO-4-90", nombre: "Codo PVC", medida: '4" x 90°', origen: "INTERNO", catNombre: "Negro", peso: 0.45 },

    // ─── CONEXIONES PVC EXTERNAS ─────────────────────────────────────────────
    { codigo: "CO-3-90",  nombre: "Codo PVC",          medida: '3" x 90°',  origen: "EXTERNO", catNombre: "Externo", peso: 0.28 },
    { codigo: "SC-2-45",  nombre: "Semi Codo PVC",      medida: '2" x 45°',  origen: "EXTERNO", catNombre: "Externo", peso: 0.10 },
    { codigo: "SC-3-45",  nombre: "Semi Codo PVC",      medida: '3" x 45°',  origen: "EXTERNO", catNombre: "Externo", peso: 0.22 },
    { codigo: "SC-4-45",  nombre: "Semi Codo PVC",      medida: '4" x 45°',  origen: "EXTERNO", catNombre: "Externo", peso: 0.40 },
    { codigo: "SI-2",     nombre: "Sifón PVC",           medida: '2"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.18 },
    { codigo: "SI-3",     nombre: "Sifón PVC",           medida: '3"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.35 },
    { codigo: "SI-4",     nombre: "Sifón PVC",           medida: '4"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.70 },
    { codigo: "TE-2",     nombre: "Tee PVC",             medida: '2"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.15 },
    { codigo: "TE-3",     nombre: "Tee PVC",             medida: '3"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.30 },
    { codigo: "TE-4",     nombre: "Tee PVC",             medida: '4"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.55 },
    { codigo: "YE-2",     nombre: "Yee PVC",             medida: '2"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.18 },
    { codigo: "YE-3",     nombre: "Yee PVC",             medida: '3"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.35 },
    { codigo: "YE-4",     nombre: "Yee PVC",             medida: '4"',        origen: "EXTERNO", catNombre: "Externo", peso: 0.65 },
    { codigo: "YR-4-2",   nombre: "Yee Reducida PVC",    medida: '4" a 2"',   origen: "EXTERNO", catNombre: "Externo", peso: 0.50 },

    // ─── MANGUERAS EXTERNAS ──────────────────────────────────────────────────
    { codigo: "MGVD-1/2",   nombre: "Manguera Verde Jardín",  medida: '1/2" x 100mts', origen: "EXTERNO", catNombre: "Externo", peso: null },
    { codigo: "MGVD-3/4",   nombre: "Manguera Verde Jardín",  medida: '3/4" x 100mts', origen: "EXTERNO", catNombre: "Externo", peso: null },
    { codigo: "MGAM-1/2",   nombre: "Manguera Gas Amarilla",  medida: '1/2" x 100mts', origen: "EXTERNO", catNombre: "Externo", peso: null },
  ];

  let creados = 0;
  let actualizados = 0;
  let omitidos = 0;

  for (const p of productos) {
    const existente = await prisma.producto.findFirst({
      where: { nombre: p.nombre, medida: p.medida },
    });
    if (existente) {
      if (!existente.codigo && p.codigo) {
        await prisma.producto.update({
          where: { id: existente.id },
          data: { codigo: p.codigo, pesoUnitarioKg: p.peso ?? existente.pesoUnitarioKg },
        });
        actualizados++;
      } else {
        omitidos++;
      }
    } else {
      await prisma.producto.create({
        data: {
          codigo: p.codigo,
          nombre: p.nombre,
          medida: p.medida,
          origen: p.origen as any,
          categoriaId: catId(p.catNombre),
          pesoUnitarioKg: p.peso,
        },
      });
      creados++;
    }
  }

  // ─── FERRETERÍA INFINITO — Lista ID 3 ────────────────────────────────────
  const preciosInfinito: { codigo?: string; nombre: string; medida: string; precio: number }[] = [
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

  let preciosInfinitoCount = 0;
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
      preciosInfinitoCount++;
    }
  }

  // ─── LISTA MADRE 2026 ─────────────────────────────────────────────────────
  let listaMadre = await prisma.listaPrecio.findFirst({
    where: { nombre: "Lista Madre 2026" },
  });
  if (!listaMadre) {
    listaMadre = await prisma.listaPrecio.create({
      data: { nombre: "Lista Madre 2026", activa: true },
    });
  }
  const lmId = listaMadre.id;

  // Prices from column L of Lista_Precios_Madre_2026_OJO.xlsx
  const preciosMadre: { codigo: string; precio: number }[] = [
    // Tubo Gris PVC
    { codigo: "TUGR-1/2",    precio: 3.1702 },
    { codigo: "TUGR-3/4",    precio: 4.8485 },
    { codigo: "TUGR-1",      precio: 5.9674 },
    // Tubo Azul Baja Presión 200Lbs
    { codigo: "TUAZ-1/2-B",  precio: 2.8272 },
    { codigo: "TUAZ-3/4-B",  precio: 4.1193 },
    // Tubo Azul Alta Presión 400Lbs
    { codigo: "TUAZ-1/2",    precio: 3.2051 },
    { codigo: "TUAZ-3/4",    precio: 4.9145 },
    { codigo: "TUAZ-1",      precio: 6.2160 },
    { codigo: "TUAZ-11/2",   precio: 13.5975 },
    { codigo: "TUAZ-2",      precio: 26.6400 },
    // Niples Azul
    { codigo: "NI-1/2-15",   precio: 0.2497 },
    { codigo: "NI-1/2-20",   precio: 0.3330 },
    { codigo: "NI-1/2-25",   precio: 0.4162 },
    { codigo: "NI-1/2-50",   precio: 0.8325 },
    { codigo: "NI-1/2-60",   precio: 0.9990 },
    { codigo: "NI-3/4-15",   precio: 0.3330 },
    { codigo: "NI-3/4-20",   precio: 0.4440 },
    { codigo: "NI-3/4-25",   precio: 0.5550 },
    { codigo: "NI-3/4-50",   precio: 1.1100 },
    { codigo: "NI-3/4-60",   precio: 1.3320 },
    { codigo: "NI-1-15",     precio: 0.5827 },
    { codigo: "NI-1-20",     precio: 0.7770 },
    { codigo: "NI-1-25",     precio: 0.9713 },
    { codigo: "NI-1-50",     precio: 1.9425 },
    { codigo: "NI-1-60",     precio: 2.3310 },
    { codigo: "NI-1 1/2-15", precio: 0.8491 },
    { codigo: "NI-1 1/2-20", precio: 1.1322 },
    { codigo: "NI-1 1/2-25", precio: 1.4152 },
    { codigo: "NI-1 1/2-50", precio: 2.8305 },
    { codigo: "NI-1 1/2-60", precio: 3.3966 },
    { codigo: "NI-2-15",     precio: 1.8814 },
    { codigo: "NI-2-20",     precio: 2.5086 },
    { codigo: "NI-2-25",     precio: 3.1358 },
    { codigo: "NI-2-50",     precio: 6.2715 },
    { codigo: "NI-2-60",     precio: 7.5258 },
    // Manguera Azul (rollo 100mts)
    { codigo: "MGAZ-1/2",    precio: 69.3750 },
    { codigo: "MGAZ-3/4",    precio: 91.5750 },
    { codigo: "MGAZ-1",      precio: 116.5500 },
    { codigo: "MGAZ-11/2",   precio: 277.5000 },
    { codigo: "MGAZ-2",      precio: 366.3000 },
    // Tubo Blanco Pesado
    { codigo: "TUBL-1/2-P",  precio: 0.6560 },
    { codigo: "TUBL-3/4-P",  precio: 0.8965 },
    { codigo: "TUBL-1-P",    precio: 1.8587 },
    { codigo: "TUBL-11/2-P", precio: 2.7334 },
    { codigo: "TUBL-2-P",    precio: 3.2800 },
    // Tubo Blanco Liviano
    { codigo: "TUBL-1/2",    precio: 0.6123 },
    { codigo: "TUBL-3/4",    precio: 0.8091 },
    { codigo: "TUBL-1",      precio: 1.5307 },
    { codigo: "TUBL-11/2",   precio: 2.7334 },
    { codigo: "TUBL-2",      precio: 3.2800 },
    // Tubo Negro Eléctrico
    { codigo: "TUNG-1/2",    precio: 0.3957 },
    { codigo: "TUNG-3/4",    precio: 0.4989 },
    { codigo: "TUNG-1",      precio: 0.8602 },
    { codigo: "TUNG-11/2",   precio: 1.2560 },
    { codigo: "TUNG-2",      precio: 1.6345 },
    // Curvas
    { codigo: "CVNG-1/2",    precio: 0.1369 },
    { codigo: "CVNG-3/4",    precio: 0.1498 },
    { codigo: "CVNG-1",      precio: 0.2517 },
    { codigo: "CVBL-1/2",    precio: 0.1648 },
    { codigo: "CVBL-3/4",    precio: 0.1786 },
    { codigo: "CVBL-1",      precio: 0.2797 },
    // Tubería Amarilla PEAD Económica
    { codigo: "TUAM-2-PEAD", precio: 2.5530 },
    { codigo: "TUAM-3-PEAD", precio: 3.8006 },
    { codigo: "TUAM-4-PEAD", precio: 6.0697 },
    { codigo: "TUGR-2-PEAD", precio: 5.8223 },
    { codigo: "TUAM-6-PEAD", precio: 18.0336 },
    // Tubería Amarilla PEAD Reforzada
    { codigo: "TUAM-2-PEAD-R", precio: 2.8858 },
    { codigo: "TUAM-3-PEAD-R", precio: 4.3286 },
    { codigo: "TUAM-4-PEAD-R", precio: 6.7334 },
    // Manguera Riego 60Lbs
    { codigo: "MGR-1/2-60",   precio: 14.4566 },
    { codigo: "MGR-3/4-60",   precio: 22.9992 },
    { codigo: "MGR-1-60",     precio: 36.4080 },
    { codigo: "MGR-11/2-60",  precio: 53.9904 },
    { codigo: "MGR-2-60",     precio: 77.2560 },
    { codigo: "MGR-21/2-60",  precio: 122.5440 },
    { codigo: "MGR-3-60",     precio: 163.4308 },
    { codigo: "MGR-4-60",     precio: 483.5160 },
    // Manguera Riego 90Lbs
    { codigo: "MGR-1/2-90",   precio: 17.7422 },
    { codigo: "MGR-3/4-90",   precio: 23.8206 },
    { codigo: "MGR-1-90",     precio: 39.7824 },
    { codigo: "MGR-11/2-90",  precio: 61.0944 },
    { codigo: "MGR-2-90",     precio: 89.6880 },
    { codigo: "MGR-21/2-90",  precio: 134.9760 },
    { codigo: "MGR-3-90",     precio: 222.0000 },
    { codigo: "MGR-4-90",     precio: 503.0520 },
    // Manguera Riego 150Lbs
    { codigo: "MGR-1/2-150",  precio: 21.1921 },
    { codigo: "MGR-3/4-150",  precio: 29.5704 },
    { codigo: "MGR-1-150",    precio: 49.7280 },
    { codigo: "MGR-11/2-150", precio: 71.2176 },
    { codigo: "MGR-2-150",    precio: 106.5600 },
    { codigo: "MGR-21/2-150", precio: 159.8400 },
    { codigo: "MGR-3-150",    precio: 239.0108 },
    { codigo: "MGR-4-150",    precio: 604.3950 },
  ];

  // Lista Gandica = lista predeterminada del cliente Gato Gandica
  // Buscarla por nombre para no hardcodear el ID
  const listaGandica = await prisma.listaPrecio.findFirst({
    where: { nombre: { contains: "Gandica", mode: "insensitive" } },
  });

  let preciosMadreCount = 0;
  for (const pm of preciosMadre) {
    const producto = await prisma.producto.findFirst({
      where: { codigo: pm.codigo },
    });
    if (producto) {
      // Carga en Lista Madre 2026
      await prisma.listaPrecioDetalle.upsert({
        where: { listaPrecioId_productoId: { listaPrecioId: lmId, productoId: producto.id } },
        update: { precioUnitario: pm.precio },
        create: { listaPrecioId: lmId, productoId: producto.id, precioUnitario: pm.precio },
      });
      // También carga en Lista Gandica (mismos precios "Primo Gato")
      if (listaGandica) {
        await prisma.listaPrecioDetalle.upsert({
          where: { listaPrecioId_productoId: { listaPrecioId: listaGandica.id, productoId: producto.id } },
          update: { precioUnitario: pm.precio },
          create: { listaPrecioId: listaGandica.id, productoId: producto.id, precioUnitario: pm.precio },
        });
      }
      preciosMadreCount++;
    }
  }

  res.json({
    mensaje: "Seed completado",
    productosCreados: creados,
    productosActualizados: actualizados,
    productosOmitidos: omitidos,
    preciosFerreteria: preciosInfinitoCount,
    preciosListaMadre: preciosMadreCount,
    preciosGandica: listaGandica ? preciosMadreCount : 0,
    listaMadreId: lmId,
  });
});
