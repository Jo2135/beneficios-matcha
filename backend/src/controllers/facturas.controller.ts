import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const { estado, clienteId } = req.query;
  // estado puede ser un valor único o varios separados por coma: "EMITIDA,PENDIENTE_COBRO"
  const estadoFiltro = estado
    ? String(estado).includes(",")
      ? { in: String(estado).split(",") as any[] }
      : (estado as any)
    : undefined;
  const facturas = await prisma.factura.findMany({
    where: {
      ...(estadoFiltro ? { estado: estadoFiltro } : {}),
      ...(clienteId ? { clienteId: Number(clienteId) } : {}),
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      empresa: { select: { id: true, nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
  res.json(facturas);
}

export async function obtener(req: Request, res: Response) {
  const factura = await prisma.factura.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: { include: { vendedor: true } },
      empresa: true,
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { orden: "asc" },
      },
      pagos: {
        include: {
          pago: {
            include: {
              cuenta: { select: { nombre: true, moneda: true } },
            },
          },
        },
        orderBy: { fechaAsignacion: "desc" },
      },
      gastos: { orderBy: { renglon: "asc" } },
      ganancias: { orderBy: { beneficiario: "asc" } },
    },
  });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  res.json(factura);
}

export async function resumenCliente(req: Request, res: Response) {
  const { clienteId } = req.params;
  const facturas = await prisma.factura.findMany({
    where: { clienteId: Number(clienteId), estado: { not: "ANULADA" } },
    include: {
      cliente: { select: { nombre: true } },
      _count: { select: { pagos: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const totalDeuda = facturas.reduce((s, f) => s + Number(f.saldoPendiente), 0);
  res.json({ facturas, totalDeuda });
}

export async function actualizarNotas(req: Request, res: Response) {
  const factura = await prisma.factura.update({
    where: { id: Number(req.params.id) },
    data: { notas: req.body.notas },
  });
  res.json(factura);
}

export async function balanceGeneral(_req: Request, res: Response) {
  const facturas = await prisma.factura.findMany({
    where: { estado: { not: "ANULADA" } },
    include: {
      cliente: { select: { nombre: true } },
      empresa: { select: { nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const totalEmitido = facturas.reduce((s, f) => s + Number(f.totalNeto), 0);
  const totalCobrado = facturas.reduce((s, f) => s + Number(f.totalPagado), 0);
  const totalPendiente = facturas.reduce((s, f) => s + Number(f.saldoPendiente), 0);

  res.json({ facturas, totalEmitido, totalCobrado, totalPendiente });
}
