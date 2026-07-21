import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { siguienteNumero } from "../utils/secuencia";

export async function listar(req: Request, res: Response) {
  const despachos = await prisma.ordenDespacho.findMany({
    include: {
      lineas: {
        take: 1,
        include: {
          cotizacion: {
            include: { cliente: { select: { nombre: true } } },
          },
        },
      },
      facturas: { select: { id: true, numero: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
  res.json(despachos);
}

export async function obtener(req: Request, res: Response) {
  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      lineas: {
        include: {
          producto: { include: { categoria: true } },
          cotizacion: {
            include: { cliente: true, lineas: true },
          },
        },
        orderBy: { id: "asc" },
      },
      facturas: { select: { id: true, numero: true, totalNeto: true, estado: true } },
    },
  });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  res.json(despacho);
}

export async function crearDesdeCotizacion(req: Request, res: Response) {
  const cotizacionId = Number(req.params.cotizacionId);
  const { chofer, vehiculo, notas, fechaSalida } = req.body;

  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { lineas: { include: { producto: true }, orderBy: { orden: "asc" } } },
  });

  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });
  if (cotizacion.estado !== "APROBADA") {
    return res.status(400).json({ error: "Solo se pueden despachar cotizaciones aprobadas" });
  }

  const numero = await siguienteNumero("DES");

  const despacho = await prisma.ordenDespacho.create({
    data: {
      numero,
      chofer: chofer || null,
      vehiculo: vehiculo || null,
      notas: notas || null,
      fechaSalida: fechaSalida ? new Date(fechaSalida) : new Date(),
      estado: "PENDIENTE",
      lineas: {
        create: cotizacion.lineas.map((l) => ({
          cotizacionId,
          productoId: l.productoId,
          cantidadPedida: l.cantidad,
          cantidadDespachada: 0,
          cantidadFaltante: 0,
          estado: "PENDIENTE",
        })),
      },
    },
    include: {
      lineas: { include: { producto: true } },
    },
  });

  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado: "EN_DESPACHO" },
  });

  res.status(201).json(despacho);
}

export async function actualizarLineas(req: Request, res: Response) {
  const despachoId = Number(req.params.id);
  const lineas: { id: number; cantidadDespachada: number }[] = req.body;

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: despachoId },
    include: { lineas: true },
  });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  if (despacho.estado === "ENTREGADO") {
    return res.status(400).json({ error: "El despacho ya fue finalizado" });
  }

  await Promise.all(
    lineas.map(async (entrada) => {
      const linea = despacho.lineas.find((l) => l.id === entrada.id);
      if (!linea) return;

      const cantPedida = Number(linea.cantidadPedida);
      const cantDesp = Math.max(0, entrada.cantidadDespachada);
      const cantFaltante = Math.max(0, cantPedida - cantDesp);

      let estadoLinea: "PENDIENTE" | "DESPACHADO" | "FALTO" | "PARCIAL" = "PENDIENTE";
      if (cantDesp === 0) estadoLinea = "FALTO";
      else if (cantDesp >= cantPedida) estadoLinea = "DESPACHADO";
      else estadoLinea = "PARCIAL";

      await prisma.despachoLinea.update({
        where: { id: entrada.id },
        data: { cantidadDespachada: cantDesp, cantidadFaltante: cantFaltante, estado: estadoLinea },
      });
    })
  );

  // Actualizar estado del despacho
  const lineasActualizadas = await prisma.despachoLinea.findMany({
    where: { ordenDespachoId: despachoId },
  });
  const algunaActualizada = lineasActualizadas.some((l) => l.estado !== "PENDIENTE");
  let estadoDespacho: "PENDIENTE" | "EN_RUTA" | "ENTREGADO" | "PARCIAL" = despacho.estado as any;
  if (algunaActualizada) estadoDespacho = "EN_RUTA";

  await prisma.ordenDespacho.update({ where: { id: despachoId }, data: { estado: estadoDespacho } });

  res.json({ ok: true });
}

