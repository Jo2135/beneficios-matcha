import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(_req: Request, res: Response) {
  const tasas = await prisma.tasaCambio.findMany({
    orderBy: { fecha: "desc" },
    take: 60,
  });
  res.json(tasas);
}

export async function obtenerVigente(_req: Request, res: Response) {
  const tasa = await prisma.tasaCambio.findFirst({ orderBy: { fecha: "desc" } });
  res.json(tasa ?? null);
}

export async function upsertHoy(req: Request, res: Response) {
  const { bsUSDT, copUSDT, notas } = req.body;
  if (!bsUSDT) return res.status(400).json({ error: "bsUSDT es requerido" });

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy); manana.setDate(manana.getDate() + 1);

  const existing = await prisma.tasaCambio.findFirst({
    where: { fecha: { gte: hoy, lt: manana } },
  });

  const tasa = existing
    ? await prisma.tasaCambio.update({
        where: { id: existing.id },
        data: { bsUSDT: Number(bsUSDT), copUSDT: copUSDT ? Number(copUSDT) : null, notas: notas ?? null },
      })
    : await prisma.tasaCambio.create({
        data: { bsUSDT: Number(bsUSDT), copUSDT: copUSDT ? Number(copUSDT) : null, notas: notas ?? null },
      });

  res.json(tasa);
}

export async function eliminar(req: Request, res: Response) {
  await prisma.tasaCambio.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}
