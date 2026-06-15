import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── LOGO LOADER ───────────────────────────────────────────────────────────────
// Logos are loaded from src/assets/ at runtime via Vite's asset pipeline.
// Glob returns empty object if files are missing — placeholder is used as fallback.

const _logoFiles = import.meta.glob<string>(
  "../assets/*-logo.png",
  { eager: true, import: "default" }
);

interface LogoCached { data: string; w: number; h: number; }
const _logoCache: Record<string, LogoCached> = {};

function _loadLogo(tipo: "ECOPLAST" | "MAXPLASTIC"): Promise<void> {
  const key = tipo === "ECOPLAST"
    ? "../assets/ecoplast-logo.png"
    : "../assets/maxplastic-logo.png";
  const url = _logoFiles[key];
  if (!url || _logoCache[tipo]) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      _logoCache[tipo] = { data: c.toDataURL("image/png"), w: img.naturalWidth, h: img.naturalHeight };
      resolve();
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

// Preload both logos as soon as this module is imported
Promise.all([_loadLogo("ECOPLAST"), _loadLogo("MAXPLASTIC")]).catch(() => {});

// ─── FORMAT HELPERS ────────────────────────────────────────────────────────────

const usd = (n: any): string => {
  const v = Number(n ?? 0);
  if (isNaN(v)) return "$0,00";
  return `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const qty = (n: any): string => {
  const v = Number(n ?? 0);
  if (isNaN(v)) return "0";
  return v % 1 === 0 ? String(v) : v.toFixed(2).replace(".", ",");
};

const fechaStr = (raw: any): string => {
  if (!raw) return "—";
  try {
    return new Date(raw).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(raw); }
};

// ─── PRODUCT FAMILY HELPERS ────────────────────────────────────────────────────

const FAMILIAS_PDF = [
  { patron: /manguera.*(riego|agr|3\/4|1[\s-]3)/i, prio: 1, label: "Manguera Riego" },
  { patron: /tubo azul agua blanca/i, prio: 2, label: "Tubo Azul Agua Blanca" },
  { patron: /tubo gris pead/i, prio: 3, label: "Tubo Gris PEAD" },
  { patron: /tubo el[eé]ctrico negro|tuber[ií]a agua negra gris/i, prio: 4, label: "Tubo Negro" },
  { patron: /tubo el[eé]ctrico blanco/i, prio: 5, label: "Tubo Eléctrico Blanco" },
  { patron: /tuber[ií]a agua negra amarilla|pead.*amarill/i, prio: 6, label: "Tubería Amarilla PEAD" },
  { patron: /tubo naranja pvc|tubo amarillo pvc/i, prio: 7, label: "Tubo PVC Amarillo/Naranja" },
  { patron: /tubo gris agua blanca pvc/i, prio: 8, label: "Tubo Gris Agua Blanca PVC" },
  { patron: /manguera verde|manguera gas/i, prio: 9, label: "Manguera Verde/Gas" },
  { patron: /curva el[eé]ctrica/i, prio: 10, label: "Curva Eléctrica" },
  { patron: /niple azul/i, prio: 11, label: "Niple Azul" },
  { patron: /codo pvc/i, prio: 12, label: "Codo PVC (fabricado)" },
];

function familiaPdf(nombre: string): { prio: number; label: string } {
  for (const f of FAMILIAS_PDF) {
    if (f.patron.test(nombre)) return f;
  }
  return { prio: 99, label: "Otros" };
}

function medidaOrdinalPdf(m: string): number {
  if (!m) return 9999;
  const mixed = m.match(/^(\d+)\s*[½⅓⅔¼¾]|^(\d+)\s+(\d+)\/(\d+)/);
  if (mixed) return Number(mixed[1] ?? mixed[2]) + 0.5;
  const frac = m.match(/^(\d+)\/(\d+)/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const num = parseFloat(m);
  return isNaN(num) ? 9999 : num;
}

function esConexionExternaPdf(prod: { nombre: string; origen?: string }): boolean {
  return (prod.origen ?? "INTERNO").toUpperCase() === "EXTERNO" &&
    !prod.nombre.toLowerCase().includes("manguera");
}

/** Detecta si una línea es "Conexión" para agrupar en el PDF (por código primero, luego nombre/origen) */
function esConexionFrontend(linea: any): boolean {
  const codigo = ((linea.producto?.codigo ?? "") as string).trim().toUpperCase().replace(/\s+/g, "");
  if (codigo && /^(CO-|SC-|SI-|TE-|YE-|YR-)/.test(codigo)) return true;
  const n = (linea.producto?.nombre ?? "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (n.includes("abrazadera")) return true;
  if (n.includes("tee") && n.includes("rapid")) return true;
  if (n.includes("union") && (n.includes("reduc") || n.includes("rapid"))) return true;
  if (n.includes("adaptador") && (n.includes("macho") || n.includes("hembra"))) return true;
  if (n.includes("cajeti")) return true;
  if (n.includes("aspersor")) return true;
  // Fallback: origen EXTERNO (excepto mangueras que son tuberías flexibles)
  const origen = (linea.producto?.origen ?? "INTERNO").toUpperCase();
  if (origen === "EXTERNO" && !n.includes("manguera")) return true;
  return false;
}

// ─── EMPRESA THEME ─────────────────────────────────────────────────────────────

type EmpresaTipo = "ECOPLAST" | "MAXPLASTIC";

interface Tema {
  tipo: EmpresaTipo;
  nombre: string;
  rif: string;
  primary: [number, number, number];
}

const TEMAS: Record<string, Tema> = {
  "ECOPLAST F.P.": {
    tipo: "ECOPLAST",
    nombre: "ECOPLAST F.P.",
    rif: "V-09331724-2",
    primary: [22, 101, 52],
  },
  "MAXPLASTIC F.P.": {
    tipo: "MAXPLASTIC",
    nombre: "MAXPLASTIC F.P.",
    rif: "J-XXXXXXXXX-X",
    primary: [30, 58, 138],
  },
};

function detectarTema(data: any): Tema {
  const nombre =
    data?.empresa?.nombre ??
    data?.cliente?.empresaFactura ??
    data?.lineas?.[0]?.cotizacion?.cliente?.empresaFactura ??
    "ECOPLAST F.P.";
  return TEMAS[nombre] ?? TEMAS["ECOPLAST F.P."];
}

// ─── LOGO DRAWING ─────────────────────────────────────────────────────────────

function drawLogo(doc: jsPDF, tema: Tema, x: number, y: number, w: number, h: number) {
  const cached = _logoCache[tema.tipo];
  if (cached) {
    // Maintain aspect ratio, fit within box, center
    const ratio = cached.w / cached.h;
    let iw = w, ih = w / ratio;
    if (ih > h) { ih = h; iw = h * ratio; }
    doc.addImage(cached.data, "PNG", x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
    return;
  }
  // Fallback placeholder
  const [r, g, b] = tema.primary;
  doc.setFillColor(r, g, b);
  doc.roundedRect(x, y, w, h, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(Math.min(h * 0.45, 13));
  doc.text(tema.tipo === "ECOPLAST" ? "EP" : "MP", x + w / 2, y + h * 0.65, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

// ─── PAGE FOOTERS ──────────────────────────────────────────────────────────────

function addFooters(doc: jsPDF) {
  const total = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Pág. ${i}/${total}`, 196, 291, { align: "right" });
    doc.setTextColor(0);
  }
}

// ─── ECOPLAST HEADER ───────────────────────────────────────────────────────────
// Layout: 2×2 client info grid (left) + logo box (right) + centered title

