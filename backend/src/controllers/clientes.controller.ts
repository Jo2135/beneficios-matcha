import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const usuario = req.usuario!;
  const where: any = { activo: true };
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId) {
    where.vendedorId = usuario.vendedorId;
  }
  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      vendedor: { select: { id: true, nombre: true } },
      listaPrecio: { select: { id: true, nombre: true } },
    },
    orderBy: { nombre: "asc" },
  });
  res.json(clientes);
}

export async function buscar(req: Request, res: Response) {
  const { q } = req.query;
  const usuario = req.usuario!;
  const where: any = {
    activo: true,
    nombre: { contains: String(q || ""), mode: "insensitive" },
  };
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId) {
    where.vendedorId = usuario.vendedorId;
  }
  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      vendedor: { select: { id: true, nombre: true } },
      listaPrecio: { select: { id: true, nombre: true } },
    },
    take: 10,
    orderBy: { nombre: "asc" },
  });
  res.json(clientes);
}

export async function obtener(req: Request, res: Response) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      vendedor: true,
      listaPrecio: {
        include: {
          detalle: { include: { producto: true } },
        },
      },
    },
  });
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(cliente);
}

export async function crear(req: Request, res: Response) {
  const cliente = await prisma.cliente.create({ data: req.body });
  res.status(201).json(cliente);
}

export async function actualizar(req: Request, res: Response) {
  const cliente = await prisma.cliente.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  res.json(cliente);
}

export async function eliminar(req: Request, res: Response) {
  await prisma.cliente.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  res.status(204).send();
}
