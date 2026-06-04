import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const { estado, clienteId } = req.query;
  const pagos = await prisma.pago.findMany({
    where: {
      ...(estado ? { estado: estado as any } : {}),
      ...(clienteId ? { clienteId: Number(clienteId) } : {}),
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      cuenta: { select: { id: true, nombre: true, moneda: true } },
      asignaciones: {
        include: { factura: { select: { id: true, numero: true } } },
        orderBy: { fechaAsignacion: "asc" },
      },
    },
    orderBy: { fecha: "desc" },
  });
  res.json(pagos);
}

export async function registrar(req: Request, res: Response) {
  const pago = await prisma.pago.create({
    data: {
      clienteId: req.body.clienteId || null,
      cuentaId: req.body.cuentaId || null,
      monto: req.body.monto,
      moneda: req.body.moneda || "USD",
      montousd: req.body.montousd || null,
      tasaCambioBs: req.body.tasaCambioBs || null,
      tasaCambioCop: req.body.tasaCambioCop || null,
      fecha: req.body.fecha ? new Date(req.body.fecha) : new Date(),
      origenFondos: req.body.origenFondos,
      destinoUso: req.body.destinoUso,
      observaciones: req.body.observaciones,
      fechaProximoAbono: req.body.fechaProximoAbono
        ? new Date(req.body.fechaProximoAbono)
        : null,
    },
    include: {
      cliente: { select: { nombre: true } },
      cuenta: { select: { nombre: true } },
    },
  });
  res.status(201).json(pago);
}

export async function asignarAFactura(req: Request, res: Response) {
  const pagoId = Number(req.params.id);
  const asignaciones: { facturaId: number; montoAsignado: number; notas?: string }[] = req.body;

  // Validar que el monto total no exceda el pago
  const pago = await prisma.pago.findUnique({
    where: { id: pagoId },
    include: { asignaciones: true },
  });
  if (!pago) return res.status(404).json({ error: "Pago no encontrado" });

  const yaAsignado = pago.asignaciones.reduce((s, a) => s + Number(a.montoAsignado), 0);
  const nuevoTotal = asignaciones.reduce((s, a) => s + a.montoAsignado, 0);
  if (yaAsignado + nuevoTotal > Number(pago.monto)) {
    return res.status(400).json({
      error: `Monto excede el disponible. Disponible: ${Number(pago.monto) - yaAsignado}`,
    });
  }

  const ops = [];

  for (const asig of asignaciones) {
    ops.push(
      prisma.pagoAsignacion.create({
        data: {
          pagoId,
          facturaId: asig.facturaId,
          montoAsignado: asig.montoAsignado,
          notas: asig.notas,
        },
      })
    );

    // Actualizar saldo de factura
    ops.push(
      prisma.factura.update({
        where: { id: asig.facturaId },
        data: {
          totalPagado: { increment: asig.montoAsignado },
          saldoPendiente: { decrement: asig.montoAsignado },
        },
      })
    );
  }

  // Actualizar estado del pago
  const totalFinal = yaAsignado + nuevoTotal;
  const estadoPago =
    totalFinal >= Number(pago.monto) ? "ASIGNADO" : totalFinal > 0 ? "PARCIAL" : "LIBRE";

  ops.push(prisma.pago.update({ where: { id: pagoId }, data: { estado: estadoPago } }));

  await prisma.$transaction(ops);

  // Actualizar estado de facturas
  for (const asig of asignaciones) {
    const factura = await prisma.factura.findUnique({ where: { id: asig.facturaId } });
    if (factura) {
      let estadoFactura = factura.estado;
      if (Number(factura.saldoPendiente) <= 0) estadoFactura = "COBRADA";
      else if (Number(factura.totalPagado) > 0) estadoFactura = "COBRADA_PARCIAL";
      await prisma.factura.update({
        where: { id: asig.facturaId },
        data: { estado: estadoFactura },
      });
    }
  }

  res.json({ mensaje: "Pago asignado correctamente" });
}

export async function pagosPendientes(req: Request, res: Response) {
  const pagos = await prisma.pago.findMany({
    where: { estado: { in: ["LIBRE", "PARCIAL"] } },
    include: {
      cliente: { select: { nombre: true } },
      cuenta: { select: { nombre: true } },
    },
    orderBy: { fecha: "desc" },
  });
  res.json(pagos);
}
