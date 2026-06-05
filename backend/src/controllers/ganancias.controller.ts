import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ─── TABLAS FIJAS (fuente: archivos Excel de referencia) ──────────────────────

// Costo por kg según material (Costos_de_cada_producto_y_pesos, fila 69)
const COSTO_KG: Record<string, number> = {
  manguera34: 1.083,
  manguera13: 1.090,
  azul:       1.580,
  negro:      1.280,
  blanco:     1.580,
  amarillo:   1.590,
};

// Ganancia por kg para categorías generales (Ganancias_1)
const GANANCIA_KG: Record<string, number> = {
  manguera34: 0.125,
  manguera13: 0.200,
  azul:       0.190,
  gris:       0.180,
  negro_elec: 0.260,
  blanco_elec: 0.350,
};

// Pesos (kg/unidad) para tubería aguas negras en cálculo de ganancia
// (Ganancias_1 — valores menores a los del sistema para cálculo de utilidad)
const PEAD_PESO_GANANCIA: Record<string, number> = {
  "TUAM-2-PEAD":   0.85,
  "TUAM-3-PEAD":   1.20,
  "TUAM-4-PEAD":   2.25,
  "TUAM-6-PEAD":   5.50,
  "TUAM-2-PEAD-R": 1.00,
  "TUAM-4-PEAD-R": 1.55,
  "TUAM-3-PEAD-R": 2.45,
  "TUNA-4-PEAD-R": 2.90,
  "TUGR-2-PEAD":   2.20,
};
const PEAD_GANANCIA_RATE = 0.49;

// Costos de curvas (Costos_y_analisis_de_las_curvas)
const CURVA_COSTO_UNIT: Record<string, number> = {
  "CVBL-1/2": 0.144, "CVBL-3/4": 0.156, "CVBL-1": 0.240,
  "CVNG-1/2": 0.120, "CVNG-3/4": 0.132, "CVNG-1": 0.145,
};
const CURVA_TUBO_COSTO: Record<string, number> = {
  "CVBL-1/2": 0.57 * 0.92, "CVBL-3/4": 0.73 * 0.92, "CVBL-1": 1.18 * 0.92,
  "CVNG-1/2": 0.36 * 0.92, "CVNG-3/4": 0.45 * 0.92, "CVNG-1": 0.78 * 0.92,
};
const CURVA_MAT_FACTOR: Record<string, { kg: number; costoPorKg: number }> = {
  "CVBL-1/2": { kg: 0.26, costoPorKg: 1.583 },
  "CVBL-3/4": { kg: 0.29, costoPorKg: 1.583 },
  "CVBL-1":   { kg: 0.38, costoPorKg: 1.583 },
  "CVNG-1/2": { kg: 0.22, costoPorKg: 1.283 },
  "CVNG-3/4": { kg: 0.28, costoPorKg: 1.283 },
  "CVNG-1":   { kg: 0.35, costoPorKg: 1.283 },
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function normCodigo(c: string | null | undefined): string {
  return (c || "").trim().toUpperCase();
}

// Categoría de COSTO DE MATERIAL según código de producto
function categoriaMateria(codigo: string): keyof typeof COSTO_KG | null {
  const c = normCodigo(codigo);
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c))                   return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c))            return "azul";
  if (/^TUGR-1\/2/.test(c))              return "negro";   // Tubo Gris Agua Blanca → costo negro
  if (/^TUNG/.test(c))                   return "negro";
  if (/^TUBL/.test(c))                   return "blanco";
  if (/^(TUAM|TUNA|TUGR-2)/.test(c))    return "amarillo";
  return null;
}

// Categoría de GANANCIA para productos generales (manguera, eléctrica, agua blanca)
function categoriaGanancia(codigo: string): string | null {
  const c = normCodigo(codigo);
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c))                   return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c))            return "azul";
  if (/^TUGR-1\/2/.test(c))              return "gris";
  if (/^TUNG/.test(c))                   return "negro_elec";
  if (/^TUBL/.test(c))                   return "blanco_elec";
  return null;
}

