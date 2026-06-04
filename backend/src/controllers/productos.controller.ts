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
  const producto = await prisma.producto.create({
    data: req.body,
    include: { categoria: true },
  });
  res.status(201).json(producto);
}

export async function actualizar(req: Request, res: Response) {
  const producto = await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: req.body,
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
