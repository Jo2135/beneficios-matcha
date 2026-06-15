import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calcularGananciasDespacho } from "./ganancias.controller";

// ─── ENDPOINTS ───────────────────────────────────────────────────────────────

/** Genera o regenera el balance de un despacho.
 *  Usa el MISMO motor de cálculo que la página de Ganancias (fuente única). */
export async function generarBalance(req: Request, res: Response) {
  const id = Number(req.params.id);
  try {
    const g: any = await calcularGananciasDespacho(id);
    if (!g) return res.status(404).json({ error: "Despacho no encontrado" });

    const items: { nombre: string; montoTotal: number; esEditable: boolean; orden: number }[] = [];
    let ord = 0;
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const add = (nombre: string, monto: number, editable = true) =>
      items.push({ nombre, montoTotal: r2(monto), esEditable: editable, orden: ord++ });

    // ── Comisión del vendedor → sección SUPERIOR (no entra en la suma del balance)
    const gananciaVendedor = r2(g.comisionesVendedores?.total ?? 0);

    // ── Filas del balance (orden según la referencia del usuario) ───────────────
    add("Material",              g.costoMateria.total);
    add("Obreros",               g.gastos.obreros);
    add("Pigmento",              g.gastos.pigmento);
    add("Electricidad y Gasoil", g.gastos.electricidad);
    add("60% Sr Alberto",        g.gananciaGeneral.srAlbertoGral);
    add("40% Capital",           g.gananciaGeneral.capital);

    // Servicio externo (Carlos)
    const servExt = (g.servicioExterno ?? []).reduce((s: number, x: any) => s + Number(x.costo ?? 0), 0);
    if (servExt > 0) add("Servicio Carlos", servExt);

    // Conexiones
    const con = g.gananciaConexiones;
    if (con && con.facturado > 0) {
      add("Conexiones (Costo Alirio)", con.costoAlirio);
      if (con.codosInternos > 0) add('Codos 2" y 4"', con.codosInternos);
      add("Ganancia Conexiones", con.ganancia);
    }

    // Ganancias_2 (Comisiones incluye el 5% de conexiones)
    add("SBUG y Yo",  g.ganancias2.sbug);
    add("Sandra",     g.ganancias2.sandra);
    add("Yola",       g.ganancias2.yolanda);
    add("Comisiones", g.ganancias2.comisionesConCinco);

    // Tubería PEAD (Aguas Negras)
    if (g.gananciaAguasNegras.total > 0) {
      add("Darwin Amarillo",     g.gananciaAguasNegras.darwinAmarillo);
      add("Danny Amarillo",      g.gananciaAguasNegras.dannyAmarillo);
      add("Sr Alberto Amarillo", g.gananciaAguasNegras.srAlbertoAmarillo);
    }

    // Curvas (Venta = Muchachas + Sr Alberto + Material)
    if (g.curvas.totalVenta > 0) {
      add("Ganancia Muchachas", g.curvas.pagoMuchachas);
      add("Sr A Curvas",        g.curvas.gananciaAlberto);
      add("Material Curvas",    g.curvas.costoMaterial);
    }

    // Flete + Ayudante (Ayudante es manual)
    add("Flete",    g.fletesCliente?.total ?? 0);
    add("Ayudante", 0);

    // Ganancia Muchachos (equipo de flete)
    if ((g.gananciaMuchachos?.total ?? 0) > 0) {
      add("Ganancia Muchachos", g.gananciaMuchachos.total);
    }

    // ── Extra Material = (venta total − comisión vendedor) − suma de las filas ──
    const sumaFilas = items.reduce((s, i) => s + i.montoTotal, 0);
    const extraMaterial = r2(g.facturaTotal - gananciaVendedor - sumaFilas);
    add("Extra Material", extraMaterial);

    // ── Snapshot para auditoría ───────────────────────────────────────────────
    const ahora = new Date();
    const tasasUsadas = { version: "2.0-unificado", generadoEn: ahora.toISOString() };

    const balance = await prisma.balancePago.upsert({
      where: { ordenDespachoId: id },
      update: {
        actualizadoEn: ahora, calculadoEn: ahora,
        gananciaVendedor,
        calculosJson: JSON.stringify(g), tasasJson: JSON.stringify(tasasUsadas),
      },
      create: {
        ordenDespachoId: id, calculadoEn: ahora,
        gananciaVendedor,
        calculosJson: JSON.stringify(g), tasasJson: JSON.stringify(tasasUsadas),
      },
    });

    await prisma.balancePagoItem.deleteMany({ where: { balancePagoId: balance.id } });
    await prisma.balancePagoItem.createMany({
      data: items.map((i) => ({ ...i, balancePagoId: balance.id })),
    });

    return res.json({ ok: true, balanceId: balance.id, items: items.length, gananciaVendedor, calculadoEn: ahora });
  } catch (e: any) {
    console.error("[generarBalance]", e);
    return res.status(500).json({ error: e.message });
  }
}