function esPEAD(codigo: string): boolean {
  const c = normCodigo(codigo);
  return /^(TUAM|TUNA|TUGR-2)/.test(c);
}

function esCurva(codigo: string): boolean {
  return /^CV(BL|NG)/.test(normCodigo(codigo));
}

// Categorías habilitadas para servicio externo de fabricación
function elegibleServicioExterno(codigo: string): boolean {
  const c = normCodigo(codigo);
  return /^(MGR|TUAZ|MGAZ|TUNG|TUBL)/.test(c);
}

// Gastos generales según total factura
function gastosPorTotal(total: number) {
  if (total <= 8000)  return { obreros: 600,  pigmento: 100, electricidad: 100 };
  if (total <= 12000) return { obreros: 1000, pigmento: 200, electricidad: 200 };
  if (total <= 20000) return { obreros: 1200, pigmento: 250, electricidad: 250 };
  return               { obreros: 1500, pigmento: 300, electricidad: 300 };
}

// ─── CONTROLLER ──────────────────────────────────────────────────────────────

export async function calcular(req: Request, res: Response) {
  const id = Number(req.params.id);

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id },
    include: {
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { id: "asc" },
      },
      facturas: { select: { totalNeto: true } },
    },
  });

  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });

  const facturaTotal = despacho.facturas.reduce((s, f) => s + Number(f.totalNeto), 0);

  // Acumuladores por categoría de material
  const kgMat: Record<string, number> = {
    manguera34: 0, manguera13: 0, azul: 0, negro: 0, blanco: 0, amarillo: 0,
  };
  // Acumuladores de kg para ganancia general (I25/I26)
  const kgGan: Record<string, number> = {
    manguera34: 0, manguera13: 0, azul: 0, gris: 0, negro_elec: 0, blanco_elec: 0,
  };

  let gananciaPEAD = 0; // base para H47

  // Cantidades de curvas
  const cantCurvas: Record<string, number> = {};

  // Detalle de líneas para respuesta
  const lineasDetalle = despacho.lineas.map((linea) => {
    const codigo = linea.producto?.codigo ?? "";
    const cantidad = Number(linea.cantidadDespachada);
    const pesoUnit = Number(linea.producto?.pesoUnitarioKg ?? 0);
    const totalKg = cantidad * pesoUnit;

    // Material cost kg
    const catMat = categoriaMateria(codigo);
    if (catMat) kgMat[catMat] = (kgMat[catMat] ?? 0) + totalKg;

    // Ganancia kg o PEAD
    const catGan = categoriaGanancia(codigo);
    if (catGan) {
      kgGan[catGan] = (kgGan[catGan] ?? 0) + totalKg;
    } else if (esPEAD(codigo)) {
      const pesoGan = PEAD_PESO_GANANCIA[normCodigo(codigo)] ?? pesoUnit;
      gananciaPEAD += cantidad * pesoGan * PEAD_GANANCIA_RATE;
    }

    // Curvas
    if (esCurva(codigo)) {
      const key = normCodigo(codigo);
      cantCurvas[key] = (cantCurvas[key] ?? 0) + cantidad;
    }

    return {
      id: linea.id,
      codigo,
      nombre: linea.producto?.nombre ?? "",
      medida: linea.producto?.medida ?? "",
      cantidad,
      pesoUnitKg: pesoUnit,
      totalKg,
      categoriaMat: catMat,
      esServicioExterno: (linea as any).esServicioExterno ?? false,
      costoServicioExterno: Number((linea as any).costoServicioExterno ?? 0),
      elegibleServicio: elegibleServicioExterno(codigo),
    };
  });

  // ── Costos de materia prima ────────────────────────────────────────────────
  const costoMateria: Record<string, { kg: number; costo: number }> = {};
  let totalCostoMateria = 0;
  for (const [cat, kg] of Object.entries(kgMat)) {
    const rate = COSTO_KG[cat] ?? 0;
    const costo = kg * rate;
    costoMateria[cat] = { kg, costo };
    totalCostoMateria += costo;
  }

  // ── Curvas ────────────────────────────────────────────────────────────────
  let curvaTotalVenta = 0, curvaFabrica = 0, curvaMaterial = 0;
  for (const [cod, qty] of Object.entries(cantCurvas)) {
    curvaTotalVenta += qty * (CURVA_COSTO_UNIT[cod] ?? 0);
    curvaFabrica    += (qty / 11.5) * (CURVA_TUBO_COSTO[cod] ?? 0);
    const mf = CURVA_MAT_FACTOR[cod];
    if (mf) curvaMaterial += (qty / 11.5) * mf.kg * mf.costoPorKg;
  }
  const curvaMuchachas = curvaTotalVenta - curvaFabrica;
  const curvaAlberto   = curvaFabrica - curvaMaterial;

  // ── Gastos generales ──────────────────────────────────────────────────────
  const gastos = gastosPorTotal(facturaTotal);

  // ── Ganancia general (I25 = Sr. Alberto Gral, I26 = Capital) ─────────────
  let totalGananciaGeneral = 0;
  const gananciaDesglose: { cat: string; kg: number; rate: number; ganancia: number }[] = [];
  for (const [cat, kg] of Object.entries(kgGan)) {
    const rate = GANANCIA_KG[cat] ?? 0;
    const ganancia = kg * rate;
    gananciaDesglose.push({ cat, kg, rate, ganancia });
    totalGananciaGeneral += ganancia;
  }
  const srAlbertoGral = totalGananciaGeneral * 0.6; // I25
  const capital       = totalGananciaGeneral * 0.4; // I26

  // ── Ganancia aguas negras (H47 → Alberto/Danny/Darwin) ───────────────────
  const srAlbertoAmarillo = gananciaPEAD * 0.42;
  const dannyAmarillo     = gananciaPEAD * 0.33;
  const darwinAmarillo    = gananciaPEAD * 0.25;

  // ── Ganancias_2 (fórmula: x - x / (1 + pct)) ────────────────────────────
  const x = facturaTotal;
  const sbug      = x - x / 1.015;
  const yolanda   = x - x / 1.0075;
  const sandra    = x - x / 1.0075;
  const comisiones = x - x / 1.022;

  // ── Servicio externo ──────────────────────────────────────────────────────
  const servicioExterno = lineasDetalle
    .filter((l) => l.esServicioExterno)
    .map((l) => ({ lineaId: l.id, nombre: `${l.nombre} ${l.medida}`.trim(), costo: l.costoServicioExterno }));

  res.json({
    despacho: { id: despacho.id, numero: despacho.numero },
    facturaTotal,
    costoMateria: { ...costoMateria, total: totalCostoMateria },
    gastos: { ...gastos, total: gastos.obreros + gastos.pigmento + gastos.electricidad },
    curvas: {
      totalVenta: curvaTotalVenta,
      pagoFabrica: curvaFabrica,
      pagoMuchachas: curvaMuchachas,
      gananciaAlberto: curvaAlberto,
    },
    gananciaGeneral: {
      desglose: gananciaDesglose,
      total: totalGananciaGeneral,
      srAlbertoGral,
      capital,
    },
    gananciaAguasNegras: {
      total: gananciaPEAD,
      srAlbertoAmarillo,
      dannyAmarillo,
      darwinAmarillo,
    },
    ganancias2: { sbug, yolanda, sandra, comisiones },
    servicioExterno,
    lineas: lineasDetalle,
  });
}

export async function actualizarServicioExterno(req: Request, res: Response) {
  const lineaId = Number(req.params.lineaId);
  const { esServicioExterno, costoServicioExterno } = req.body;

  await prisma.despachoLinea.update({
    where: { id: lineaId },
    data: {
      esServicioExterno: Boolean(esServicioExterno),
      costoServicioExterno: esServicioExterno ? Number(costoServicioExterno ?? 0) : null,
    },
  });

  res.json({ ok: true });
}