export async function agregarCotizacion(req: Request, res: Response) {
  const despachoId = Number(req.params.id);
  const { cotizacionId } = req.body;

  if (!cotizacionId) return res.status(400).json({ error: "cotizacionId requerido" });

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: despachoId },
    select: { estado: true, lineas: { select: { cotizacionId: true } } },
  });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  if (despacho.estado === "ENTREGADO") {
    return res.status(400).json({ error: "El despacho ya fue finalizado" });
  }

  const cotIdsEnDespacho = new Set(despacho.lineas.map((l) => l.cotizacionId));
  if (cotIdsEnDespacho.has(cotizacionId)) {
    return res.status(400).json({ error: "Esta cotización ya está incluida en el despacho" });
  }

  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: cotizacionId },
    include: { lineas: { include: { producto: true }, orderBy: { orden: "asc" } } },
  });
  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });
  if (cotizacion.estado !== "APROBADA") {
    return res.status(400).json({ error: "Solo se pueden agregar cotizaciones aprobadas" });
  }

  await prisma.despachoLinea.createMany({
    data: cotizacion.lineas.map((l) => ({
      ordenDespachoId: despachoId,
      cotizacionId,
      productoId: l.productoId,
      cantidadPedida: l.cantidad,
      cantidadDespachada: 0,
      cantidadFaltante: 0,
      estado: "PENDIENTE" as const,
    })),
  });

  await prisma.cotizacion.update({
    where: { id: cotizacionId },
    data: { estado: "EN_DESPACHO" },
  });

  res.json({ ok: true });
}