/** Obtiene el balance completo con cuotas */
export async function getBalance(req: Request, res: Response) {
  const id = Number(req.params.id);
  const balance = await prisma.balancePago.findUnique({
    where: { ordenDespachoId: id },
    include: {
      items: {
        include: { cuotas: { orderBy: { fecha: "asc" } } },
        orderBy: { orden: "asc" },
      },
    },
  });
  if (!balance) return res.status(404).json({ error: "Balance no generado aún" });
  const { calculosJson, tasasJson, ...rest } = balance as any;
  return res.json(rest);
}

/** Obtiene el snapshot completo de cálculos (para auditoría) */
export async function getSnapshot(req: Request, res: Response) {
  const id = Number(req.params.id);
  const balance = await prisma.balancePago.findUnique({
    where: { ordenDespachoId: id },
    select: { calculadoEn: true, calculosJson: true, tasasJson: true },
  });
  if (!balance) return res.status(404).json({ error: "Balance no encontrado" });
  return res.json({
    calculadoEn: balance.calculadoEn,
    calculos: balance.calculosJson ? JSON.parse(balance.calculosJson) : null,
    tasas: balance.tasasJson ? JSON.parse(balance.tasasJson) : null,
  });
}

/** Actualiza monto o notas de un item (MASTER) */
export async function actualizarItem(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);
  const { montoTotal, notas } = req.body;
  const data: any = {};
  if (montoTotal !== undefined) data.montoTotal = Number(montoTotal);
  if (notas !== undefined) data.notas = notas;
  await prisma.balancePagoItem.update({ where: { id: itemId }, data });
  return res.json({ ok: true });
}

/** Agrega un pago a un item */
export async function agregarCuota(req: Request, res: Response) {
  const itemId = Number(req.params.itemId);
  const { fecha, monto, notas } = req.body;
  if (!fecha || !monto) return res.status(400).json({ error: "fecha y monto requeridos" });
  const cuota = await prisma.balancePagoCuota.create({
    data: { balancePagoItemId: itemId, fecha: new Date(fecha), monto: Number(monto), notas },
  });
  return res.json(cuota);
}

/** Elimina un pago */
export async function eliminarCuota(req: Request, res: Response) {
  const cuotaId = Number(req.params.cuotaId);
  await prisma.balancePagoCuota.delete({ where: { id: cuotaId } });
  return res.json({ ok: true });
}

/** Actualiza notas de una cuota */
export async function actualizarCuota(req: Request, res: Response) {
  const cuotaId = Number(req.params.cuotaId);
  const { notas, monto } = req.body;
  const data: any = {};
  if (notas !== undefined) data.notas = notas;
  if (monto !== undefined) data.monto = Number(monto);
  await prisma.balancePagoCuota.update({ where: { id: cuotaId }, data });
  return res.json({ ok: true });
}