function cabeceraEcoplast(
  doc: jsPDF,
  tema: Tema,
  titulo: string,
  numero: string,
  cliente: any,
  fechaDoc: string
): number {
  const W = 210;
  const M = 14;
  const [r, g, b] = tema.primary;

  const logoW = 40;
  const boxH = 34;
  const boxW = W - M * 2 - logoW - 4;
  const boxX = M;
  const boxY = 10;
  const midX = boxX + boxW / 2;
  const midY = boxY + boxH / 2;

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.rect(boxX, boxY, boxW, boxH);
  doc.line(midX, boxY, midX, boxY + boxH);
  doc.line(boxX, midY, boxX + boxW, midY);

  const cellW = boxW / 2 - 3;

  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.text("Cliente:", boxX + 2, boxY + 4.5);
  doc.text("RIF:", boxX + 2, midY + 4.5);
  doc.text("Dirección:", midX + 2, boxY + 4.5);
  doc.text("Fecha:", midX + 2, midY + 4.5);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);

  const cnLines = doc.splitTextToSize(cliente?.nombre ?? "—", cellW);
  doc.text(cnLines.slice(0, 2) as string[], boxX + 2, boxY + 9.5);
  doc.text(cliente?.rif ?? "—", boxX + 2, midY + 9.5);

  const dirLines = doc.splitTextToSize(cliente?.direccion ?? "—", cellW);
  doc.text(dirLines.slice(0, 2) as string[], midX + 2, boxY + 9.5);
  doc.text(fechaDoc, midX + 2, midY + 9.5);

  drawLogo(doc, tema, W - M - logoW, boxY, logoW, boxH);

  const tY = boxY + boxH + 10;
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(titulo, W / 2, tY, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(`N° ${numero}`, W / 2, tY + 6, { align: "center" });

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.7);
  doc.line(M, tY + 10, W - M, tY + 10);
  doc.setLineWidth(0.3);
  doc.setTextColor(0, 0, 0);

  return tY + 15;
}

// ─── MAXPLASTIC HEADER ─────────────────────────────────────────────────────────
// Layout: logo (top-left) + company name + N° Documento (top-right) + client section

