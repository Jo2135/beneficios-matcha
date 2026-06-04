import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  try {
    const items = await prisma.seguimientoCotizacion.findMany({
      where: { cotizacionId: Number(req.params.cotizacionId) },
      include: { creadoPor: { select: { nombre: true, rol: true } } },
      orderBy: { creadoEn: "asc" },
    });
    res.json(items);
  } catch (e: any) {
    if (e?.code === "P2021" || e?.message?.includes("does not exist")) return res.json([]);
    throw e;
  }
}

export async function crear(req: Request, res: Response) {
  const { tipo, nota, fechaProxSeguimiento } = req.body;
  if (!nota) return res.status(400).json({ error: "nota es requerida" });

  const item = await prisma.seguimientoCotizacion.create({
    data: {
      cotizacionId: Number(req.params.cotizacionId),
      tipo: tipo ?? "NOTA",
      nota,
      fechaProxSeguimiento: fechaProxSeguimiento ? new Date(fechaProxSeguimiento) : null,
      creadoPorId: req.usuario?.id ?? null,
    },
    include: { creadoPor: { select: { nombre: true, rol: true } } },
  });
  res.json(item);
}

export async function eliminar(req: Request, res: Response) {
  await prisma.seguimientoCotizacion.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}

export async function pendientes(_req: Request, res: Response) {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const items = await prisma.seguimientoCotizacion.findMany({
    where: {
      fechaProxSeguimiento: { lte: hoy },
      tipo: { in: ["SEGUIMIENTO", "RECORDATORIO"] },
    },
    include: {
      cotizacion: {
        include: { cliente: { select: { nombre: true } } },
      },
      creadoPor: { select: { nombre: true } },
    },
    orderBy: { fechaProxSeguimiento: "asc" },
  });
  res.json(items);
}
