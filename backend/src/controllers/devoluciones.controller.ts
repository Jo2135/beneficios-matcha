import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

/**
 * Devolución de producto sobre una línea de factura ya emitida.
 *
 * Toca DOS lados a la vez, porque el motor de ganancias (ganancias.controller.ts)
 * lee dos fuentes distintas: la FACTURA para todo lo que es % (comisión del
 * vendedor, flete, Ganancias_2, conexiones) y el DESPACHO (cantidadDespachada)
 * para todo lo que es por kg (material, PEAD, curvas). Si solo se ajustara la
 * factura, el vendedor seguiría ganando comisión sobre producto que ya no
 * vendió; si solo se ajustara el despacho, la factura seguiría cobrando de más.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

async function recalcularEstadoFactura(tx: any, facturaId: number) {
  const f = await tx.factura.findUnique({ where: { id: facturaId }, select: { totalNeto: true, totalPagado: true } });
  const saldo = r2(Number(f.totalNeto) - Number(f.totalPagado));
  await tx.factura.update({
    where: { id: facturaId },
    data: {
      saldoPendiente: Math.max(0, saldo),
      estado: saldo <= 0.005 ? "COBRADA" : Number(f.totalPagado) > 0 ? "COBRADA_PARCIAL" : "EMITIDA",
    },
  });
}

// POST /facturas/:facturaId/lineas/:lineaId/devolucion
export async function crear(req: Request, res: Response) {
  const facturaId = Number(req.params.facturaId);
  const lineaId = Number(req.params.lineaId);
  const { cantidad, motivo } = req.body;
  const cant = Number(cantidad);
  if (!(cant > 0)) return res.status(400).json({ error: "La cantidad a devolver debe ser mayor a cero" });

  const linea = await prisma.facturaLinea.findUnique({
    where: { id: lineaId },
    include: {
      factura: { select: { id: true, ordenDespachoId: true, clienteId: true, estado: true } },
      producto: { select: { nombre: true, medida: true } },
    },
  });
  if (!linea || linea.facturaId !== facturaId) return res.status(404).json({ error: "Línea de factura no encontrada" });
  if (linea.factura.estado === "ANULADA") return res.status(400).json({ error: "La factura está anulada" });
  if (cant > Number(linea.cantidad) + 0.005) {
    return res.status(400).json({ error: `Solo quedan ${linea.cantidad} unidades facturadas de "${linea.producto.nombre} ${linea.producto.medida}" — no se puede devolver más de eso` });
  }

  const precioNeto = Number(linea.precioUnitario) * (1 - Number(linea.descuentoPct) / 100);
  const montoDevuelto = r2(cant * precioNeto);

  let avisoBalance: string | undefined;

  await prisma.$transaction(async (tx) => {
    // 1) Reducir la línea de factura y sus totales
    await tx.facturaLinea.update({
      where: { id: lineaId },
      data: { cantidad: { decrement: cant }, totalLinea: { decrement: montoDevuelto } },
    });
    await tx.factura.update({
      where: { id: facturaId },
      data: {
        totalBruto: { decrement: r2(cant * Number(linea.precioUnitario)) },
        totalNeto: { decrement: montoDevuelto },
        descuentoTotal: { decrement: r2(cant * Number(linea.precioUnitario) - montoDevuelto) },
      },
    });

    // 2) Registrar la devolución (historial, auditable y reversible)
    const dev = await tx.facturaDevolucion.create({
      data: {
        facturaId, facturaLineaId: lineaId, productoId: linea.productoId,
        cantidad: cant, montoDevuelto, motivo: motivo?.trim() || null,
        creadoPorId: req.usuario!.id,
      },
    });

    // 3) Descontar cantidadDespachada de la(s) línea(s) del DESPACHO que
    //    corresponden a este producto y a este cliente (un despacho puede
    //    traer el mismo producto de varias cotizaciones/clientes — solo se
    //    toca la de este cliente). Cascada si hace falta más de una línea.
    if (linea.factura.ordenDespachoId) {
      const candidatas = await tx.despachoLinea.findMany({
        where: {
          ordenDespachoId: linea.factura.ordenDespachoId,
          productoId: linea.productoId,
          cotizacion: { clienteId: linea.factura.clienteId },
        },
        orderBy: { cantidadDespachada: "desc" },
      });
      let restante = cant;
      for (const dl of candidatas) {
        if (restante <= 0.005) break;
        const disponible = Number(dl.cantidadDespachada);
        if (disponible <= 0.005) continue;
        const tomar = Math.min(restante, disponible);
        await tx.despachoLinea.update({ where: { id: dl.id }, data: { cantidadDespachada: { decrement: tomar } } });
        await tx.facturaDevolucionDespacho.create({ data: { devolucionId: dev.id, despachoLineaId: dl.id, cantidad: tomar } });
        restante = r2(restante - tomar);
      }
      if (restante > 0.005) {
        // No había suficiente cantidadDespachada que descontar (p.ej. el despacho
        // se editó después de facturar). No es un error bloqueante: la factura y
        // el historial ya quedaron correctos; solo no hay de dónde restar kg/PEAD.
        avisoBalance = `Se ajustó la factura, pero el despacho no tenía suficiente cantidad despachada de "${linea.producto.nombre}" para descontar completo (faltaron ${restante} unidades) — revísalo en Orden Producción.`;
      }
    }

    await recalcularEstadoFactura(tx, facturaId);
  });

  // Aviso si ya existe un balance para este despacho: es una foto, no se
  // actualiza sola — hay que entrar y darle "Regenerar" (o "Guardar y
  // recalcular" si no tiene pagos todavía).
  if (linea.factura.ordenDespachoId) {
    const balance = await prisma.balancePago.findUnique({ where: { ordenDespachoId: linea.factura.ordenDespachoId } });
    if (balance) {
      avisoBalance = (avisoBalance ? avisoBalance + " " : "") +
        "Ya existe un Balance generado para este despacho: entra y dale \"Regenerar\" para que refleje la devolución.";
    }
  }

  const facturaActualizada = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: { lineas: { include: { producto: true } }, devoluciones: { include: { producto: true }, orderBy: { creadoEn: "desc" } } },
  });
  res.status(201).json({ factura: facturaActualizada, aviso: avisoBalance });
}

// DELETE /devoluciones/:id — revertir una devolución cargada por error
export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const dev = await prisma.facturaDevolucion.findUnique({
    where: { id },
    include: { ajustesDespacho: true, facturaLinea: { select: { precioUnitario: true, descuentoPct: true } } },
  });
  if (!dev) return res.status(404).json({ error: "Devolución no encontrada" });

  await prisma.$transaction(async (tx) => {
    const montoBruto = r2(Number(dev.cantidad) * Number(dev.facturaLinea.precioUnitario));
    await tx.facturaLinea.update({
      where: { id: dev.facturaLineaId },
      data: { cantidad: { increment: dev.cantidad }, totalLinea: { increment: dev.montoDevuelto } },
    });
    await tx.factura.update({
      where: { id: dev.facturaId },
      data: {
        totalBruto: { increment: montoBruto },
        totalNeto: { increment: dev.montoDevuelto },
        descuentoTotal: { increment: r2(montoBruto - Number(dev.montoDevuelto)) },
      },
    });
    for (const aj of dev.ajustesDespacho) {
      await tx.despachoLinea.update({ where: { id: aj.despachoLineaId }, data: { cantidadDespachada: { increment: aj.cantidad } } });
    }
    await tx.facturaDevolucion.delete({ where: { id } }); // ajustesDespacho cae en cascada
    await recalcularEstadoFactura(tx, dev.facturaId);
  });

  res.json({ ok: true });
}
