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

export async function crearManual(req: Request, res: Response) {
  const { clienteId, numero, fechaEmision, totalNeto, notas, empresaId, pagosIniciales = [] } = req.body;

  if (!clienteId || !numero || totalNeto === undefined) {
    return res.status(400).json({ error: "clienteId, numero y totalNeto son requeridos" });
  }

  const sumaPagos = (pagosIniciales as any[]).reduce((s: number, p: any) => s + Number(p.monto), 0);
  const saldoPendiente = Math.max(0, Number(totalNeto) - sumaPagos);
  const estado =
    saldoPendiente <= 0 ? "COBRADA" : sumaPagos > 0 ? "COBRADA_PARCIAL" : "EMITIDA";
  const fechaBase = fechaEmision ? new Date(fechaEmision) : new Date();

  const factura = await prisma.$transaction(async (tx) => {
    const f = await tx.factura.create({
      data: {
        numero,
        clienteId: Number(clienteId),
        empresaId: empresaId ? Number(empresaId) : undefined,
        fechaEmision: fechaBase,
        totalNeto: Number(totalNeto),
        totalBruto: Number(totalNeto),
        totalPagado: sumaPagos,
        saldoPendiente,
        estado: estado as any,
        notas: notas ?? null,
      },
    });

    for (const p of pagosIniciales as any[]) {
      const fechaPago = p.fecha ? new Date(p.fecha) : fechaBase;
      const pago = await tx.pago.create({
        data: {
          clienteId: Number(clienteId),
          cuentaId: p.cuentaId ? Number(p.cuentaId) : undefined,
          monto: Number(p.monto),
          moneda: p.moneda ?? "USD",
          fecha: fechaPago,
          estado: "ASIGNADO" as any,
          origenFondos: p.origenFondos ?? null,
          observaciones: "Importación histórica",
        },
      });
      await tx.pagoAsignacion.create({
        data: {
          pagoId: pago.id,
          facturaId: f.id,
          montoAsignado: Number(p.monto),
          fechaAsignacion: fechaPago,
          notas: "Importación histórica",
        },
      });
    }

    return f;
  });

  res.status(201).json(factura);
}

/** Importación masiva de facturas históricas (formato PLANTILLA GENERAL).
 *  El frontend ya parseó cada archivo. Empata cliente y producto por nombre;
 *  crea los productos que no existan. Entran como COBRADAS (histórico). */
export async function importarHistorico(req: Request, res: Response) {
  const { anio, facturas } = req.body as {
    anio: number;
    facturas: { archivo: string; cliente: string; fecha: string;
      lineas: { producto: string; medida: string; cantidad: number; monto: number }[] }[];
  };
  if (!Array.isArray(facturas) || facturas.length === 0) {
    return res.status(400).json({ error: "No hay facturas para importar" });
  }
  const year = Number(anio) || new Date().getFullYear();

  // Empate de clientes por nombre
  const clientes = await prisma.cliente.findMany({ select: { id: true, nombre: true } });
  const findCliente = (nombre: string): number | null => {
    const key = String(nombre).toLowerCase().trim();
    if (!key) return null;
    const exact = clientes.find((c) => c.nombre.toLowerCase().trim() === key);
    if (exact) return exact.id;
    const part = clientes.find((c) => {
      const cn = c.nombre.toLowerCase();
      return cn.includes(key) || key.includes(cn);
    });
    return part?.id ?? null;
  };

  // Categoría por defecto para productos nuevos
  const catExterno = await prisma.categoriaCosto.findFirst({ where: { nombre: "Externo" } });
  const catDefaultId = catExterno?.id ?? (await prisma.categoriaCosto.findFirst())!.id;

  // Productos existentes por nombre+medida
  const productos = await prisma.producto.findMany({ select: { id: true, nombre: true, medida: true } });
  const pkey = (n: string, m: string) => `${n.toLowerCase().trim()}|${m.toLowerCase().trim()}`;
  const prodByKey = new Map(productos.map((p) => [pkey(p.nombre, p.medida), p.id]));

  const parseFecha = (f: string): Date => {
    const m = String(f).match(/(\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(year, Number(m[2]) - 1, Number(m[1]), 12);
    return new Date(year, 0, 1, 12);
  };
  const sanit = (s: string) => String(s).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

  let creadas = 0, omitidas = 0;
  const productosCreados: string[] = [];
  const clientesNoEncontrados: string[] = [];
  const errores: { archivo: string; mensaje: string }[] = [];

  for (const fac of facturas) {
    try {
      const clienteId = findCliente(fac.cliente);
      if (!clienteId) {
        if (!clientesNoEncontrados.includes(fac.cliente)) clientesNoEncontrados.push(fac.cliente);
        errores.push({ archivo: fac.archivo, mensaje: `Cliente no encontrado: "${fac.cliente}"` });
        continue;
      }
      const numero = `HIST-${year}-${sanit(fac.archivo)}`;
      const ya = await prisma.factura.findUnique({ where: { numero } });
      if (ya) { omitidas++; continue; }

      const lineasData: any[] = [];
      for (const l of fac.lineas) {
        const nombre = String(l.producto ?? "").trim();
        const medida = String(l.medida ?? "").trim();
        const cantidad = Number(l.cantidad) || 0;
        const monto = Number(l.monto) || 0;
        if (!nombre || cantidad <= 0 || monto <= 0) continue;
        let pid = prodByKey.get(pkey(nombre, medida));
        if (!pid) {
          const nuevo = await prisma.producto.create({
            data: { nombre, medida, categoriaId: catDefaultId, origen: "EXTERNO" },
          });
          pid = nuevo.id;
          prodByKey.set(pkey(nombre, medida), pid);
          productosCreados.push(`${nombre} ${medida}`);
        }
        lineasData.push({
          productoId: pid, cantidad,
          precioUnitario: cantidad > 0 ? monto / cantidad : monto,
          totalLinea: monto, origen: "EXTERNO", orden: lineasData.length,
        });
      }
      if (lineasData.length === 0) { errores.push({ archivo: fac.archivo, mensaje: "Sin productos con cantidad/monto" }); continue; }

      const totalNeto = lineasData.reduce((s, l) => s + l.totalLinea, 0);
      await prisma.factura.create({
        data: {
          numero, clienteId, fechaEmision: parseFecha(fac.fecha),
          totalBruto: totalNeto, totalNeto, totalPagado: totalNeto, saldoPendiente: 0,
          estado: "COBRADA", notas: `Histórico: ${fac.archivo}`,
          lineas: { create: lineasData },
        },
      });
      creadas++;
    } catch (e: any) {
      errores.push({ archivo: fac.archivo, mensaje: e.message });
    }
  }

  res.json({ creadas, omitidas, productosCreados, clientesNoEncontrados, errores, total: facturas.length });
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

export async function listarClienteConPagos(req: Request, res: Response) {
  const facturas = await prisma.factura.findMany({
    where: { clienteId: Number(req.params.clienteId), estado: { not: "ANULADA" } },
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
            include: { cuenta: { select: { nombre: true, moneda: true } } },
          },
        },
        orderBy: { fechaAsignacion: "asc" },
      },
    },
    orderBy: { creadoEn: "asc" },
  });
  res.json(facturas);
}

export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const factura = await prisma.factura.findUnique({ where: { id }, select: { numero: true, totalPagado: true } });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  if (Number(factura.totalPagado) > 0) {
    return res.status(400).json({ error: "No se puede eliminar una factura con pagos registrados" });
  }
  await prisma.facturaLinea.deleteMany({ where: { facturaId: id } });
  await prisma.factura.delete({ where: { id } });
  res.json({ ok: true });
}
