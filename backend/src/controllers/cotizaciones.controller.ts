import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { siguienteNumero } from "../utils/secuencia";

/** Construye un mapa productoId → precio buscando en TODAS las listas asignadas al cliente */
async function getPrecioMap(clienteId: number): Promise<Map<number, { precioUnitario: number; descuentoPct: number; listaPrecioId: number }>> {
  const asignaciones = await prisma.clienteListaPrecios.findMany({
    where: { clienteId },
    include: { listaPrecio: { include: { detalle: true } } },
  });
  const map = new Map<number, { precioUnitario: number; descuentoPct: number; listaPrecioId: number }>();
  for (const asig of asignaciones) {
    for (const d of asig.listaPrecio.detalle) {
      if (!map.has(d.productoId)) {
        map.set(d.productoId, {
          precioUnitario: Number(d.precioUnitario),
          descuentoPct: Number(d.descuentoPct),
          listaPrecioId: asig.listaPrecioId,
        });
      }
    }
  }
  return map;
}

interface LineaInput {
  productoId: number;
  cantidad: number;
  notaCantidad?: string;
  descuentoPct?: number;
}

export async function listar(req: Request, res: Response) {
  const { estado, clienteId } = req.query;
  const usuario = req.usuario!;

  const where: any = {};
  if (estado) where.estado = estado as any;
  if (clienteId) where.clienteId = Number(clienteId);
  // VENDEDOR solo ve sus propias cotizaciones
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId) {
    where.vendedorId = usuario.vendedorId;
  }

  const cotizaciones = await prisma.cotizacion.findMany({
    where,
    include: {
      cliente: { select: { id: true, nombre: true, empresaFactura: true } },
      vendedor: { select: { id: true, nombre: true } },
      empresa: { select: { id: true, nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
  res.json(cotizaciones);
}

export async function obtener(req: Request, res: Response) {
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: {
        include: {
          vendedor: true,
          listasAsignadas: { include: { listaPrecio: { select: { id: true, nombre: true } } } },
        },
      },
      vendedor: true,
      empresa: true,
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { orden: "asc" },
      },
    },
  });
  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });
  res.json(cotizacion);
}

