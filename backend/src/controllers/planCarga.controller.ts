import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// Devuelve el plan con sus campos JSON ya parseados a objetos
function parsePlan(p: any) {
  const safe = (s: string, fb: any) => { try { return JSON.parse(s); } catch { return fb; } };
  return {
    id: p.id, nombre: p.nombre, fecha: p.fecha, notas: p.notas, estado: p.estado,
    creadoEn: p.creadoEn, actualizadoEn: p.actualizadoEn,
    clientes: safe(p.clientesJson, []),     // [clienteId, ...]
    productos: safe(p.productosJson, []),    // [{ id, costo }, ...]
    cantidades: safe(p.cantidadesJson, {}),  // { "clienteId_productoId": cantidad }
  };
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
  const { nombre, fecha, notas, clientes, productos, cantidades } = req.body;
  const p = await prisma.planCarga.create({
    data: {
      nombre: nombre?.trim() || "Plan sin nombre",
      fecha: fecha ? new Date(fecha) : null,
      notas: notas?.trim() || null,
      clientesJson: JSON.stringify(clientes ?? []),
      productosJson: JSON.stringify(productos ?? []),
      cantidadesJson: JSON.stringify(cantidades ?? {}),
    },
  });
  res.status(201).json(parsePlan(p));
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { nombre, fecha, notas, clientes, productos, cantidades } = req.body;
  const data: any = {};
  if (nombre !== undefined) data.nombre = String(nombre).trim() || "Plan sin nombre";
  if (fecha !== undefined) data.fecha = fecha ? new Date(fecha) : null;
  if (notas !== undefined) data.notas = notas?.trim() || null;
  if (clientes !== undefined) data.clientesJson = JSON.stringify(clientes);
  if (productos !== undefined) data.productosJson = JSON.stringify(productos);
  if (cantidades !== undefined) data.cantidadesJson = JSON.stringify(cantidades);
  const p = await prisma.planCarga.update({ where: { id }, data });
  res.json(parsePlan(p));
}

export async function eliminar(req: Request, res: Response) {
  await prisma.planCarga.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
}