export async function finalizar(req: Request, res: Response) {
  const despachoId = Number(req.params.id);

  // Atomically save quantities if provided in body before finalizing
  const lineasBody: { id: number; cantidadDespachada: number }[] | undefined =
    Array.isArray(req.body?.lineas) && req.body.lineas.length > 0 ? req.body.lineas : undefined;

  if (lineasBody) {
    const despachoPrev = await prisma.ordenDespacho.findUnique({
      where: { id: despachoId },
      include: { lineas: true },
    });
    if (despachoPrev) {
      await Promise.all(lineasBody.map(async (entrada) => {
        const linea = despachoPrev.lineas.find((l) => l.id === Number(entrada.id));
        if (!linea) return;
        const cantPedida = Number(linea.cantidadPedida);
        const cantDesp = Math.max(0, Number(entrada.cantidadDespachada));
        const cantFaltante = Math.max(0, cantPedida - cantDesp);
        let estadoLinea: "PENDIENTE" | "DESPACHADO" | "FALTO" | "PARCIAL" = "PENDIENTE";
        if (cantDesp === 0) estadoLinea = "FALTO";
        else if (cantDesp >= cantPedida) estadoLinea = "DESPACHADO";
        else estadoLinea = "PARCIAL";
        await prisma.despachoLinea.update({
          where: { id: Number(entrada.id) },
          data: { cantidadDespachada: cantDesp, cantidadFaltante: cantFaltante, estado: estadoLinea },
        });
      }));
    }
  }

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: despachoId },
    include: {
      lineas: {
        include: {
          producto: true,
          cotizacion: { include: { cliente: true, lineas: true } },
        },
      },
    },
  });

  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  if (despacho.estado === "ENTREGADO") {
    return res.status(400).json({ error: "El despacho ya fue finalizado" });
  }

  // Agrupar líneas por cotización — soporta multi-cliente en un mismo despacho
  type LineaDespacho = (typeof despacho.lineas)[number];
  const cotizacionMap = new Map<number, {
    cotizacion: NonNullable<LineaDespacho["cotizacion"]>;
    lineas: LineaDespacho[];
  }>();

  for (const linea of despacho.lineas) {
    if (!linea.cotizacion) continue;
    const cotId = linea.cotizacion.id;
    if (!cotizacionMap.has(cotId)) {
      cotizacionMap.set(cotId, { cotizacion: linea.cotizacion, lineas: [] });
    }
    cotizacionMap.get(cotId)!.lineas.push(linea);
  }

  if (cotizacionMap.size === 0) {
    return res.status(400).json({ error: "Despacho sin cotizaciones asociadas" });
  }

  const facturasCreadas: any[] = [];

  for (const [, { cotizacion, lineas }] of cotizacionMap) {
    const preciosPorProducto = new Map<number, any>(
      cotizacion.lineas.map((l) => [l.productoId, l])
    );

    const lineasFactura = lineas
      .filter((l) => Number(l.cantidadDespachada) > 0)
      .map((l, idx) => {
        const cotLinea = preciosPorProducto.get(l.productoId);
        if (!cotLinea) return null;
        const cantDesp = Number(l.cantidadDespachada);
        const precioUnit = Number(cotLinea.precioFinal);
        return {
          productoId: l.productoId,
          cantidad: cantDesp,
          precioUnitario: precioUnit,
          descuentoPct: cotLinea.descuentoPct,
          totalLinea: cantDesp * precioUnit,
          origen: l.producto.origen,
          pesoTotalKg: l.producto.pesoUnitarioKg
            ? Number(l.producto.pesoUnitarioKg) * cantDesp
            : null,
          orden: idx,
        };
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);

    if (lineasFactura.length === 0) continue;

    const totalBruto = lineasFactura.reduce((s, l) => s + l.precioUnitario * l.cantidad, 0);
    const totalNeto  = lineasFactura.reduce((s, l) => s + l.totalLinea, 0);

    const numero = await siguienteNumero("FAC");
    const fechaVencimiento = cotizacion.cliente.diasCredito
      ? new Date(Date.now() + cotizacion.cliente.diasCredito * 86400000)
      : null;

    const factura = await prisma.factura.create({
      data: {
        numero,
        clienteId: cotizacion.clienteId,
        ordenDespachoId: despachoId,
        empresaId: cotizacion.empresaId,
        fechaVencimiento,
        totalBruto,
        descuentoTotal: totalBruto - totalNeto,
        totalNeto,
        saldoPendiente: totalNeto,
        lineas: { create: lineasFactura },
      },
    });

    facturasCreadas.push(factura);

    await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { estado: "COMPLETADA" },
    });
  }

  if (facturasCreadas.length === 0) {
    return res.status(400).json({ error: "No hay productos despachados para facturar" });
  }

  const algunoFalto = despacho.lineas.some((l) => Number(l.cantidadFaltante) > 0);

  await prisma.ordenDespacho.update({
    where: { id: despachoId },
    data: { estado: algunoFalto ? "PARCIAL" : "ENTREGADO" },
  });

  res.json({
    facturas: facturasCreadas,
    factura: facturasCreadas[0], // backward compat
    estadoDespacho: algunoFalto ? "PARCIAL" : "ENTREGADO",
  });
}


export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id },
    select: { estado: true, numero: true, _count: { select: { facturas: true } } },
  });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  // Un despacho con factura generada NO se borra: hacerlo dejaría la factura huérfana
  // (sin Ganancias ni Balance). Antes solo se bloqueaba el estado ENTREGADO, pero la
  // factura puede existir estando el despacho aún En Ruta/Parcial — ese era el hueco.
  if (despacho._count.facturas > 0) {
    return res.status(400).json({ error: "No se puede eliminar un despacho que ya tiene factura generada. Anula la factura primero." });
  }
  if (despacho.estado === "ENTREGADO") {
    return res.status(400).json({ error: "No se puede eliminar un despacho ya entregado (tiene factura generada)" });
  }
  await prisma.despachoLinea.deleteMany({ where: { ordenDespachoId: id } });
  await prisma.ordenDespacho.delete({ where: { id } });
  res.json({ ok: true });
}
