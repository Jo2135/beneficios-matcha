import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function ventasProducto(req: Request, res: Response) {
  const { q, desde, hasta } = req.query;

  const cotWhere: any = {};
  if (desde || hasta) {
    cotWhere.creadoEn = {};
    if (desde) cotWhere.creadoEn.gte = new Date(desde as string);
    if (hasta) {
      const h = new Date(hasta as string);
      h.setHours(23, 59, 59, 999);
      cotWhere.creadoEn.lte = h;
    }
  }

  const lineaWhere: any = { cotizacion: cotWhere };
  if (q) {
    lineaWhere.producto = {
      OR: [
        { nombre: { contains: q as string, mode: "insensitive" } },
        { medida: { contains: q as string, mode: "insensitive" } },
      ],
    };
  }

  const lineas = await prisma.cotizacionLinea.findMany({
    where: lineaWhere,
    include: {
      producto: { include: { categoria: true } },
      cotizacion: {
        include: {
          cliente: { select: { id: true, nombre: true } },
          vendedor: { select: { id: true, nombre: true } },
        },
      },
    },
    orderBy: { cotizacion: { creadoEn: "desc" } },
  });

  res.json(lineas);
}

export async function estadoCuenta(req: Request, res: Response) {
  const clienteId = Number(req.params.clienteId);
  const { desde, hasta } = req.query;

  const df: any = {};
  if (desde) df.gte = new Date(desde as string);
  if (hasta) {
    const h = new Date(hasta as string);
    h.setHours(23, 59, 59, 999);
    df.lte = h;
  }
  const dw = Object.keys(df).length ? { creadoEn: df } : {};

  const [cliente, cotizaciones, facturas] = await Promise.all([
    prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { id: true, nombre: true, rif: true, diasCredito: true },
    }),
    prisma.cotizacion.findMany({
      where: { clienteId, ...dw },
      include: { vendedor: { select: { id: true, nombre: true } } },
      orderBy: { creadoEn: "desc" },
    }),
    prisma.factura.findMany({
      where: { clienteId, ...dw },
      orderBy: { creadoEn: "desc" },
    }),
  ]);

  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json({ cliente, cotizaciones, facturas });
}

export async function cuentasCobrar(req: Request, res: Response) {
  const { producto } = req.query;

  const facturas = await prisma.factura.findMany({
    where: { saldoPendiente: { gt: 0 } },
    include: {
      cliente: { select: { id: true, nombre: true, rif: true } },
      lineas: {
        include: { producto: true },
        ...(producto
          ? { where: { producto: { nombre: { contains: producto as string, mode: "insensitive" } } } }
          : {}),
      },
    },
    orderBy: [{ cliente: { nombre: "asc" } }],
  });

  const result = producto
    ? facturas.filter((f) => f.lineas.length > 0)
    : facturas;

  res.json(result);
}
