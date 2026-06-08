import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ─── TABLAS FIJAS (fuente: archivos Excel de referencia) ──────────────────────

const COSTO_MAT_KG: Record<string, number> = {
  manguera34: 1.083, manguera13: 1.090,
  azul: 1.580, negro: 1.280, gris: 1.280, blanco: 1.580, amarillo: 1.590,
};

const GANANCIA_KG: Record<string, number> = {
  manguera34: 0.125, manguera13: 0.200,
  azul: 0.190, gris: 0.180,
  negro_elec: 0.260, blanco_elec: 0.350,
};

// Pesos de ganancia para tubería PEAD (Ganancias_1 — valores menores al sistema)
const PEAD_PESO_CODE: Record<string, number> = {
  "TUAM-2-PEAD": 0.85, "TUAM-3-PEAD": 1.2, "TUAM-4-PEAD": 2.25, "TUAM-6-PEAD": 5.5,
  "TUAM-2-PEAD-R": 1.0, "TUAM-4-PEAD-R": 1.55, "TUAM-3-PEAD-R": 2.45,
  "TUNA-4-PEAD-R": 2.9, "TUGR-2-PEAD": 2.2,
};

const PEAD_GANANCIA_RATE = 0.49;

const CURVA_COSTO_UNIT: Record<string, number> = {
  "CVBL-1/2": 0.144, "CVBL-3/4": 0.156, "CVBL-1": 0.240,
  "CVNG-1/2": 0.120, "CVNG-3/4": 0.132, "CVNG-1": 0.145,
};
const CURVA_TUBO_COSTO: Record<string, number> = {
  "CVBL-1/2": 0.57*0.92, "CVBL-3/4": 0.73*0.92, "CVBL-1": 1.18*0.92,
  "CVNG-1/2": 0.36*0.92, "CVNG-3/4": 0.45*0.92, "CVNG-1": 0.78*0.92,
};
const CURVA_MAT_FACTOR: Record<string, { kg: number; cKg: number }> = {
  "CVBL-1/2": { kg: 0.26, cKg: 1.583 }, "CVBL-3/4": { kg: 0.29, cKg: 1.583 }, "CVBL-1": { kg: 0.38, cKg: 1.583 },
  "CVNG-1/2": { kg: 0.22, cKg: 1.283 }, "CVNG-3/4": { kg: 0.28, cKg: 1.283 }, "CVNG-1": { kg: 0.35, cKg: 1.283 },
};

// ─── NORMALIZACIÓN ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/["""'']/g, '"').trim();
}

function normCodigo(c: string | null | undefined): string {
  return (c || "").trim().toUpperCase().replace(/\s+/g, "");
}

// ─── DETECCIÓN POR CÓDIGO (primer intento) ────────────────────────────────────

function catMatByCode(c: string): keyof typeof COSTO_MAT_KG | null {
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c))                   return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c))            return "azul";
  if (/^TUGR-1/.test(c))                 return "gris";   // Tubo Gris Agua Blanca (fabricado)
  if (/^TUNG/.test(c))                   return "negro";
  if (/^TUBL/.test(c))                   return "blanco";
  if (/^(TUAM|TUNA|TUGR-2)/.test(c))    return "amarillo";
  return null;
}

function catGanByCode(c: string): string | null {
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c))                   return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c))            return "azul";
  if (/^TUGR-1/.test(c))                 return "gris";
  if (/^TUNG/.test(c))                   return "negro_elec";
  if (/^TUBL/.test(c))                   return "blanco_elec";
  return null;
}

// ─── DETECCIÓN POR NOMBRE (fallback cuando no hay código) ─────────────────────

interface Deteccion {
  catMat: keyof typeof COSTO_MAT_KG | null;
  catGan: string | null;
  esPead: boolean;
  curvaKey: string | null;
  label: string;
}

