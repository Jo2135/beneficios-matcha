import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

/**
 * Gastos operativos: almuerzos, agua mineral, soldadura, insumos en general.
 *
 * El flujo que pidió José (1-oct-2026) es en dos pasos, a propósito:
 *  1. Se carga el pago: fecha, descripción, monto y medio de pago. Nada más.
 *  2. Después se reparte. Un mismo gasto puede ir partido entre varios
 *     despachos y renglones distintos ("$30 al 40% Capital de Ferremarket y
 *     el resto al Extra Material de Gandica"). Él decide a qué se le resta.
 *
 * Cada parte asignada se comporta como un abono del renglón: baja su saldo en
 * el Balance de Pagos (ver getBalance en balance.controller.ts).
 */

export const MEDIOS_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo",
  TRUEQUE: "Trueque / mercancía",
  BINANCE: "Binance",
  BANESCO_PANAMA: "Transferencia Banesco Panamá",
  DEPOSITO_USD: "Depósito en dólares",
  DEPOSITO_BS: "Depósito en Bs",
  BANCO_COLOMBIA: "Depósito banco colombiano",
  ZELLE: "Zelle",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => Number(v ?? 0) || 0;

const INCLUDE = {
  asignaciones: {
    include: {
      ordenDespacho: {
        select: {
          id: true, numero: true,
          facturas: { select: { numero: true, cliente: { select: { nombre: true } } } },
        },
      },
    },
    orderBy: { id: "asc" as const },
  },
  creadoPor: { select: { nombre: true } },
};

function conTotales(g: any) {
  const monto = num(g.monto);
  const asignado = r2((g.asignaciones ?? []).reduce((s: number, a: any) => s + num(a.monto), 0));
  return {
    id: g.id,
    fecha: g.fecha,
    descripcion: g.descripcion,
    monto,
    medioPago: g.medioPago,
    medioPagoLabel: MEDIOS_PAGO[g.medioPago] ?? g.medioPago,
    notas: g.notas,
    creadoPor: g.creadoPor?.nombre ?? null,
    asignado,
    libre: r2(monto - asignado),
    asignaciones: (g.asignaciones ?? []).map((a: any) => ({
      id: a.id,
      monto: num(a.monto),
      renglon: a.renglon,
      despachoId: a.ordenDespachoId,
      despacho: a.ordenDespacho?.numero ?? "—",
      clientes: [...new Set((a.ordenDespacho?.facturas ?? []).map((f: any) => f.cliente?.nombre).filter(Boolean))].join(" / "),
      facturas: (a.ordenDespacho?.facturas ?? []).map((f: any) => f.numero).join(", "),
    })),
  };
}

/** GET /gastos-operativos?desde&hasta */
export async function listar(req: Request, res: Response) {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };
  const gastos = await prisma.gastoOperativo.findMany({
    where: desde || hasta
      ? { fecha: { ...(desde ? { gte: new Date(desde) } : {}), ...(hasta ? { lte: new Date(hasta + "T23:59:59") } : {}) } }
      : {},
    include: INCLUDE,
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });
  const filas = gastos.map(conTotales);
  res.json({
    gastos: filas,
    medios: Object.entries(MEDIOS_PAGO).map(([key, label]) => ({ key, label })),
    totales: {
      total: r2(filas.reduce((s, g) => s + g.monto, 0)),
      asignado: r2(filas.reduce((s, g) => s + g.asignado, 0)),
      libre: r2(filas.reduce((s, g) => s + g.libre, 0)),
    },
  });
}

/** POST /gastos-operativos */
export async function crear(req: Request, res: Response) {
  const { fecha, descripcion, monto, medioPago, notas } = req.body ?? {};
  const m = Number(monto);
  if (!fecha) return res.status(400).json({ error: "Indica la fecha del gasto" });
  if (!String(descripcion ?? "").trim()) return res.status(400).json({ error: "Escribe en qué se gastó" });
  if (!(m > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });
  if (!MEDIOS_PAGO[String(medioPago)]) return res.status(400).json({ error: "Elige con qué se pagó" });

  const creado = await prisma.gastoOperativo.create({
    data: {
      fecha: new Date(fecha),
      descripcion: String(descripcion).trim(),
      monto: m,
      medioPago: String(medioPago),
      notas: notas ? String(notas).trim() : null,
      creadoPorId: (req as any).usuario?.id ?? null,
    },
    include: INCLUDE,
  });
  res.status(201).json(conTotales(creado));
}

/** PATCH /gastos-operativos/:id */
export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gasto = await prisma.gastoOperativo.findUnique({ where: { id }, include: { asignaciones: true } });
  if (!gasto) return res.status(404).json({ error: "Gasto no encontrado" });

  const { fecha, descripcion, monto, medioPago, notas } = req.body ?? {};
  const data: any = {};
  if (fecha !== undefined) data.fecha = new Date(fecha);
  if (descripcion !== undefined) data.descripcion = String(descripcion).trim();
  if (medioPago !== undefined) {
    if (!MEDIOS_PAGO[String(medioPago)]) return res.status(400).json({ error: "Medio de pago inválido" });
    data.medioPago = String(medioPago);
  }
  if (notas !== undefined) data.notas = notas ? String(notas).trim() : null;
  if (monto !== undefined) {
    const m = Number(monto);
    if (!(m > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });
    const asignado = r2(gasto.asignaciones.reduce((s, a) => s + num(a.monto), 0));
    if (m < asignado - 0.005) {
      return res.status(400).json({
        error: `Este gasto ya tiene $${asignado.toFixed(2)} repartidos en el balance. Quita alguna asignación antes de bajarlo a $${m.toFixed(2)}.`,
      });
    }
    data.monto = m;
  }

  const actualizado = await prisma.gastoOperativo.update({ where: { id }, data, include: INCLUDE });
  res.json(conTotales(actualizado));
}

