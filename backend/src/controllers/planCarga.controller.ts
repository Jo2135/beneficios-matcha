import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { siguienteNumero } from "../utils/secuencia";

// Devuelve el plan con sus campos JSON ya parseados a objetos
function parsePlan(p: any) {
  const safe = (s: string, fb: any) => { try { return JSON.parse(s); } catch { return fb; } };
  return {
    id: p.id, nombre: p.nombre, fecha: p.fecha, notas: p.notas, estado: p.estado,
    despachoId: p.despachoId, creadoEn: p.creadoEn, actualizadoEn: p.actualizadoEn,
    clientes: safe(p.clientesJson, []),     // [clienteId, ...]
    productos: safe(p.productosJson, []),    // [{ id, costo }, ...]
    cantidades: safe(p.cantidadesJson, {}),  // { "clienteId_productoId": cantidad }
    precios: safe(p.preciosJson, {}),        // { "clienteId_productoId": precio } (traido de la cotizacion)
    cotizacionesIds: safe(p.cotizacionesIds, []), // [cotizacionId, ...]
  };
}

// Precios de las listas asignadas al cliente (igual que en cotizaciones.controller)
async function getPrecioMap(clienteId: number) {
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

export async function listar(_req: Request, res: Response) {
  const planes = await prisma.planCarga.findMany({ orderBy: { actualizadoEn: "desc" } });
  res.json(planes.map(parsePlan));
}

export async function obtener(req: Request, res: Response) {
  const p = await prisma.planCarga.findUnique({ where: { id: Number(req.params.id) } });
  if (!p) return res.status(404).json({ error: "Plan no encontrado" });
  res.json(parsePlan(p));
}

export async function crear(req: Request, res: Response) {
  const { nombre, fecha, notas, clientes, productos, cantidades, precios } = req.body;
  const p = await prisma.planCarga.create({
    data: {
      nombre: nombre?.trim() || "Plan sin nombre",
      fecha: fecha ? new Date(fecha) : null,
      notas: notas?.trim() || null,
      clientesJson: JSON.stringify(clientes ?? []),
      productosJson: JSON.stringify(productos ?? []),
      cantidadesJson: JSON.stringify(cantidades ?? {}),
      preciosJson: JSON.stringify(precios ?? {}),
    },
  });
  res.status(201).json(parsePlan(p));
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { nombre, fecha, notas, clientes, productos, cantidades, precios } = req.body;
  const data: any = {};
  if (nombre !== undefined) data.nombre = String(nombre).trim() || "Plan sin nombre";
  if (fecha !== undefined) data.fecha = fecha ? new Date(fecha) : null;
  if (notas !== undefined) data.notas = notas?.trim() || null;
  if (clientes !== undefined) data.clientesJson = JSON.stringify(clientes);
  if (productos !== undefined) data.productosJson = JSON.stringify(productos);
  if (cantidades !== undefined) data.cantidadesJson = JSON.stringify(cantidades);
  if (precios !== undefined) data.preciosJson = JSON.stringify(precios);
  const p = await prisma.planCarga.update({ where: { id }, data });
  res.json(parsePlan(p));
}

export async function eliminar(req: Request, res: Response) {
  await prisma.planCarga.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}

// POST /planes-carga/:id/generar — crea una cotización (BORRADOR) por cada cliente
export async function generar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const raw = await prisma.planCarga.findUnique({ where: { id } });
  if (!raw) return res.status(404).json({ error: "Plan no encontrado" });
  const plan = parsePlan(raw);
  if (plan.estado !== "BORRADOR") {
    return res.status(400).json({ error: "Este plan ya generó cotizaciones. Para rehacerlo, elimina las cotizaciones generadas o crea un plan nuevo." });
  }

  const creadas: any[] = [];
  const omitidos: { cliente: string; producto: string }[] = [];
  const clientesSinLineas: string[] = [];

  for (const clienteId of plan.clientes as number[]) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) continue;
    const precioMap = await getPrecioMap(clienteId);

    // Líneas de este cliente desde la matriz
    const lineasCrudas: { productoId: number; cantidad: number }[] = [];
    for (const f of plan.productos as { id: number; costo: number }[]) {
      const cant = Number((plan.cantidades as any)[`${clienteId}_${f.id}`] ?? 0);
      if (cant > 0) lineasCrudas.push({ productoId: f.id, cantidad: cant });
    }
    if (lineasCrudas.length === 0) continue;

    // Precios desde la lista del cliente; los que no tengan precio se omiten y reportan
    const lineas: any[] = [];
    for (let idx = 0; idx < lineasCrudas.length; idx++) {
      const l = lineasCrudas[idx];
      const dp = precioMap.get(l.productoId);
      if (!dp) {
        const prod = await prisma.producto.findUnique({ where: { id: l.productoId }, select: { nombre: true, medida: true } });
        omitidos.push({ cliente: cliente.nombre, producto: `${prod?.nombre ?? l.productoId} ${prod?.medida ?? ""}`.trim() });
        continue;
      }
      const precioFinal = dp.precioUnitario * (1 - dp.descuentoPct / 100);
      const producto = await prisma.producto.findUnique({ where: { id: l.productoId } });
      const pesoTotalKg = producto?.pesoUnitarioKg ? Number(producto.pesoUnitarioKg) * l.cantidad : null;
      lineas.push({
        productoId: l.productoId, cantidad: l.cantidad,
        precioUnitarioAplicado: dp.precioUnitario, descuentoPct: dp.descuentoPct,
        precioFinal, totalLinea: precioFinal * l.cantidad,
        listaPrecioOrigenId: dp.listaPrecioId, pesoTotalKg, orden: idx,
      });
    }
    if (lineas.length === 0) { clientesSinLineas.push(cliente.nombre); continue; }

    const totalBruto = lineas.reduce((s, l) => s + l.precioUnitarioAplicado * l.cantidad, 0);
    const totalNeto = lineas.reduce((s, l) => s + l.totalLinea, 0);
    const numero = await siguienteNumero("COT");
    const cot = await prisma.cotizacion.create({
      data: {
        numero, clienteId, vendedorId: cliente.vendedorId ?? null,
        validezDias: 30, fechaVencimiento: new Date(Date.now() + 30 * 86400000),
        totalBruto, descuentoTotal: totalBruto - totalNeto, totalNeto,
        notas: `Generada del plan de carga "${plan.nombre}"`,
        lineas: { create: lineas },
      },
    });
    creadas.push({ id: cot.id, numero: cot.numero, cliente: cliente.nombre, lineas: lineas.length, totalNeto });
  }

  await prisma.planCarga.update({
    where: { id },
    data: { estado: creadas.length ? "GENERADO" : "BORRADOR", cotizacionesIds: JSON.stringify(creadas.map((c) => c.id)) },
  });

  res.json({ creadas, omitidos, clientesSinLineas });
}