function cabeceraMaxplastic(
  doc: jsPDF,
  tema: Tema,
  titulo: string,
  numero: string,
  cliente: any,
  fechaDoc: string
): number {
  const W = 210;
  const M = 14;
  const [r, g, b] = tema.primary;

  // Logo wide — the MAXPLASTIC image already contains the company name
  drawLogo(doc, tema, M, 6, 80, 22);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Formato de facturación / ${titulo.toLowerCase()}`, M, 31);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(`N° Documento: ${numero}`, W - M, 10, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${fechaDoc}`, W - M, 16, { align: "right" });
  doc.text("Moneda: USD", W - M, 22, { align: "right" });

  doc.setFillColor(r, g, b);
  doc.rect(M, 35, W - M * 2, 0.5, "F");

  const cY = 42;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("Datos del Cliente", M, cY);

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  const tw = doc.getTextWidth("Datos del Cliente");
  doc.line(M, cY + 1.5, M + tw, cY + 1.5);
  doc.setLineWidth(0.3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Nombre: ${cliente?.nombre ?? "—"}`, M, cY + 7);
  doc.text(`RIF: ${cliente?.rif ?? "—"}`, M, cY + 13);

  let yAfter = cY + 18;
  if (cliente?.direccion) {
    const dirLines = doc.splitTextToSize(`Dirección: ${cliente.direccion}`, W - M * 2);
    doc.text((dirLines as string[]).slice(0, 2), M, cY + 19);
    yAfter = cY + 19 + Math.min((dirLines as string[]).length - 1, 1) * 5;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(M, yAfter + 4, W - M, yAfter + 4);
  doc.setDrawColor(0, 0, 0);

  return yAfter + 9;
}

// ─── TOTALS BOX ────────────────────────────────────────────────────────────────

function drawTotalsBox(
  doc: jsPDF,
  tema: Tema,
  startY: number,
  totalBruto: number,
  descuento: number,
  totalNeto: number,
  extraLabel?: string,
  split?: { tuberias: number; conexiones: number }
): number {
  const [r, g, b] = tema.primary;
  const boxX = 130;
  const lineH = 7;

  const subRows: [string, string][] = [];
  if (split && split.tuberias > 0 && split.conexiones > 0) {
    subRows.push(["Total Tuberías:", usd(split.tuberias)]);
    subRows.push(["Total Conexiones:", usd(split.conexiones)]);
  } else if (descuento > 0.005) {
    subRows.push(["Subtotal:", usd(totalBruto)]);
    subRows.push(["Descuento:", `−${usd(descuento)}`]);
  }

  const totalRowH = 10;
  const extraH = extraLabel ? 7 : 0;
  const boxH = 4 + subRows.length * lineH + totalRowH + extraH + 2;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, startY, 66, boxH, 2, 2, "F");

  let y = startY + 7;
  doc.setFontSize(9);

  for (const [label, val] of subRows) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(label, boxX + 3, y);
    doc.setTextColor(0, 0, 0);
    doc.text(val, boxX + 63, y, { align: "right" });
    y += lineH;
  }

  const [hr, hg, hb]: [number, number, number] =
    tema.tipo === "MAXPLASTIC" ? [254, 240, 138] : [r, g, b];
  const [tr, tg, tb]: [number, number, number] =
    tema.tipo === "MAXPLASTIC" ? [0, 0, 0] : [255, 255, 255];

  doc.setFillColor(hr, hg, hb);
  doc.roundedRect(boxX, y, 66, totalRowH, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(tr, tg, tb);
  doc.text("TOTAL:", boxX + 3, y + 7);
  doc.text(usd(totalNeto), boxX + 63, y + 7, { align: "right" });
  doc.setTextColor(0, 0, 0);

  y += totalRowH + 2;

  if (extraLabel) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(180, 0, 0);
    doc.text(extraLabel, boxX + 3, y + 5);
    doc.setTextColor(0, 0, 0);
    y += extraH;
  }

  return y;
}

// ─── TABLE BUILDERS ────────────────────────────────────────────────────────────

type DocTipo = "cot" | "fac" | "des";

interface TableConfig {
  headers: string[];
  rows: any[][];
  subtotalRows: Set<number>;
  conexionRows: Set<number>;   // índices de filas que son conexiones (fondo suave)
  colStyles: Record<number, any>;
  totalTub: number;
  totalCon: number;
}

/** Ordena líneas de tuberías por familia y luego por medida ordinal */
function sortLineasTub(lineas: any[]): any[] {
  return [...lineas].sort((a, b) => {
    const fa = familiaPdf(a.producto?.nombre ?? "");
    const fb = familiaPdf(b.producto?.nombre ?? "");
    if (fa.prio !== fb.prio) return fa.prio - fb.prio;
    return medidaOrdinalPdf(a.producto?.medida ?? "") - medidaOrdinalPdf(b.producto?.medida ?? "");
  });
}

// ECOPLAST: dos grupos — Tuberías/Mangueras + Conexiones — cada uno con subtotal
function tablaEcoplast(lineas: any[], tipo: DocTipo): TableConfig {
  const esDespacho = tipo === "des";
  const headers = esDespacho
    ? ["Descripción Producto", "Medida", "Pedido", "Despachado", "Costo Unit.", "Costo Total"]
    : ["Descripción Producto", "Medida", "Cantidad", "Costo Unit.", "Costo Total"];

  const rows: any[][] = [];
  const subtotalRows = new Set<number>();
  const conexionRows  = new Set<number>();

  const lineasTub = sortLineasTub(lineas.filter(l => !esConexionFrontend(l)));
  const lineasCon = lineas.filter(l => esConexionFrontend(l));
  const cols = esDespacho ? 6 : 5;

  function buildRow(l: any): { row: any[]; total: number } {
    if (esDespacho) {
      const cotLinea = l.cotizacion?.lineas?.find(
        (cl: any) => Number(cl.productoId) === Number(l.productoId)
      );
      const precio = cotLinea ? Number(cotLinea.precioFinal) : 0;
      const cantDesp = Number(l.cantidadDespachada ?? 0);
      const total = precio * cantDesp;
      return { row: [l.producto?.nombre ?? "—", l.producto?.medida ?? "—", qty(l.cantidadPedida), qty(cantDesp), usd(precio), usd(total)], total };
    } else if (tipo === "cot") {
      const total = Number(l.totalLinea ?? 0);
      const cantStr = l.notaCantidad ? `${qty(l.cantidad)} (${l.notaCantidad})` : qty(l.cantidad);
      return { row: [l.producto?.nombre ?? "—", l.producto?.medida ?? "—", cantStr, usd(l.precioFinal ?? l.precioUnitarioAplicado ?? 0), usd(total)], total };
    } else {
      const total = Number(l.totalLinea ?? 0);
      return { row: [l.producto?.nombre ?? "—", l.producto?.medida ?? "—", qty(l.cantidad), usd(l.precioUnitario ?? 0), usd(total)], total };
    }
  }

  // ── Grupo Tuberías ────────────────────────────────────────────────────────
  let totalTub = 0;
  for (const l of lineasTub) {
    const { row, total } = buildRow(l);
    totalTub += total;
    rows.push(row);
  }
  if (lineasTub.length > 0) {
    const sub = Array(cols).fill("");
    sub[0] = "Total Tuberías";
    sub[cols - 1] = usd(totalTub);
    rows.push(sub);
    subtotalRows.add(rows.length - 1);
  }

  // ── Grupo Conexiones ──────────────────────────────────────────────────────
  let totalCon = 0;
  for (const l of lineasCon) {
    const { row, total } = buildRow(l);
    totalCon += total;
    const idx = rows.length;
    rows.push(row);
    conexionRows.add(idx);
  }
  if (lineasCon.length > 0) {
    const sub = Array(cols).fill("");
    sub[0] = "Total Conexiones";
    sub[cols - 1] = usd(totalCon);
    rows.push(sub);
    subtotalRows.add(rows.length - 1);
  }

  const colStyles: Record<number, any> = esDespacho
    ? { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "center", fontStyle: "bold" }, 4: { halign: "right" }, 5: { halign: "right", fontStyle: "bold" } }
    : { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } };

  return { headers, rows, subtotalRows, conexionRows, colStyles, totalTub, totalCon };
}

// MAXPLASTIC: numbered items, no grouping
function tablaMaxplastic(lineas: any[], tipo: DocTipo): TableConfig {
  const esDespacho = tipo === "des";

  const headers = esDespacho
    ? ["#", "Descripción", "Medida", "Cantidad", "Costo Unit.", "Costo Total"]
    : ["#", "Descripción", "Medida", "Cantidad", "Costo Unit.", "Desc.", "Costo Total"];

  const rows: any[][] = [];

  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (esDespacho) {
      const cotLinea = l.cotizacion?.lineas?.find(
        (cl: any) => Number(cl.productoId) === Number(l.productoId)
      );
      const precio = cotLinea ? Number(cotLinea.precioFinal) : 0;
      const cantDesp = Number(l.cantidadDespachada ?? 0);
      rows.push([
        i + 1,
        l.producto?.nombre ?? "—",
        l.producto?.medida ?? "—",
        qty(cantDesp),
        usd(precio),
        usd(precio * cantDesp),
      ]);
    } else if (tipo === "cot") {
      const desc = Number(l.descuentoPct ?? 0);
      rows.push([
        i + 1,
        l.producto?.nombre ?? "—",
        l.producto?.medida ?? "—",
        l.notaCantidad ? `${qty(l.cantidad)} (${l.notaCantidad})` : qty(l.cantidad),
        usd(l.precioUnitarioAplicado ?? 0),
        desc > 0 ? `${desc}%` : "—",
        usd(l.totalLinea ?? 0),
      ]);
    } else {
      const desc = Number(l.descuentoPct ?? 0);
      rows.push([
        i + 1,
        l.producto?.nombre ?? "—",
        l.producto?.medida ?? "—",
        qty(l.cantidad),
        usd(l.precioUnitario ?? 0),
        desc > 0 ? `${desc}%` : "—",
        usd(l.totalLinea ?? 0),
      ]);
    }
  }

  const colStyles: Record<number, any> = esDespacho
    ? {
        0: { cellWidth: 9, halign: "center" },
        2: { halign: "center" },
        3: { halign: "center", fontStyle: "bold" },
        4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
      }
    : {
        0: { cellWidth: 9, halign: "center" },
        2: { halign: "center" },
        3: { halign: "center" },
        4: { halign: "right" },
        5: { halign: "center" },
        6: { halign: "right", fontStyle: "bold" },
      };

  return { headers, rows, subtotalRows: new Set(), colStyles };
}

// ─── DRAW TABLE ────────────────────────────────────────────────────────────────

function drawTable(doc: jsPDF, tema: Tema, startY: number, config: TableConfig): number {
  const [r, g, b] = tema.primary;

  autoTable(doc, {
    startY,
    head: [config.headers],
    body: config.rows,
    styles: { fontSize: 8.5, cellPadding: [2.5, 2] },
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
    columnStyles: config.colStyles,
    alternateRowStyles: tema.tipo === "MAXPLASTIC" ? { fillColor: [248, 250, 252] } : undefined,
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const idx = data.row.index;
      if (config.subtotalRows.has(idx)) {
        const isTub = (config.rows[idx]?.[0] as string ?? "").includes("Tuberías");
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = isTub ? [22, 101, 52] : [30, 58, 95];
        data.cell.styles.textColor = [255, 255, 255];
      } else if (config.conexionRows?.has(idx)) {
        data.cell.styles.fillColor = [239, 246, 255]; // azul muy suave para conexiones
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

// ─── PDF COTIZACIÓN ────────────────────────────────────────────────────────────

export function pdfCotizacion(cot: any) {
  const doc = new jsPDF();
  const tema = detectarTema(cot);
  const cliente = cot.cliente ?? {};
  const fechaDoc = fechaStr(cot.creadoEn);
  const lineas: any[] = cot.lineas ?? [];

  const startY =
    tema.tipo === "ECOPLAST"
      ? cabeceraEcoplast(doc, tema, "COTIZACIÓN", cot.numero, cliente, fechaDoc)
      : cabeceraMaxplastic(doc, tema, "COTIZACIÓN", cot.numero, cliente, fechaDoc);

  const config =
    tema.tipo === "ECOPLAST"
      ? tablaEcoplast(lineas, "cot")
      : tablaMaxplastic(lineas, "cot");

  const fy = drawTable(doc, tema, startY, config);

  // Notes (bottom-left, next to totals)
  if (cot.notas) {
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(60, 60, 60);
    doc.text("Notas:", 14, fy + 6);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(cot.notas, 108) as string[];
    doc.text(lines.slice(0, 3), 14, fy + 12);
  }

  const splitCot = tema.tipo === "ECOPLAST" ? { tuberias: config.totalTub, conexiones: config.totalCon } : undefined;
  drawTotalsBox(doc, tema, fy, Number(cot.totalBruto), Number(cot.descuentoTotal), Number(cot.totalNeto), undefined, splitCot);

  // Condiciones de pago (both company types)
  if (cliente.condicionPago) {
    const cpY = fy + 52;
    if (cpY < 282) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`Condiciones de pago: ${cliente.condicionPago}`, 105, cpY, { align: "center" });
    }
  }

  addFooters(doc);
  doc.save(`${cot.numero}.pdf`);
}

// ─── PDF COTIZACIÓN CON GANANCIA (COPIA INTERNA) ───────────────────────────────

export function pdfCotizacionGanancia(cot: any) {
  const doc = new jsPDF();
  const tema = detectarTema(cot);
  const cliente = cot.cliente ?? {};
  const fechaDoc = fechaStr(cot.creadoEn);
  const lineas: any[] = cot.lineas ?? [];

  const ftPct = Number(cliente.fleteTuberiaPct ?? 0);
  const fcPct = Number(cliente.fleteConexionesPct ?? 0);
  const ctPct = Number(cliente.comisionTuberiaPct ?? 0);
  const ccPct = Number(cliente.comisionConexionesPct ?? 0);

  const esConexion = (l: any) =>
    (l.producto?.origen ?? "INTERNO") === "EXTERNO" &&
    !(l.producto?.nombre ?? "").toLowerCase().includes("manguera");

  const lineasTub = lineas.filter((l) => !esConexion(l));
  const lineasCon = lineas.filter((l) => esConexion(l));
  const totalTub = lineasTub.reduce((s, l) => s + Number(l.totalLinea), 0);
  const totalCon = lineasCon.reduce((s, l) => s + Number(l.totalLinea), 0);

  const costoFlete =
    (ftPct > 0 ? totalTub * ftPct / (100 + ftPct) : 0) +
    (fcPct > 0 ? totalCon * fcPct / (100 + fcPct) : 0);
  const gananciaVendedor =
    (ctPct > 0 ? totalTub * ctPct / (100 + ctPct) : 0) +
    (ccPct > 0 ? totalCon * ccPct / (100 + ccPct) : 0);
  const labelVendedor = [
    ctPct > 0 && totalTub > 0 ? `${ctPct}% tub` : "",
    ccPct > 0 && totalCon > 0 ? `${ccPct}% con` : "",
  ].filter(Boolean).join(" · ");
  const totalGanancia = costoFlete + gananciaVendedor;

  // Same header as customer quote
  const startY =
    tema.tipo === "ECOPLAST"
      ? cabeceraEcoplast(doc, tema, "COTIZACIÓN", cot.numero, cliente, fechaDoc)
      : cabeceraMaxplastic(doc, tema, "COTIZACIÓN", cot.numero, cliente, fechaDoc);

  // "COPIA INTERNA" watermark strip
  const [r, g, b] = tema.primary;
  doc.setFillColor(220, 252, 231);
  doc.rect(14, startY - 6, 182, 7, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(22, 101, 52);
  doc.text("*  COPIA INTERNA - COTIZACION CON GANANCIA - NO ENVIAR AL CLIENTE  *", 105, startY - 1.5, { align: "center" });
  doc.setTextColor(0, 0, 0);

  const config =
    tema.tipo === "ECOPLAST"
      ? tablaEcoplast(lineas, "cot")
      : tablaMaxplastic(lineas, "cot");

  const fy = drawTable(doc, tema, startY + 2, config);
  const splitGan = tema.tipo === "ECOPLAST" ? { tuberias: (config as any).totalTub, conexiones: (config as any).totalCon } : undefined;
  drawTotalsBox(doc, tema, fy, Number(cot.totalBruto), Number(cot.descuentoTotal), Number(cot.totalNeto), undefined, splitGan);

  // Ganancia breakdown box
  const bY = fy + 46;
  if (bY < 250) {
    const boxRows = (costoFlete > 0 ? 1 : 0) + (gananciaVendedor > 0 ? 1 : 0);
    const boxH = 14 + boxRows * 10;
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(14, bY, 182, boxH, 3, 3, "F");
    doc.setDrawColor(134, 239, 172);
    doc.setLineWidth(0.5);
    doc.roundedRect(14, bY, 182, boxH, 3, 3, "D");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(22, 101, 52);
    doc.text("DESGLOSE DE GANANCIA INTERNA", 105, bY + 7, { align: "center" });
    doc.setLineWidth(0.3);
    doc.setDrawColor(134, 239, 172);
    doc.line(14, bY + 10, 196, bY + 10);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    let rowY = bY + 17;
    const col1 = 20, col2 = 192;

    // Header row
    doc.setFont("helvetica", "bold");
    doc.setTextColor(80, 80, 80);
    doc.text("Concepto", col1, rowY);
    doc.text("Monto", col2, rowY, { align: "right" });
    rowY += 6;

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);

    if (costoFlete > 0) {
      doc.text("Costo Flete", col1, rowY);
      doc.text(usd(costoFlete), col2, rowY, { align: "right" });
      rowY += 6;
    }
    if (gananciaVendedor > 0) {
      const vendLabel = labelVendedor ? `Ganancia Vendedor  (${labelVendedor})` : "Ganancia Vendedor";
      doc.text(vendLabel, col1, rowY);
      doc.text(usd(gananciaVendedor), col2, rowY, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
  }

  addFooters(doc);
  doc.save(`${cot.numero}-ganancia.pdf`);
}

// ─── PDF FACTURA ───────────────────────────────────────────────────────────────

export function pdfFactura(fac: any) {
  const doc = new jsPDF();
  const tema = detectarTema(fac);
  const cliente = fac.cliente ?? {};
  const fechaDoc = fechaStr(fac.fechaEmision ?? fac.creadoEn);
  const lineas: any[] = fac.lineas ?? [];

  const startY =
    tema.tipo === "ECOPLAST"
      ? cabeceraEcoplast(doc, tema, "FACTURA", fac.numero, cliente, fechaDoc)
      : cabeceraMaxplastic(doc, tema, "FACTURA", fac.numero, cliente, fechaDoc);

  const config =
    tema.tipo === "ECOPLAST"
      ? tablaEcoplast(lineas, "fac")
      : tablaMaxplastic(lineas, "fac");

  const fy = drawTable(doc, tema, startY, config);

  const saldo = Number(fac.saldoPendiente ?? 0);
  const extraLabel = saldo > 0.005 ? `Saldo pendiente: ${usd(saldo)}` : undefined;
  const splitFac = tema.tipo === "ECOPLAST" ? { tuberias: (config as any).totalTub, conexiones: (config as any).totalCon } : undefined;
  const fyAfter = drawTotalsBox(
    doc,
    tema,
    fy,
    Number(fac.totalBruto),
    Number(fac.descuentoTotal),
    Number(fac.totalNeto),
    extraLabel,
    splitFac
  );

  // Notas internas (if any)
  if (fac.notas) {
    const notaY = fy + 2;
    if (notaY < 255) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100, 100, 100);
      const notaLines = doc.splitTextToSize(`Nota: ${fac.notas}`, 108) as string[];
      doc.text(notaLines.slice(0, 2), 14, notaY + 6);
      doc.setTextColor(0, 0, 0);
    }
  }

  const sigY = Math.min(fyAfter + 15, 268);
  if (sigY < 272) {
    doc.setDrawColor(180);
    doc.setLineWidth(0.4);
    doc.line(14, sigY, 82, sigY);
    doc.line(128, sigY, 196, sigY);
    doc.setFontSize(7.5);
    doc.setTextColor(100);
    doc.text("Firma Cliente", 48, sigY + 4, { align: "center" });
    doc.text("Firma / Sello Empresa", 162, sigY + 4, { align: "center" });
    doc.setTextColor(0);
  }

  // MAXPLASTIC: condiciones de pago
  if (tema.tipo === "MAXPLASTIC" && cliente.condicionPago) {
    const cpY = sigY + 14;
    if (cpY < 285) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`Condiciones de pago: ${cliente.condicionPago}`, 105, cpY, { align: "center" });
    }
  }

  addFooters(doc);
  doc.save(`${fac.numero}.pdf`);
}

// ─── PDF HOJA DE PRODUCCIÓN ────────────────────────────────────────────────────

export function pdfHojaProduccion(cot: any) {
  const doc = new jsPDF();
  const tema = detectarTema(cot);
  const [r, g, b] = tema.primary;
  const cliente = cot.cliente ?? {};
  const lineas: any[] = cot.lineas ?? [];

  // Header bar
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 210, 8, "F");

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.text("HOJA DE PRODUCCIÓN", 105, 20, { align: "center" });

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.6);
  doc.line(14, 24, 196, 24);

  // Info grid
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);

  const infoY = 32;
  doc.text("Cotización:", 14, infoY);
  doc.text("Cliente:", 14, infoY + 7);
  doc.text("Fecha:", 14, infoY + 14);
  doc.text("Empresa:", 105, infoY);
  doc.text("RIF:", 105, infoY + 7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.text(cot.numero ?? "—", 46, infoY);
  const clienteLines = doc.splitTextToSize(cliente.nombre ?? "—", 85) as string[];
  doc.text(clienteLines.slice(0, 1), 46, infoY + 7);
  doc.text(fechaStr(cot.creadoEn), 46, infoY + 14);
  doc.text(cot.empresa?.nombre ?? cliente.empresaFactura ?? "—", 128, infoY);
  doc.text(cliente.rif ?? "—", 128, infoY + 7);

  if (cot.notas) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    const notaLines = doc.splitTextToSize(`Notas: ${cot.notas}`, 182) as string[];
    doc.text(notaLines.slice(0, 2), 14, infoY + 21);
    doc.setTextColor(0, 0, 0);
  }

  // Sort lineas by family priority + medida
  const lineasSorted = [...lineas].sort((a: any, b: any) => {
    const fa = familiaPdf(a.producto?.nombre ?? "");
    const fb = familiaPdf(b.producto?.nombre ?? "");
    if (fa.prio !== fb.prio) return fa.prio - fb.prio;
    return medidaOrdinalPdf(a.producto?.medida ?? "") - medidaOrdinalPdf(b.producto?.medida ?? "");
  });

  // Build rows with group separator rows
  const prodRows: any[][] = [];
  const prodHeaderRows = new Set<number>();
  let lastFamLabel = "";
  for (const l of lineasSorted) {
    const fam = familiaPdf(l.producto?.nombre ?? "");
    if (fam.label !== lastFamLabel) {
      prodRows.push(["__HEADER__", fam.label, "", "", ""]);
      prodHeaderRows.add(prodRows.length - 1);
      lastFamLabel = fam.label;
    }
    prodRows.push([
      l.producto?.nombre ?? "—",
      l.producto?.medida ?? "—",
      l.notaCantidad ? `${qty(l.cantidad)} (${l.notaCantidad})` : qty(l.cantidad),
      "",
      "",
    ]);
  }

  // Product table
  autoTable(doc, {
    startY: infoY + 32,
    head: [["Descripción del Producto", "Medida", "Cantidad Pedida", "Fabricado", "Faltante"]],
    body: prodRows,
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 9 },
    styles: { fontSize: 9.5, cellPadding: [4, 3], minCellHeight: 11 },
    columnStyles: {
      0: { cellWidth: 78 },
      1: { halign: "center", cellWidth: 28 },
      2: { halign: "center", cellWidth: 30 },
      3: { halign: "center", cellWidth: 27 },
      4: { halign: "center", cellWidth: 27 },
    },
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === "body" && prodHeaderRows.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [22, 101, 52];
        data.cell.styles.fontSize = 8;
        // Show label only in first column, clear others
        if (data.column.index === 0) {
          data.cell.text = [data.row.raw[1] as string];
        } else {
          data.cell.text = [""];
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY ?? 200;

  // Signatures
  const sigY = Math.min(finalY + 24, 268);
  doc.setDrawColor(150);
  doc.setLineWidth(0.4);
  doc.line(14, sigY, 90, sigY);
  doc.line(110, sigY, 196, sigY);
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text("Responsable de Producción", 52, sigY + 5, { align: "center" });
  doc.text("Jefe de Despacho", 153, sigY + 5, { align: "center" });
  doc.setTextColor(0);

  addFooters(doc);
  doc.save(`${cot.numero}-produccion.pdf`);
}

// ─── PDF ORDEN DE DESPACHOS ────────────────────────────────────────────────────

export function pdfOrdenDespachos(cotizaciones: any[], orden: number[]) {
  const doc = new jsPDF({ orientation: "landscape" });
  const [r, g, b]: [number, number, number] = [22, 101, 52];

  // Order cotizaciones by provided order array
  const ordered = orden.length > 0
    ? orden.map((id) => cotizaciones.find((c: any) => c.id === id)).filter(Boolean) as any[]
    : cotizaciones as any[];

  // Build unique products map (exclude external connections)
  const productMap = new Map<number, { nombre: string; medida: string; origen: string }>();
  for (const cot of ordered) {
    for (const l of cot.lineas ?? []) {
      if (!productMap.has(l.productoId)) {
        const prod = {
          nombre: l.producto?.nombre ?? "—",
          medida: l.producto?.medida ?? "—",
          origen: l.producto?.origen ?? "INTERNO",
        };
        if (!esConexionExternaPdf(prod)) {
          productMap.set(l.productoId, prod);
        }
      }
    }
  }

  // Sort products by family priority + medida ordinal
  const products = Array.from(productMap.entries()).sort((a, b) => {
    const fa = familiaPdf(a[1].nombre);
    const fb = familiaPdf(b[1].nombre);
    if (fa.prio !== fb.prio) return fa.prio - fb.prio;
    return medidaOrdinalPdf(a[1].medida) - medidaOrdinalPdf(b[1].medida);
  });

  // Build lookup: productId → cotId → quantity
  const lookup = new Map<number, Map<number, number>>();
  for (const cot of ordered) {
    for (const l of cot.lineas ?? []) {
      if (!lookup.has(l.productoId)) lookup.set(l.productoId, new Map());
      lookup.get(l.productoId)!.set(cot.id, Number(l.cantidad));
    }
  }

  // Title
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, 297, 8, "F");

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.text("ORDEN DE PRODUCCIÓN / DESPACHOS", 148.5, 18, { align: "center" });

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Generado: ${new Date().toLocaleDateString("es-VE")}   ·   ${ordered.length} cotizaciones aprobadas   ·   ${products.length} productos a fabricar`,
    148.5, 24, { align: "center" }
  );

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 283, 27);

  // Build table headers and rows (with group separator rows)
  const headers = [
    "Descripción Producto",
    "Medida",
    ...ordered.map((c: any) => `${c.cliente?.nombre ?? "?"}\n${c.numero}`),
    "TOTAL",
  ];

  const totalCols = 2 + ordered.length + 1;
  const rows: any[][] = [];
  const groupHeaderRows = new Set<number>();
  let lastFamLabel = "";

  for (const [productId, p] of products) {
    const fam = familiaPdf(p.nombre);
    if (fam.label !== lastFamLabel) {
      // Separator row spanning all columns
      rows.push(["__HEADER__", fam.label, ...Array(totalCols - 2).fill("")]);
      groupHeaderRows.add(rows.length - 1);
      lastFamLabel = fam.label;
    }
    const qtMap = lookup.get(productId);
    const qtys = ordered.map((c: any) => {
      const q = qtMap?.get(c.id);
      return q ? qty(q) : "";
    });
    const total = ordered.reduce((s: number, c: any) => s + (qtMap?.get(c.id) ?? 0), 0);
    rows.push([p.nombre, p.medida, ...qtys, total > 0 ? qty(total) : ""]);
  }

  // Column widths
  const pageW = 297 - 28;
  const fixedW = 78 + 24;
  const dynColW = Math.max(18, Math.min(32, (pageW - fixedW - 24) / Math.max(ordered.length, 1)));

  const colStyles: Record<number, any> = {
    0: { cellWidth: 78 },
    1: { halign: "center", cellWidth: 24 },
    [totalCols - 1]: { halign: "center", fontStyle: "bold", cellWidth: 24, fillColor: [220, 252, 231], textColor: [22, 101, 52] },
  };
  for (let i = 2; i < totalCols - 1; i++) {
    colStyles[i] = { halign: "center", cellWidth: dynColW };
  }

  autoTable(doc, {
    startY: 31,
    head: [headers],
    body: rows,
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 7, valign: "middle", halign: "center", minCellHeight: 14 },
    styles: { fontSize: 7.5, cellPadding: [2.5, 2] },
    columnStyles: colStyles,
    margin: { left: 14, right: 14 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data) => {
      if (data.section === "head" && data.column.index >= 2 && data.column.index < totalCols - 1) {
        data.cell.styles.fontSize = 6.5;
      }
      if (data.section === "body" && groupHeaderRows.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [220, 252, 231];
        data.cell.styles.textColor = [22, 101, 52];
        data.cell.styles.fontSize = 7;
        if (data.column.index === 0) {
          data.cell.text = [data.row.raw[1] as string];
        } else {
          data.cell.text = [""];
        }
      }
    },
  });

  addFooters(doc);
  doc.save(`orden-produccion-${new Date().toISOString().split("T")[0]}.pdf`);
}

