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

/** Ventas por producto basadas en FACTURAS (ventas reales, incluye históricas).
 *  Devuelve la misma forma que ventasProducto pero desde FacturaLinea, para que
 *  las pestañas de Reportes la consuman sin cambios. */
export async function ventasProductoFacturas(req: Request, res: Response) {
  const { q, desde, hasta } = req.query;

  const facWhere: any = { estado: { not: "ANULADA" } };
  if (desde || hasta) {
    facWhere.fechaEmision = {};
    if (desde) facWhere.fechaEmision.gte = new Date(desde as string);
    if (hasta) { const h = new Date(hasta as string); h.setHours(23, 59, 59, 999); facWhere.fechaEmision.lte = h; }
  }

  const lineaWhere: any = { factura: facWhere };
  if (q) {
    lineaWhere.producto = {
      OR: [
        { nombre: { contains: q as string, mode: "insensitive" } },
        { medida: { contains: q as string, mode: "insensitive" } },
      ],
    };
  }

  const lineas = await prisma.facturaLinea.findMany({
    where: lineaWhere,
    include: {
      producto: { include: { categoria: true } },
      factura: { include: { cliente: { select: { id: true, nombre: true } } } },
    },
    orderBy: { factura: { fechaEmision: "desc" } },
  });

  // Reshape: se expone como "cotizacion" (envoltorio) para reutilizar la UI de Reportes
  const out = lineas.map((l) => ({
    cantidad: l.cantidad,
    totalLinea: l.totalLinea,
    producto: l.producto,
    cotizacion: {
      id: l.factura.id,
      numero: l.factura.numero,
      creadoEn: l.factura.fechaEmision,
      estado: l.factura.estado,
      cliente: l.factura.cliente,
    },
  }));
  res.json(out);
}

/** Estadísticas de ventas basadas en FACTURAS: top productos, top clientes, ventas por mes */
export async function ventasFacturas(req: Request, res: Response) {
  const { desde, hasta } = req.query;
  const where: any = { estado: { not: "ANULADA" } };
  if (desde || hasta) {
    where.fechaEmision = {};
    if (desde) where.fechaEmision.gte = new Date(desde as string);
    if (hasta) { const h = new Date(hasta as string); h.setHours(23, 59, 59, 999); where.fechaEmision.lte = h; }
  }

  const facturas = await prisma.factura.findMany({
    where,
    select: {
      id: true, fechaEmision: true, totalNeto: true,
      cliente: { select: { id: true, nombre: true } },
      lineas: { select: { cantidad: true, totalLinea: true, producto: { select: { id: true, nombre: true, medida: true } } } },
    },
  });

  const prodMap = new Map<number, { nombre: string; monto: number; unidades: number }>();
  const cliMap = new Map<number, { nombre: string; monto: number; facturas: number }>();
  const mesMap = new Map<string, number>();
  let totalVentas = 0;

  for (const f of facturas) {
    const monto = Number(f.totalNeto);
    totalVentas += monto;
    if (f.cliente) {
      const c = cliMap.get(f.cliente.id) ?? { nombre: f.cliente.nombre, monto: 0, facturas: 0 };
      c.monto += monto; c.facturas += 1;
      cliMap.set(f.cliente.id, c);
    }
    const d = new Date(f.fechaEmision);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesMap.set(mk, (mesMap.get(mk) ?? 0) + monto);
    for (const l of f.lineas) {
      if (!l.producto) continue;
      const p = prodMap.get(l.producto.id) ?? { nombre: `${l.producto.nombre} ${l.producto.medida}`.trim(), monto: 0, unidades: 0 };
      p.monto += Number(l.totalLinea);
      p.unidades += Number(l.cantidad);
      prodMap.set(l.producto.id, p);
    }
  }

  res.json({
    totalFacturas: facturas.length,
    totalVentas,
    topProductosMonto:    [...prodMap.values()].sort((a, b) => b.monto - a.monto).slice(0, 15),
    topProductosUnidades: [...prodMap.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 15),
    topClientes:          [...cliMap.values()].sort((a, b) => b.monto - a.monto).slice(0, 15),
    ventasPorMes:         [...mesMap.entries()].sort().map(([mes, monto]) => ({ mes, monto })),
  });
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
