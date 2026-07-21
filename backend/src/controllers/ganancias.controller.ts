import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { DEFAULTS } from "./tablas.controller";

// ─── TABLAS FIJAS (fuente: archivos Excel de referencia) ──────────────────────
// Si hay overrides en ConfigGanancias, éstos reemplazan los defaults al calcular.

const COSTO_MAT_KG: Record<string, number> = {
  manguera34: 1.083, manguera13: 1.090,
  azul: 1.580, negro: 1.280, gris: 1.280, blanco: 1.580, amarillo: 1.590,
};

const GANANCIA_KG: Record<string, number> = {
  manguera34: 0.125, manguera13: 0.200,
  azul: 0.190, gris: 0.180,
  negro_elec: 0.260, blanco_elec: 0.350,
};

// ─── Lee ConfigGanancias y devuelve tablas efectivas ─────────────────────────
async function cargarTablas(despachoId: number) {
  const rows = await prisma.configGanancias.findMany({
    where: { OR: [{ despachoId: null }, { despachoId }] },
  });
  // despacho-specific tiene prioridad sobre global
  const ov = new Map<string, number>();
  const globalRows = rows.filter((r) => r.despachoId === null);
  const despRows   = rows.filter((r) => r.despachoId !== null);
  for (const r of globalRows) ov.set(r.campo, Number(r.valor));
  for (const r of despRows)   ov.set(r.campo, Number(r.valor));

  const get = (campo: string, fallback: number) => ov.has(campo) ? ov.get(campo)! : fallback;

  return {
    costoMat: {
      manguera34: get("costo_manguera34", COSTO_MAT_KG.manguera34),
      manguera13: get("costo_manguera13", COSTO_MAT_KG.manguera13),
      azul:       get("costo_azul",       COSTO_MAT_KG.azul),
      negro:      get("costo_negro",      COSTO_MAT_KG.negro),
      gris:       get("costo_gris",       COSTO_MAT_KG.gris),
      blanco:     get("costo_blanco",     COSTO_MAT_KG.blanco),
      amarillo:   get("costo_amarillo",   COSTO_MAT_KG.amarillo),
    } as Record<string, number>,
    gananciaKg: {
      manguera34: get("gan_manguera34",  GANANCIA_KG.manguera34),
      manguera13: get("gan_manguera13",  GANANCIA_KG.manguera13),
      azul:       get("gan_azul",        GANANCIA_KG.azul),
      gris:       get("gan_gris",        GANANCIA_KG.gris),
      negro_elec: get("gan_negro_elec",  GANANCIA_KG.negro_elec),
      blanco_elec:get("gan_blanco_elec", GANANCIA_KG.blanco_elec),
    } as Record<string, number>,
    g2: {
      sbug:       get("g2_sbug",       DEFAULTS.g2_sbug.valor),
      yolanda:    get("g2_yolanda",    DEFAULTS.g2_yolanda.valor),
      sandra:     get("g2_sandra",     DEFAULTS.g2_sandra.valor),
      comisiones: get("g2_comisiones", DEFAULTS.g2_comisiones.valor),
    },
    dist: {
      alberto_gral: get("dist_alberto_gral", DEFAULTS.dist_alberto_gral.valor) / 100,
      capital:      get("dist_capital",      DEFAULTS.dist_capital.valor)      / 100,
      alberto_am:   get("dist_alberto_am",   DEFAULTS.dist_alberto_am.valor)   / 100,
      danny_am:     get("dist_danny_am",     DEFAULTS.dist_danny_am.valor)     / 100,
      darwin_am:    get("dist_darwin_am",    DEFAULTS.dist_darwin_am.valor)    / 100,
    },
    gastosOv: {
      obreros:  ov.has("gastos_obreros") ? ov.get("gastos_obreros")! : null,
      pigmento: ov.has("gastos_pigmento") ? ov.get("gastos_pigmento")! : null,
      elect:    ov.has("gastos_elect")   ? ov.get("gastos_elect")!   : null,
    },
    hayOverrides: ov.size > 0,
    overridesCampos: [...ov.keys()],
  };
}

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
  "CVBL-1/2": { kg: 0.28, cKg: 1.583 }, "CVBL-3/4": { kg: 0.30, cKg: 1.583 }, "CVBL-1": { kg: 0.50, cKg: 1.583 },
  "CVNG-1/2": { kg: 0.24, cKg: 1.283 }, "CVNG-3/4": { kg: 0.28, cKg: 1.283 }, "CVNG-1": { kg: 0.40, cKg: 1.283 },
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

/** Tubo Gris PVC comprado a proveedor (Casa del Tubo / Alirio). Se detecta por
 *  nombre "gris" + "pvc" (el "Gris Agua Blanca" sin "pvc" es fabricado interno). */
function esTuboGrisPVC(codigo: string | null, nombre: string): boolean {
  const n = norm(nombre);
  return n.includes("gris") && n.includes("pvc");
}

