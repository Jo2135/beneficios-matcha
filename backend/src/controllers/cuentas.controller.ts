import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(_req: Request, res: Response) {
  const cuentas = await prisma.cuenta.findMany({
    where: { activa: true },
    orderBy: { nombre: "asc" },
  });
  res.json(cuentas);
}

export async function listarTodas(_req: Request, res: Response) {
  const cuentas = await prisma.cuenta.findMany({ orderBy: { nombre: "asc" } });
  res.json(cuentas);
}

export async function crear(req: Request, res: Response) {
  const cuenta = await prisma.cuenta.create({ data: req.body });
  res.status(201).json(cuenta);
}

export async function actualizar(req: Request, res: Response) {
  const cuenta = await prisma.cuenta.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  res.json(cuenta);
}

export async function toggleActiva(req: Request, res: Response) {
  const cuenta = await prisma.cuenta.update({
    where: { id: Number(req.params.id) },
    data: { activa: req.body.activa },
  });
  res.json(cuenta);
}

// Seed de cuentas iniciales — solo si no existen
export async function seedCuentas(_req: Request, res: Response) {
  const count = await prisma.cuenta.count();
  if (count > 0) return res.json({ mensaje: "Las cuentas ya existen", total: count });

  const cuentasIniciales = [
    { nombre: "Efectivo USD",        moneda: "USD", propietario: "Empresa", comisionPct: 0 },
    { nombre: "Efectivo Bs",         moneda: "BS",  propietario: "Empresa", comisionPct: 0 },
    { nombre: "USDT (Binance)",      moneda: "USDT",propietario: "Empresa", comisionPct: 1 },
    { nombre: "Zelle",               moneda: "USD", propietario: "Empresa", comisionPct: 0 },
    { nombre: "Banesco Panamá",      moneda: "USD", propietario: "Empresa", comisionPct: 0 },
    { nombre: "BANCAMIGA Dólares",   moneda: "USD", propietario: "Empresa", comisionPct: 0 },
  ];

  const creadas = await prisma.$transaction(
    cuentasIniciales.map((c) => prisma.cuenta.create({ data: c as any }))
  );

  res.status(201).json({ mensaje: "Cuentas creadas", total: creadas.length });
}