export async function crear(req: Request, res: Response) {
  const { clienteId, vendedorId, empresaId, validezDias, notas, lineas } = req.body as {
    clienteId: number;
    vendedorId?: number;
    empresaId?: number;
    validezDias?: number;
    notas?: string;
    lineas: LineaInput[];
  };

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

  if (req.usuario!.rol === "VENDEDOR" && req.usuario!.vendedorId) {
    if (cliente.vendedorId !== req.usuario!.vendedorId) {
      return res.status(403).json({ error: "Solo puedes crear cotizaciones para tus propios clientes" });
    }
  }

  const precioMap = await getPrecioMap(clienteId);
  const numero = await siguienteNumero("COT");
  const fechaVencimiento = new Date();
  fechaVencimiento.setDate(fechaVencimiento.getDate() + (validezDias ?? 30));

  // Resolver precios con snapshot
  const lineasConPrecios = await Promise.all(
    lineas.map(async (linea, idx) => {
      const detallePrecio = precioMap.get(linea.productoId);

      if (!detallePrecio) {
        throw new Error(`Producto ${linea.productoId} no tiene precio en ninguna lista del cliente`);
      }

      const descuento = linea.descuentoPct ?? detallePrecio.descuentoPct;
      const precioBase = detallePrecio.precioUnitario;
      const precioFinal = precioBase * (1 - descuento / 100);
      const totalLinea = precioFinal * linea.cantidad;

      const producto = await prisma.producto.findUnique({ where: { id: linea.productoId } });
      const pesoTotalKg = producto?.pesoUnitarioKg
        ? Number(producto.pesoUnitarioKg) * linea.cantidad
        : null;

      return {
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        notaCantidad: linea.notaCantidad,
        precioUnitarioAplicado: precioBase,
        descuentoPct: descuento,
        precioFinal,
        totalLinea,
        listaPrecioOrigenId: detallePrecio.listaPrecioId,
        pesoTotalKg,
        orden: idx,
      };
    })
  );

  const totalBruto = lineasConPrecios.reduce((s, l) => s + Number(l.precioUnitarioAplicado) * l.cantidad, 0);
  const descuentoTotal = totalBruto - lineasConPrecios.reduce((s, l) => s + l.totalLinea, 0);
  const totalNeto = lineasConPrecios.reduce((s, l) => s + l.totalLinea, 0);

  // Look up fresh vendedorId from DB so MASTER doesn't need to re-login after linking a vendor
  const creadorDb = await prisma.usuario.findUnique({
    where: { id: req.usuario!.id },
    select: { vendedorId: true },
  });
  const vendedorFinal = req.usuario!.rol === "VENDEDOR" && req.usuario!.vendedorId
    ? req.usuario!.vendedorId
    : (vendedorId ?? creadorDb?.vendedorId ?? cliente.vendedorId);

  const cotizacion = await prisma.cotizacion.create({
    data: {
      numero,
      clienteId,
      vendedorId: vendedorFinal,
      empresaId,
      validezDias: validezDias ?? 30,
      fechaVencimiento,
      totalBruto,
      descuentoTotal,
      totalNeto,
      notas,
      lineas: { create: lineasConPrecios },
    },
    include: {
      cliente: true,
      lineas: { include: { producto: { include: { categoria: true } } } },
    },
  });

  res.status(201).json(cotizacion);
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { clienteId, vendedorId, notas, validezDias, lineas } = req.body as {
    clienteId: number;
    vendedorId?: number;
    notas?: string;
    validezDias?: number;
    lineas: LineaInput[];
  };
  const usuario = req.usuario!;

  const cot = await prisma.cotizacion.findUnique({
    where: { id },
    select: { estado: true, vendedorId: true, numero: true },
  });
  if (!cot) return res.status(404).json({ error: "Cotización no encontrada" });
  if (!["BORRADOR", "RECHAZADA"].includes(cot.estado)) {
    return res.status(400).json({ error: `No se puede editar una cotización en estado ${cot.estado}` });
  }
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId && cot.vendedorId !== usuario.vendedorId) {
    return res.status(403).json({ error: "Solo puedes editar tus propias cotizaciones" });
  }

  const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });

  const precioMap = await getPrecioMap(clienteId);

  const lineasConPrecios = await Promise.all(
    lineas.map(async (linea, idx) => {
      const detallePrecio = precioMap.get(linea.productoId);
      if (!detallePrecio) throw new Error(`Producto ${linea.productoId} no tiene precio en ninguna lista del cliente`);

      const descuento = linea.descuentoPct ?? detallePrecio.descuentoPct;
      const precioBase = detallePrecio.precioUnitario;
      const precioFinal = precioBase * (1 - descuento / 100);
      const totalLinea = precioFinal * linea.cantidad;

      const producto = await prisma.producto.findUnique({ where: { id: linea.productoId } });
      const pesoTotalKg = producto?.pesoUnitarioKg ? Number(producto.pesoUnitarioKg) * linea.cantidad : null;

      return {
        productoId: linea.productoId,
        cantidad: linea.cantidad,
        notaCantidad: linea.notaCantidad,
        precioUnitarioAplicado: precioBase,
        descuentoPct: descuento,
        precioFinal,
        totalLinea,
        listaPrecioOrigenId: detallePrecio.listaPrecioId,
        pesoTotalKg,
        orden: idx,
      };
    })
  );

  const totalBruto = lineasConPrecios.reduce((s, l) => s + Number(l.precioUnitarioAplicado) * l.cantidad, 0);
  const descuentoTotal = totalBruto - lineasConPrecios.reduce((s, l) => s + l.totalLinea, 0);
  const totalNeto = lineasConPrecios.reduce((s, l) => s + l.totalLinea, 0);

  const fechaVencimiento = new Date();
  fechaVencimiento.setDate(fechaVencimiento.getDate() + (validezDias ?? 30));

  // Vendedor: MASTER/ADMIN pueden cambiarlo; si no eligen, quedan ellos como vendedor.
  // VENDEDOR no puede reasignar (se conserva el vendedor actual).
  let vendedorFinal: number | null | undefined = undefined;
  if (usuario.rol !== "VENDEDOR") {
    const creadorDb = await prisma.usuario.findUnique({ where: { id: usuario.id }, select: { vendedorId: true } });
    vendedorFinal = vendedorId ?? creadorDb?.vendedorId ?? null;
  }

  await prisma.cotizacionLinea.deleteMany({ where: { cotizacionId: id } });

  const cotizacion = await prisma.cotizacion.update({
    where: { id },
    data: {
      clienteId,
      ...(vendedorFinal !== undefined ? { vendedorId: vendedorFinal } : {}),
      notas,
      validezDias: validezDias ?? 30,
      fechaVencimiento,
      totalBruto,
      descuentoTotal,
      totalNeto,
      estado: "BORRADOR",
      lineas: { create: lineasConPrecios },
    },
    include: {
      cliente: true,
      lineas: { include: { producto: { include: { categoria: true } } } },
    },
  });

  res.json(cotizacion);
}