/** Tubo Amarillo PVC comprado a proveedor (Casa del Tubo / Alirio / OCC). Se
 *  detecta por "amarill" + "pvc". El "Amarillo PEAD" (sin pvc) es fabricado interno. */
function esTuboAmarilloPVC(codigo: string | null, nombre: string): boolean {
  const n = norm(nombre);
  return n.includes("amarill") && n.includes("pvc");
}

// ─── Niples (sub-empresa: compra tubo azul con 8% desc, lo pica y rosca) ─────
// Tarifas fijas por diámetro (ver Excel "Costos y analisis Niples").
const NIPLE_TUBO_UTIL_CM = 550;   // cm útiles por tubo de 6m (tras cortes)
const NIPLE_TUBO_DESC    = 0.08;  // 8% de descuento al costo del tubo azul
const NIPLE_TUBO_COSTO: Record<string, number> = { "1/2": 2.68, "3/4": 3.94, "1": 5.5, "1 1/2": 12.25, "2": 24.45 };
const NIPLE_TARIFA_CM:  Record<string, number> = { "1/2": 0.015, "3/4": 0.02, "1": 0.035, "1 1/2": 0.051, "2": 0.113 };

function esNiple(nombre: string): boolean {
  return norm(nombre).includes("niple");
}
// Extrae { diametro, longitud } de la medida (ej. '1½" x 15cm' → { "1 1/2", 15 }).
function parseNipleMedida(medida: string): { diametro: string; longitud: number } | null {
  const m = String(medida ?? "");
  const lm = m.match(/(\d+(?:\.\d+)?)\s*cm/i);
  if (!lm) return null;
  const diam = m.split(/x/i)[0].replace(/"/g, "").replace(/½/g, " 1/2").replace(/\s+/g, " ").trim();
  if (!NIPLE_TUBO_COSTO[diam]) return null;
  return { diametro: diam, longitud: Number(lm[1]) };
}

/** Detecta si un producto es "conexión" — excluido de Ganancias_2.
 *  Prioridad: categoría "Conexiones" → código → nombre (fallback). */
function esConexion(codigo: string | null, nombre: string, categoriaNombre?: string): boolean {
  // 1) Por categoría (lo más confiable ahora que existe la categoría Conexiones)
  if (categoriaNombre && norm(categoriaNombre) === "conexiones") return true;
  const c = normCodigo(codigo);
  // 2) Por código: Codo, Semi Codo, Sifón, Tee PVC, Yee, Yee Reducida + abrazaderas, tee rápidas, etc.
  if (c && /^(CO-|SC-|SI-|TE-|YE-|YR-|ABS-|TR-|UR-|URR-|AM-|AH-|TAR-|COR-|ASP-|CA-)/.test(c)) return true;
  // 3) Por nombre (productos sin código aún)
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

/** Manguera Verde / Manguera Amarilla (gas): producto EXTERNO con lógica de tubería.
 *  Solo gana el vendedor; se le saca flete y G2 (SBUG/Yolanda/Sandra/Comisiones).
 *  El remanente va a la fila "Costo Manguera Verde". */
function esMangueraVerdeAmarilla(codigo: string | null, nombre: string): boolean {
  const c = normCodigo(codigo);
  if (/^(MGVD|MGAM)/.test(c)) return true;
  const n = norm(nombre);
  if (!n.includes("manguera")) return false;
  return n.includes("verde") || n.includes("gas") ||
    (n.includes("amarill") && !n.includes("pead") && !n.includes("agua negra"));
}

// ─── CONEXIONES: configuración del cálculo de Ganancia Conexiones ──────────────
// Descuentos de compra al mayor: 5% sobre el publicado, luego se PAGA 60% del resto.
// Costo real = publicado × (1 − 0.05) × 0.60 = publicado × 0.57
const CONEX_DESC1 = 0.05;   // primer descuento (se suma a Comisiones)
const CONEX_PAGA2 = 0.60;   // fracción que se paga tras el 2º descuento (Excel: *0.95*0.6)

// Codos fabricados internamente (2" y 4"): costo real de producción por unidad.
// Se EXCLUYEN del "Costo donde Alirio" y se restan aparte por su costo interno.
const CODO_INTERNO: Record<string, number> = {
  "CO-2-90": 0.38,
  "CO-4-90": 1.90,
};

// ─── CONTROLLER ──────────────────────────────────────────────────────────────

/** Calcula todas las ganancias de un despacho. Devuelve el objeto de resultado
 *  o null si el despacho no existe. Reutilizable por el módulo de Balance. */
export async function calcularGananciasDespacho(id: number): Promise<any | null> {
  // Cargar tablas (con posibles overrides de ConfigGanancias)
  const tablas = await cargarTablas(id);
  const CM = tablas.costoMat;
  const GK = tablas.gananciaKg;

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id },
    include: {
      lineas: {
        include: {
          producto: { include: { categoria: true } },
          cotizacion: {
          select: {
            id: true, totalNeto: true,
            vendedor: { select: { nombre: true, gananciaMuchachosPct: true } },
            cliente:  { select: { id: true, nombre: true, comisionTuberiaPct: true, comisionConexionesPct: true, fleteTuberiaPct: true, fleteConexionesPct: true, socioEquivalente: true, vendedorEsMaster: true } },
            lineas:   { select: { totalLinea: true, producto: { select: { codigo: true, nombre: true, categoria: { select: { nombre: true } } } } } },
          },
        },
        },
        orderBy: { id: "asc" },
      },
      facturas: {
        select: {
          id: true, clienteId: true, totalNeto: true,
          comisionTuberiaPctOverride: true, comisionConexionesPctOverride: true,
          cliente: {
            select: {
              nombre: true,
              comisionTuberiaPct: true, comisionConexionesPct: true,
              fleteTuberiaPct: true, fleteConexionesPct: true,
              vendedorEsMaster: true,
              vendedor: { select: { nombre: true, gananciaMuchachosPct: true } },
            },
          },
          lineas: {
            select: {
              totalLinea: true, cantidad: true, productoId: true,
              producto: { select: { codigo: true, nombre: true, medida: true, costoCompra: true, categoria: { select: { nombre: true } } } },
            },
          },
        },
      },
    },
  });

  if (!despacho) return null;

  const facturaTotal = despacho.facturas.reduce((s, f) => s + Number(f.totalNeto), 0);

  // Comisión del vendedor ajustada por factura (descuento pactado). Mapa por cliente
  // para que el cálculo por cotización use el % de la factura de ese cliente.
  const facturaPorCliente = new Map<number, number>();
  const comOverride = new Map<number, { tub: number | null; conex: number | null }>();
  for (const f of despacho.facturas as any[]) {
    if (!facturaPorCliente.has(f.clienteId)) facturaPorCliente.set(f.clienteId, f.id);
    if (f.comisionTuberiaPctOverride != null || f.comisionConexionesPctOverride != null) {
      comOverride.set(f.clienteId, {
        tub:   f.comisionTuberiaPctOverride    != null ? Number(f.comisionTuberiaPctOverride)    : null,
        conex: f.comisionConexionesPctOverride != null ? Number(f.comisionConexionesPctOverride) : null,
      });
    }
  }

  // Costo de tubo gris sugerido (último usado por producto en cualquier despacho)
  const grisPrevios = await prisma.despachoLinea.findMany({
    where: { costoGrisUnit: { not: null } },
    orderBy: { id: "desc" },
    select: { productoId: true, costoGrisUnit: true, proveedorGris: true },
  });
  const grisSugerido = new Map<number, { costo: number; proveedor: string | null }>();
  for (const g of grisPrevios) if (!grisSugerido.has(g.productoId)) grisSugerido.set(g.productoId, { costo: Number(g.costoGrisUnit), proveedor: g.proveedorGris ?? null });

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
      esGrisPVC: esTuboGrisPVC(codigo, nombre),
      esAmarilloPVC: esTuboAmarilloPVC(codigo, nombre),
      proveedorGris: (linea as any).proveedorGris ?? null,
      costoGrisUnit: (linea as any).costoGrisUnit != null ? Number((linea as any).costoGrisUnit) : null,
      costoGrisSugerido: grisSugerido.get(linea.productoId)?.costo ?? null,
      proveedorGrisSugerido: grisSugerido.get(linea.productoId)?.proveedor ?? null,
    };
  });

  // ── Costos de materia prima ────────────────────────────────────────────────
  const costoMateria: Record<string, { kg: number; rate: number; costo: number }> = {};
  let totalCostoMateria = 0;
  for (const [cat, kg] of Object.entries(kgMat)) {
    const rate = CM[cat] ?? COSTO_MAT_KG[cat] ?? 0;
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
  // Base: tabla escalonada según el total de la factura. Pero cuando una CARGA
  // lleva varios clientes, los obreros/pigmento/electricidad son de la carga
  // completa y José reparte el monto entre las facturas: esos montos manuales
  // (override por despacho) mandan sobre la tabla.
  const gastosBase = gastosPorTotal(facturaTotal);
  const gastos = {
    obreros:      tablas.gastosOv.obreros  ?? gastosBase.obreros,
    pigmento:     tablas.gastosOv.pigmento ?? gastosBase.pigmento,
    electricidad: tablas.gastosOv.elect    ?? gastosBase.electricidad,
  };

  // ── Ganancia general I25 / I26 ────────────────────────────────────────────
  const gananciaDesglose: { cat: string; kg: number; rate: number; ganancia: number }[] = [];
  let totalGananciaGeneral = 0;
  for (const [cat, kg] of Object.entries(kgGan)) {
    const rate = GK[cat] ?? GANANCIA_KG[cat] ?? 0;
    const ganancia = kg * rate;
    gananciaDesglose.push({ cat, kg, rate, ganancia });
    totalGananciaGeneral += ganancia;
  }
  const srAlbertoGral = totalGananciaGeneral * tablas.dist.alberto_gral;
  const capital       = totalGananciaGeneral * tablas.dist.capital;

  // ── Ganancia Aguas Negras H47 ─────────────────────────────────────────────
  const srAlbertoAmarillo = gananciaPEAD * tablas.dist.alberto_am;
  const dannyAmarillo     = gananciaPEAD * tablas.dist.danny_am;
  const darwinAmarillo    = gananciaPEAD * tablas.dist.darwin_am;

  // ── Ganancias_2 (excluye conexiones) ─────────────────────────────────────
  // Suma de FacturaLineas excluyendo productos tipo conexión
  let totalSinConexiones = 0;
  let totalConexiones = 0;
  for (const factura of despacho.facturas) {
    for (const fl of (factura as any).lineas ?? []) {
      const monto = Number(fl.totalLinea);
      if (esConexion(fl.producto?.codigo ?? null, fl.producto?.nombre ?? "", fl.producto?.categoria?.nombre)) {
        totalConexiones += monto;
      } else {
        totalSinConexiones += monto;
      }
    }
  }
  const x = totalSinConexiones;
  const sbug       = x - x / (1 + tablas.g2.sbug);
  const yolanda    = x - x / (1 + tablas.g2.yolanda);
  const sandra     = x - x / (1 + tablas.g2.sandra);
  const comisiones = x - x / (1 + tablas.g2.comisiones);

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

    // Si el cliente pertenece al vendedor MASTER, su comisión ya está en Ganancias_2 (2.2% Comisiones)
    if (cot.cliente?.vendedorEsMaster === true) continue;

    // % ajustado en la factura de este cliente (descuento pactado) o el % normal
    const ov = cot.cliente?.id != null ? comOverride.get(cot.cliente.id) : undefined;
    const ctPct = Number(ov?.tub   ?? cot.cliente?.comisionTuberiaPct ?? 0);
    const ccPct = Number(ov?.conex ?? cot.cliente?.comisionConexionesPct ?? 0);
    if (ctPct + ccPct === 0 && !ov) continue;

    let totalTuberia = 0, totalConexiones = 0;
    for (const cl of (cot.lineas ?? []) as any[]) {
      const monto = Number(cl.totalLinea ?? 0);
      if (esConexion(cl.producto?.codigo ?? null, cl.producto?.nombre ?? "", cl.producto?.categoria?.nombre)) {
        totalConexiones += monto;
      } else {
        totalTuberia += monto;
      }
    }

    const monto =
      (ctPct > 0 ? totalTuberia  * ctPct / (100 + ctPct) : 0) +
      (ccPct > 0 ? totalConexiones * ccPct / (100 + ccPct) : 0);

    if (monto > 0 || ov) {
      comisionesVendedores.push({
        clienteNombre:  cot.cliente?.nombre  ?? `Cot #${cot.id}`,
        vendedorNombre: cot.vendedor?.nombre ?? "—",
        ctPct, ccPct, totalTuberia, totalConexiones, monto,
        facturaId: cot.cliente?.id != null ? (facturaPorCliente.get(cot.cliente.id) ?? null) : null,
        ajustada: !!ov,
        ctPctNormal: Number(cot.cliente?.comisionTuberiaPct ?? 0),
        ccPctNormal: Number(cot.cliente?.comisionConexionesPct ?? 0),
      } as any);
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
      if (esConexion(cl.producto?.codigo ?? null, cl.producto?.nombre ?? "", cl.producto?.categoria?.nombre)) {
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

  // ── Ganancia Muchachos (equipo de flete) — gasto extra independiente ───────
  // % sobre TODA la venta (tubería + conexiones) de los clientes cuyo VENDEDOR
  // tenga gananciaMuchachosPct > 0. Misma fórmula que comisión: x − x/(1+%).
  // Se basa en el vendedor del CLIENTE (asignación permanente), no en quién
  // tecleó la cotización. No afecta la comisión del vendedor; es un pago aparte.
  interface MuchachosItem { vendedorNombre: string; clienteNombre: string; pct: number; ventaTotal: number; monto: number; }
  const muchachosDetalle: MuchachosItem[] = [];
  for (const factura of despacho.facturas as any[]) {
    const vend = factura.cliente?.vendedor;
    const pct = Number(vend?.gananciaMuchachosPct ?? 0);
    if (pct <= 0) continue;

    const ventaTotal = Number(factura.totalNeto);  // toda la venta de esa factura
    if (ventaTotal <= 0) continue;

    const monto = ventaTotal * pct / (100 + pct);
    muchachosDetalle.push({
      vendedorNombre: vend?.nombre ?? "—",
      clienteNombre:  factura.cliente?.nombre ?? "—",
      pct, ventaTotal, monto,
    });
  }
  const totalMuchachos = muchachosDetalle.reduce((s, m) => s + m.monto, 0);

  // ── socioEquivalente: redirigir parte de Ganancias_2 a Extra de Material ──
  // Cuando un cliente tiene socioEquivalente, la fracción de G2 que le correspondería
  // a ese socio (calculada sobre las ventas de ESA cotización) va a Extra de Material
  // porque el vendedor ya cobró su parte como vendedor, no como socio.
  interface SocioRedirItem { clienteNombre: string; socio: string; monto: number; }
  const socioRedireccionDetalle: SocioRedirItem[] = [];
  const socioRedireccion: Record<string, number> = {};
  const cotVistasS = new Set<number>();

  for (const linea of despacho.lineas) {
    const cot = (linea as any).cotizacion;
    if (!cot || cotVistasS.has(cot.id)) continue;
    cotVistasS.add(cot.id);

    const socio = cot.cliente?.socioEquivalente as string | null;
    if (!socio) continue;
    const tasaObj = tablas.g2 as Record<string, number>;
    const tasa = tasaObj[socio];
    if (!tasa) continue;

    // Calcular tubería de esta cotización (sin conexiones)
    let cotSinCon = 0;
    for (const cl of (cot.lineas ?? []) as any[]) {
      if (!esConexion(cl.producto?.codigo ?? null, cl.producto?.nombre ?? "", cl.producto?.categoria?.nombre))
        cotSinCon += Number(cl.totalLinea ?? 0);
    }
    if (cotSinCon <= 0) continue;

    const montoRedirigido = cotSinCon - cotSinCon / (1 + tasa);
    socioRedireccion[socio] = (socioRedireccion[socio] ?? 0) + montoRedirigido;
    socioRedireccionDetalle.push({
      clienteNombre: cot.cliente?.nombre ?? `Cot #${cot.id}`,
      socio,
      monto: montoRedirigido,
    });
  }

  // Montos finales de G2 (descontando las redirecciones)
  const sbugFinal       = sbug       - (socioRedireccion.sbug       ?? 0);
  const yolandaFinal    = yolanda    - (socioRedireccion.yolanda    ?? 0);
  const sandraFinal     = sandra     - (socioRedireccion.sandra     ?? 0);
  const comisionesFinal = comisiones - (socioRedireccion.comisiones ?? 0);
  const totalSocioRedirigido = Object.values(socioRedireccion).reduce((s, v) => s + v, 0);

  // ── GANANCIA CONEXIONES (cálculo independiente) ──────────────────────────────
  // Fórmula (Excel "Ejemplo calculo gastos conexiones"):
  //   Ganancia = Facturado − CostoAlirio − 5% − ComisiónVend − Flete − CodosInternos
  //   CostoAlirio = Σ costoCompra×cant×0.95×0.60   (EXCLUYE codos 2"/4" internos)
  //   5%          = Σ costoCompra×cant×0.05         (INCLUYE codos, con su costo interno)
  //   Codos       = Σ cant × costoInterno (CO-2-90=0.38, CO-4-90=1.90)
  //   Comisión/Flete = por cliente (comisionConexionesPct / fleteConexionesPct)
  //   El 5% se suma además a la fila "Comisiones".
  let conexFacturado = 0, conexCostoAlirio = 0, conexCinco = 0, conexCodosInternos = 0;
  let conexComisionVend = 0, conexFlete = 0, conexMuchachos = 0;
  const conexLineasDetalle: { codigo: string | null; nombre: string; cantidad: number; costoUnit: number; facturado: number; alirio: number; cinco: number; esCodoInterno: boolean }[] = [];
  const conexClientesDetalle: { cliente: string; facturado: number; ccPct: number; fcPct: number; muchPct: number; comision: number; flete: number; muchachos: number }[] = [];

  for (const factura of despacho.facturas as any[]) {
    const ccPct = Number(factura.comisionConexionesPctOverride ?? factura.cliente?.comisionConexionesPct ?? 0);
    const fcPct = Number(factura.cliente?.fleteConexionesPct ?? 0);
    const muchPct = Number(factura.cliente?.vendedor?.gananciaMuchachosPct ?? 0);
    let facturadoClienteConex = 0;

    for (const fl of (factura.lineas ?? [])) {
      const codigo    = fl.producto?.codigo ?? null;
      const nombre    = fl.producto?.nombre ?? "";
      const catNombre = fl.producto?.categoria?.nombre;
      if (!esConexion(codigo, nombre, catNombre)) continue;

      const cant           = Number(fl.cantidad);
      const facturadoLinea = Number(fl.totalLinea);
      const cod            = normCodigo(codigo);
      const esCodoInterno  = Object.prototype.hasOwnProperty.call(CODO_INTERNO, cod);
      // Codos internos usan su costo de producción; el resto, el costoCompra publicado
      const costoUnit = esCodoInterno ? CODO_INTERNO[cod] : Number(fl.producto?.costoCompra ?? 0);

      conexFacturado        += facturadoLinea;
      facturadoClienteConex += facturadoLinea;

      const cincoLinea = costoUnit * cant * CONEX_DESC1;
      conexCinco += cincoLinea;

      let alirioLinea = 0;
      if (esCodoInterno) {
        conexCodosInternos += costoUnit * cant;                       // costo interno de codos 2"/4"
      } else {
        alirioLinea = costoUnit * cant * (1 - CONEX_DESC1) * CONEX_PAGA2;
        conexCostoAlirio += alirioLinea;
      }

      conexLineasDetalle.push({
        codigo, nombre: `${nombre} ${fl.producto?.medida ?? ""}`.trim(),
        cantidad: cant, costoUnit, facturado: facturadoLinea,
        alirio: alirioLinea, cinco: cincoLinea, esCodoInterno,
      });
    }

    if (facturadoClienteConex > 0) {
      const comision  = ccPct  > 0 ? facturadoClienteConex * ccPct  / (100 + ccPct)  : 0;
      const flete     = fcPct  > 0 ? facturadoClienteConex * fcPct  / (100 + fcPct)  : 0;
      const muchachos = muchPct > 0 ? facturadoClienteConex * muchPct / (100 + muchPct) : 0;
      conexComisionVend += comision;
      conexFlete        += flete;
      conexMuchachos    += muchachos;
      conexClientesDetalle.push({ cliente: factura.cliente?.nombre ?? "—", facturado: facturadoClienteConex, ccPct, fcPct, muchPct, comision, flete, muchachos });
    }
  }

  const gananciaConexiones =
    conexFacturado - conexCostoAlirio - conexCinco - conexComisionVend - conexFlete - conexMuchachos - conexCodosInternos;

  // ── Manguera Verde / Amarilla (externa, lógica de tubería) ─────────────────
  // Costo Manguera Verde = venta − flete − comisión vendedor − SBUG − Yolanda − Sandra − Comisiones
  let mvVenta = 0, mvFlete = 0, mvComisionVend = 0;
  for (const factura of despacho.facturas as any[]) {
    const ftPct = Number(factura.cliente?.fleteTuberiaPct ?? 0);
    const ctPct = Number(factura.comisionTuberiaPctOverride ?? factura.cliente?.comisionTuberiaPct ?? 0);
    let mvFact = 0;
    for (const fl of (factura.lineas ?? [])) {
      if (esMangueraVerdeAmarilla(fl.producto?.codigo ?? null, fl.producto?.nombre ?? ""))
        mvFact += Number(fl.totalLinea);
    }
    if (mvFact <= 0) continue;
    mvVenta        += mvFact;
    mvFlete        += ftPct > 0 ? mvFact * ftPct / (100 + ftPct) : 0;
    mvComisionVend += ctPct > 0 ? mvFact * ctPct / (100 + ctPct) : 0;
  }
  const mvSbug = mvVenta - mvVenta / (1 + tablas.g2.sbug);
  const mvYol  = mvVenta - mvVenta / (1 + tablas.g2.yolanda);
  const mvSan  = mvVenta - mvVenta / (1 + tablas.g2.sandra);
  const mvCom  = mvVenta - mvVenta / (1 + tablas.g2.comisiones);
  const costoMangueraVerde = mvVenta - mvFlete - mvComisionVend - mvSbug - mvYol - mvSan - mvCom;

  // ── Tubos PVC externos: Gris y Amarillo (comprados a proveedor) ────────────
  // Misma regla para ambos. Proveedores: casa_del_tubo (con 5% Fábrica), alirio
  // y occ (sin 5%). El flete/comisión/G2 ya están en los totales principales
  // (son tubería); aquí se aíslan y a la reserva se le resta costo+fábrica+
  // ganancia, sin doble conteo (mismo patrón que Manguera Verde).
  // Costo y proveedor por línea: DespachoLinea.costoGrisUnit / proveedorGris.
  const calcPvcExterno = (pred: (c: string | null, n: string) => boolean) => {
    const map = new Map<number, { proveedor: string | null; costoUnit: number }>();
    for (const l of despacho.lineas as any[]) {
      if (!pred(l.producto?.codigo ?? null, l.producto?.nombre ?? "")) continue;
      const cu = Number(l.costoGrisUnit ?? 0);
      if (!map.has(l.productoId) || cu > 0) map.set(l.productoId, { proveedor: l.proveedorGris ?? null, costoUnit: cu });
    }
    let venta = 0, ventaCasa = 0, costo = 0, flete = 0, comis = 0;
    const detalle: { nombre: string; cantidad: number; venta: number; proveedor: string | null; costoUnit: number; costo: number }[] = [];
    for (const factura of despacho.facturas as any[]) {
      const ftPct = Number(factura.cliente?.fleteTuberiaPct ?? 0);
      const ctPct = Number(factura.comisionTuberiaPctOverride ?? factura.cliente?.comisionTuberiaPct ?? 0);
      const esMaster = factura.cliente?.vendedorEsMaster === true;
      let vFact = 0;
      for (const fl of (factura.lineas ?? [])) {
        if (!pred(fl.producto?.codigo ?? null, fl.producto?.nombre ?? "")) continue;
        const v    = Number(fl.totalLinea);
        const cant = Number(fl.cantidad);
        const info = map.get(fl.productoId) ?? { proveedor: null, costoUnit: 0 };
        const cLinea = info.costoUnit * cant;
        venta += v; vFact += v; costo += cLinea;
        if (info.proveedor === "casa_del_tubo") ventaCasa += v;
        detalle.push({ nombre: `${fl.producto?.nombre ?? ""} ${fl.producto?.medida ?? ""}`.trim(), cantidad: cant, venta: v, proveedor: info.proveedor, costoUnit: info.costoUnit, costo: cLinea });
      }
      if (vFact <= 0) continue;
      flete += ftPct > 0 ? vFact * ftPct / (100 + ftPct) : 0;
      comis += (!esMaster && ctPct > 0) ? vFact * ctPct / (100 + ctPct) : 0;
    }
    const sbug = venta - venta / (1 + tablas.g2.sbug);
    const yol  = venta - venta / (1 + tablas.g2.yolanda);
    const san  = venta - venta / (1 + tablas.g2.sandra);
    const com  = venta - venta / (1 + tablas.g2.comisiones);
    const gananciaFabrica = ventaCasa > 0 ? ventaCasa * 5 / 105 : 0; // 5% Fábrica (solo Casa del Tubo)
    const ganancia = venta - flete - comis - sbug - yol - san - com - costo - gananciaFabrica;
    return { venta, ventaCasaDelTubo: ventaCasa, flete, comisionVendedor: comis, sbug, yolanda: yol, sandra: san, comisiones: com, costoTubo: costo, gananciaFabrica, ganancia, lineas: detalle };
  };
  const grisBloque = calcPvcExterno(esTuboGrisPVC);
  const amarilloBloque = calcPvcExterno(esTuboAmarilloPVC);

  // ── Niples (sub-empresa) ───────────────────────────────────────────────────
  // El niple va en la factura a precio PÚBLICO (ya pasó por G2/flete/comisión).
  // Materiales de Niples = costo del tubo azul (con 8% desc) que la sub-empresa
  // paga a la empresa. Ganancia Niples = venta interna − materiales. El excedente
  // (público − interno) queda en Ganancias Extras. Todo se deriva de la medida.
  let nipleVenta = 0, nipleMateriales = 0, nipleGanancia = 0;
  const nipleLineasDetalle: { nombre: string; diametro: string; longitud: number; cantidad: number; materiales: number; ventaInterna: number; ganancia: number }[] = [];
  for (const factura of despacho.facturas as any[]) {
    for (const fl of (factura.lineas ?? [])) {
      if (!esNiple(fl.producto?.nombre ?? "")) continue;
      const info = parseNipleMedida(fl.producto?.medida ?? "");
      if (!info) continue;
      const cant  = Number(fl.cantidad);
      const tubos = cant * info.longitud / NIPLE_TUBO_UTIL_CM;
      const K = tubos * NIPLE_TUBO_COSTO[info.diametro] * (1 - NIPLE_TUBO_DESC); // materiales
      const M = cant * NIPLE_TARIFA_CM[info.diametro] * info.longitud;           // venta interna
      nipleVenta += M; nipleMateriales += K; nipleGanancia += (M - K);
      nipleLineasDetalle.push({ nombre: `${fl.producto?.nombre ?? ""} ${fl.producto?.medida ?? ""}`.trim(), diametro: info.diametro, longitud: info.longitud, cantidad: cant, materiales: K, ventaInterna: M, ganancia: M - K });
    }
  }

  // El 5% de descuento se suma a la fila "Comisiones"
  const comisionesConCinco = comisionesFinal + conexCinco;

  // ── Extra de material (fondo reserva) ────────────────────────────────────
  // = Venta total − costos identificados − ganancias distribuidas.
  // Las conexiones se sacan aquí (su ganancia, 5%, costo Alirio y codos internos
  // se distribuyen/cuestan en sus propias líneas) para no contarlas doble.
  const gastosTotal = gastos.obreros + gastos.pigmento + gastos.electricidad;
  const g2Sum = sbugFinal + yolandaFinal + sandraFinal + comisionesFinal;
  const extraMaterial = facturaTotal
    - totalCostoMateria
    - curvaTotalVenta
    - gastosTotal
    - totalGananciaGeneral
    - gananciaPEAD
    - g2Sum
    - totalComisionVendedores
    - totalFlete
    - totalMuchachos        // pago extra al equipo de flete
    // conexiones (ya están en facturaTotal vía sus ventas; se retiran del reserva):
    // (conexMuchachos NO se resta aquí: ya está dentro de totalMuchachos)
    - conexCinco            // → va a Comisiones
    - gananciaConexiones    // → línea propia
    - conexCostoAlirio      // costo real (proveedor)
    - conexCodosInternos    // costo real (producción interna)
    - costoMangueraVerde    // → fila propia "Costo Manguera Verde"
    // Tubos PVC externos (flete/comisión/G2 ya salieron por los totales principales):
    - grisBloque.costoTubo - grisBloque.gananciaFabrica - grisBloque.ganancia
    - amarilloBloque.costoTubo - amarilloBloque.gananciaFabrica - amarilloBloque.ganancia
    // Niples (público ya pasó por G2/flete/comisión; el excedente queda aquí):
    - nipleMateriales - nipleGanancia;

  return {
    despacho: { id: despacho.id, numero: despacho.numero },
    facturaTotal,
    costoMateria: { ...costoMateria, total: totalCostoMateria },
    gastos: {
      ...gastos,
      total: gastos.obreros + gastos.pigmento + gastos.electricidad,
      // Para el editor de la pantalla Balance: qué daría la tabla automática
      // y cuáles montos están fijados a mano para esta carga.
      base: gastosBase,
      ajustado: {
        obreros:      tablas.gastosOv.obreros  != null,
        pigmento:     tablas.gastosOv.pigmento != null,
        electricidad: tablas.gastosOv.elect    != null,
      },
    },
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
    ganancias2: {
      base: totalSinConexiones, conexionesExcluidas: totalConexiones,
      sbug: sbugFinal, yolanda: yolandaFinal, sandra: sandraFinal, comisiones: comisionesFinal,
      comisionesConCinco,            // comisiones (2.2%) + 5% descuento conexiones
      comisionesCinco: conexCinco,   // solo el 5% de conexiones que se suma a Comisiones
      // montos brutos (antes de redirección) — para referencia
      sbugBruto: sbug, yolandaBruto: yolanda, sandraBruto: sandra, comisionesBruto: comisiones,
    },
    socioRedireccion: { detalle: socioRedireccionDetalle, total: totalSocioRedirigido },
    comisionesVendedores: { detalle: comisionesVendedores, total: totalComisionVendedores },
    fletesCliente: { detalle: fletesCliente, total: totalFlete },
    gananciaMuchachos: { detalle: muchachosDetalle, total: totalMuchachos },
    mangueraVerde: {
      venta: mvVenta, flete: mvFlete, comisionVendedor: mvComisionVend,
      sbug: mvSbug, yolanda: mvYol, sandra: mvSan, comisiones: mvCom,
      costo: costoMangueraVerde,
    },
    grisPVC: grisBloque,          // líneas "Ganancia Tubo Gris" + "Ganancia Fabrica Tubo Gris"
    amarilloPVC: amarilloBloque,  // líneas "Ganancia Tubo Amarillo" + "Ganancia Fabrica Tubo Amarillo"
    niples: {                     // líneas "Materiales de Niples" + "Ganancia Niples" (sub-empresa)
      venta: nipleVenta, materiales: nipleMateriales, ganancia: nipleGanancia,
      lineas: nipleLineasDetalle,
    },
    gananciaConexiones: {
      facturado:        conexFacturado,       // Paso 1
      costoAlirio:      conexCostoAlirio,      // Paso 2 (excl. codos 2"/4")
      cinco:            conexCinco,            // Paso 3 (→ se suma a Comisiones)
      comisionVendedor: conexComisionVend,     // Paso 4 (por cliente)
      flete:            conexFlete,            // Paso 5 (por cliente)
      muchachos:        conexMuchachos,        // 2% Muchachos sobre conexiones (Henry)
      codosInternos:    conexCodosInternos,    // Paso 6 (CO-2-90, CO-4-90)
      ganancia:         gananciaConexiones,    // Resultado
      lineas:   conexLineasDetalle,
      clientes: conexClientesDetalle,
    },
    extraMaterial,
    servicioExterno,
    lineas: lineasDetalle,
  };
}

/** Handler HTTP: GET /despachos/:id/ganancias */
export async function calcular(req: Request, res: Response) {
  const result = await calcularGananciasDespacho(Number(req.params.id));
  if (!result) return res.status(404).json({ error: "Despacho no encontrado" });
  res.json(result);
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

// Costo y proveedor del tubo PVC externo (gris o amarillo) por línea de despacho.
// Proveedores válidos: casa_del_tubo (con 5% Fábrica), alirio, occ (sin 5%).
export async function actualizarGris(req: Request, res: Response) {
  const lineaId = Number(req.params.lineaId);
  const { proveedorGris, costoGrisUnit } = req.body;
  const prov = ["casa_del_tubo", "alirio", "occ"].includes(proveedorGris) ? proveedorGris : null;
  await prisma.despachoLinea.update({
    where: { id: lineaId },
    data: {
      proveedorGris: prov,
      costoGrisUnit: costoGrisUnit != null && costoGrisUnit !== "" ? Number(costoGrisUnit) : null,
    },
  });
  res.json({ ok: true });
}