/** Detecta el tipo de curva desde el nombre/medida del producto */
function curvaKeyFromNombre(nombre: string, medida: string): string {
  const full = norm(nombre + " " + medida);
  const blanca = full.includes("blanc");
  const is34   = full.includes("3/4");
  // detectar 1" (no 1/2 ni 11/2)
  const is1    = /\b1\s*"/.test(nombre + " " + medida) ||
                 (full.includes(" 1") && !full.includes("1/2") && !full.includes("11/2"));
  if (blanca) return is34 ? "CVBL-3/4" : is1 ? "CVBL-1" : "CVBL-1/2";
  return              is34 ? "CVNG-3/4" : is1 ? "CVNG-1" : "CVNG-1/2";
}

/** Peso de ganancia para PEAD inferido desde nombre/medida */
function pesoGananciaPeadFromNombre(nombre: string, medida: string, pesoUnitDB: number): number {
  // Primero devuelve el DB weight;
  // en versión futura se puede afinar con lookup de código
  const full = norm(nombre + " " + medida);
  const reforzado = full.includes("pesado") || full.includes("reforzad");
  const negra     = (full.includes("gris") || (full.includes("negr") && !full.includes("naranja")));
  const s6 = /6\s*["x]/.test(nombre + medida);
  const s4 = /4\s*["x]/.test(nombre + medida);
  const s3 = /3\s*["x]/.test(nombre + medida);
  // const s2 = /2\s*["x]/.test(nombre + medida);
  if (negra) { return s4 ? 2.2 : s3 ? 1.2 : 0.8; }
  if (reforzado) { return s4 ? 2.45 : s3 ? 1.55 : 1.0; }
  // Economico
  if (s6) return 5.5;
  if (s4) return 2.25;
  if (s3) return 1.2;
  return pesoUnitDB > 0 ? pesoUnitDB * 0.89 : 0.85; // aprox 89% del peso DB cuando no hay talla
}

function detectarPorNombre(nombre: string, medida: string, categoriaNombre: string): Deteccion {
  const full = norm(nombre + " " + medida + " " + categoriaNombre);

  // ── Curvas ──────────────────────────────────────────────────────────────────
  if (full.includes("curva") || full.includes("codo electr")) {
    const curvaKey = curvaKeyFromNombre(nombre, medida);
    return { catMat: null, catGan: null, esPead: false, curvaKey, label: `curva:${curvaKey}` };
  }

  // ── Aguas Negras / PEAD ─────────────────────────────────────────────────────
  if (full.includes("agua negra") || full.includes("aguas negras") || full.includes("pead") ||
      (full.includes("amarill") && full.includes("tuber")) ||
      (full.includes("naranja") && full.includes("tuber")) ||
      (full.includes("negra") && full.includes("tuber") && !full.includes("electr"))) {
    return { catMat: "amarillo", catGan: null, esPead: true, curvaKey: null, label: "pead/aguas negras" };
  }

  // ── Manguera Agrícola / Riego ───────────────────────────────────────────────
  if (full.includes("manguera") || full.includes("agricola") || full.includes("riego")) {
    // Si el nombre o medida incluye tamaños grandes (1" en adelante) → manguera13
    // Lookbehind negativo para no confundir "2" en "1/2" con tamaño "2 pulgadas"
    const grande = /(?<![/\d])(1\s*1\/2|2\s*1\/2|[23])\s*["x]/i.test(nombre + " " + medida) ||
                   (/(?<![/\d])1\s*["x]/i.test(nombre + " " + medida) && !/(1\/2|3\/4)/i.test(medida));
    const cat = grande ? "manguera13" : "manguera34";
    return { catMat: cat, catGan: cat, esPead: false, curvaKey: null, label: cat };
  }

  // ── Manguera Azul / Tubo Azul ───────────────────────────────────────────────
  if (full.includes("azul") && (full.includes("tubo") || full.includes("manguera") || full.includes("agua"))) {
    return { catMat: "azul", catGan: "azul", esPead: false, curvaKey: null, label: "azul" };
  }

  // ── Tubo Gris PVC (compra externa — excluir de costos de fabricación) ────────
  if (full.includes("gris") && full.includes("pvc")) {
    return { catMat: null, catGan: null, esPead: false, curvaKey: null, label: "gris-pvc (externo)" };
  }

  // ── Tubo Gris Agua Blanca (fabricado internamente) ─────────────────────────
  if (full.includes("gris") && (full.includes("agua") || full.includes("tubo") || full.includes("tuberia"))) {
    return { catMat: "gris", catGan: "gris", esPead: false, curvaKey: null, label: "gris" };
  }

  // ── Tubo Eléctrico Negro ────────────────────────────────────────────────────
  if (full.includes("electr") && (full.includes("negr") || full.includes("negro"))) {
    return { catMat: "negro", catGan: "negro_elec", esPead: false, curvaKey: null, label: "negro_elec" };
  }

  // ── Tubo Eléctrico Blanco ───────────────────────────────────────────────────
  if (full.includes("electr") && full.includes("blanc")) {
    return { catMat: "blanco", catGan: "blanco_elec", esPead: false, curvaKey: null, label: "blanco_elec" };
  }

  // ── Tubo Eléctrico sin color especificado ───────────────────────────────────
  if (full.includes("electr") && full.includes("tubo")) {
    return { catMat: "negro", catGan: "negro_elec", esPead: false, curvaKey: null, label: "negro_elec" };
  }

  return { catMat: null, catGan: null, esPead: false, curvaKey: null, label: "—" };
}

/** Aplica detección por código primero, luego por nombre */
function detectar(codigo: string | null, nombre: string, medida: string, catNombre: string): Deteccion {
  const c = normCodigo(codigo);
  if (c) {
    // Curva por código
    if (/^CV(BL|NG)/.test(c)) {
      const key = c.replace(/^CV/, "CV"); // normalize
      const ck = CURVA_COSTO_UNIT[c] ? c : curvaKeyFromNombre(nombre, medida);
      return { catMat: null, catGan: null, esPead: false, curvaKey: ck, label: `curva:${ck}` };
    }
    // PEAD por código
    if (/^(TUAM|TUNA|TUGR-2)/.test(c)) {
      return { catMat: "amarillo", catGan: null, esPead: true, curvaKey: null, label: "pead" };
    }
    // TUGR-1: si el nombre contiene "pvc" es compra externa (Tubo Gris PVC),
    // aunque tenga el código de Agua Blanca
    if (/^TUGR-1/.test(c)) {
      const nfull = norm(nombre + " " + medida + " " + catNombre);
      if (nfull.includes("pvc")) {
        return { catMat: null, catGan: null, esPead: false, curvaKey: null, label: "gris-pvc (externo)" };
      }
    }
    const catMat = catMatByCode(c);
    const catGan = catGanByCode(c);
    if (catMat || catGan) {
      return { catMat, catGan, esPead: false, curvaKey: null, label: catGan ?? catMat ?? "—" };
    }
  }
  // Sin código o sin match → detección por nombre
  return detectarPorNombre(nombre, medida, catNombre);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function gastosPorTotal(total: number) {
  if (total <= 8000)  return { obreros: 600,  pigmento: 100, electricidad: 100 };
  if (total <= 12000) return { obreros: 1000, pigmento: 200, electricidad: 200 };
  if (total <= 20000) return { obreros: 1200, pigmento: 250, electricidad: 250 };
  return               { obreros: 1500, pigmento: 300, electricidad: 300 };
}

function elegibleServicio(codigo: string | null, nombre: string): boolean {
  const c = normCodigo(codigo);
  if (c && /^(MGR|TUAZ|MGAZ|TUNG|TUBL)/.test(c)) return true;
  const n = norm(nombre);
  return n.includes("manguera") || (n.includes("azul") && n.includes("tubo")) ||
         (n.includes("negr") && n.includes("electr")) || (n.includes("blanc") && n.includes("electr"));
}

/** Detecta si un producto es "conexión" — excluido de Ganancias_2 */
function esConexion(codigo: string | null, nombre: string): boolean {
  const c = normCodigo(codigo);
  // Por código: Codo, Semi Codo, Sifón, Tee PVC, Yee, Yee Reducida
  if (c && /^(CO-|SC-|SI-|TE-|YE-|YR-)/.test(c)) return true;
  // Por nombre (productos sin código aún)
  const n = norm(nombre);
  return (
    n.includes("abrazadera") ||
    (n.includes("tee") && n.includes("rapid")) ||
    (n.includes("union") && n.includes("reduc")) ||
    (n.includes("union") && n.includes("rapid")) ||
    (n.includes("adaptador") && n.includes("macho")) ||
    (n.includes("adaptador") && n.includes("hembra")) ||
    n.includes("cajeti") ||
    n.includes("aspersor")
  );
}

// ─── CONTROLLER ──────────────────────────────────────────────────────────────

export async function calcular(req: Request, res: Response) {
  const id = Number(req.params.id);

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id },
    include: {
      lineas: {
        include: {
          producto: { include: { categoria: true } },
          cotizacion: {
          select: {
            id: true, totalNeto: true,
            vendedor: { select: { nombre: true } },
            cliente:  { select: { nombre: true, comisionTuberiaPct: true, comisionConexionesPct: true, fleteTuberiaPct: true, fleteConexionesPct: true } },
            lineas:   { select: { totalLinea: true, producto: { select: { codigo: true, nombre: true } } } },
          },
        },
        },
        orderBy: { id: "asc" },
      },
      facturas: {
        select: {
          totalNeto: true,
          lineas: {
            select: { totalLinea: true, productoId: true, producto: { select: { codigo: true, nombre: true } } },
          },
        },
      },
    },
  });

  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });

  const facturaTotal = despacho.facturas.reduce((s, f) => s + Number(f.totalNeto), 0);

  const kgMat: Record<string, number> = { manguera34: 0, manguera13: 0, azul: 0, negro: 0, gris: 0, blanco: 0, amarillo: 0 };
  const kgGan: Record<string, number> = { manguera34: 0, manguera13: 0, azul: 0, gris: 0, negro_elec: 0, blanco_elec: 0 };
  let gananciaPEAD = 0;
  const cantCurvas: Record<string, number> = {};

  const lineasDetalle = despacho.lineas.map((linea) => {
    const codigo    = linea.producto?.codigo ?? null;
    const nombre    = linea.producto?.nombre ?? "";
    const medida    = linea.producto?.medida ?? "";
    const catNombre = linea.producto?.categoria?.nombre ?? "";
    const cantidad  = Number(linea.cantidadDespachada);
    const pesoUnit  = Number(linea.producto?.pesoUnitarioKg ?? 0);
    const totalKg   = cantidad * pesoUnit;

    const det = detectar(codigo, nombre, medida, catNombre);
    // Productos EXTERNOS (compra directa) no acumulan kgMat/kgGan de fabricación
    const esExterno = linea.producto?.origen === "EXTERNO";

    if (!esExterno) {
      // Acumular material
      if (det.catMat) kgMat[det.catMat] = (kgMat[det.catMat] ?? 0) + totalKg;

      // Acumular ganancia general
      if (det.catGan) {
        kgGan[det.catGan] = (kgGan[det.catGan] ?? 0) + totalKg;
      } else if (det.esPead) {
        const c = normCodigo(codigo);
        const pesoGan = (c && PEAD_PESO_CODE[c]) ? PEAD_PESO_CODE[c]
                      : pesoGananciaPeadFromNombre(nombre, medida, pesoUnit);
        gananciaPEAD += cantidad * pesoGan * PEAD_GANANCIA_RATE;
      }

      // Acumular curvas
      if (det.curvaKey) {
        cantCurvas[det.curvaKey] = (cantCurvas[det.curvaKey] ?? 0) + cantidad;
      }
    }

    return {
      id: linea.id, codigo, nombre, medida, cantidad,
      pesoUnitKg: pesoUnit, totalKg,
      esExterno,
      catDetectada: esExterno ? `externo` : det.label,
      catMat: det.catMat, esPead: det.esPead, curvaKey: det.curvaKey,
      esServicioExterno: (linea as any).esServicioExterno ?? false,
      costoServicioExterno: Number((linea as any).costoServicioExterno ?? 0),
      elegibleServicio: elegibleServicio(codigo, nombre),
    };
  });

  // ── Costos de materia prima ────────────────────────────────────────────────
  const costoMateria: Record<string, { kg: number; rate: number; costo: number }> = {};
  let totalCostoMateria = 0;
  for (const [cat, kg] of Object.entries(kgMat)) {
    const rate = COSTO_MAT_KG[cat] ?? 0;
    const costo = kg * rate;
    costoMateria[cat] = { kg, rate, costo };
    totalCostoMateria += costo;
  }

  // ── Curvas ────────────────────────────────────────────────────────────────
  let curvaTotalVenta = 0, curvaFabrica = 0, curvaMaterial = 0;
  const curvasDetalle: { clave: string; cantidad: number; costoUnit: number; subtotal: number }[] = [];
  for (const [clave, qty] of Object.entries(cantCurvas)) {
    const cu   = CURVA_COSTO_UNIT[clave] ?? 0;
    const tc   = CURVA_TUBO_COSTO[clave] ?? 0;
    const mf   = CURVA_MAT_FACTOR[clave];
    const sub  = qty * cu;
    curvaFabrica    += (qty / 11.5) * tc;
    if (mf) curvaMaterial += (qty / 11.5) * mf.kg * mf.cKg;
    curvaTotalVenta += sub;
    curvasDetalle.push({ clave, cantidad: qty, costoUnit: cu, subtotal: sub });
  }
  const curvaMuchachas = curvaTotalVenta - curvaFabrica;
  const curvaAlberto   = curvaFabrica - curvaMaterial;

  // ── Gastos generales ──────────────────────────────────────────────────────
  const gastos = gastosPorTotal(facturaTotal);

  // ── Ganancia general I25 / I26 ────────────────────────────────────────────
  const gananciaDesglose: { cat: string; kg: number; rate: number; ganancia: number }[] = [];
  let totalGananciaGeneral = 0;
  for (const [cat, kg] of Object.entries(kgGan)) {
    const rate = GANANCIA_KG[cat] ?? 0;
    const ganancia = kg * rate;
    gananciaDesglose.push({ cat, kg, rate, ganancia });
    totalGananciaGeneral += ganancia;
  }
  const srAlbertoGral = totalGananciaGeneral * 0.6;
  const capital       = totalGananciaGeneral * 0.4;

  // ── Ganancia Aguas Negras H47 ─────────────────────────────────────────────
  const srAlbertoAmarillo = gananciaPEAD * 0.42;
  const dannyAmarillo     = gananciaPEAD * 0.33;
  const darwinAmarillo    = gananciaPEAD * 0.25;

  // ── Ganancias_2 (excluye conexiones) ─────────────────────────────────────
  // Suma de FacturaLineas excluyendo productos tipo conexión
  let totalSinConexiones = 0;
  let totalConexiones = 0;
  for (const factura of despacho.facturas) {
    for (const fl of (factura as any).lineas ?? []) {
      const monto = Number(fl.totalLinea);
      if (esConexion(fl.producto?.codigo ?? null, fl.producto?.nombre ?? "")) {
        totalConexiones += monto;
      } else {
        totalSinConexiones += monto;
      }
    }
  }
  const x = totalSinConexiones;
  const sbug      = x - x / 1.015;
  const yolanda   = x - x / 1.0075;
  const sandra    = x - x / 1.0075;
  const comisiones = x - x / 1.022;

  // ── Servicios externos ────────────────────────────────────────────────────
  const servicioExterno = lineasDetalle
    .filter((l) => l.esServicioExterno)
    .map((l) => ({ lineaId: l.id, nombre: `${l.nombre} ${l.medida}`.trim(), costo: l.costoServicioExterno }));

  // ── Comisiones por cliente (misma fórmula que muestra NuevaCotizacion) ──────
  // Se calcula por cotización única: tubería × ctPct/(100+ctPct) + conexiones × ccPct/(100+ccPct)
  const cotizacionesVistas = new Set<number>();
  interface ComisionItem { clienteNombre: string; vendedorNombre: string; ctPct: number; ccPct: number; totalTuberia: number; totalConexiones: number; monto: number; }
  const comisionesVendedores: ComisionItem[] = [];

  for (const linea of despacho.lineas) {
    const cot = (linea as any).cotizacion;
    if (!cot || cotizacionesVistas.has(cot.id)) continue;
    cotizacionesVistas.add(cot.id);

    const ctPct = Number(cot.cliente?.comisionTuberiaPct ?? 0);
    const ccPct = Number(cot.cliente?.comisionConexionesPct ?? 0);
    if (ctPct + ccPct === 0) continue;

    let totalTuberia = 0, totalConexiones = 0;
    for (const cl of (cot.lineas ?? []) as any[]) {
      const monto = Number(cl.totalLinea ?? 0);
      if (esConexion(cl.producto?.codigo ?? null, cl.producto?.nombre ?? "")) {
        totalConexiones += monto;
      } else {
        totalTuberia += monto;
      }
    }

    const monto =
      (ctPct > 0 ? totalTuberia  * ctPct / (100 + ctPct) : 0) +
      (ccPct > 0 ? totalConexiones * ccPct / (100 + ccPct) : 0);

    if (monto > 0) {
      comisionesVendedores.push({
        clienteNombre:  cot.cliente?.nombre  ?? `Cot #${cot.id}`,
        vendedorNombre: cot.vendedor?.nombre ?? "—",
        ctPct, ccPct, totalTuberia, totalConexiones, monto,
      });
    }
  }
  const totalComisionVendedores = comisionesVendedores.reduce((s, c) => s + c.monto, 0);

  // ── Flete por cliente (misma fórmula que NuevaCotizacion) ─────────────────
  interface FleteItem { clienteNombre: string; ftPct: number; fcPct: number; totalTuberia: number; totalConexiones: number; monto: number; }
  const fletesCliente: FleteItem[] = [];
  const cotVistasF = new Set<number>();

  for (const linea of despacho.lineas) {
    const cot = (linea as any).cotizacion;
    if (!cot || cotVistasF.has(cot.id)) continue;
    cotVistasF.add(cot.id);

    const ftPct = Number(cot.cliente?.fleteTuberiaPct ?? 0);
    const fcPct = Number(cot.cliente?.fleteConexionesPct ?? 0);
    if (ftPct + fcPct === 0) continue;

    let totalTuberia = 0, totalConexiones = 0;
    for (const cl of (cot.lineas ?? []) as any[]) {
      const monto = Number(cl.totalLinea ?? 0);
      if (esConexion(cl.producto?.codigo ?? null, cl.producto?.nombre ?? "")) {
        totalConexiones += monto;
      } else {
        totalTuberia += monto;
      }
    }

    const monto =
      (ftPct > 0 ? totalTuberia  * ftPct / (100 + ftPct) : 0) +
      (fcPct > 0 ? totalConexiones * fcPct / (100 + fcPct) : 0);

    if (monto > 0) {
      fletesCliente.push({
        clienteNombre: cot.cliente?.nombre ?? `Cot #${cot.id}`,
        ftPct, fcPct, totalTuberia, totalConexiones, monto,
      });
    }
  }
  const totalFlete = fletesCliente.reduce((s, f) => s + f.monto, 0);

  // ── Extra de material (fondo reserva) ────────────────────────────────────
  // = Venta total − costos identificados − ganancias distribuidas
  // curvaTotalVenta ya engloba curvaMaterial + curvaAlberto + curvaMuchachas
  const gastosTotal = gastos.obreros + gastos.pigmento + gastos.electricidad;
  const g2Sum = sbug + yolanda + sandra + comisiones;
  const extraMaterial = facturaTotal
    - totalCostoMateria
    - curvaTotalVenta
    - gastosTotal
    - totalGananciaGeneral
    - gananciaPEAD
    - g2Sum
    - totalComisionVendedores
    - totalFlete;

  res.json({
    despacho: { id: despacho.id, numero: despacho.numero },
    facturaTotal,
    costoMateria: { ...costoMateria, total: totalCostoMateria },
    gastos: { ...gastos, total: gastos.obreros + gastos.pigmento + gastos.electricidad },
    curvas: {
      detalle: curvasDetalle,
      totalVenta: curvaTotalVenta,
      costoMaterial: curvaMaterial,
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
    ganancias2: { base: totalSinConexiones, conexionesExcluidas: totalConexiones, sbug, yolanda, sandra, comisiones },
    comisionesVendedores: { detalle: comisionesVendedores, total: totalComisionVendedores },
    fletesCliente: { detalle: fletesCliente, total: totalFlete },
    extraMaterial,
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
