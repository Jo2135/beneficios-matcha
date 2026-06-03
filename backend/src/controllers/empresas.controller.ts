import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(_req: Request, res: Response) {
  const empresas = await prisma.empresa.findMany({ orderBy: { nombre: "asc" } });
  res.json(empresas);
}

export async function crear(req: Request, res: Response) {
  const { nombre, rif } = req.body;
  if (!nombre || !rif) return res.status(400).json({ error: "Nombre y RIF son requeridos" });
  try {
    const empresa = await prisma.empresa.create({ data: { nombre, rif } });
    res.status(201).json(empresa);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una empresa con ese RIF" });
    res.status(500).json({ error: e.message });
  }
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { nombre, rif } = req.body;
  try {
    const empresa = await prisma.empresa.update({ where: { id }, data: { nombre, rif } });
    res.json(empresa);
  } catch (e: any) {
    if (e.code === "P2002") return res.status(409).json({ error: "Ya existe una empresa con ese RIF" });
    res.status(500).json({ error: e.message });
  }
}

export async function toggleActiva(req: Request, res: Response) {
  const id = Number(req.params.id);
  const empresa = await prisma.empresa.update({
    where: { id },
    data: { activa: req.body.activa },
  });
  res.json(empresa);
}
