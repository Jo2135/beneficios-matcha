import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const listas = await prisma.listaPrecio.findMany({
    where: { activa: true },
    include: {
      cliente: { select: { id: true, nombre: true } },
      _count: { select: { detalle: true } },
    },
    orderBy: { nombre: "asc" },
  });
  res.json(listas);
}

export async function obtener(req: Request, res: Response) {
  const lista = await prisma.listaPrecio.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: true,
      detalle: {
        include: {
          producto: { include: { categoria: true } },
        },
        orderBy: [
          { producto: { categoria: { nombre: "asc" } } },
          { producto: { nombre: "asc" } },
        ],
      },
    },
  });
  if (!lista) return res.status(404).json({ error: "Lista no encontrada" });
  res.json(lista);
}

/**
 * Devuelve el catálogo combinado de todas las listas asignadas a un cliente.
 * Incluye de qué lista viene cada precio (para diagnóstico).
 */
export async function catalogoParaCliente(req: Request, res: Response) {
  const clienteId = Number(req.params.clienteId);

  const asignaciones = await prisma.clienteListaPrecios.findMany({
    where: { clienteId },
    include: {
      listaPrecio: {
        include: {
          detalle: {
            include: {
              producto: { include: { categoria: true } },
            },
          },
        },
      },
    },
    orderBy: { listaPrecio: { nombre: "asc" } },
  });

  // Construir detalle combinado (productoId → precio)
  // Si por error hubiera el mismo producto en dos listas, gana la primera
  const detalleMap = new Map<number, any>();
  const listas: { id: number; nombre: string }[] = [];

  for (const asig of asignaciones) {
    listas.push({ id: asig.listaPrecio.id, nombre: asig.listaPrecio.nombre });
    for (const d of asig.listaPrecio.detalle) {
      if (!detalleMap.has(d.productoId)) {
        detalleMap.set(d.productoId, { ...d, listaNombre: asig.listaPrecio.nombre });
      }
    }
  }

  res.json({
    listas,
    detalle: Array.from(detalleMap.values()),
  });
}

/**
 * Devuelve el precio de un producto para un cliente buscando en TODAS sus listas.
 */
export async function precioParaCliente(req: Request, res: Response) {
  const { clienteId, productoId } = req.params;

  // Buscar en todas las listas asignadas al cliente
  const asignacion = await prisma.clienteListaPrecios.findFirst({
    where: {
      clienteId: Number(clienteId),
      listaPrecio: {
        detalle: { some: { productoId: Number(productoId) } },
      },
    },
    include: {
      listaPrecio: {
        include: {
          detalle: {
            where: { productoId: Number(productoId) },
            include: { producto: { select: { nombre: true, medida: true } } },
          },
        },
      },
    },
  });

  if (!asignacion || asignacion.listaPrecio.detalle.length === 0) {
    return res.status(404).json({ error: "Producto no encontrado en ninguna lista del cliente" });
  }

  const detalle = asignacion.listaPrecio.detalle[0];
  res.json({
    precioUnitario: detalle.precioUnitario,
    descuentoPct: detalle.descuentoPct,
    precioFinal: Number(detalle.precioUnitario) * (1 - Number(detalle.descuentoPct) / 100),
    listaPrecioId: asignacion.listaPrecioId,
    listaNombre: asignacion.listaPrecio.nombre,
    producto: detalle.producto,
  });
}

export async function crear(req: Request, res: Response) {
  const lista = await prisma.listaPrecio.create({
    data: {
      nombre: req.body.nombre,
      clienteId: req.body.clienteId || null,
      vigenciaDesde: req.body.vigenciaDesde ? new Date(req.body.vigenciaDesde) : undefined,
      vigenciaHasta: req.body.vigenciaHasta ? new Date(req.body.vigenciaHasta) : null,
    },
  });
  res.status(201).json(lista);
}

export async function upsertDetalle(req: Request, res: Response) {
  const listaId = Number(req.params.id);
  const lineas: { productoId: number; precioUnitario: number; descuentoPct?: number }[] = req.body;

  // Validar que ningún producto exista en OTRA lista
  for (const l of lineas) {
    const enOtraLista = await prisma.listaPrecioDetalle.findFirst({
      where: { productoId: l.productoId, listaPrecioId: { not: listaId } },
      include: { listaPrecio: { select: { nombre: true } } },
    });
    if (enOtraLista) {
      return res.status(409).json({
        error: `El producto ya existe en la lista "${enOtraLista.listaPrecio.nombre}". Los productos no se pueden repetir entre listas.`,
      });
    }
  }

  const ops = lineas.map((l) =>
    prisma.listaPrecioDetalle.upsert({
      where: {
        listaPrecioId_productoId: { listaPrecioId: listaId, productoId: l.productoId },
      },
      update: { precioUnitario: l.precioUnitario, descuentoPct: l.descuentoPct ?? 0 },
      create: {
        listaPrecioId: listaId,
        productoId: l.productoId,
        precioUnitario: l.precioUnitario,
        descuentoPct: l.descuentoPct ?? 0,
      },
    })
  );

  const result = await prisma.$transaction(ops);
  res.json({ actualizados: result.length });
}

export async function importarPrecios(req: Request, res: Response) {
  const listaId = Number(req.params.id);
  const lineas: { nombre: string; medida: string; precio: number }[] = req.body;

  if (!Array.isArray(lineas) || lineas.length === 0) {
    return res.status(400).json({ error: "No hay líneas para importar" });
  }

  // Asegurar que la columna codigo exista (idempotente)
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "codigo" TEXT`);
  } catch { /* ya existe */ }

  const productos = await prisma.producto.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, medida: true },
  });

  const noEncontrados: string[] = [];
  const ops: ReturnType<typeof prisma.listaPrecioDetalle.upsert>[] = [];

  for (const linea of lineas) {
    const precio = Number(linea.precio);
    if (!precio || precio <= 0) continue;

    const nombreKey = String(linea.nombre || "").toLowerCase().trim();
    const medidaKey = String(linea.medida || "").toLowerCase().trim();

    // Primero: buscar por nombre + medida exacto
    let match = productos.find(
      (p) =>
        p.nombre.toLowerCase().trim() === nombreKey &&
        p.medida.toLowerCase().trim() === medidaKey
    );

    // Fallback: buscar por código vía SQL (col A del Excel puede ser el código)
    if (!match && nombreKey) {
      try {
        const rows = await prisma.$queryRawUnsafe<{ id: bigint | number }[]>(
          `SELECT id FROM "Producto" WHERE lower("codigo") = $1`, nombreKey
        );
        if (rows[0]?.id) {
          match = { id: Number(rows[0].id), nombre: nombreKey, medida: "" };
        }
      } catch {
        // columna codigo aún no existe en la BD — ignorar y seguir
      }
    }

    if (!match) {
      noEncontrados.push(`${linea.nombre} / ${linea.medida}`);
      continue;
    }

    ops.push(
      prisma.listaPrecioDetalle.upsert({
        where: { listaPrecioId_productoId: { listaPrecioId: listaId, productoId: match.id } },
        update: { precioUnitario: precio },
        create: { listaPrecioId: listaId, productoId: match.id, precioUnitario: precio, descuentoPct: 0 },
      })
    );
  }

  if (ops.length > 0) await prisma.$transaction(ops);

  res.json({ importados: ops.length, noEncontrados, total: lineas.length });
}

export async function eliminar(req: Request, res: Response) {
  await prisma.listaPrecio.update({
    where: { id: Number(req.params.id) },
    data: { activa: false },
  });
  res.status(204).send();
}