// ─── PDF DESPACHO / MANIFIESTO ─────────────────────────────────────────────────

export function pdfDespacho(des: any) {
  const doc = new jsPDF();
  const cliente = des.lineas?.[0]?.cotizacion?.cliente ?? {};
  const tema = detectarTema({ cliente });
  const fechaDoc = fechaStr(des.fechaSalida ?? des.creadoEn);
  const lineas: any[] = des.lineas ?? [];

  let startY =
    tema.tipo === "ECOPLAST"
      ? cabeceraEcoplast(doc, tema, "DESPACHO", des.numero, cliente, fechaDoc)
      : cabeceraMaxplastic(doc, tema, "DESPACHO", des.numero, cliente, fechaDoc);

  // Chofer / Vehículo line
  if (des.chofer || des.vehiculo) {
    const parts = [
      des.chofer && `Chofer: ${des.chofer}`,
      des.vehiculo && `Vehículo: ${des.vehiculo}`,
    ].filter(Boolean).join("   ·   ");
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(60, 60, 60);
    doc.text(parts, 14, startY);
    startY += 6;
  }

  const config =
    tema.tipo === "ECOPLAST"
      ? tablaEcoplast(lineas, "des")
      : tablaMaxplastic(lineas, "des");

  const fy = drawTable(doc, tema, startY, config);

  // Calculate total from dispatched + cotización prices
  const hasPrices = lineas.some((l: any) =>
    (l.cotizacion?.lineas ?? []).some((cl: any) => Number(cl.productoId) === Number(l.productoId))
  );

  if (hasPrices) {
    const totalDesp = lineas.reduce((acc: number, l: any) => {
      const cotLinea = (l.cotizacion?.lineas ?? []).find(
        (cl: any) => Number(cl.productoId) === Number(l.productoId)
      );
      const precio = cotLinea ? Number(cotLinea.precioFinal) : 0;
      return acc + precio * Number(l.cantidadDespachada ?? 0);
    }, 0);
    const splitDes = tema.tipo === "ECOPLAST" ? { tuberias: (config as any).totalTub, conexiones: (config as any).totalCon } : undefined;
    drawTotalsBox(doc, tema, fy, totalDesp, 0, totalDesp, undefined, splitDes);
  }

  // "RECIBI CONFORME" signature — add new page if table is too close to page bottom
  const sigOffset = hasPrices ? 50 : 20;
  const needsNewPage = fy + sigOffset + 15 > 275;
  if (needsNewPage) doc.addPage();
  const sigY = needsNewPage ? 30 : fy + sigOffset;
  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.line(14, sigY, 84, sigY);
  doc.line(120, sigY, 196, sigY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("RECIBI CONFORME", 158, sigY - 3, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text(des.chofer ? `Chofer: ${des.chofer}` : "Chofer: ___________", 49, sigY + 4, { align: "center" });
  doc.text("Firma / Sello", 158, sigY + 4, { align: "center" });
  doc.setTextColor(0);

  if (des.notas) {
    const notaY = sigY + 14;
    if (notaY < 285) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(100);
      doc.text(`Notas: ${des.notas}`, 14, notaY, { maxWidth: 182 });
      doc.setTextColor(0);
    }
  }

  addFooters(doc);
  doc.save(`${des.numero}-manifiesto.pdf`);
}

// ─── PDF ESTADO DE CUENTA ──────────────────────────────────────────────────

export function pdfEstadoCuenta(data: { cliente: any; cotizaciones: any[]; facturas: any[] }) {
  const doc = new jsPDF();
  const { cliente, facturas } = data;
  const [r, g, b]: [number, number, number] = [22, 101, 52];
  const W = 210, M = 14;

  // ── Pick factura with most recent activity that still has payments ──
  // Show all facturas in the PDF, starting with those with pending balance
  const facturasOrdenadas = [...facturas].sort((a, b) =>
    Number(b.saldoPendiente) - Number(a.saldoPendiente)
  );

  for (let fi = 0; fi < facturasOrdenadas.length; fi++) {
    const fac = facturasOrdenadas[fi];
    if (fi > 0) doc.addPage();

    // ── Page header ──
    const tema = TEMAS[cliente?.empresaFactura ?? "ECOPLAST F.P."] ?? TEMAS["ECOPLAST F.P."];
    drawLogo(doc, tema, W - M - 40, 6, 40, 26);

    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(r, g, b);
    const fields = [
      ["Cliente", cliente?.nombre ?? "—"],
      ["RIF", cliente?.rif ?? "—"],
      ["Dirección", cliente?.direccion ?? "—"],
      ["Vendedor", fac?.vendedor?.nombre ?? "—"],
      ["Fecha", fechaStr(fac.fechaEmision ?? fac.creadoEn)],
    ];
    fields.forEach(([label, val], i) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(r, g, b);
      doc.text(label, M, 12 + i * 5.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(0, 0, 0);
      doc.text(val, M + 22, 12 + i * 5.5);
    });

    // ── Title ──
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Estado de Cuenta", W / 2, 42, { align: "center" });
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Factura N° ${fac.numero}`, W / 2, 48, { align: "center" });

    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.line(M, 52, W - M, 52);

    let startY = 58;

    // ── Product table (lineas) ──
    if ((fac.lineas ?? []).length > 0) {
      const config = tablaEcoplast(fac.lineas, "fac");
      startY = drawTable(doc, tema, startY, config);
    } else {
      // No lineas (historical invoice) — just show total
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      doc.text("(Factura importada — sin detalle de productos)", M, startY + 4);
      startY += 10;
    }

    // Totals box
    drawTotalsBox(doc, tema, startY, Number(fac.totalBruto), Number(fac.descuentoTotal), Number(fac.totalNeto));
    startY = Math.min(startY + 52, 240);

    // ── Payment ledger (Resta / Abono) ──
    // Check if we need a new page
    if (startY > 200) { doc.addPage(); startY = 20; }

    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.3);
    doc.line(M, startY, W - M, startY);
    startY += 6;

    const pagos: any[] = (fac.pagos ?? []).sort(
      (a: any, b: any) => new Date(a.fechaAsignacion).getTime() - new Date(b.fechaAsignacion).getTime()
    );

    let saldo = Number(fac.totalNeto);
    const ledgerRows: [string, string, string, string?][] = []; // [label, amount, type: resta|abono, nota?]

    for (const pa of pagos) {
      const monto = Number(pa.montoAsignado ?? pa.monto ?? 0);
      const fechaPago = pa.fechaAsignacion ?? pa.pago?.fecha;
      const metodo = pa.pago?.cuenta?.nombre ?? pa.pago?.origenFondos ?? "Abono";
      const dia = fechaPago ? new Date(fechaPago).toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit" }).replace(/\//g, "-") : "";
      ledgerRows.push([`${metodo}  ${dia}`, monto.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), "abono", pa.notas || undefined]);
      saldo -= monto;
      ledgerRows.push(["Resta", saldo.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 }), "resta"]);
    }

    const colW = (W - M * 2) / 2;
    const rowH = 7;
    let ly = startY;

    // Initial Resta row (full invoice total)
    const totalStr = Number(fac.totalNeto).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    // Draw first "Resta" = totalNeto (after initial efectivo if any)
    doc.setFillColor(253, 185, 19);  // orange/amber
    doc.rect(M + colW, ly, colW, rowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(180, 80, 0);
    doc.text("Resta", M + colW + 3, ly + 5);
    doc.text(totalStr, W - M - 2, ly + 5, { align: "right" });
    ly += rowH;

    for (const [label, amount, type, nota] of ledgerRows) {
      if (ly > 282) { doc.addPage(); ly = 16; }

      if (type === "resta") {
        doc.setFillColor(253, 185, 19);
        doc.rect(M + colW, ly, colW, rowH, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(180, 80, 0);
        doc.text("Resta", M + colW + 3, ly + 5);
        doc.text(amount, W - M - 2, ly + 5, { align: "right" });
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(label, M + colW + 3, ly + 5);
        doc.text(amount, W - M - 2, ly + 5, { align: "right" });
        if (nota) {
          doc.setFontSize(7);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(120, 120, 120);
          const notaTxt = doc.splitTextToSize(nota, colW - 6) as string[];
          doc.text(notaTxt[0], M + colW + 3, ly + 5 + rowH * 0.7);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(0, 0, 0);
          ly += 4;
        }
      }
      ly += rowH;
    }

    // Final saldo box
    if (saldo > 0.005) {
      ly += 2;
      doc.setFillColor(r, g, b);
      doc.roundedRect(M + colW, ly, colW, 10, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(255, 255, 255);
      doc.text("SALDO PENDIENTE", M + colW + 3, ly + 7);
      doc.text(`$${saldo.toFixed(2)}`, W - M - 2, ly + 7, { align: "right" });
      doc.setTextColor(0, 0, 0);
    } else {
      ly += 2;
      doc.setFillColor(22, 163, 74);
      doc.roundedRect(M + colW, ly, colW, 10, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255, 255, 255);
      const lastPago = pagos[pagos.length - 1];
      const lastDate = lastPago ? ` · ${fechaStr(lastPago.fechaAsignacion ?? lastPago.pago?.fecha)}` : "";
      doc.text(`✓ PAGADO TODO${lastDate}`, M + colW + 3, ly + 7);
      doc.setTextColor(0, 0, 0);
    }
  }

  addFooters(doc);
  doc.save(`estado-cuenta-${(cliente?.nombre ?? "cliente").replace(/\s+/g, "-").toLowerCase()}.pdf`);
}

// ─── PDF DESPACHO GANDICA ──────────────────────────────────────────────────────
// Formato especial para Piezas y Conexiones Gandica — debe ser idéntico al PDF
// entregado anteriormente.

export function pdfDespachoGandica(params: {
  lineas: any[];
  cliente: any;
  fecha?: string;
  fechaRef: string;
  mesDespacho: string;
  prestamo?: number;
  comision?: number;
  abonos: { label: string; monto: number }[];
}) {
  const { lineas, cliente, fecha, fechaRef, mesDespacho, prestamo = 0, comision = 0, abonos = [] } = params;
  const doc = new jsPDF();
  const tema = TEMAS["ECOPLAST F.P."];
  const [r, g, b] = tema.primary;
  const W = 210, M = 14;

  const fmtUsd = (v: number) =>
    `$${v.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtPlain = (v: number) => {
    const hasDec = Math.abs((v % 1)) > 0.0001;
    return v.toLocaleString("es-VE", { minimumFractionDigits: hasDec ? 2 : 0, maximumFractionDigits: 4 });
  };

  const getPrecio = (l: any) => {
    const cl = (l.cotizacion?.lineas ?? []).find((cl: any) => Number(cl.productoId) === Number(l.productoId));
    return cl ? Number(cl.precioFinal ?? cl.precioUnitarioAplicado ?? 0) : 0;
  };
  const getCant = (l: any) => {
    const d = Number(l.cantidadDespachada ?? 0);
    return d > 0 ? d : Number(l.cantidadPedida ?? l.cantidad ?? 0);
  };
  const esConex = (l: any) => esConexionExternaPdf(l.producto ?? {});

  const lineasTub = lineas.filter(l => !esConex(l));
  const lineasCon = lineas.filter(l => esConex(l));
  const totalTub = lineasTub.reduce((s, l) => s + getPrecio(l) * getCant(l), 0);
  const totalCon = lineasCon.reduce((s, l) => s + getPrecio(l) * getCant(l), 0);
  const totalFactura = totalTub + totalCon + (prestamo > 0 ? prestamo : 0) + (comision > 0 ? comision : 0);

  // ── Header — 5-row table (matches reference format) ──
  const logoW = 42, boxX = M, boxY = 10;
  const hdrRowH = 8, rowCount = 5;
  const boxH = hdrRowH * rowCount;
  const boxW = W - M * 2 - logoW - 4;
  const labelW = 26;
  const fechaHeader = fecha ?? new Date().toLocaleDateString("es-VE", { day: "2-digit", month: "2-digit", year: "numeric" });
  const headerLabels = ["Cliente", "RIF", "Direccion", "Vendedor", "Fecha"];
  const headerValues = [
    cliente?.nombre ?? "—",
    cliente?.rif ?? "—",
    cliente?.direccion ?? "—",
    cliente?.vendedor?.nombre ?? "—",
    fechaHeader,
  ];

  // Outer border
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.rect(boxX, boxY, boxW, boxH);
  // Label/value separator
  doc.line(boxX + labelW, boxY, boxX + labelW, boxY + boxH);
  // Row separators
  for (let i = 1; i < rowCount; i++) {
    doc.line(boxX, boxY + hdrRowH * i, boxX + boxW, boxY + hdrRowH * i);
  }
  // Labels (green bg + white text)
  for (let i = 0; i < rowCount; i++) {
    doc.setFillColor(r, g, b);
    doc.rect(boxX, boxY + hdrRowH * i, labelW, hdrRowH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(headerLabels[i], boxX + 2, boxY + hdrRowH * i + hdrRowH * 0.65);
  }
  // Values
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  for (let i = 0; i < rowCount; i++) {
    const vLines = doc.splitTextToSize(headerValues[i], boxW - labelW - 3);
    doc.text((vLines as string[]).slice(0, 1), boxX + labelW + 2, boxY + hdrRowH * i + hdrRowH * 0.65);
  }

  drawLogo(doc, tema, W - M - logoW, boxY, logoW, boxH);

  const tY = boxY + boxH + 10;
  doc.setFontSize(17);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`DESPACHO ${fechaRef}`, W / 2, tY, { align: "center" });

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.7);
  doc.line(M, tY + 8, W - M, tY + 8);
  doc.setLineWidth(0.3);

  let startY = tY + 14;

  // ── Tuberías table ──
  if (lineasTub.length > 0) {
    const tubRows = lineasTub.map(l => {
      const precio = getPrecio(l);
      const cant = getCant(l);
      return [l.producto?.nombre ?? "—", l.producto?.medida ?? "—", qty(cant), fmtUsd(precio), fmtUsd(precio * cant)];
    });
    autoTable(doc, {
      startY,
      head: [["Descripción Producto", "Medida", "Cantidad", "Costo Unit", "Costo Total"]],
      body: tubRows,
      styles: { fontSize: 8, cellPadding: [2, 2] },
      headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
      margin: { left: M, right: M },
    });
    startY = (doc as any).lastAutoTable.finalY + 3;

    const bw = 72, bh = 9, bx = W - M - bw;
    doc.setFillColor(r, g, b);
    doc.roundedRect(bx, startY, bw, bh, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Total Tuberias", bx + 3, startY + 6);
    doc.text(fmtUsd(totalTub), bx + bw - 3, startY + 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
    startY += bh + 7;
  }

  // ── Conexiones table ──
  if (lineasCon.length > 0) {
    const conRows = lineasCon.map(l => {
      const precio = getPrecio(l);
      const cant = getCant(l);
      return [l.producto?.nombre ?? "—", l.producto?.medida ?? "—", qty(cant), fmtPlain(precio), fmtPlain(precio * cant)];
    });
    autoTable(doc, {
      startY,
      head: [["Descripción Producto", "Medida", "Cantidad", "Costo Unit", "Costo Total"]],
      body: conRows,
      styles: { fontSize: 8, cellPadding: [2, 2] },
      headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 8 },
      columnStyles: { 1: { halign: "center" }, 2: { halign: "center" }, 3: { halign: "right" }, 4: { halign: "right", fontStyle: "bold" } },
      margin: { left: M, right: M },
    });
    startY = (doc as any).lastAutoTable.finalY + 3;

    const bw = 72, bh = 9, bx = W - M - bw;
    doc.setFillColor(r, g, b);
    doc.roundedRect(bx, startY, bw, bh, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Total Conexiones", bx + 3, startY + 6);
    doc.text(fmtPlain(totalCon), bx + bw - 3, startY + 6, { align: "right" });
    doc.setTextColor(0, 0, 0);
    startY += bh + 8;
  }

  // ── RECIBI CONFORME — add new page if not enough room ──
  if (startY + 20 > 275) { doc.addPage(); startY = 20; }
  const sigLineY = startY + 4;
  doc.setDrawColor(80);
  doc.setLineWidth(0.4);
  doc.line(M, sigLineY, M + 72, sigLineY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text("RECIBI CONFORME", M + 36, sigLineY - 2, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100);
  doc.text("Firma / Sello Cliente", M + 36, sigLineY + 5, { align: "center" });
  doc.setTextColor(0);

  // ── Payment summary box (right side) ──
  type SumRow = { label: string; value: string; kind: "header" | "normal" | "total" | "resta" };
  const sumRows: SumRow[] = [];
  sumRows.push({ label: `DESPACHO ${mesDespacho}`, value: fmtUsd(totalTub), kind: "header" });
  sumRows.push({ label: "Mas Prestamo Viaticos", value: prestamo > 0 ? fmtPlain(prestamo) : "", kind: "normal" });
  if (totalCon > 0) sumRows.push({ label: "Conexiones", value: fmtPlain(totalCon), kind: "normal" });
  if (comision > 0) sumRows.push({ label: "Comision", value: fmtPlain(comision), kind: "normal" });
  sumRows.push({ label: "Total Factura", value: fmtUsd(totalFactura), kind: "total" });

  let resta = totalFactura;
  sumRows.push({ label: "Resta", value: fmtPlain(resta), kind: "resta" });
  for (const abono of abonos) {
    sumRows.push({ label: abono.label, value: fmtPlain(abono.monto), kind: "normal" });
    resta -= abono.monto;
    sumRows.push({ label: "Resta", value: fmtPlain(resta), kind: "resta" });
  }

  const rowH = 8;
  const sumBW = 86;
  const sumBX = W - M - sumBW;
  const totalBoxH = sumRows.length * rowH + 4;
  let sumY = sigLineY + 12;
  if (sumY + totalBoxH > 288) { doc.addPage(); sumY = 20; }

  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.roundedRect(sumBX, sumY, sumBW, totalBoxH, 2, 2, "D");

  let ry = sumY + 2;
  for (const row of sumRows) {
    if (row.kind === "header") {
      doc.setFillColor(r, g, b);
      doc.rect(sumBX, ry, sumBW, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text(row.label, sumBX + 3, ry + 5.5);
      doc.text(row.value, sumBX + sumBW - 3, ry + 5.5, { align: "right" });
    } else if (row.kind === "total") {
      doc.setFillColor(253, 185, 19);
      doc.rect(sumBX, ry, sumBW, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(row.label, sumBX + 3, ry + 5.5);
      doc.text(row.value, sumBX + sumBW - 3, ry + 5.5, { align: "right" });
    } else if (row.kind === "resta") {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(200, 80, 0);
      doc.text(row.label, sumBX + 3, ry + 5.5);
      doc.text(row.value, sumBX + sumBW - 3, ry + 5.5, { align: "right" });
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(row.label, sumBX + 3, ry + 5.5);
      if (row.value) doc.text(row.value, sumBX + sumBW - 3, ry + 5.5, { align: "right" });
    }
    doc.setTextColor(0, 0, 0);
    ry += rowH;
  }

  doc.save(`DESPACHO-${fechaRef.replace(/\//g, "-")}-Gandica.pdf`);
}

// ─── PDF BALANCE DE PAGOS ──────────────────────────────────────────────────────

interface BalancePDFCuota { fecha: string; monto: number; notas?: string }
interface BalancePDFItem {
  nombre: string; montoTotal: number; notas?: string;
  cuotas: BalancePDFCuota[];
}
interface BalancePDFData {
  despachoId: number;
  calculadoEn?: string;
  items: BalancePDFItem[];
  gananciaVendedor?: number;
}

export function pdfBalancePago(data: BalancePDFData) {
  const { despachoId, calculadoEn, items, gananciaVendedor } = data;
  const [r, g, b]: [number, number, number] = [22, 101, 52];

  // Collect unique dates sorted ascending
  const fechasSet = new Set<string>();
  items.forEach((i) => i.cuotas.forEach((c) => fechasSet.add(c.fecha.slice(0, 10))));
  const fechas = [...fechasSet].sort();

  // Choose orientation based on column count
  const totalCols = 2 + fechas.length + 1; // concepto + monto + fechas + saldo
  const orientation = totalCols > 6 ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation });
  const W = orientation === "landscape" ? 297 : 210;
  const M = 14;

  // ── Header bar ────────────────────────────────────────────────────────────
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 8, "F");

  // Logo
  const cached = _logoCache["ECOPLAST"];
  if (cached) {
    const lw = 36, lh = 14;
    const ratio = cached.w / cached.h;
    let iw = lw, ih = lw / ratio;
    if (ih > lh) { ih = lh; iw = lh * ratio; }
    doc.addImage(cached.data, "PNG", W - M - lw + (lw - iw) / 2, 10 + (lh - ih) / 2, iw, ih);
  }

  // Title
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("BALANCE DE PAGOS", M, 19);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(60, 60, 60);
  doc.text(`Despacho #${despachoId}`, M, 26);
  if (calculadoEn) {
    const calc = new Date(calculadoEn).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
    doc.text(`Calculado: ${calc}`, M, 32);
  }

  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.5);
  doc.line(M, 36, W - M, 36);

  // ── Ganancia del Vendedor (sección superior independiente) ─────────────────
  const fmtUsd0 = (n: number) =>
    `$${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let tableStartY = 40;
  if ((gananciaVendedor ?? 0) > 0.005) {
    const bw = W - M * 2;
    doc.setFillColor(236, 254, 255);            // cyan claro
    doc.setDrawColor(165, 243, 252);
    doc.roundedRect(M, 39, bw, 12, 2, 2, "FD");
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(14, 116, 144);
    doc.text("Ganancia del Vendedor", M + 4, 44.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text("Comisión del vendedor — pago independiente, no se incluye en el total del balance", M + 4, 48.8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(8, 145, 178);
    doc.text(fmtUsd0(gananciaVendedor!), W - M - 4, 47, { align: "right" });
    doc.setTextColor(0, 0, 0);
    tableStartY = 56;
  }

  // ── Compute totals for footer ─────────────────────────────────────────────
  const totalGeneral = items.reduce((s, i) => s + Number(i.montoTotal), 0);
  const totalPagado  = items.reduce((s, i) => i.cuotas.reduce((sc, c) => sc + Number(c.monto), 0) + s, 0);
  const totalSaldo   = totalGeneral - totalPagado;

  // ── Build table ────────────────────────────────────────────────────────────
  const fmtUsdPdf = (n: number) =>
    `$${Number(n).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtFechaCel = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
  };

  const head = [
    "Concepto",
    "Monto Total",
    ...fechas.map(fmtFechaCel),
    "Saldo",
  ];

  const body: any[][] = items.map((item) => {
    const pagado = item.cuotas.reduce((s, c) => s + Number(c.monto), 0);
    const saldo  = Number(item.montoTotal) - pagado;
    return [
      item.nombre + (item.notas ? `\n${item.notas}` : ""),
      fmtUsdPdf(item.montoTotal),
      ...fechas.map((f) => {
        const c = item.cuotas.find((cu) => cu.fecha.slice(0, 10) === f);
        return c ? fmtUsdPdf(c.monto) : "";
      }),
      saldo < -0.005
        ? `(${fmtUsdPdf(Math.abs(saldo))})`
        : fmtUsdPdf(saldo),
    ];
  });

  // Totals footer row
  const footerRow = [
    "TOTAL",
    fmtUsdPdf(totalGeneral),
    ...fechas.map((f) => {
      const sum = items.reduce((s, i) => {
        const c = i.cuotas.find((cu) => cu.fecha.slice(0, 10) === f);
        return s + (c ? Number(c.monto) : 0);
      }, 0);
      return sum > 0 ? fmtUsdPdf(sum) : "";
    }),
    totalSaldo < -0.005
      ? `(${fmtUsdPdf(Math.abs(totalSaldo))})`
      : fmtUsdPdf(totalSaldo),
  ];

  // Column widths
  const availW = W - M * 2;
  const saldoW = 26, montoW = 26;
  const dateW  = Math.min(24, Math.max(18, (availW - 60 - montoW - saldoW) / Math.max(fechas.length, 1)));
  const conceptoW = availW - montoW - dateW * fechas.length - saldoW;

  const colStyles: Record<number, any> = {
    0: { cellWidth: conceptoW },
    1: { halign: "right", cellWidth: montoW, fontStyle: "bold" },
  };
  fechas.forEach((_, i) => { colStyles[2 + i] = { halign: "right", cellWidth: dateW }; });
  colStyles[2 + fechas.length] = { halign: "right", cellWidth: saldoW, fontStyle: "bold" };

  const saldoColIdx = 2 + fechas.length;

  autoTable(doc, {
    startY: tableStartY,
    head: [head],
    body: [...body, footerRow],
    headStyles: { fillColor: [r, g, b], textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 8, cellPadding: [2.5, 3] },
    columnStyles: colStyles,
    margin: { left: M, right: M },
    didParseCell: (data) => {
      if (data.section === "body") {
        const isFooter = data.row.index === body.length;
        if (isFooter) {
          data.cell.styles.fillColor = [15, 23, 42];
          data.cell.styles.textColor = [255, 255, 255];
          data.cell.styles.fontStyle = "bold";
          // Saldo amarillo en el footer
          if (data.column.index === saldoColIdx) {
            data.cell.styles.textColor = totalSaldo < 0 ? [192, 132, 252] : [251, 191, 36];
          }
        } else {
          // Pintar saldo en rojo si pagado completo (saldo ≤ 0)
          if (data.column.index === saldoColIdx) {
            const item = items[data.row.index];
            if (!item) return;
            const pagado = item.cuotas.reduce((s, c) => s + Number(c.monto), 0);
            const sal = Number(item.montoTotal) - pagado;
            if (sal <= 0.005) data.cell.styles.textColor = [220, 38, 38];
          }
          // Pagos en verde
          const fechaIdx = data.column.index - 2;
          if (fechaIdx >= 0 && fechaIdx < fechas.length && data.cell.text[0]) {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY ?? 200;

  // ── Summary box ────────────────────────────────────────────────────────────
  const boxW = 86, boxX = W - M - boxW;
  let by = finalY + 8;
  if (by + 36 > (orientation === "landscape" ? 200 : 280)) { doc.addPage(); by = 20; }

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, by, boxW, 34, 2, 2, "F");

  const col1 = boxX + 4, col2 = boxX + boxW - 4;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Total Balance:", col1, by + 9);
  doc.text("Total Pagado:", col1, by + 18);
  doc.text("Saldo Pendiente:", col1, by + 27);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(fmtUsdPdf(totalGeneral), col2, by + 9,  { align: "right" });
  doc.setTextColor(22, 163, 74);
  doc.text(fmtUsdPdf(totalPagado),  col2, by + 18, { align: "right" });
  doc.setTextColor(totalSaldo <= 0.005 ? 22 : 0, totalSaldo <= 0.005 ? 163 : 0, totalSaldo <= 0.005 ? 74 : 0);
  doc.text(
    totalSaldo < -0.005 ? `(${fmtUsdPdf(Math.abs(totalSaldo))})` : fmtUsdPdf(totalSaldo),
    col2, by + 27, { align: "right" }
  );
  doc.setTextColor(0, 0, 0);

  addFooters(doc);
  doc.save(`balance-despacho-${despachoId}.pdf`);
}
