import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ─── COSTOS FIJOS ────────────────────────────────────────────────────────────
const COSTO_MAT_KG: Record<string, number> = {
  manguera34: 1.083, manguera13: 1.090,
  azul: 1.580, negro: 1.280, gris: 1.280, blanco: 1.580, amarillo: 1.590,
};
const GANANCIA_KG: Record<string, number> = {
  manguera34: 0.125, manguera13: 0.200,
  azul: 0.190, gris: 0.180, negro_elec: 0.260, blanco_elec: 0.350,
};
const PEAD_PESO_CODE: Record<string, number> = {
  "TUAM-2-PEAD": 0.85, "TUAM-3-PEAD": 1.2, "TUAM-4-PEAD": 2.25, "TUAM-6-PEAD": 5.5,
  "TUAM-2-PEAD-R": 1.0, "TUAM-4-PEAD-R": 1.55, "TUAM-3-PEAD-R": 2.45,
  "TUNA-4-PEAD-R": 2.9, "TUGR-2-PEAD": 2.2,
};
const CURVA_COSTO_UNIT: Record<string, number> = {
  "CVBL-1/2": 0.144, "CVBL-3/4": 0.156, "CVBL-1": 0.240,
  "CVNG-1/2": 0.120, "CVNG-3/4": 0.132, "CVNG-1": 0.145,
};
const CURVA_TUBO_COSTO: Record<string, number> = {
  "CVBL-1/2": 0.57 * 0.92, "CVBL-3/4": 0.73 * 0.92, "CVBL-1": 1.18 * 0.92,
  "CVNG-1/2": 0.36 * 0.92, "CVNG-3/4": 0.45 * 0.92, "CVNG-1": 0.78 * 0.92,
};
const CURVA_MAT_FACTOR: Record<string, { kg: number; cKg: number }> = {
  "CVBL-1/2": { kg: 0.26, cKg: 1.583 }, "CVBL-3/4": { kg: 0.29, cKg: 1.583 }, "CVBL-1": { kg: 0.38, cKg: 1.583 },
  "CVNG-1/2": { kg: 0.22, cKg: 1.283 }, "CVNG-3/4": { kg: 0.28, cKg: 1.283 }, "CVNG-1": { kg: 0.35, cKg: 1.283 },
};
const CODO_COSTO_FABRICA: Record<string, number> = { "CO-2": 0.38, "CO-4": 1.90 };

// ─── HELPERS ────────────────────────────────────────────────────────────────

