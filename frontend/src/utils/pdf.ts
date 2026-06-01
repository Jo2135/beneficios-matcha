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
  extraLabel?: string
): number {
  const [r, g, b] = tema.primary;
  const boxX = 130;
  const lineH = 7;

  const subRows: [string, string][] = [];
  if (descuento > 0.005) {
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
  colStyles: Record<number, any>;
}

// ECOPLAST: no item numbers, grouped by product category with subtotals
function tablaEcoplast(lineas: any[], tipo: DocTipo): TableConfig {
  const groups = new Map<string, any[]>();
  for (const l of lineas) {
    const cat = l.producto?.categoria?.nombre ?? "Productos";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(l);
  }

  const esDespacho = tipo === "des";
  const headers = esDespacho
    ? ["Descripción Producto", "Medida", "Pedido", "Despachado", "Costo Unit.", "Costo Total"]
    : ["Descripción Producto", "Medida", "Cantidad", "Costo Unit.", "Costo Total"];

  const rows: any[][] = [];
  const subtotalRows = new Set<number>();

  for (const [cat, items] of groups) {
    let catTotal = 0;

    for (const l of items) {
      if (esDespacho) {
        const cotLinea = l.cotizacion?.lineas?.find(
          (cl: any) => Number(cl.productoId) === Number(l.productoId)
        );
        const precio = cotLinea ? Number(cotLinea.precioFinal) : 0;
        const cantDesp = Number(l.cantidadDespachada ?? 0);
        const total = precio * cantDesp;
        catTotal += total;
        rows.push([
          l.producto?.nombre ?? "—",
          l.producto?.medida ?? "—",
          qty(l.cantidadPedida),
          qty(cantDesp),
          usd(precio),
          usd(total),
        ]);
      } else if (tipo === "cot") {
        const total = Number(l.totalLinea ?? 0);
        catTotal += total;
        const cantStr = l.notaCantidad
          ? `${qty(l.cantidad)} (${l.notaCantidad})`
          : qty(l.cantidad);
        rows.push([
          l.producto?.nombre ?? "—",
          l.producto?.medida ?? "—",
          cantStr,
          usd(l.precioFinal ?? l.precioUnitarioAplicado ?? 0),
          usd(total),
        ]);
      } else {
        const total = Number(l.totalLinea ?? 0);
        catTotal += total;
        rows.push([
          l.producto?.nombre ?? "—",
          l.producto?.medida ?? "—",
          qty(l.cantidad),
          usd(l.precioUnitario ?? 0),
          usd(total),
        ]);
      }
    }

    // Subtotal row (fills last column)
    const cols = esDespacho ? 6 : 5;
    const sub = Array(cols).fill("");
    sub[0] = `Total ${cat}`;
    sub[cols - 1] = usd(catTotal);
    rows.push(sub);
    subtotalRows.add(rows.length - 1);
  }

  const colStyles: Record<number, any> = esDespacho
    ? {
        1: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "center", fontStyle: "bold" },
        4: { halign: "right" },
        5: { halign: "right", fontStyle: "bold" },
      }
    : {
        1: { halign: "center" },
        2: { halign: "center" },
        3: { halign: "right" },
        4: { halign: "right", fontStyle: "bold" },
      };

  return { headers, rows, subtotalRows, colStyles };
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
      if (data.section === "body" && config.subtotalRows.has(data.row.index)) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [234, 250, 241];
        data.cell.styles.textColor = [22, 101, 52];
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

  drawTotalsBox(doc, tema, fy, Number(cot.totalBruto), Number(cot.descuentoTotal), Number(cot.totalNeto));

  // MAXPLASTIC: condiciones de pago
  if (tema.tipo === "MAXPLASTIC" && cliente.condicionPago) {
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
  const fyAfter = drawTotalsBox(
    doc,
    tema,
    fy,
    Number(fac.totalBruto),
    Number(fac.descuentoTotal),
    Number(fac.totalNeto),
    extraLabel
  );

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
    drawTotalsBox(doc, tema, fy, totalDesp, 0, totalDesp);
  }

  // "RECIBI CONFORME" signature
  const sigY = Math.min(fy + (hasPrices ? 50 : 20), 265);
  if (sigY < 270) {
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
  }

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