export async function cambiarEstado(req: Request, res: Response) {
  const { estado } = req.body;
  const cotizacionId = Number(req.params.id);
  const usuario = req.usuario!;

  if (usuario.rol === "VENDEDOR") {
    if (estado !== "ENVIADA") {
      return res.status(403).json({ error: "Solo puedes enviar cotizaciones para aprobación" });
    }
    const cot = await prisma.cotizacion.findUnique({
      where: { id: cotizacionId },
      select: { vendedorId: true, estado: true },
    });
    if (!cot) return res.status(404).json({ error: "Cotización no encontrada" });
    if (cot.vendedorId !== usuario.vendedorId) {
      return res.status(403).json({ error: "Solo puedes enviar tus propias cotizaciones" });
    }
    if (cot.estado !== "BORRADOR") {
      return res.status(400).json({ error: "Solo puedes enviar cotizaciones en borrador" });
    }
  }

  const cotizacion = await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado },
  });
  res.json(cotizacion);
}

// Actualiza el precio de una línea específica y recalcula los totales de la cotización
export async function actualizarPrecioLinea(req: Request, res: Response) {
  const lineaId = Number(req.params.lineaId);
  const { precioUnitario, descuentoPct } = req.body;

  const linea = await prisma.cotizacionLinea.findUnique({
    where: { id: lineaId },
    include: { cotizacion: true },
  });
  if (!linea) return res.status(404).json({ error: "Línea no encontrada" });
  if (linea.cotizacion.estado === "COMPLETADA") {
    return res.status(400).json({ error: "No se puede editar una cotización ya completada/facturada" });
  }

  const precio = Number(precioUnitario);
  const dto = descuentoPct !== undefined ? Number(descuentoPct) : Number(linea.descuentoPct);
  const precioFinal = precio * (1 - dto / 100);
  const totalLinea = precioFinal * Number(linea.cantidad);

  await prisma.cotizacionLinea.update({
    where: { id: lineaId },
    data: { precioUnitarioAplicado: precio, descuentoPct: dto, precioFinal, totalLinea },
  });

  // Recalcular totales de la cotización
  const todasLineas = await prisma.cotizacionLinea.findMany({
    where: { cotizacionId: linea.cotizacionId },
  });
  const totalBruto = todasLineas.reduce((s, l) => s + Number(l.precioUnitarioAplicado) * Number(l.cantidad), 0);
  const totalNeto = todasLineas.reduce((s, l) => s + Number(l.totalLinea), 0);
  const descuentoTotal = totalBruto - totalNeto;

  const cot = await prisma.cotizacion.update({
    where: { id: linea.cotizacionId },
    data: { totalBruto, totalNeto, descuentoTotal },
  });
  res.json({ ok: true, totalNeto: cot.totalNeto });
}

