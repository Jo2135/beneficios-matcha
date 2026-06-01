import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── EMPRESA INFO ──────────────────────────────────────────────────────────
const EMPRESAS: Record<string, { nombre: string; rif: string; direccion: string }> = {
  "ECOPLAST F.P.":   { nombre: "ECOPLAST F.P.",   rif: "V-09331724-2", direccion: "Venezuela" },
  "MAXPLASTIC F.P.": { nombre: "MAXPLASTIC F.P.", rif: "J-XXXXXXXXX-X", direccion: "Venezuela" },
};

function cabecera(doc: jsPDF, empresa: string, titulo: string, numero: string) {
  const emp = EMPRESAS[empresa] ?? EMPRESAS["ECOPLAST F.P."];

  // Banda superior
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, 210, 18, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(emp.nombre, 14, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`RIF: ${emp.rif}`, 14, 17.5);

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 210 - 14, 12, { align: "right" });
  doc.setFontSize(10);
  doc.text(numero, 210 - 14, 17.5, { align: "right" });

  doc.setTextColor(0, 0, 0);
}

function pie(doc: jsPDF) {
  const total = (doc as any).internal.pages.length - 1;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${total}`, 105, 290, { align: "center" });
    doc.text("Documento generado por Ecoplast Sistema de Gestión", 105, 294, { align: "center" });
    doc.setTextColor(0);
  }
}

// ─── PDF COTIZACIÓN ────────────────────────────────────────────────────────
export function pdfCotizacion(cot: any) {
  const doc = new jsPDF();
  const empresa = cot.empresa?.nombre ?? cot.cliente?.empresaFactura ?? "ECOPLAST F.P.";

  cabecera(doc, empresa, "COTIZACIÓN", cot.numero);

  // Info cliente y fechas
  let y = 26;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENTE", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(cot.cliente?.nombre ?? "—", 14, y + 6);
  if (cot.cliente?.rif)       doc.text(`RIF: ${cot.cliente.rif}`, 14, y + 12);
  if (cot.cliente?.direccion) doc.text(`Dirección: ${cot.cliente.direccion}`, 14, y + 18);
  if (cot.cliente?.telefono)  doc.text(`Tel: ${cot.cliente.telefono}`, 14, y + 24);

  const fecha   = new Date(cot.creadoEn).toLocaleDateString("es-VE");
  const vence   = cot.fechaVencimiento ? new Date(cot.fechaVencimiento).toLocaleDateString("es-VE") : "—";
  const vendedor = cot.vendedor?.nombre ?? "—";

  doc.setFont("helvetica", "bold");
  doc.text("DATOS", 140, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${fecha}`, 140, y + 6);
  doc.text(`Válida hasta: ${vence}`, 140, y + 12);
  doc.text(`Vendedor: ${vendedor}`, 140, y + 18);
  if (cot.cliente?.condicionPago) doc.text(`Condición: ${cot.cliente.condicionPago}`, 140, y + 24);

  // Línea separadora
  y += 32;
  doc.setDrawColor(220);
  doc.line(14, y, 196, y);

  // Tabla de productos
  const lineas = cot.lineas ?? [];
  const filas = lineas.map((l: any, i: number) => [
    i + 1,
    l.producto?.nombre ?? "—",
    l.producto?.medida ?? "—",
    l.notaCantidad ? `${Number(l.cantidad)} (${l.notaCantidad})` : Number(l.cantidad),
    `$${Number(l.precioUnitarioAplicado).toFixed(2)}`,
    Number(l.descuentoPct) > 0 ? `${Number(l.descuentoPct)}%` : "—",
    `$${Number(l.totalLinea).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Producto", "Medida", "Cantidad", "Precio Unit.", "Desc.", "Total"]],
    body: filas,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "center" },
      6: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Totales
  const fy = (doc as any).lastAutoTable.finalY + 8;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(130, fy, 66, 30, 2, 2, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Total Bruto:", 134, fy + 8);
  doc.text(`$${Number(cot.totalBruto).toFixed(2)}`, 194, fy + 8, { align: "right" });
  doc.text("Descuento:", 134, fy + 15);
  doc.text(`-$${Number(cot.descuentoTotal).toFixed(2)}`, 194, fy + 15, { align: "right" });
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL NETO:", 134, fy + 24);
  doc.text(`$${Number(cot.totalNeto).toFixed(2)}`, 194, fy + 24, { align: "right" });

  // Notas
  if (cot.notas) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Notas:", 14, fy + 8);
    doc.setFont("helvetica", "normal");
    doc.text(cot.notas, 14, fy + 15, { maxWidth: 110 });
  }

  pie(doc);
  doc.save(`${cot.numero}.pdf`);
}

// ─── PDF FACTURA ───────────────────────────────────────────────────────────
export function pdfFactura(fac: any) {
  const doc = new jsPDF();
  const empresa = fac.empresa?.nombre ?? fac.cliente?.empresaFactura ?? "ECOPLAST F.P.";

  cabecera(doc, empresa, "FACTURA", fac.numero);

  let y = 26;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENTE", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(fac.cliente?.nombre ?? "—", 14, y + 6);
  if (fac.cliente?.rif)       doc.text(`RIF: ${fac.cliente.rif}`, 14, y + 12);
  if (fac.cliente?.direccion) doc.text(`Dirección: ${fac.cliente.direccion}`, 14, y + 18);

  const emision   = new Date(fac.fechaEmision ?? fac.creadoEn).toLocaleDateString("es-VE");
  const venceFac  = fac.fechaVencimiento ? new Date(fac.fechaVencimiento).toLocaleDateString("es-VE") : "Contado";
  const condicion = fac.cliente?.condicionPago ?? (fac.cliente?.diasCredito ? `${fac.cliente.diasCredito} días` : "Contado");

  doc.setFont("helvetica", "bold");
  doc.text("FACTURA", 140, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Emisión: ${emision}`, 140, y + 6);
  doc.text(`Vencimiento: ${venceFac}`, 140, y + 12);
  doc.text(`Condición: ${condicion}`, 140, y + 18);

  y += 28;
  doc.setDrawColor(220);
  doc.line(14, y, 196, y);

  const lineas = fac.lineas ?? [];
  const filas = lineas.map((l: any, i: number) => [
    i + 1,
    l.producto?.nombre ?? "—",
    l.producto?.medida ?? "—",
    Number(l.cantidad),
    `$${Number(l.precioUnitario).toFixed(2)}`,
    Number(l.descuentoPct) > 0 ? `${Number(l.descuentoPct)}%` : "—",
    `$${Number(l.totalLinea).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Producto", "Medida", "Cantidad", "Precio Unit.", "Desc.", "Total"]],
    body: filas,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { halign: "center" },
      4: { halign: "right" },
      5: { halign: "center" },
      6: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [240, 253, 244] },
  });

  const fy = (doc as any).lastAutoTable.finalY + 8;
  doc.setFillColor(240, 253, 244);
  doc.roundedRect(130, fy, 66, 38, 2, 2, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Total Bruto:", 134, fy + 8);
  doc.text(`$${Number(fac.totalBruto).toFixed(2)}`, 194, fy + 8, { align: "right" });
  doc.text("Descuento:", 134, fy + 15);
  doc.text(`-$${Number(fac.descuentoTotal).toFixed(2)}`, 194, fy + 15, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", 134, fy + 22);
  doc.text(`$${Number(fac.totalNeto).toFixed(2)}`, 194, fy + 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(220, 38, 38);
  doc.text(`Saldo pendiente: $${Number(fac.saldoPendiente).toFixed(2)}`, 134, fy + 30);
  doc.setTextColor(0);

  // Firma
  const fyFirma = fy + 50;
  if (fyFirma < 270) {
    doc.setDrawColor(180);
    doc.line(14, fyFirma, 80, fyFirma);
    doc.line(130, fyFirma, 196, fyFirma);
    doc.setFontSize(8);
    doc.text("Firma Cliente", 47, fyFirma + 5, { align: "center" });
    doc.text("Firma Empresa", 163, fyFirma + 5, { align: "center" });
  }

  pie(doc);
  doc.save(`${fac.numero}.pdf`);
}

// ─── PDF MANIFIESTO DE DESPACHO ────────────────────────────────────────────
export function pdfDespacho(des: any) {
  const doc = new jsPDF();
  const cliente = des.lineas?.[0]?.cotizacion?.cliente;
  const empresa = cliente?.empresaFactura ?? "ECOPLAST F.P.";

  cabecera(doc, empresa, "ORDEN DE DESPACHO", des.numero);

  let y = 26;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("CLIENTE", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(cliente?.nombre ?? "—", 14, y + 6);
  if (cliente?.direccion) doc.text(`Destino: ${cliente.direccion}`, 14, y + 12);

  const fecha = new Date(des.fechaSalida).toLocaleDateString("es-VE");
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DE SALIDA", 140, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${fecha}`, 140, y + 6);
  doc.text(`Chofer: ${des.chofer ?? "—"}`, 140, y + 12);
  doc.text(`Vehículo: ${des.vehiculo ?? "—"}`, 140, y + 18);

  y += 28;
  doc.setDrawColor(220);
  doc.line(14, y, 196, y);

  const ESTADO_COLOR: Record<string, [number, number, number]> = {
    DESPACHADO: [22, 163, 74],
    FALTO:      [220, 38, 38],
    PARCIAL:    [217, 119, 6],
    PENDIENTE:  [107, 114, 128],
  };
  const ESTADO_LABEL: Record<string, string> = {
    DESPACHADO: "Completo",
    FALTO:      "Faltó",
    PARCIAL:    "Parcial",
    PENDIENTE:  "Pendiente",
  };

  const filas = (des.lineas ?? []).map((l: any, i: number) => [
    i + 1,
    l.producto?.nombre ?? "—",
    l.producto?.medida ?? "—",
    Number(l.cantidadPedida),
    Number(l.cantidadDespachada),
    Number(l.cantidadFaltante),
    ESTADO_LABEL[l.estado] ?? l.estado,
  ]);

  autoTable(doc, {
    startY: y + 4,
    head: [["#", "Producto", "Medida", "Pedido", "Despachado", "Faltante", "Estado"]],
    body: filas,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [124, 58, 237], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      3: { halign: "center" },
      4: { halign: "center", fontStyle: "bold" },
      5: { halign: "center" },
      6: { halign: "center" },
    },
    alternateRowStyles: { fillColor: [250, 245, 255] },
    didDrawCell: (data: any) => {
      if (data.column.index === 6 && data.section === "body") {
        const estado = (des.lineas?.[data.row.index]?.estado ?? "PENDIENTE") as string;
        const [r, g, b] = ESTADO_COLOR[estado] ?? [107, 114, 128];
        doc.setTextColor(r, g, b);
        doc.setFont("helvetica", "bold");
        doc.text(ESTADO_LABEL[estado] ?? estado, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: "center" });
        doc.setTextColor(0);
        doc.setFont("helvetica", "normal");
        return false; // prevent default text draw
      }
    },
  });

  // Resumen
  const fy = (doc as any).lastAutoTable.finalY + 10;
  const totalPedido    = (des.lineas ?? []).reduce((s: number, l: any) => s + Number(l.cantidadPedida), 0);
  const totalDesp      = (des.lineas ?? []).reduce((s: number, l: any) => s + Number(l.cantidadDespachada), 0);
  const totalFaltante  = (des.lineas ?? []).reduce((s: number, l: any) => s + Number(l.cantidadFaltante), 0);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Total pedido: ${totalPedido}  |  Despachado: ${totalDesp}  |  Faltante: ${totalFaltante}`, 105, fy, { align: "center" });

  if (des.notas) {
    doc.setFont("helvetica", "normal");
    doc.text(`Notas: ${des.notas}`, 14, fy + 8, { maxWidth: 180 });
  }

  // Firmas
  const fyFirma = Math.max(fy + 25, 250);
  if (fyFirma < 275) {
    doc.setDrawColor(180);
    doc.line(14, fyFirma, 80, fyFirma);
    doc.line(130, fyFirma, 196, fyFirma);
    doc.setFontSize(8);
    doc.text(`Chofer: ${des.chofer ?? "___________"}`, 47, fyFirma + 5, { align: "center" });
    doc.text("Firma / Sello Cliente", 163, fyFirma + 5, { align: "center" });
  }

  pie(doc);
  doc.save(`${des.numero}-manifiesto.pdf`);
}
