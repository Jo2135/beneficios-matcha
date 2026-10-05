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

    // Total de comisiones (se sigue guardando para la caja-resumen y el PDF).
    // OJO: desde ahora TAMBIÉN entra al balance como filas por vendedor (ver abajo),
    // para poder llevarle control y registrar sus pagos como a cualquier concepto.
    const gananciaVendedor = r2(g.comisionesVendedores?.total ?? 0);

    // Ayudante: ahora es un concepto adicional guardado (ver más abajo). Si aún
    // llega por el cuerpo (balances viejos), se respeta para no perderlo.
    const ayudante = Number(req.body?.ayudante ?? 0) || 0;

    // ── Filas del balance (orden según la referencia del usuario) ───────────────
    // El "Material" del balance = Materia Prima − Gastos Generales (los gastos se
    // listan aparte; así no se cuentan dos veces).
    const gastosTotal = g.gastos.obreros + g.gastos.pigmento + g.gastos.electricidad;
    add("Material",              g.costoMateria.total - gastosTotal);
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

    // Flete + Ayudante (Ayudante se pregunta al generar)
    add("Flete",    g.fletesCliente?.total ?? 0);
    // Solo si llega por el cuerpo (compatibilidad): hoy el Ayudante es un
    // concepto adicional guardado y se agrega con los demás, más abajo.
    if (ayudante > 0.005) add("Ayudante", ayudante);

    // Ganancia Muchachos (equipo de flete)
    if ((g.gananciaMuchachos?.total ?? 0) > 0) {
      add("Ganancia Muchachos", g.gananciaMuchachos.total);
    }

    // Costo Manguera Verde / Amarilla (producto externo con lógica de tubería)
    if ((g.mangueraVerde?.costo ?? 0) > 0.005) {
      add("Costo Manguera Verde", g.mangueraVerde.costo);
    }

    // Tubo Gris PVC (comprado a proveedor)
    if (g.grisPVC) {
      if (g.grisPVC.costoTubo       > 0.005) add("Costo Tubo Gris",           g.grisPVC.costoTubo);
      if (g.grisPVC.gananciaFabrica > 0.005) add("Ganancia Fabrica Tubo Gris", g.grisPVC.gananciaFabrica);
      if (g.grisPVC.ganancia        > 0.005) add("Ganancia Tubo Gris",         g.grisPVC.ganancia);
    }

    // Tubo Amarillo PVC (comprado a proveedor: Casa del Tubo / Alirio / OCC)
    if (g.amarilloPVC) {
      if (g.amarilloPVC.costoTubo       > 0.005) add("Costo Tubo Amarillo",           g.amarilloPVC.costoTubo);
      if (g.amarilloPVC.gananciaFabrica > 0.005) add("Ganancia Fabrica Tubo Amarillo", g.amarilloPVC.gananciaFabrica);
      if (g.amarilloPVC.ganancia        > 0.005) add("Ganancia Tubo Amarillo",         g.amarilloPVC.ganancia);
    }

    // Niples (sub-empresa: materiales que paga a la empresa + su ganancia)
    if (g.niples) {
      if (g.niples.materiales > 0.005) add("Materiales de Niples", g.niples.materiales);
      if (g.niples.ganancia   > 0.005) add("Ganancia Niples",      g.niples.ganancia);
    }

    // ── Conceptos adicionales del despacho (Comisión 2, Viáticos, Carga
    //    Externa, Ayudante...). Cada uno su fila, con su saldo y sus pagos.
    for (const c of (g.conceptosExtra?.detalle ?? []) as any[]) {
      if (Number(c.monto) > 0.005) add(c.nombre, Number(c.monto));
    }

    // ── Ganancia de los vendedores: una fila por vendedor (varios clientes del
    //    mismo vendedor se suman). Antes iba solo arriba y fuera del total.
    const porVendedor = new Map<string, number>();
    for (const c of (g.comisionesVendedores?.detalle ?? []) as any[]) {
      const nombre = String(c.vendedorNombre ?? "").trim() || "Vendedor";
      porVendedor.set(nombre, (porVendedor.get(nombre) ?? 0) + Number(c.monto ?? 0));
    }
    for (const [nombre, monto] of porVendedor) {
      if (monto > 0.005) add(`Ganancia Vendedor — ${nombre}`, monto);
    }

    // ── Extra Material = venta total − suma de las filas ───────────────────────
    // (la comisión ya está entre las filas, por eso no se resta aparte: el Extra
    //  da exactamente el mismo número que antes.)
    const sumaFilas = items.reduce((s, i) => s + i.montoTotal, 0);
    const extraMaterial = r2(g.facturaTotal - sumaFilas);
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

    // ── Rescatar lo que el usuario escribió a mano ────────────────────────────
    // Regenerar borra los renglones, y la base de datos se lleva por delante sus
    // abonos: BalancePagoCuota cuelga de BalancePagoItem con borrado en cascada.
    // Asi se perdian pagos ya registrados (lo detecto una auditoria externa en
    // oct-2026: habia $24.184 en abonos en riesgo). Ahora los abonos y las notas
    // se rescatan por NOMBRE de renglon y se vuelven a colgar del renglon nuevo,
    // el mismo criterio que usan los gastos operativos.
    // Los montos editados a mano SI vuelven al valor calculado: eso es el
    // proposito de regenerar.
    const anteriores = await prisma.balancePagoItem.findMany({
      where: { balancePagoId: balance.id },
      include: { cuotas: { orderBy: { fecha: "asc" } } },
    });
    const cuotasPrevias = new Map<string, { fecha: Date; monto: any; notas: string | null }[]>();
    const notasPrevias = new Map<string, string>();
    for (const it of anteriores) {
      if (it.cuotas.length > 0) {
        cuotasPrevias.set(it.nombre, it.cuotas.map((c) => ({ fecha: c.fecha, monto: c.monto, notas: c.notas })));
      }
      if (it.notas) notasPrevias.set(it.nombre, it.notas);
    }

    // Un renglon que desaparece del calculo pero tiene abonos NO se borra: se
    // conserva con su monto anterior. Nunca se hace desaparecer plata registrada.
    const nombresNuevos = new Set(items.map((i) => i.nombre));
    const rescatados: string[] = [];
    for (const it of anteriores) {
      if (it.cuotas.length > 0 && !nombresNuevos.has(it.nombre)) {
        items.push({ nombre: it.nombre, montoTotal: Number(it.montoTotal), esEditable: true, orden: ord++ });
        rescatados.push(it.nombre);
      }
    }

    let abonosConservados = 0;
    let montoConservado = 0;
    await prisma.$transaction(async (tx) => {
      await tx.balancePagoItem.deleteMany({ where: { balancePagoId: balance.id } });
      for (const i of items) {
        const creado = await tx.balancePagoItem.create({
          data: { ...i, balancePagoId: balance.id, notas: notasPrevias.get(i.nombre) ?? null },
        });
        const cuotas = cuotasPrevias.get(i.nombre);
        if (cuotas && cuotas.length > 0) {
          await tx.balancePagoCuota.createMany({
            data: cuotas.map((c) => ({ balancePagoItemId: creado.id, fecha: c.fecha, monto: c.monto, notas: c.notas })),
          });
          abonosConservados += cuotas.length;
          montoConservado += cuotas.reduce((s, c) => s + Number(c.monto), 0);
        }
      }
    }, { timeout: 30000 });

    return res.json({
      ok: true, balanceId: balance.id, items: items.length, gananciaVendedor, calculadoEn: ahora,
      abonosConservados, montoConservado: r2(montoConservado), renglonesRescatados: rescatados,
    });
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

  // Gastos operativos repartidos a este despacho: se muestran dentro de su
  // renglón como un abono más. Se buscan por NOMBRE del renglón, así siguen
  // apareciendo aunque el balance se haya regenerado (regenerar borra y vuelve
  // a crear los renglones con otros ids).
  const asignados = await prisma.gastoOperativoAsignacion.findMany({
    where: { ordenDespachoId: id },
    include: { gasto: { select: { fecha: true, descripcion: true, medioPago: true } } },
    orderBy: { id: "asc" },
  });
  const porRenglon = new Map<string, any[]>();
  for (const a of asignados) {
    const lista = porRenglon.get(a.renglon) ?? [];
    lista.push({
      id: a.id, monto: Number(a.monto), fecha: a.gasto.fecha,
      descripcion: a.gasto.descripcion, medioPago: a.gasto.medioPago,
    });
    porRenglon.set(a.renglon, lista);
  }

  const { calculosJson, tasasJson, ...rest } = balance as any;
  return res.json({
    ...rest,
    items: (rest.items ?? []).map((i: any) => ({ ...i, gastos: porRenglon.get(i.nombre) ?? [] })),
  });
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
