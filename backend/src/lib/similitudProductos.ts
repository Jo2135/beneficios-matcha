// ─────────────────────────────────────────────────────────────────────────────
// Detección de productos parecidos / redundantes.
//
// Un mismo tubo se ha cargado varias veces con nombres distintos ("Tubo Gris
// PVC 3/4" vs "Tubo Gris Agua Blanca PVC 3/4 x 400Lbs x 6mts"), sobre todo
// porque la importación de facturas crea productos al vuelo cuando no reconoce
// el nombre. Eso parte en dos el histórico de costos y precios.
//
// Compara por FAMILIA + DIÁMETRO + PRESENTACIÓN, no por texto suelto. Lo usan
// tanto la auditoría del catálogo como el alta de un producto nuevo.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProductoLike {
  id?: number;
  codigo?: string | null;
  nombre: string;
  medida?: string | null;
  activo?: boolean;
}

export interface Similar extends ProductoLike {
  puntaje: number;
  motivos: string[];
}

/** minúsculas, sin tildes, ½ -> 1/2, comillas y separadores unificados */
export function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4")
    .replace(/[″“”’']/g, '"')
    .replace(/[*×]/g, " x ")
    .replace(/(\d)\s*x\s*(\d)/g, "$1 x $2")   // "4x45" -> "4 x 45"
    .replace(/[_,;:()\[\]]/g, " ")
    // "agua blanca" / "agua negra" son usos, no colores: se pegan para que no
    // ensucien la deteccion de color ("Tubo Gris Agua Blanca" es UN color).
    .replace(/aguas?\s+blancas?/g, "aguablanca")
    .replace(/aguas?\s+negras?/g, "aguanegra")
    .replace(/\s+/g, " ")
    .trim();
}

/** Material: separa lo comprado (PVC) de lo fabricado (PEAD). Nunca se mezclan. */
export function material(texto: string): string | null {
  const t = norm(texto);
  if (/\bpvc\b/.test(t)) return "pvc";
  if (/\bpead\b|polietileno/.test(t)) return "pead";
  return null;
}

/** Color real de la pieza (ya sin "agua blanca/negra"). */
export function color(texto: string): string | null {
  const t = norm(texto);
  for (const c of ["blanc", "negr", "azul", "gris", "amarill", "naranj", "verd", "roj"]) {
    if (new RegExp("\\b" + c + "\\w*\\b").test(t)) return c;
  }
  return null;
}

/** Ángulo del codo/semicodo: 45 y 90 son piezas distintas. */
export function angulo(texto: string): string | null {
  const m = norm(texto).match(/\b(45|90)\b/);
  return m ? m[1] : null;
}

const ANGULARES = ["codo", "semicodo", "curva"];

/** Familia del producto: qué COSA es, sin importar la medida. */
export function familia(texto: string): string {
  const t = norm(texto);
  const tubo = /\btub(o|eria|erias)\b/.test(t);
  const mang = /\bmanguera\b/.test(t);

  if (/\bniple\b/.test(t)) return "niple";
  if (/\bcurva\b/.test(t)) return "curva";
  if (/\bcajetin\b/.test(t)) return "cajetin";
  if (/\baspersor\b/.test(t)) return "aspersor";
  if (/\babrazadera\b/.test(t)) return "abrazadera";
  if (/\btapon\b/.test(t)) return "tapon";
  if (/\bsifon\b/.test(t)) return "sifon";
  if (/\byee?\b/.test(t)) return "yee";
  if (/\btee?\b/.test(t)) return "tee";
  if (/adaptad\w*\s+(rap\w*\s+)?hembra/.test(t)) return "adaptador_hembra";
  if (/adaptad\w*\s+macho/.test(t)) return "adaptador_macho";
  if (/\bunion\b/.test(t)) return "union";
  if (/semi\s*codo/.test(t)) return "semicodo";
  if (/\bcodos?\b/.test(t)) return "codo";

  if (mang) {
    if (/verde|jardin/.test(t)) return "manguera_verde";
    if (/\bgas\b/.test(t)) return "manguera_gas";
    if (/azul/.test(t)) return "manguera_azul";
    return "manguera_riego";
  }
  if (tubo) {
    // Aguas negras / PEAD / polietileno: se separan por color
    if (/aguanegra|pead|polietileno|residual/.test(t)) {
      if (/naranja/.test(t)) return "pead_naranja";
      if (/gris/.test(t)) return "pead_gris";
      return "pead_amarillo";
    }
    if (/electr/.test(t)) {
      if (/blanc/.test(t)) return "tubo_elec_blanco";
      if (/negr/.test(t)) return "tubo_elec_negro";
      return "tubo_elec";
    }
    if (/azul/.test(t)) return "tubo_azul";
    if (/gris/.test(t)) return "tubo_gris";
    if (/blanc/.test(t)) return "tubo_elec_blanco";
    if (/negr/.test(t)) return "tubo_elec_negro";
    return "tubo";
  }
  const palabras = t.split(" ").filter((w) => w.length > 2 && !/^[\d/."]+$/.test(w));
  return palabras.slice(0, 2).join("_") || "otro";
}

/** Familias que en la práctica nombran la misma pieza de otra manera. */
const PARIENTES: [string, string][] = [
  ["codo", "semicodo"],
  ["tubo_gris", "pead_gris"],
  ["tubo", "tubo_azul"], ["tubo", "tubo_gris"],
  ["tubo", "tubo_elec_blanco"], ["tubo", "tubo_elec_negro"], ["tubo", "tubo_elec"],
  ["tubo_elec", "tubo_elec_blanco"], ["tubo_elec", "tubo_elec_negro"],
  ["manguera_riego", "manguera_azul"], ["manguera_verde", "manguera_riego"],
];
function sonParientes(a: string, b: string): boolean {
  return PARIENTES.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

const METRICOS = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160, 200];

/** Diámetros (pulgadas o mm) vs presentación (Lbs, mts, cm). Los grados se ignoran. */
export function medidas(texto: string): { diametros: string[]; presentacion: string[]; variantes: string[] } {
  let t = norm(texto);
  t = t.replace(/\d+\s*(°|grados)/g, " "); // 90 grados / 45 grados no son medidas

  const presentacion: string[] = [];
  const enMm: string[] = [];
  const reP = /(\d+(?:[.,]\d+)?)\s*(lbs?|mts?|metros?|cm|mm)\b/g;
  let m: RegExpExecArray | null;
  while ((m = reP.exec(t))) {
    const u = m[2][0] === "l" ? "lbs" : m[2][0] === "c" ? "cm" : m[2] === "mm" ? "mm" : "mts";
    // "40mm" es el diametro de la pieza, no su presentacion ("Codo Rapido 40mm"
    // es el mismo que "CODO 40").
    if (u === "mm") { enMm.push(m[1]); continue; }
    presentacion.push(m[1] + u);
  }
  const sinPres = t.replace(reP, " ");

  const diametros: string[] = [...enMm];
  const reD = /(\d+\s+\d\/\d|\d\/\d|\d+(?:\.\d+)?)/g;
  while ((m = reD.exec(sinPres))) {
    const crudo = m[1].replace(/\s+/g, " ").trim();
    if (!crudo.includes("/")) {
      const n = Number(crudo);
      if (n > 12 && !METRICOS.includes(n)) continue; // 400Lbs sueltos, códigos, etc.
    }
    diametros.push(crudo);
  }

  const variantes: string[] = [];
  for (const v of ["pesad", "livian", "reforzad", "reduc", "red", "oferta", "rev"]) {
    if (new RegExp("\\b" + v + "\\w*\\b").test(t)) variantes.push(v);
  }
  return {
    diametros: [...new Set(diametros)].sort(),
    presentacion: [...new Set(presentacion)].sort(),
    variantes: [...new Set(variantes)].sort(),
  };
}

const igualSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
const subSet = (a: string[], b: string[]) => a.length > 0 && a.every((x) => b.includes(x));

/** 0-100. >=75 casi seguro el mismo producto; 60-74 conviene revisar. */
export function puntaje(a: ProductoLike, b: ProductoLike): { puntaje: number; motivos: string[] } {
  const ta = a.nombre + " " + (a.medida ?? "");
  const tb = b.nombre + " " + (b.medida ?? "");
  const motivos: string[] = [];

  const fa = familia(ta), fb = familia(tb);
  let p = 0;
  if (fa === fb) { p += 40; motivos.push("misma familia (" + fa + ")"); }
  else if (sonParientes(fa, fb)) { p += 28; motivos.push("familias equivalentes (" + fa + " / " + fb + ")"); }
  else return { puntaje: 0, motivos: [] };

  // Descartes duros: no son el mismo producto por mas que se parezcan.
  const [matA, matB] = [material(ta), material(tb)];
  if (matA && matB && matA !== matB) return { puntaje: 0, motivos: [] };   // PVC comprado != PEAD fabricado
  const [colA, colB] = [color(ta), color(tb)];
  if (colA && colB && colA !== colB) return { puntaje: 0, motivos: [] };   // curva blanca != curva negra
  const [angA, angB] = [angulo(ta), angulo(tb)];
  if (angA && angB && angA !== angB) return { puntaje: 0, motivos: [] };   // codo 45 != codo 90

  const ma = medidas(ta), mb = medidas(tb);
  // En codos "3x90" el 90 es el angulo, no un diametro metrico.
  if (ANGULARES.includes(fa) || ANGULARES.includes(fb)) {
    for (const m of [ma, mb]) {
      if (m.diametros.length > 1) m.diametros = m.diametros.filter((d) => d !== "45" && d !== "90");
    }
  }

  if (ma.diametros.length && igualSet(ma.diametros, mb.diametros)) {
    p += 32; motivos.push("mismo diametro (" + ma.diametros.join(", ") + ")");
  } else if (subSet(ma.diametros, mb.diametros) || subSet(mb.diametros, ma.diametros)) {
    p += 12; motivos.push("diametro contenido");
  } else if (ma.diametros.length && mb.diametros.length) {
    return { puntaje: 0, motivos: [] }; // medidas realmente distintas
  } else {
    p += 6;
  }

  if (ma.presentacion.length && igualSet(ma.presentacion, mb.presentacion)) {
    p += 22; motivos.push("misma presentacion (" + ma.presentacion.join(", ") + ")");
  } else if (!ma.presentacion.length || !mb.presentacion.length) {
    p += 12; motivos.push("uno sin presentacion");
  } else if (subSet(ma.presentacion, mb.presentacion) || subSet(mb.presentacion, ma.presentacion)) {
    p += 14; motivos.push("presentacion contenida");
  } else {
    p -= 35; motivos.push("presentacion distinta (" + ma.presentacion.join(", ") + " vs " + mb.presentacion.join(", ") + ")");
  }

  if (igualSet(ma.variantes, mb.variantes)) p += 6;
  else { p -= 30; motivos.push("variante distinta (" + (ma.variantes.join(",") || "-") + " vs " + (mb.variantes.join(",") || "-") + ")"); }

  if (norm(ta) === norm(tb)) { p = 100; motivos.unshift("nombre identico"); }

  return { puntaje: Math.max(0, Math.min(100, Math.round(p))), motivos };
}

/** Candidatos parecidos a `nuevo` dentro de `catalogo`, de mayor a menor. */
export function buscarSimilares(nuevo: ProductoLike, catalogo: ProductoLike[], umbral = 60, max = 5): Similar[] {
  const out: Similar[] = [];
  for (const p of catalogo) {
    if (nuevo.id && p.id === nuevo.id) continue;
    const r = puntaje(nuevo, p);
    if (r.puntaje >= umbral) out.push({ ...p, puntaje: r.puntaje, motivos: r.motivos });
  }
  return out.sort((x, y) => y.puntaje - x.puntaje).slice(0, max);
}

/** Filas que no son productos: sobras de importaciones de Excel. */
export function pareceBasura(p: ProductoLike): string | null {
  const n = (p.nombre || "").trim();
  if (/^[\d.,\s]+$/.test(n)) return "el nombre es un numero";
  if (/ganancia|material gastado|%-fabrica/i.test(n)) return "es un concepto contable, no un producto";
  if (/^prueba/i.test(n)) return "producto de prueba";
  const med = String(p.medida ?? "").trim();
  if (/^[\d.,]+$/.test(med) && Number(med) > 500) return "la medida es un monto";
  return null;
}