/** DELETE /gastos-operativos/:id — se lleva también sus asignaciones */
export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const gasto = await prisma.gastoOperativo.findUnique({ where: { id }, include: { asignaciones: true } });
  if (!gasto) return res.status(404).json({ error: "Gasto no encontrado" });
  if (gasto.asignaciones.length > 0 && req.body?.confirmar !== true) {
    return res.status(409).json({
      error: `Este gasto está repartido en ${gasto.asignaciones.length} renglón(es) del balance. Si lo borras, esos renglones vuelven a quedar con el saldo completo.`,
      codigoError: "GASTO_ASIGNADO",
      asignaciones: gasto.asignaciones.length,
    });
  }
  await prisma.gastoOperativo.delete({ where: { id } });
  res.json({ ok: true });
}

/**
 * GET /gastos-operativos/destinos — a dónde se puede mandar un gasto.
 * Devuelve los despachos que ya tienen balance, con sus renglones y el saldo
 * que le queda a cada uno (contando abonos y gastos ya asignados).
 */
export async function destinos(_req: Request, res: Response) {
  const balances = await prisma.balancePago.findMany({
    include: {
      items: { include: { cuotas: { select: { monto: true } } }, orderBy: { orden: "asc" } },
      ordenDespacho: {
        select: {
          id: true, numero: true, fechaSalida: true,
          facturas: { select: { numero: true, cliente: { select: { nombre: true } } } },
        },
      },
    },
  });

  const asignado = await prisma.gastoOperativoAsignacion.groupBy({
    by: ["ordenDespachoId", "renglon"],
    _sum: { monto: true },
  });
  const yaAsignado = new Map(asignado.map((a) => [`${a.ordenDespachoId}|${a.renglon}`, num(a._sum.monto)]));

  const filas = balances
    .map((b) => ({
      despachoId: b.ordenDespachoId,
      numero: b.ordenDespacho?.numero ?? "—",
      fecha: b.ordenDespacho?.fechaSalida ?? null,
      clientes: [...new Set((b.ordenDespacho?.facturas ?? []).map((f) => f.cliente?.nombre).filter(Boolean))].join(" / "),
      facturas: (b.ordenDespacho?.facturas ?? []).map((f) => f.numero).join(", "),
      renglones: b.items.map((i) => {
        const pagado = r2(
          i.cuotas.reduce((s, c) => s + num(c.monto), 0) + (yaAsignado.get(`${b.ordenDespachoId}|${i.nombre}`) ?? 0),
        );
        return { nombre: i.nombre, montoTotal: num(i.montoTotal), pagado, saldo: r2(num(i.montoTotal) - pagado) };
      }),
    }))
    .sort((a, b) => (b.fecha?.getTime() ?? 0) - (a.fecha?.getTime() ?? 0));

  res.json(filas);
}

/** POST /gastos-operativos/:id/asignaciones { ordenDespachoId, renglon, monto } */
export async function asignar(req: Request, res: Response) {
  const gastoId = Number(req.params.id);
  const { ordenDespachoId, renglon, monto } = req.body ?? {};
  const m = Number(monto);

  const gasto = await prisma.gastoOperativo.findUnique({ where: { id: gastoId }, include: { asignaciones: true } });
  if (!gasto) return res.status(404).json({ error: "Gasto no encontrado" });
  if (!(m > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });
  if (!ordenDespachoId || !String(renglon ?? "").trim()) {
    return res.status(400).json({ error: "Elige la factura y el renglón del balance" });
  }

  const libre = r2(num(gasto.monto) - gasto.asignaciones.reduce((s, a) => s + num(a.monto), 0));
  if (m > libre + 0.005) {
    return res.status(400).json({ error: `De este gasto solo quedan $${libre.toFixed(2)} sin repartir.` });
  }

  const balance = await prisma.balancePago.findUnique({
    where: { ordenDespachoId: Number(ordenDespachoId) },
    include: { items: { select: { nombre: true } }, ordenDespacho: { select: { numero: true } } },
  });
  if (!balance) {
    return res.status(400).json({ error: "Ese despacho todavía no tiene balance generado. Entra a su Balance y genéralo primero." });
  }
  if (!balance.items.some((i) => i.nombre === String(renglon))) {
    return res.status(400).json({ error: `El balance de ${balance.ordenDespacho?.numero} no tiene el renglón "${renglon}".` });
  }

  await prisma.gastoOperativoAsignacion.create({
    data: { gastoId, ordenDespachoId: Number(ordenDespachoId), renglon: String(renglon), monto: m },
  });
  const actualizado = await prisma.gastoOperativo.findUnique({ where: { id: gastoId }, include: INCLUDE });
  res.status(201).json(conTotales(actualizado));
}

/** DELETE /gastos-operativos/asignaciones/:asignacionId */
export async function desasignar(req: Request, res: Response) {
  const id = Number(req.params.asignacionId);
  const asig = await prisma.gastoOperativoAsignacion.findUnique({ where: { id } });
  if (!asig) return res.status(404).json({ error: "Asignación no encontrada" });
  await prisma.gastoOperativoAsignacion.delete({ where: { id } });
  const gasto = await prisma.gastoOperativo.findUnique({ where: { id: asig.gastoId }, include: INCLUDE });
  res.json(gasto ? conTotales(gasto) : { ok: true });
}