function norm(s: string) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/["""'']/g, '"').trim();
}
function normCod(c: string | null | undefined) {
  return (c || "").trim().toUpperCase().replace(/\s+/g, "");
}

function esConexion(codigo: string | null, nombre: string): boolean {
  const c = normCod(codigo);
  if (c && /^(CO-|SC-|SI-|TE-|YE-|YR-)/.test(c)) return true;
  const n = norm(nombre);
  return n.includes("abrazadera") || (n.includes("tee") && n.includes("rapid")) ||
    (n.includes("union") && (n.includes("reduc") || n.includes("rapid"))) ||
    (n.includes("adaptador") && (n.includes("macho") || n.includes("hembra"))) ||
    n.includes("cajeti") || n.includes("aspersor");
}

function catMatByCode(c: string): string | null {
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c)) return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c)) return "azul";
  if (/^TUGR-1/.test(c)) return "gris";   // Tubo Gris Agua Blanca — separado de negro
  if (/^TUNG/.test(c)) return "negro";
  if (/^TUBL/.test(c)) return "blanco";
  if (/^(TUAM|TUNA|TUGR-2)/.test(c)) return "amarillo";
  return null;
}
function catGanByCode(c: string): string | null {
  if (/^MGR-(3\/8|1\/2|3\/4)/.test(c)) return "manguera34";
  if (/^MGR-/.test(c)) return "manguera13";
  if (/^(MGAZ|TUAZ)/.test(c)) return "azul";
  if (/^TUGR-1/.test(c)) return "gris";
  if (/^TUNG/.test(c)) return "negro_elec";
  if (/^TUBL/.test(c)) return "blanco_elec";
  return null;
}

function gastosPorTotal(total: number) {
  if (total <= 8000) return { obreros: 600, pigmento: 100, electricidad: 100 };
  if (total <= 12000) return { obreros: 1000, pigmento: 200, electricidad: 200 };
  if (total <= 20000) return { obreros: 1200, pigmento: 250, electricidad: 250 };
  return { obreros: 1500, pigmento: 300, electricidad: 300 };
}

/** Parsea longitud del niple desde medida, ej: "1/2\" x 15cm" → 15 */
function nipleLengthCm(medida: string): number {
  const m = medida.match(/x\s*(\d+)\s*cm/i);
  return m ? parseInt(m[1]) : 20;
}

/** Extrae diámetro del niple, ej: "1/2\" x 15cm" → "1/2" */
function nipleDiameter(medida: string): string {
  const m = medida.match(/^([\d\s/]+)"?/);
  return m ? m[1].trim() : "1/2";
}

// ─── DETECCIÓN POR NOMBRE (para productos sin código en DB) ─────────────────

function curvaKeyFromNombreB(nombre: string, medida: string): string {
  const full = norm(nombre + " " + medida);
  const blanca = full.includes("blanc");
  const is34   = full.includes("3/4");
  const is1    = /\b1\s*"/.test(nombre + " " + medida) ||
                 (full.includes(" 1") && !full.includes("1/2") && !full.includes("11/2"));
  if (blanca) return is34 ? "CVBL-3/4" : is1 ? "CVBL-1" : "CVBL-1/2";
  return              is34 ? "CVNG-3/4" : is1 ? "CVNG-1" : "CVNG-1/2";
}

function pesoGananciaPead(codigo: string | null, nombre: string, medida: string, pesoUnitDB: number): number {
  const c = normCod(codigo);
  if (c && PEAD_PESO_CODE[c]) return PEAD_PESO_CODE[c];
  const full = norm(nombre + " " + medida);
  const reforzado = full.includes("pesado") || full.includes("reforzad");
  const negra     = full.includes("gris") || (full.includes("negr") && !full.includes("naranja"));
  const s6 = /6\s*["x]/.test(nombre + medida);
  const s4 = /4\s*["x]/.test(nombre + medida);
  const s3 = /3\s*["x]/.test(nombre + medida);
  if (negra)     return s4 ? 2.2  : s3 ? 1.2  : 0.8;
  if (reforzado) return s4 ? 2.45 : s3 ? 1.55 : 1.0;
  if (s6) return 5.5;
  if (s4) return 2.25;
  if (s3) return 1.2;
  return pesoUnitDB > 0 ? pesoUnitDB * 0.89 : 0.85;
}

interface DetB { catMat: string | null; catGan: string | null; esPead: boolean; curvaKey: string | null }

/** Detecta categoría por código primero, luego por nombre (fallback para productos sin código) */
function detectar(codigo: string | null, nombre: string, medida: string, catNombre: string): DetB {
  const c = normCod(codigo);
  // Manguera Verde y codos se manejan por separado fuera de este detector
  if (c && (/^MGVD/.test(c) || /^CO-[24]/.test(c)))
    return { catMat: null, catGan: null, esPead: false, curvaKey: null };
  if (c) {
    if (/^CV(BL|NG)/.test(c)) {
      const ck = CURVA_COSTO_UNIT[c] ? c : curvaKeyFromNombreB(nombre, medida);
      return { catMat: null, catGan: null, esPead: false, curvaKey: ck };
    }
    if (/^(TUAM|TUNA|TUGR-2)/.test(c))
      return { catMat: "amarillo", catGan: null, esPead: true, curvaKey: null };
    const catM = catMatByCode(c);
    const catG = catGanByCode(c);
    if (catM || catG) return { catMat: catM, catGan: catG, esPead: false, curvaKey: null };
  }
  // Sin código (o sin match) → detectar por nombre
  const full = norm(nombre + " " + medida + " " + catNombre);
  if (full.includes("curva") || full.includes("codo electr"))
    return { catMat: null, catGan: null, esPead: false, curvaKey: curvaKeyFromNombreB(nombre, medida) };
  if (full.includes("agua negra") || full.includes("aguas negras") || full.includes("pead") ||
      (full.includes("amarill") && full.includes("tuber")) ||
      (full.includes("naranja") && full.includes("tuber")) ||
      (full.includes("negra") && full.includes("tuber") && !full.includes("electr")))
    return { catMat: "amarillo", catGan: null, esPead: true, curvaKey: null };
  if (full.includes("manguera") || full.includes("agricola") || full.includes("riego")) {
    const verde = full.includes("verde"); // Manguera verde = compra externa, no suma a kgMat
    if (verde) return { catMat: null, catGan: null, esPead: false, curvaKey: null };
    const grande = /(?<![/\d])(1\s*1\/2|2\s*1\/2|[23])\s*["x]/i.test(nombre + " " + medida) ||
                   (/(?<![/\d])1\s*["x]/i.test(nombre + " " + medida) && !/(1\/2|3\/4)/i.test(medida));
    const cat = grande ? "manguera13" : "manguera34";
    return { catMat: cat, catGan: cat, esPead: false, curvaKey: null };
  }
  if (full.includes("azul") && (full.includes("tubo") || full.includes("manguera") || full.includes("agua")))
    return { catMat: "azul", catGan: "azul", esPead: false, curvaKey: null };
  if (full.includes("gris") && (full.includes("agua") || full.includes("tubo")))
    return { catMat: "gris", catGan: "gris", esPead: false, curvaKey: null };
  if (full.includes("electr") && (full.includes("negr") || full.includes("negro")))
    return { catMat: "negro", catGan: "negro_elec", esPead: false, curvaKey: null };
  if (full.includes("electr") && full.includes("blanc"))
    return { catMat: "blanco", catGan: "blanco_elec", esPead: false, curvaKey: null };
  if (full.includes("electr") && full.includes("tubo"))
    return { catMat: "negro", catGan: "negro_elec", esPead: false, curvaKey: null };
  return { catMat: null, catGan: null, esPead: false, curvaKey: null };
}

// ─── CÁLCULO PRINCIPAL ──────────────────────────────────────────────────────

async function calcularDesdeDespacho(despachoId: number) {
  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: despachoId },
    include: {
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { id: "asc" },
      },
      facturas: {
        include: {
          cliente: {
            select: {
              fleteTuberiaPct: true, fleteConexionesPct: true,
              comisionTuberiaPct: true, comisionConexionesPct: true,
            },
          },
          lineas: {
            include: {
              producto: { select: { id: true, codigo: true, nombre: true, medida: true, pesoUnitarioKg: true } },
            },
          },
        },
      },
    },
  });
  if (!despacho) throw new Error("Despacho no encontrado");

  const facturaTotal = despacho.facturas.reduce((s, f) => s + Number(f.totalNeto), 0);
  const gastos = gastosPorTotal(facturaTotal);

  // ── Material (kg × cost) ─────────────────────────────────────────────────
  const kgMat: Record<string, number> = { manguera34: 0, manguera13: 0, azul: 0, negro: 0, gris: 0, blanco: 0, amarillo: 0 };
  const kgGan: Record<string, number> = { manguera34: 0, manguera13: 0, azul: 0, gris: 0, negro_elec: 0, blanco_elec: 0 };
  let gananciaPEAD = 0;
  const cantCurvas: Record<string, number> = {};
  let hayMangueraVerde = false;
  let totalMangueraVerde = 0;
  const codoCant: Record<string, number> = {};
  let hayServicioExterno = false;
  let totalServicioExterno = 0;

  for (const linea of despacho.lineas) {
    const codigo = linea.producto?.codigo ?? null;
    const nombre = linea.producto?.nombre ?? "";
    const medida = linea.producto?.medida ?? "";
    const cantidad = Number(linea.cantidadDespachada);
    const pesoUnit = Number(linea.producto?.pesoUnitarioKg ?? 0);
    const totalKg = cantidad * pesoUnit;
    const c = normCod(codigo);

    // Manguera Verde
    if (c && /^MGVD/.test(c)) { hayMangueraVerde = true; }

    // Codos
    if (c && /^CO-2/.test(c)) codoCant["CO-2"] = (codoCant["CO-2"] ?? 0) + cantidad;
    if (c && /^CO-4/.test(c)) codoCant["CO-4"] = (codoCant["CO-4"] ?? 0) + cantidad;

    // Servicio externo
    const esServ = (linea as any).esServicioExterno ?? false;
    if (esServ) {
      hayServicioExterno = true;
      totalServicioExterno += Number((linea as any).costoServicioExterno ?? 0);
    }

    // Productos EXTERNOS excluidos de kgMat/kgGan (manguera verde y codos ya salieron arriba)
    if (linea.producto?.origen === "EXTERNO") continue;

    // Detección por código con fallback por nombre (para productos sin código en DB)
    const catNombre = linea.producto?.categoria?.nombre ?? "";
    const det = detectar(codigo, nombre, medida, catNombre);
    if (det.curvaKey) {
      cantCurvas[det.curvaKey] = (cantCurvas[det.curvaKey] ?? 0) + cantidad;
      continue;
    }
    if (det.esPead) {
      const pesoGan = pesoGananciaPead(codigo, nombre, medida, pesoUnit);
      gananciaPEAD += cantidad * pesoGan * 0.49;
      kgMat["amarillo"] = (kgMat["amarillo"] ?? 0) + totalKg;
      continue;
    }
    if (det.catMat) kgMat[det.catMat] = (kgMat[det.catMat] ?? 0) + totalKg;
    if (det.catGan) kgGan[det.catGan] = (kgGan[det.catGan] ?? 0) + totalKg;
  }

  let totalCostoMateria = 0;
  for (const [cat, kg] of Object.entries(kgMat)) {
    totalCostoMateria += kg * (COSTO_MAT_KG[cat] ?? 0);
  }

  // ── Curvas ───────────────────────────────────────────────────────────────
  let curvaTotalVenta = 0, curvaFabrica = 0, curvaMaterial = 0;
  for (const [clave, qty] of Object.entries(cantCurvas)) {
    curvaTotalVenta += qty * (CURVA_COSTO_UNIT[clave] ?? 0);
    curvaFabrica += (qty / 11.5) * (CURVA_TUBO_COSTO[clave] ?? 0);
    const mf = CURVA_MAT_FACTOR[clave];
    if (mf) curvaMaterial += (qty / 11.5) * mf.kg * mf.cKg;
  }
  const curvaMuchachas = curvaTotalVenta - curvaFabrica;
  const curvaAlberto = curvaFabrica - curvaMaterial;

  // ── Ganancias generales ───────────────────────────────────────────────────
  let totalGananciaGeneral = 0;
  for (const [cat, kg] of Object.entries(kgGan)) {
    totalGananciaGeneral += kg * (GANANCIA_KG[cat] ?? 0);
  }
  const srAlbertoGral = totalGananciaGeneral * 0.6;
  const capital = totalGananciaGeneral * 0.4;

  // ── Ganancias PEAD ────────────────────────────────────────────────────────
  const srAlbertoAmarillo = gananciaPEAD * 0.42;
  const dannyAmarillo = gananciaPEAD * 0.33;
  const darwinAmarillo = gananciaPEAD * 0.25;

  // ── Ganancias_2 (sin conexiones) ──────────────────────────────────────────
  let totalSinConexiones = 0, totalConexiones = 0;
  for (const factura of despacho.facturas) {
    for (const fl of factura.lineas) {
      const monto = Number(fl.totalLinea);
      if (esConexion(fl.producto?.codigo ?? null, fl.producto?.nombre ?? "")) {
        totalConexiones += monto;
      } else {
        totalSinConexiones += monto;
      }
    }
  }
  const sbug = totalSinConexiones - totalSinConexiones / 1.015;
  const yolanda = totalSinConexiones - totalSinConexiones / 1.0075;
  const sandra = totalSinConexiones - totalSinConexiones / 1.0075;
  const comisiones = totalSinConexiones - totalSinConexiones / 1.022;

  // ── Manguera Verde (total facturado) ──────────────────────────────────────
  for (const factura of despacho.facturas) {
    for (const fl of factura.lineas) {
      const c = normCod(fl.producto?.codigo ?? "");
      if (/^MGVD/.test(c)) {
        hayMangueraVerde = true;
        totalMangueraVerde += Number(fl.totalLinea);
      }
    }
  }

  // ── Tubería Gris PVC (compra externa) ────────────────────────────────────
  let hayTuboGrisPVC = false;
  let totalTuboGrisPVC = 0;
  for (const factura of despacho.facturas) {
    for (const fl of factura.lineas) {
      const cn = normCod(fl.producto?.codigo ?? "");
      const fn = norm(fl.producto?.nombre ?? "");
      if (/^TUGR/.test(cn) || (fn.includes("gris") && (fn.includes("tubo") || fn.includes("tuberia")))) {
        hayTuboGrisPVC = true;
        totalTuboGrisPVC += Number(fl.totalLinea);
      }
    }
  }

  // ── Niples: ganancia = venta - costo tubos ────────────────────────────────
  let hayNiples = false;
  let gananciaRevenueNiples = 0;
  let costoTubosNiples = 0;
  // Precios de tubos azules por diámetro (de facturas del mismo despacho)
  const tubeAzulPrice: Record<string, number> = {};
  for (const factura of despacho.facturas) {
    for (const fl of factura.lineas) {
      const c = normCod(fl.producto?.codigo ?? "");
      if (/^TUAZ-/.test(c)) {
        const diam = c.replace("TUAZ-", "").replace(/-.*/, ""); // "1/2", "3/4", etc.
        tubeAzulPrice[diam] = Number(fl.precioUnitario);
      }
    }
  }
  for (const factura of despacho.facturas) {
    for (const fl of factura.lineas) {
      const c = normCod(fl.producto?.codigo ?? "");
      if (/^NI-/.test(c)) {
        hayNiples = true;
        const qty = Number(fl.cantidad);
        const medida = fl.producto?.medida ?? "";
        gananciaRevenueNiples += Number(fl.totalLinea);
        const lenCm = nipleLengthCm(medida);
        const diam = nipleDiameter(medida).replace(/\s/g, "");
        const niplesPerTube = 600 / lenCm;
        const tubesNeeded = qty / niplesPerTube;
        // Precio del tubo azul con 8% descuento, o fallback por costo kg
        const tubePrice = tubeAzulPrice[diam]
          ? tubeAzulPrice[diam] * 0.92
          : (Number(fl.producto?.pesoUnitarioKg ?? 0.3) * COSTO_MAT_KG.azul * 40); // approx
        costoTubosNiples += tubesNeeded * tubePrice;
      }
    }
  }
  const gananciaNetaNiples = gananciaRevenueNiples - costoTubosNiples;

  // ── Codos Darwin ──────────────────────────────────────────────────────────
  const darwinCodos = (codoCant["CO-2"] ?? 0) * CODO_COSTO_FABRICA["CO-2"] +
                      (codoCant["CO-4"] ?? 0) * CODO_COSTO_FABRICA["CO-4"];

  // ── Flete (suma por factura del flete tuberías + conexiones) ──────────────
  let costoFlete = 0;
  for (const factura of despacho.facturas) {
    const cli = factura.cliente;
    if (!cli) continue;
    const ftPct = Number(cli.fleteTuberiaPct ?? 0);
    const fcPct = Number(cli.fleteConexionesPct ?? 0);
    let subtuberia = 0, subconex = 0;
    for (const fl of factura.lineas) {
      const monto = Number(fl.totalLinea);
      if (esConexion(fl.producto?.codigo ?? null, fl.producto?.nombre ?? "")) {
        subconex += monto;
      } else {
        subtuberia += monto;
      }
    }
    costoFlete += (ftPct > 0 ? subtuberia * ftPct / (100 + ftPct) : 0) +
                  (fcPct > 0 ? subconex * fcPct / (100 + fcPct) : 0);
  }

  return {
    facturaTotal, gastos, totalCostoMateria,
    srAlbertoGral, capital,
    sbug, yolanda, sandra, comisiones,
    gananciaPEAD, srAlbertoAmarillo, dannyAmarillo, darwinAmarillo,
    curvaTotalVenta, curvaFabrica, curvaMuchachas, curvaAlberto,
    hayNiples, gananciaNetaNiples, costoTubosNiples,
    totalConexiones,
    hayMangueraVerde, totalMangueraVerde,
    hayTuboGrisPVC, totalTuboGrisPVC,
    darwinCodos, hayCodos: darwinCodos > 0,
    costoFlete, hayFlete: costoFlete > 0.01,
    hayServicioExterno, totalServicioExterno,
  };
}

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

/** Genera o regenera el balance de un despacho */
export async function generarBalance(req: Request, res: Response) {
  const id = Number(req.params.id);
  try {
    const g = await calcularDesdeDespacho(id);

    const items: { nombre: string; montoTotal: number; esEditable: boolean; orden: number }[] = [];
    let ord = 0;
    const add = (nombre: string, monto: number, editable = false) =>
      items.push({ nombre, montoTotal: Math.round(monto * 100) / 100, esEditable: editable, orden: ord++ });

    // Siempre
    add("Material",           g.totalCostoMateria, true);
    add("Obreros",            g.gastos.obreros,    true);
    add("Pigmento",           g.gastos.pigmento,   true);
    add("Electricidad y Gasoil", g.gastos.electricidad, true);
    add("60% Sr Alberto",     g.srAlbertoGral,     true);
    add("40% Capital",        g.capital,           true);
    add("SBUG y Yo",          g.sbug,              true);
    add("Yola",               g.yolanda,           true);
    add("Sandra",             g.sandra,            true);
    add("Comisiones",         g.comisiones,        true);

    // PEAD
    if (g.gananciaPEAD > 0) {
      add("Darwin Amarillo",      g.darwinAmarillo,   true);
      add("Sr Alberto Amarillo",  g.srAlbertoAmarillo,true);
      add("Danny Tubo Amarillo",  g.dannyAmarillo,    true);
    }

    // Curvas
    if (g.curvaTotalVenta > 0) {
      add("Material Curvas + Material Niples", g.curvaFabrica + g.costoTubosNiples, true);
      add("Ganancia Muchachas Curvas",         g.curvaMuchachas, true);
      add("Ganancia Sr Alberto Curvas",        g.curvaAlberto,   true);
    }

    // Niples
    if (g.hayNiples) {
      add("Ganancia Niples Muchachas", g.gananciaNetaNiples, true);
    }

    // Conexiones
    if (g.totalConexiones > 0) {
      add("Costo Conexiones", g.totalConexiones, true);
    }

    // Manguera Verde
    if (g.hayMangueraVerde) {
      add("Manguera Verde", g.totalMangueraVerde, true);
    }

    // Tubería Gris PVC (compra externa)
    if (g.hayTuboGrisPVC) {
      add("Tuberia Gris PVC", g.totalTuboGrisPVC, true);
    }

    // Codos Darwin
    if (g.hayCodos) {
      add("Darwin Codos 2\" y 4\"", g.darwinCodos, true);
    }

    // Servicio externo (Carlos Servicio)
    if (g.hayServicioExterno) {
      add("Carlos Servicio", g.totalServicioExterno, true);
    }

    // Flete + Ayudante
    if (g.hayFlete) {
      add("Flete",    g.costoFlete, true);
      add("Ayudante", 0,            true); // Manual
    }

    // Extra Material = factura - suma de todos los costos
    const sumaCostos = items.reduce((s, i) => s + i.montoTotal, 0);
    const extraMaterial = g.facturaTotal - sumaCostos;
    add("Extra Material", Math.max(0, extraMaterial), true);

    // ── Snapshot de tasas usadas para auditoría futura ───────────────────────
    const tasasUsadas = {
      COSTO_MAT_KG, GANANCIA_KG, PEAD_GANANCIA_RATE: 0.49,
      CODO_COSTO_FABRICA, version: "1.0",
      generadoEn: new Date().toISOString(),
    };

    // ── Upsert en DB — guardar snapshot y timestamp ───────────────────────────
    const ahora = new Date();
    const balance = await prisma.balancePago.upsert({
      where: { ordenDespachoId: id },
      update: {
        actualizadoEn: ahora,
        calculadoEn:   ahora,
        calculosJson:  JSON.stringify(g),
        tasasJson:     JSON.stringify(tasasUsadas),
      },
      create: {
        ordenDespachoId: id,
        calculadoEn:     ahora,
        calculosJson:    JSON.stringify(g),
        tasasJson:       JSON.stringify(tasasUsadas),
      },
    });

    // ── Eliminar items anteriores y recrear ───────────────────────────────────
    await prisma.balancePagoItem.deleteMany({ where: { balancePagoId: balance.id } });
    await prisma.balancePagoItem.createMany({
      data: items.map((i) => ({ ...i, balancePagoId: balance.id })),
    });

    return res.json({ ok: true, balanceId: balance.id, items: items.length, calculadoEn: ahora });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}

/** Obtiene el balance completo con cuotas */
export async function getBalance(req: Request, res: Response) {
  const id = Number(req.params.id);
  const balance = await prisma.balancePago.findUnique({
    where: { ordenDespachoId: id },
    include: {
      items: {
        include: { cuotas: { orderBy: { fecha: "asc" } } },
        orderBy: { orden: "asc" },
      },
    },
  });
  if (!balance) return res.status(404).json({ error: "Balance no generado aún" });
  // Omitir el JSON pesado de la respuesta normal (disponible en endpoint aparte si se necesita)
  const { calculosJson, tasasJson, ...rest } = balance as any;
  return res.json(rest);
}

/** Obtiene el snapshot completo de cálculos (para auditoría) */
export async function getSnapshot(req: Request, res: Response) {
  const id = Number(req.params.id);
  const balance = await prisma.balancePago.findUnique({
    where: { ordenDespachoId: id },
    select: { calculadoEn: true, calculosJson: true, tasasJson: true },
  });
  if (!balance) return res.status(404).json({ error: "Balance no encontrado" });
  return res.json({
    calculadoEn: balance.calculadoEn,
    calculos: balance.calculosJson ? JSON.parse(balance.calculosJson) : null,
    tasas: balance.tasasJson ? JSON.parse(balance.tasasJson) : null,
  });
}

/** Actualiza monto o notas de un item (MASTER) */
export async function actualizarItem(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);
  const { montoTotal, notas } = req.body;
  const data: any = {};
  if (montoTotal !== undefined) data.montoTotal = Number(montoTotal);
  if (notas !== undefined) data.notas = notas;
  await prisma.balancePagoItem.update({ where: { id: itemId }, data });
  return res.json({ ok: true });
}

/** Agrega un pago a un item */
export async function agregarCuota(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);
  const { fecha, monto, notas } = req.body;
  if (!fecha || !monto) return res.status(400).json({ error: "fecha y monto requeridos" });
  const cuota = await prisma.balancePagoCuota.create({
    data: { balancePagoItemId: itemId, fecha: new Date(fecha), monto: Number(monto), notas },
  });
  return res.json(cuota);
}

/** Elimina un pago */
export async function eliminarCuota(req: Request, res: Response) {
  const cuotaId = Number(req.params.cuotaId);
  await prisma.balancePagoCuota.delete({ where: { id: cuotaId } });
  return res.json({ ok: true });
}

/** Actualiza notas de una cuota */
export async function actualizarCuota(req: Request, res: Response) {
  const cuotaId = Number(req.params.cuotaId);
  const { notas, monto } = req.body;
  const data: any = {};
  if (notas !== undefined) data.notas = notas;
  if (monto !== undefined) data.monto = Number(monto);
  await prisma.balancePagoCuota.update({ where: { id: cuotaId }, data });
  return res.json({ ok: true });
}