// Recalcula todos los precios de una cotización desde la lista de precios actual del cliente
export async function recalcularDesdeListaPrecios(req: Request, res: Response) {
  const cotizacionId = Number(req.params.id);
  const usuario = req.usuario!;
  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { lineas: true },
  });
  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });
  if (cotizacion.estado === "COMPLETADA") {
    return res.status(400).json({ error: "No se puede recalcular una cotización ya completada/facturada" });
  }
  // VENDEDOR solo puede recalcular sus propias cotizaciones
  if (usuario.rol === "VENDEDOR" && cotizacion.vendedorId !== usuario.vendedorId) {
    return res.status(403).json({ error: "Solo puedes modificar tus propias cotizaciones" });
  }

  const precioMap = await getPrecioMap(cotizacion.clienteId);
  const actualizados: string[] = [];
  const sinPrecio: string[] = [];

  for (const linea of cotizacion.lineas) {
    const detalle = precioMap.get(linea.productoId);
    if (!detalle) { sinPrecio.push(String(linea.productoId)); continue; }

    const precio = detalle.precioUnitario;
    const dto = Number(linea.descuentoPct);
    const precioFinal = precio * (1 - dto / 100);
    const totalLinea = precioFinal * Number(linea.cantidad);

    await prisma.cotizacionLinea.update({
      where: { id: linea.id },
      data: { precioUnitarioAplicado: precio, precioFinal, totalLinea, listaPrecioOrigenId: detalle.listaPrecioId },
    });
    actualizados.push(String(linea.id));
  }

  // Recalcular totales
  const todasLineas = await prisma.cotizacionLinea.findMany({ where: { cotizacionId } });
  const totalBruto = todasLineas.reduce((s, l) => s + Number(l.precioUnitarioAplicado) * Number(l.cantidad), 0);
  const totalNeto = todasLineas.reduce((s, l) => s + Number(l.totalLinea), 0);
  const descuentoTotal = totalBruto - totalNeto;

  await prisma.cotizacion.update({ where: { id: cotizacionId }, data: { totalBruto, totalNeto, descuentoTotal } });
  res.json({ actualizados: actualizados.length, sinPrecio });
}

export async function ordenProduccion(req: Request, res: Response) {
  const cotizaciones = await prisma.cotizacion.findMany({
    where: { estado: { in: ["APROBADA", "EN_DESPACHO"] } },
    include: {
      cliente: { select: { id: true, nombre: true } },
      vendedor: { select: { id: true, nombre: true } },
      lineas: {
        include: {
          producto: {
            select: {
              id: true, nombre: true, medida: true, origen: true,
              categoria: { select: { nombre: true } },
            },
          },
        },
        orderBy: { orden: "asc" },
      },
    },
    orderBy: { creadoEn: "asc" },
  });
  res.json(cotizaciones);
}

export async function generarFactura(req: Request, res: Response) {
  const cotizacionId = Number(req.params.id);

  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: {
      cliente: true,
      lineas: { include: { producto: true } },
    },
  });

  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });
  if (cotizacion.estado !== "APROBADA" && cotizacion.estado !== "EN_DESPACHO") {
    return res.status(400).json({ error: "Solo se pueden facturar cotizaciones aprobadas" });
  }

  const numero = await siguienteNumero("FAC");
  const fechaVencimiento = cotizacion.cliente.diasCredito
    ? new Date(Date.now() + cotizacion.cliente.diasCredito * 86400000)
    : null;

  const factura = await prisma.factura.create({
    data: {
      numero,
      clienteId: cotizacion.clienteId,
      empresaId: cotizacion.empresaId,
      fechaVencimiento,
      totalBruto: cotizacion.totalBruto,
      descuentoTotal: cotizacion.descuentoTotal,
      totalNeto: cotizacion.totalNeto,
      saldoPendiente: cotizacion.totalNeto,
      lineas: {
        create: cotizacion.lineas.map((l, idx) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          precioUnitario: l.precioFinal,
          descuentoPct: l.descuentoPct,
          totalLinea: l.totalLinea,
          origen: l.producto.origen,
          pesoTotalKg: l.pesoTotalKg,
          orden: idx,
        })),
      },
    },
    include: {
      cliente: true,
      lineas: { include: { producto: { include: { categoria: true } } } },
    },
  });

  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado: "COMPLETADA" },
  });

  res.status(201).json(factura);
}

