import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

/**
 * Conceptos adicionales de un despacho (Comisión 2, Viáticos, Carga Externa,
 * Ayudante...). No salen de los productos vendidos, por eso no entran en las
 * bases de los porcentajes (comisión del vendedor, flete, Ganancias_2).
 *
 * cobradoAlCliente = true  → lo paga el cliente: se suma al total de SU factura
 *                            y sale en el balance ⇒ neutro para el Extra.
 * cobradoAlCliente = false → lo paga Ecoplast (Ayudante) ⇒ baja el Extra.
 */

/** Deja la factura del despacho con los conceptos cobrados al cliente incluidos.
 *  Trabaja sobre la DIFERENCIA (total actual − conceptos ya aplicados + conceptos
 *  de ahora) para no recalcular la base desde las líneas: recalcularla arrastra
 *  redondeos y movía el total unos centavos en cada guardado. */
export async function recalcularFacturaConExtras(despachoId: number): Promise<{ ok: boolean; aviso?: string }> {
  const facturas = await prisma.factura.findMany({
    where: { ordenDespachoId: despachoId, estado: { not: "ANULADA" } },
    select: { id: true, numero: true, totalPagado: true, totalNeto: true, totalBruto: true, montoConceptosExtra: true },
  });
  if (facturas.length === 0) return { ok: false, aviso: "El despacho no tiene factura: los conceptos quedan guardados pero no se cargaron a ninguna." };
  if (facturas.length > 1) return { ok: false, aviso: `El despacho tiene ${facturas.length} facturas: los conceptos quedan en el balance pero no se sumaron a ninguna factura.` };

  const extras = await prisma.despachoConceptoExtra.aggregate({
    where: { ordenDespachoId: despachoId, cobradoAlCliente: true },
    _sum: { monto: true },
  });
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const totalExtras = r2(Number(extras._sum.monto ?? 0));

  const f = facturas[0];
  const yaAplicado = Number(f.montoConceptosExtra);
  if (Math.abs(totalExtras - yaAplicado) < 0.005) return { ok: true }; // nada que mover

  const base      = r2(Number(f.totalNeto) - yaAplicado);   // total sin conceptos
  const baseBruto = r2(Number(f.totalBruto) - yaAplicado);
  const totalNeto = r2(base + totalExtras);
  const pagado    = Number(f.totalPagado);
  const saldo     = r2(totalNeto - pagado);

  await prisma.factura.update({
    where: { id: f.id },
    data: {
      totalBruto: r2(baseBruto + totalExtras),
      totalNeto,
      montoConceptosExtra: totalExtras,
      saldoPendiente: Math.max(0, saldo),
      estado: saldo <= 0.005 ? "COBRADA" : pagado > 0 ? "COBRADA_PARCIAL" : "EMITIDA",
    },
  });
  return { ok: true };
}

// GET /despachos/:id/conceptos
export async function listar(req: Request, res: Response) {
  const despachoId = Number(req.params.id);
  const conceptos = await prisma.despachoConceptoExtra.findMany({
    where: { ordenDespachoId: despachoId },
    orderBy: [{ orden: "asc" }, { id: "asc" }],
  });
  res.json(conceptos);
}

// POST /despachos/:id/conceptos
export async function crear(req: Request, res: Response) {
  const despachoId = Number(req.params.id);
  const { nombre, monto, cobradoAlCliente } = req.body;

  const nom = String(nombre ?? "").trim();
  const mon = Number(monto);
  if (!nom) return res.status(400).json({ error: "Indica el nombre del concepto" });
  if (!(mon > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });

  const despacho = await prisma.ordenDespacho.findUnique({ where: { id: despachoId }, select: { id: true } });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });

  const ultimo = await prisma.despachoConceptoExtra.findFirst({
    where: { ordenDespachoId: despachoId },
    orderBy: { orden: "desc" },
    select: { orden: true },
  });

  const concepto = await prisma.despachoConceptoExtra.create({
    data: {
      ordenDespachoId: despachoId,
      nombre: nom,
      monto: mon,
      cobradoAlCliente: cobradoAlCliente !== false,
      orden: (ultimo?.orden ?? -1) + 1,
    },
  });
  const r = await recalcularFacturaConExtras(despachoId);
  res.status(201).json({ concepto, aviso: r.aviso });
}

// PATCH /conceptos/:conceptoId
export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.conceptoId);
  const { nombre, monto, cobradoAlCliente } = req.body;
  const actual = await prisma.despachoConceptoExtra.findUnique({ where: { id }, select: { ordenDespachoId: true } });
  if (!actual) return res.status(404).json({ error: "Concepto no encontrado" });

  const data: any = {};
  if (nombre !== undefined) {
    const nom = String(nombre).trim();
    if (!nom) return res.status(400).json({ error: "El nombre no puede quedar vacío" });
    data.nombre = nom;
  }
  if (monto !== undefined) {
    const mon = Number(monto);
    if (!(mon > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });
    data.monto = mon;
  }
  if (cobradoAlCliente !== undefined) data.cobradoAlCliente = Boolean(cobradoAlCliente);

  await prisma.despachoConceptoExtra.update({ where: { id }, data });
  const r = await recalcularFacturaConExtras(actual.ordenDespachoId);
  res.json({ ok: true, aviso: r.aviso });
}

// DELETE /conceptos/:conceptoId
export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.conceptoId);
  const actual = await prisma.despachoConceptoExtra.findUnique({ where: { id }, select: { ordenDespachoId: true } });
  if (!actual) return res.status(404).json({ error: "Concepto no encontrado" });

  await prisma.despachoConceptoExtra.delete({ where: { id } });
  const r = await recalcularFacturaConExtras(actual.ordenDespachoId);
  res.json({ ok: true, aviso: r.aviso });
}