// POST /planes-carga/:id/importar — trae cotizaciones existentes (sueltas o de
// despachos) a la matriz del plan, para calcular el flete combinado y consolidar.
export async function importar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { cotizacionIds = [], despachoIds = [] } = req.body as { cotizacionIds?: number[]; despachoIds?: number[] };
  const raw = await prisma.planCarga.findUnique({ where: { id } });
  if (!raw) return res.status(404).json({ error: "Plan no encontrado" });
  const plan = parsePlan(raw);

  // Resolver: los ids de cotización + las cotizaciones de los despachos elegidos
  let allCotIds: number[] = [...cotizacionIds.map(Number)];
  if (despachoIds.length) {
    const lineas = await prisma.despachoLinea.findMany({
      where: { ordenDespachoId: { in: despachoIds.map(Number) }, cotizacionId: { not: null } },
      select: { cotizacionId: true },
    });
    allCotIds.push(...lineas.map((l) => l.cotizacionId as number));
  }
  allCotIds = [...new Set(allCotIds.filter(Boolean))];
  // Las que ya estan en el plan se omiten: reimportarlas sumaria otra vez sus
  // cantidades y duplicaria la carga.
  const yaEnPlan = new Set((plan.cotizacionesIds as number[]) ?? []);
  const repetidas = allCotIds.filter((x) => yaEnPlan.has(x));
  allCotIds = allCotIds.filter((x) => !yaEnPlan.has(x));
  if (allCotIds.length === 0)
    return res.status(400).json({
      error: repetidas.length
        ? "Esas cotizaciones ya estan en el plan."
        : "No hay cotizaciones para importar",
    });

  const cots = await prisma.cotizacion.findMany({
    where: { id: { in: allCotIds } },
    // precioFinal viene tambien: si el producto no esta en la lista del cliente
    // (precio pactado a mano), es el unico lugar donde existe ese precio.
    include: { lineas: { select: { productoId: true, cantidad: true, precioFinal: true, precioUnitarioAplicado: true } } },
  });

  // Fusionar en la matriz (clientes = columnas, productos = filas, cantidades = celdas)
  const clientes: number[] = [...(plan.clientes as number[])];
  const productos: { id: number; costo: number }[] = [...(plan.productos as any[])];
  const cantidades: Record<string, number> = { ...(plan.cantidades as any) };
  const precios: Record<string, number> = { ...(plan.precios as any) };
  for (const c of cots) {
    if (!clientes.includes(c.clienteId)) clientes.push(c.clienteId);
    for (const l of c.lineas) {
      if (!productos.some((p) => p.id === l.productoId)) productos.push({ id: l.productoId, costo: 0 });
      const k = `${c.clienteId}_${l.productoId}`;
      cantidades[k] = (Number(cantidades[k]) || 0) + Number(l.cantidad);
      const precio = Number(l.precioFinal ?? l.precioUnitarioAplicado ?? 0);
      if (precio > 0) precios[k] = precio;   // respaldo si no esta en su lista
    }
  }
  const nuevosIds = [...new Set([...(plan.cotizacionesIds as number[]), ...cots.map((c) => c.id)])];

  const upd = await prisma.planCarga.update({
    where: { id },
    data: {
      clientesJson: JSON.stringify(clientes),
      productosJson: JSON.stringify(productos),
      cantidadesJson: JSON.stringify(cantidades),
      preciosJson: JSON.stringify(precios),
      cotizacionesIds: JSON.stringify(nuevosIds),
      estado: "GENERADO", // ya hay cotizaciones reales; el paso es aprobar/consolidar
    },
  });
  res.json({ ...parsePlan(upd), importadas: cots.length, repetidas: repetidas.length });
}