export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const cot = await prisma.cotizacion.findUnique({ where: { id }, select: { estado: true, numero: true } });
  if (!cot) return res.status(404).json({ error: "Cotización no encontrada" });
  if (["EN_DESPACHO", "COMPLETADA"].includes(cot.estado)) {
    return res.status(400).json({ error: `No se puede eliminar una cotización en estado ${cot.estado}` });
  }
  await prisma.cotizacionLinea.deleteMany({ where: { cotizacionId: id } });
  await prisma.cotizacion.delete({ where: { id } });
  res.json({ ok: true });
}

export async function duplicar(req: Request, res: Response) {
  const original = await prisma.cotizacion.findUnique({
    where: { id: Number(req.params.id) },
    include: { lineas: true },
  });
  if (!original) return res.status(404).json({ error: "Cotización no encontrada" });

  const numero = await siguienteNumero("COT");

  const nueva = await prisma.cotizacion.create({
    data: {
      numero,
      clienteId: original.clienteId,
      vendedorId: original.vendedorId ?? undefined,
      empresaId: original.empresaId ?? undefined,
      estado: "BORRADOR",
      validezDias: original.validezDias,
      totalBruto: original.totalBruto,
      descuentoTotal: original.descuentoTotal,
      totalNeto: original.totalNeto,
      notas: original.notas ?? undefined,
      lineas: {
        create: original.lineas.map((l, idx) => ({
          productoId: l.productoId,
          cantidad: l.cantidad,
          notaCantidad: l.notaCantidad ?? undefined,
          precioUnitarioAplicado: l.precioUnitarioAplicado,
          descuentoPct: l.descuentoPct,
          precioFinal: l.precioFinal,
          totalLinea: l.totalLinea,
          listaPrecioOrigenId: l.listaPrecioOrigenId ?? undefined,
          pesoTotalKg: l.pesoTotalKg ?? undefined,
          orden: idx,
        })),
      },
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      vendedor: { select: { id: true, nombre: true } },
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { orden: "asc" },
      },
    },
  });

  res.status(201).json(nueva);
}

export async function reporteComisiones(req: Request, res: Response) {
  const { mes } = req.query;

  const where: any = { estado: { in: ["APROBADA", "COMPLETADA"] } };

  if (mes) {
    const [year, month] = (mes as string).split("-").map(Number);
    where.creadoEn = {
      gte: new Date(year, month - 1, 1),
      lt: new Date(year, month, 1),
    };
  }

  const cotizaciones = await prisma.cotizacion.findMany({
    where,
    include: {
      cliente: true,
      vendedor: true,
      lineas: { include: { producto: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const esConexion = (l: any) =>
    (l.producto?.origen ?? "INTERNO") === "EXTERNO" &&
    !(l.producto?.nombre ?? "").toLowerCase().includes("manguera");

  const vendedorMap = new Map<number, any>();

  for (const cot of cotizaciones) {
    if (!cot.vendedorId || !cot.vendedor) continue;

    const c = cot.cliente;
    const ctPct = Number(c.comisionTuberiaPct ?? 0);
    const ccPct = Number(c.comisionConexionesPct ?? 0);

    const totalTub = cot.lineas
      .filter((l) => !esConexion(l))
      .reduce((s, l) => s + Number(l.totalLinea), 0);
    const totalCon = cot.lineas
      .filter((l) => esConexion(l))
      .reduce((s, l) => s + Number(l.totalLinea), 0);

    const comision =
      (ctPct > 0 ? totalTub * ctPct / (100 + ctPct) : 0) +
      (ccPct > 0 ? totalCon * ccPct / (100 + ccPct) : 0);

    if (!vendedorMap.has(cot.vendedorId)) {
      vendedorMap.set(cot.vendedorId, {
        vendedor: { id: cot.vendedor.id, nombre: cot.vendedor.nombre },
        totalCotizaciones: 0,
        totalVentas: 0,
        comision: 0,
        detalle: [],
      });
    }

    const v = vendedorMap.get(cot.vendedorId)!;
    v.totalCotizaciones++;
    v.totalVentas += Number(cot.totalNeto);
    v.comision += comision;
    v.detalle.push({
      id: cot.id,
      numero: cot.numero,
      cliente: c.nombre,
      totalNeto: Number(cot.totalNeto),
      comision,
      estado: cot.estado,
      fecha: cot.creadoEn,
    });
  }

  res.json(Array.from(vendedorMap.values()));
}
