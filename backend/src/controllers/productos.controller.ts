import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const { categoria, origen } = req.query;
  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(categoria ? { categoriaId: Number(categoria) } : {}),
      ...(origen ? { origen: origen as any } : {}),
    },
    include: { categoria: true },
    orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
  });
  res.json(productos);
}

export async function buscar(req: Request, res: Response) {
  const { q } = req.query;
  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      OR: [
        { codigo: { contains: String(q || ""), mode: "insensitive" } },
        { nombre: { contains: String(q || ""), mode: "insensitive" } },
        { medida: { contains: String(q || ""), mode: "insensitive" } },
      ],
    },
    include: { categoria: true },
    take: 20,
    orderBy: { nombre: "asc" },
  });
  res.json(productos);
}

export async function obtener(req: Request, res: Response) {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: { categoria: true },
  });
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(producto);
}

export async function crear(req: Request, res: Response) {
  const { nombre, codigo, medida, origen, categoriaId, pesoUnitarioKg, descripcion, activo, imagenUrl } = req.body;
  const producto = await prisma.producto.create({
    data: {
      nombre,
      codigo: codigo ?? null,
      medida,
      origen: origen ?? "INTERNO",
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      pesoUnitarioKg: pesoUnitarioKg !== undefined ? pesoUnitarioKg : undefined,
      descripcion: descripcion ?? null,
      activo: activo ?? true,
      imagenUrl: imagenUrl ?? null,
    },
    include: { categoria: true },
  });
  res.status(201).json(producto);
}

export async function actualizar(req: Request, res: Response) {
  // Extraer solo los campos planos — excluir relaciones anidadas (categoria, etc.)
  const { nombre, codigo, medida, origen, categoriaId, pesoUnitarioKg, descripcion, activo, imagenUrl } = req.body;
  const producto = await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: {
      nombre,
      codigo: codigo ?? null,
      medida,
      origen,
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      pesoUnitarioKg: pesoUnitarioKg !== undefined ? pesoUnitarioKg : undefined,
      descripcion: descripcion ?? null,
      activo,
      imagenUrl: imagenUrl ?? null,
    },
    include: { categoria: true },
  });
  res.json(producto);
}

export async function eliminar(req: Request, res: Response) {
  await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  res.status(204).send();
}

/**
 * Importación masiva desde Excel.
 * Cada fila: { codigo?, nombre, medida, categoria, origen?, pesoUnitarioKg?, descripcion? }
 * - Si existe un producto con el mismo código → actualiza
 * - Si existe uno con mismo nombre+medida → actualiza
 * - Si no existe → crea
 */
export async function importar(req: Request, res: Response) {
  const filas: {
    codigo?: string;
    nombre: string;
    medida: string;
    categoria: string;
    origen?: string;
    pesoUnitarioKg?: number;
    descripcion?: string;
  }[] = req.body;

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ error: "No hay filas para importar" });
  }

  // Cargar categorías para resolver por nombre
  const categorias = await prisma.categoriaCosto.findMany();
  const catMap = new Map(categorias.map((c) => [c.nombre.toLowerCase().trim(), c.id]));

  const creados: string[] = [];
  const actualizados: string[] = [];
  const errores: { fila: number; mensaje: string }[] = [];

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numFila = i + 2; // +2 porque fila 1 es el encabezado

    const nombre = String(fila.nombre ?? "").trim();
    const medida = String(fila.medida ?? "").trim();
    const categoriaNombre = String(fila.categoria ?? "").trim().toLowerCase();
    const codigo = fila.codigo ? String(fila.codigo).trim().toUpperCase() || null : null;

    if (!nombre || !medida) {
      errores.push({ fila: numFila, mensaje: "Nombre y Medida son obligatorios" });
      continue;
    }

    const categoriaId = catMap.get(categoriaNombre);
    if (!categoriaId) {
      errores.push({ fila: numFila, mensaje: `Categoría "${fila.categoria}" no existe. Disponibles: ${[...catMap.keys()].join(", ")}` });
      continue;
    }

    const origen = (fila.origen ?? "INTERNO").toString().toUpperCase() === "EXTERNO" ? "EXTERNO" : "INTERNO";
    const pesoUnitarioKg = fila.pesoUnitarioKg ? Number(fila.pesoUnitarioKg) : null;
    const descripcion = fila.descripcion ? String(fila.descripcion).trim() || null : null;

    try {
      // Buscar por código primero, luego por nombre+medida
      let existente = null;
      if (codigo) {
        existente = await prisma.producto.findFirst({ where: { codigo } });
      }
      if (!existente) {
        existente = await prisma.producto.findFirst({
          where: { nombre: { equals: nombre, mode: "insensitive" }, medida: { equals: medida, mode: "insensitive" } },
        });
      }

      if (existente) {
        await prisma.producto.update({
          where: { id: existente.id },
          data: { nombre, medida, codigo, categoriaId, origen: origen as any, pesoUnitarioKg, descripcion, activo: true },
        });
        actualizados.push(`${nombre} ${medida}`);
      } else {
        await prisma.producto.create({
          data: { nombre, medida, codigo, categoriaId, origen: origen as any, pesoUnitarioKg, descripcion },
        });
        creados.push(`${nombre} ${medida}`);
      }
    } catch (e: any) {
      errores.push({ fila: numFila, mensaje: e.message });
    }
  }

  res.json({ creados: creados.length, actualizados: actualizados.length, errores, total: filas.length });
}
