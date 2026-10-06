import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { siguienteNumero } from "../utils/secuencia";

export async function listar(req: Request, res: Response) {
  const despachos = await prisma.ordenDespacho.findMany({
    include: {
      // Antes se traia solo 1 linea (take: 1) para sacar el cliente: la lista
      // mostraba "1 lineas" siempre y un unico cliente, aunque el despacho
      // fuera consolidado. Ahora se trae el minimo para contar y listar todos.
      lineas: {
        select: { cotizacion: { select: { cliente: { select: { nombre: true } } } } },
      },
      _count: { select: { lineas: true } },
      facturas: { select: { id: true, numero: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
  // Se resume aqui para no mandar cientos de lineas al navegador
  const resumen = despachos.map((d) => {
    const clientes = [...new Set(d.lineas.map((l) => l.cotizacion?.cliente?.nombre).filter(Boolean))] as string[];
    const { lineas, ...resto } = d;
    return { ...resto, clientes, totalLineas: d._count.lineas };
  });
  res.json(resumen);
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

const r2f = (n: number) => Math.round(n * 100) / 100;

/**
 * Vuelve a cuadrar las facturas de un despacho con lo que REALMENTE salió.
 *
 * Una devolución ya rehacía su factura (renglón, totales, saldo y estado), pero
 * **corregir las cantidades despachadas no la tocaba**: la factura se quedaba
 * con las cantidades viejas. Así pasó con FAC-0021 (Fyfto, DES-0019): se
 * verificó lo que llegó, se subieron 48 TEE 4" y se bajaron 12 YEE 4", y el
 * cliente quedó debiendo $116,16 que nadie le estaba cobrando. Regla de José
 * (6-oct-2026): después de corregir, la factura se regenera.
 *
 * Reglas:
 * - **Si la factura ya tiene pagos aplicados NO se toca.** Ahí hay dinero del
 *   cliente de por medio y la decisión es de José; se devuelve el aviso para
 *   que la pantalla se lo diga.
 * - **Los precios no se recalculan**: se conserva el `precioUnitario` con el
 *   que se facturó. Solo cambian las cantidades. Un renglón nuevo toma el
 *   precio de la cotización.
 * - Las devoluciones no estorban: bajan la cantidad despachada y el renglón de
 *   la factura a la vez, así que reconstruir desde el despacho da lo mismo.
 */
async function resincronizarFacturas(despachoId: number) {
  const actualizadas: { numero: string; cliente: string; antes: number; ahora: number }[] = [];
  const bloqueadas: { numero: string; cliente: string; motivo: string }[] = [];

  const facturas = await prisma.factura.findMany({
    where: { ordenDespachoId: despachoId, estado: { not: "ANULADA" } },
    select: {
      id: true, numero: true, clienteId: true, totalPagado: true, montoConceptosExtra: true,
      cliente: { select: { nombre: true } },
      lineas: { select: { id: true, productoId: true, cantidad: true, precioUnitario: true, orden: true } },
    },
  });
  if (facturas.length === 0) return { actualizadas, bloqueadas };

  const lineas = await prisma.despachoLinea.findMany({
    where: { ordenDespachoId: despachoId },
    select: {
      productoId: true, cantidadDespachada: true,
      producto: { select: { origen: true, pesoUnitarioKg: true } },
      cotizacion: { select: { clienteId: true, lineas: { select: { productoId: true, precioFinal: true, descuentoPct: true } } } },
    },
  });

  const despachado = new Map<number, Map<number, number>>();   // cliente -> producto -> cantidad
  const precioCot  = new Map<string, { precio: number; desc: number }>();
  const datosProd  = new Map<number, { origen: any; peso: number | null }>();
  for (const l of lineas) {
    const cliId = l.cotizacion?.clienteId;
    if (cliId == null) continue;
    const m = despachado.get(cliId) ?? new Map<number, number>();
    m.set(l.productoId, (m.get(l.productoId) ?? 0) + Number(l.cantidadDespachada));
    despachado.set(cliId, m);
    datosProd.set(l.productoId, {
      origen: l.producto?.origen ?? "INTERNO",
      peso: l.producto?.pesoUnitarioKg != null ? Number(l.producto.pesoUnitarioKg) : null,
    });
    for (const cl of l.cotizacion?.lineas ?? []) {
      precioCot.set(`${cliId}:${cl.productoId}`, { precio: Number(cl.precioFinal), desc: Number(cl.descuentoPct ?? 0) });
    }
  }

  // La factura no guarda de qué cotización nació, así que se empareja por
  // cliente. Si un cliente tiene dos facturas en el mismo despacho no hay forma
  // de saber qué renglón va a cuál: se deja quieto y se avisa.
  const cuantasPorCliente = new Map<number, number>();
  for (const f of facturas) cuantasPorCliente.set(f.clienteId, (cuantasPorCliente.get(f.clienteId) ?? 0) + 1);

  for (const f of facturas) {
    if ((cuantasPorCliente.get(f.clienteId) ?? 0) > 1) {
      bloqueadas.push({ numero: f.numero, cliente: f.cliente.nombre, motivo: "el cliente tiene más de una factura en este despacho" });
      continue;
    }
    if (Number(f.totalPagado) > 0.005) {
      bloqueadas.push({ numero: f.numero, cliente: f.cliente.nombre, motivo: `ya tiene $${Number(f.totalPagado).toFixed(2)} en pagos aplicados` });
      continue;
    }

    const objetivo = despachado.get(f.clienteId) ?? new Map<number, number>();
    const extra = Number(f.montoConceptosExtra ?? 0);
    const antes = r2f(f.lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.precioUnitario), 0)) + extra;
    const porProducto = new Map(f.lineas.map((l) => [l.productoId, l]));

    let huboCambio = false;
    let ahora = antes;

    await prisma.$transaction(async (tx) => {
      let orden = Math.max(-1, ...f.lineas.map((l) => Number(l.orden ?? 0)));

      for (const [productoId, cant] of objetivo) {
        const ex = porProducto.get(productoId);
        const pd = datosProd.get(productoId);
        if (ex) {
          if (Math.abs(Number(ex.cantidad) - cant) < 0.005) continue;
          huboCambio = true;
          if (cant <= 0.005) {
            await tx.facturaLinea.delete({ where: { id: ex.id } });
          } else {
            const pu = Number(ex.precioUnitario);
            await tx.facturaLinea.update({
              where: { id: ex.id },
              data: {
                cantidad: cant, totalLinea: r2f(cant * pu),
                ...(pd?.peso != null ? { pesoTotalKg: r2f(pd.peso * cant) } : {}),
              },
            });
          }
        } else if (cant > 0.005) {
          const p = precioCot.get(`${f.clienteId}:${productoId}`);
          if (!p) continue;   // sin precio en la cotización no se puede facturar
          huboCambio = true;
          await tx.facturaLinea.create({
            data: {
              facturaId: f.id, productoId, cantidad: cant,
              precioUnitario: p.precio, descuentoPct: p.desc, totalLinea: r2f(cant * p.precio),
              origen: pd?.origen ?? "INTERNO",
              pesoTotalKg: pd?.peso != null ? r2f(pd.peso * cant) : null,
              orden: ++orden,
            },
          });
        }
      }

      // Renglones que ya no vienen del despacho
      for (const ex of f.lineas) {
        if (!objetivo.has(ex.productoId)) {
          huboCambio = true;
          await tx.facturaLinea.delete({ where: { id: ex.id } });
        }
      }

      if (!huboCambio) return;

      const finales = await tx.facturaLinea.findMany({
        where: { facturaId: f.id },
        select: { cantidad: true, precioUnitario: true, totalLinea: true },
      });
      const bruto = r2f(finales.reduce((s, l) => s + Number(l.precioUnitario) * Number(l.cantidad), 0)) + extra;
      const neto  = r2f(finales.reduce((s, l) => s + Number(l.totalLinea), 0)) + extra;
      ahora = neto;
      // Sin pagos aplicados (ya se verificó arriba): el saldo es el total.
      await tx.factura.update({
        where: { id: f.id },
        data: { totalBruto: bruto, totalNeto: neto, descuentoTotal: r2f(bruto - neto), saldoPendiente: neto, estado: "EMITIDA" },
      });
    }, { timeout: 20000 });

    if (huboCambio) actualizadas.push({ numero: f.numero, cliente: f.cliente.nombre, antes: r2f(antes), ahora: r2f(ahora) });
  }

  return { actualizadas, bloqueadas };
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

  // Si el despacho ya tiene facturas, hay que rehacerlas con las cantidades
  // nuevas: antes se quedaban con las viejas y el cliente terminaba pagando de
  // más o de menos sin que nadie se enterara.
  const facturas = await resincronizarFacturas(despachoId);

  res.json({ ok: true, facturas });
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

  // Un despacho se factura UNA vez. Finalizarlo dos veces creaba un segundo
  // juego de facturas y todo salía duplicado: ventas, conexiones, SBUG,
  // Yolanda, Sandra y Comisiones (pasó con DES-0019, que quedó con seis
  // facturas para tres clientes y un balance del doble de lo real).
  const yaFacturado = await prisma.factura.findMany({
    where: { ordenDespachoId: despachoId },
    select: {
      numero: true, totalNeto: true, fechaEmision: true,
      cliente: { select: { nombre: true } },
      _count: { select: { pagos: true } },
    },
    orderBy: { id: "asc" },
  });
  if (yaFacturado.length > 0) {
    return res.status(409).json({
      error: `Este despacho ya se facturó: tiene ${yaFacturado.length} ${yaFacturado.length === 1 ? "factura" : "facturas"}.`,
      codigoError: "DESPACHO_YA_FACTURADO",
      facturas: yaFacturado.map((f) => ({
        numero: f.numero,
        cliente: f.cliente.nombre,
        total: Number(f.totalNeto),
        fecha: f.fechaEmision,
        pagos: f._count.pagos,
      })),
    });
  }

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

/**
 * POST /despachos/:id/lineas — agrega un producto al despacho a ultima hora.
 *
 * Se agrega TAMBIEN a la cotizacion del cliente, no solo al despacho, porque:
 *  - finalizar() saca el precio de la cotizacion; sin linea alli, el producto
 *    se descartaria en silencio al facturar.
 *  - el motor de ganancias calcula comision del vendedor, flete y Ganancias_2
 *    sobre las lineas de la COTIZACION; si no esta, no genera comision.
 * El pedido del cliente efectivamente crecio, asi que la cotizacion debe
 * reflejarlo.
 */
export async function agregarLinea(req: Request, res: Response) {
  const despachoId = Number(req.params.id);
  const { cotizacionId, productoId, cantidad, precioUnitario } = req.body;

  const cant = Number(cantidad);
  if (!cotizacionId || !productoId) return res.status(400).json({ error: "Indica la cotización y el producto" });
  if (!(cant > 0)) return res.status(400).json({ error: "La cantidad debe ser mayor a cero" });

  const despacho = await prisma.ordenDespacho.findUnique({
    where: { id: despachoId },
    select: { estado: true, lineas: { select: { cotizacionId: true, productoId: true } } },
  });
  if (!despacho) return res.status(404).json({ error: "Despacho no encontrado" });
  if (despacho.estado === "ENTREGADO") return res.status(400).json({ error: "El despacho ya fue finalizado" });

  const cotIds = new Set(despacho.lineas.map((l) => l.cotizacionId));
  if (!cotIds.has(Number(cotizacionId))) {
    return res.status(400).json({ error: "Esa cotización no pertenece a este despacho" });
  }
  if (despacho.lineas.some((l) => l.cotizacionId === Number(cotizacionId) && l.productoId === Number(productoId))) {
    return res.status(400).json({ error: "Ese producto ya está en el despacho para ese cliente: edita su cantidad en la tabla" });
  }

  const cotizacion = await prisma.cotizacion.findUnique({
    where: { id: Number(cotizacionId) },
    select: {
      id: true, clienteId: true, numero: true,
      // precioUnitarioAplicado y cantidad hacen falta para recalcular el bruto
      lineas: { select: { orden: true, totalLinea: true, precioUnitarioAplicado: true, cantidad: true } },
    },
  });
  if (!cotizacion) return res.status(404).json({ error: "Cotización no encontrada" });

  const producto = await prisma.producto.findUnique({
    where: { id: Number(productoId) },
    select: { id: true, nombre: true, medida: true, pesoUnitarioKg: true },
  });
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });

  // Precio: el indicado a mano, o el de la lista del cliente
  let precio = Number(precioUnitario);
  let listaOrigenId: number | null = null;
  if (!(precio > 0)) {
    const asignaciones = await prisma.clienteListaPrecios.findMany({
      where: { clienteId: cotizacion.clienteId },
      include: { listaPrecio: { include: { detalle: { where: { productoId: Number(productoId) } } } } },
    });
    for (const a of asignaciones) {
      const det = a.listaPrecio.detalle[0];
      if (det) { precio = Number(det.precioUnitario) * (1 - Number(det.descuentoPct) / 100); listaOrigenId = a.listaPrecioId; break; }
    }
  }
  if (!(precio > 0)) {
    return res.status(400).json({ error: `"${producto.nombre} ${producto.medida}" no tiene precio en la lista de este cliente: escribe el precio a mano.` });
  }

  const totalLinea = Math.round(precio * cant * 100) / 100;
  const ordenNuevo = cotizacion.lineas.reduce((m, l) => Math.max(m, l.orden), -1) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.cotizacionLinea.create({
      data: {
        cotizacionId: cotizacion.id, productoId: producto.id, cantidad: cant,
        precioUnitarioAplicado: precio, descuentoPct: 0, precioFinal: precio, totalLinea,
        listaPrecioOrigenId: listaOrigenId,
        pesoTotalKg: producto.pesoUnitarioKg ? Number(producto.pesoUnitarioKg) * cant : null,
        orden: ordenNuevo,
        notaCantidad: "Agregado en el despacho",
      },
    });
    // Totales de la cotizacion (el pedido crecio). Se usa la MISMA formula que
    // al crear o editar una cotizacion (cotizaciones.controller): el bruto sale
    // del precio de lista, el neto de lo que se cobra, y el descuento es la
    // diferencia -- o sea, la suma de los descuentos de cada linea.
    //
    // Antes aqui se escribia totalBruto = totalNeto = suma, y eso dejaba el
    // descuento huerfano: la cotizacion quedaba diciendo que hubo un descuento
    // que ya no se reflejaba en ningun lado, y el recuadro de totales del PDF
    // (cotizacion y factura) salia descuadrado. Lo detecto la auditoria externa.
    const neto = cotizacion.lineas.reduce((s, l) => s + Number(l.totalLinea), 0) + totalLinea;
    const bruto = cotizacion.lineas.reduce(
      (s, l) => s + Number(l.precioUnitarioAplicado) * Number(l.cantidad), 0,
    ) + precio * cant;
    await tx.cotizacion.update({
      where: { id: cotizacion.id },
      data: { totalBruto: bruto, totalNeto: neto, descuentoTotal: bruto - neto },
    });
    // Linea del despacho, ya marcada como despachada (se agrega porque salio)
    await tx.despachoLinea.create({
      data: {
        ordenDespachoId: despachoId, cotizacionId: cotizacion.id, productoId: producto.id,
        cantidadPedida: cant, cantidadDespachada: cant, cantidadFaltante: 0, estado: "DESPACHADO",
      },
    });
  });

  // Misma razon que en actualizarLineas: si el despacho ya esta facturado, la
  // mercancia que se agrega ahora tiene que aparecer en la factura.
  const facturasResinc = await resincronizarFacturas(despachoId);

  res.status(201).json({ ok: true, producto: `${producto.nombre} ${producto.medida}`, precio, cotizacion: cotizacion.numero, facturas: facturasResinc });
}