// POST /planes-carga/:id/aprobar — aprueba de golpe todas las cotizaciones del plan
export async function aprobar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const raw = await prisma.planCarga.findUnique({ where: { id } });
  if (!raw) return res.status(404).json({ error: "Plan no encontrado" });
  const plan = parsePlan(raw);
  const ids = (plan.cotizacionesIds as number[]) ?? [];
  if (ids.length === 0) return res.status(400).json({ error: "Primero genera las cotizaciones." });
  const r = await prisma.cotizacion.updateMany({
    where: { id: { in: ids }, estado: { in: ["BORRADOR", "ENVIADA", "APROBADA"] } },
    data: { estado: "APROBADA" },
  });
  res.json({ aprobadas: r.count });
}

// POST /planes-carga/:id/consolidar — arma UN despacho con las cotizaciones aprobadas del plan
export async function consolidar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const raw = await prisma.planCarga.findUnique({ where: { id } });
  if (!raw) return res.status(404).json({ error: "Plan no encontrado" });
  const plan = parsePlan(raw);
  if (plan.despachoId) return res.status(400).json({ error: "Este plan ya tiene un despacho consolidado." });

  const ids = (plan.cotizacionesIds as number[]) ?? [];
  if (ids.length === 0) return res.status(400).json({ error: "Primero genera las cotizaciones." });

  const cots = await prisma.cotizacion.findMany({
    where: { id: { in: ids } },
    include: { cliente: { select: { nombre: true } }, lineas: { orderBy: { orden: "asc" } } },
  });
  if (cots.length === 0) return res.status(400).json({ error: "Las cotizaciones generadas ya no existen." });

  const noAprobadas = cots.filter((c) => c.estado !== "APROBADA");
  if (noAprobadas.length > 0) {
    return res.status(400).json({
      error: "Estas cotizaciones aún no están APROBADAS: " +
        noAprobadas.map((c) => `${c.numero} (${c.cliente?.nombre}, ${c.estado})`).join(", ") +
        ". Apruébalas primero y vuelve a consolidar.",
    });
  }

  const numero = await siguienteNumero("DES");
  const despacho = await prisma.ordenDespacho.create({
    data: {
      numero, estado: "PENDIENTE",
      notas: `Consolidado del plan de carga "${plan.nombre}"`,
      lineas: {
        create: cots.flatMap((c) => c.lineas.map((l) => ({
          cotizacionId: c.id, productoId: l.productoId,
          cantidadPedida: l.cantidad, cantidadDespachada: 0, cantidadFaltante: 0, estado: "PENDIENTE" as const,
        }))),
      },
    },
  });

  await prisma.cotizacion.updateMany({ where: { id: { in: cots.map((c) => c.id) } }, data: { estado: "EN_DESPACHO" } });
  await prisma.planCarga.update({ where: { id }, data: { estado: "DESPACHADO", despachoId: despacho.id } });

  res.status(201).json({ despachoId: despacho.id, numero: despacho.numero, cotizaciones: cots.length });
}
