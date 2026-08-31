import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";

// ─── Tablas por defecto (mirror de las constantes en ganancias.controller) ────

export const DEFAULTS: Record<string, { valor: number; label: string; grupo: string; unidad: string }> = {
  // Costo materia prima
  costo_manguera34:  { valor: 1.083, label: "Manguera 3/8\"–3/4\"",     grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_manguera13:  { valor: 1.090, label: "Manguera 1\"–3\"",          grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_azul:        { valor: 1.580, label: "Tubo Azul / Manguera Azul", grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_negro:       { valor: 1.280, label: "Tubo Negro Eléctrico",       grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_gris:        { valor: 1.280, label: "Tubo Gris Agua Blanca",      grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_blanco:      { valor: 1.580, label: "Tubo Blanco Eléctrico",      grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  costo_amarillo:    { valor: 1.590, label: "PEAD / Aguas Negras",        grupo: "Costo Materia Prima ($/kg)", unidad: "$/kg" },
  // Ganancia por kg (I25/I26)
  gan_manguera34:    { valor: 0.125, label: "Manguera 3/8\"–3/4\"",     grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  gan_manguera13:    { valor: 0.200, label: "Manguera 1\"–3\"",          grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  gan_azul:          { valor: 0.190, label: "Tubo Azul",                  grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  gan_gris:          { valor: 0.180, label: "Tubo Gris Agua Blanca",      grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  gan_negro_elec:    { valor: 0.260, label: "Tubo Negro Eléctrico",       grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  gan_blanco_elec:   { valor: 0.350, label: "Tubo Blanco Eléctrico",      grupo: "Ganancia por kg ($/kg)",     unidad: "$/kg" },
  // Ganancias_2 (tasas, usadas como: x - x/(1+tasa))
  g2_sbug:           { valor: 0.015,  label: "SBUG (1.5%)",     grupo: "Tasas Ganancias_2",  unidad: "%" },
  g2_yolanda:        { valor: 0.0075, label: "Yolanda (0.75%)", grupo: "Tasas Ganancias_2",  unidad: "%" },
  g2_sandra:         { valor: 0.0075, label: "Sandra (0.75%)",  grupo: "Tasas Ganancias_2",  unidad: "%" },
  g2_comisiones:     { valor: 0.022,  label: "Comisiones (2.2%)", grupo: "Tasas Ganancias_2", unidad: "%" },
  // Distribución I25/I26
  dist_alberto_gral: { valor: 60, label: "Sr. Alberto Gral (%)",    grupo: "Distribución I25/I26", unidad: "%" },
  dist_capital:      { valor: 40, label: "Capital (%)",              grupo: "Distribución I25/I26", unidad: "%" },
  // Distribución PEAD H47
  dist_alberto_am:   { valor: 42, label: "Sr. Alberto Amarillo (%)", grupo: "Distribución PEAD H47", unidad: "%" },
  dist_danny_am:     { valor: 33, label: "Danny Amarillo (%)",       grupo: "Distribución PEAD H47", unidad: "%" },
  dist_darwin_am:    { valor: 25, label: "Darwin Amarillo (%)",      grupo: "Distribución PEAD H47", unidad: "%" },
  // Gastos generales por tramo (solo útil como override por despacho)
  gastos_obreros:    { valor: 0, label: "Obreros (override)",       grupo: "Gastos Override por Despacho", unidad: "$" },
  gastos_pigmento:   { valor: 0, label: "Pigmento (override)",      grupo: "Gastos Override por Despacho", unidad: "$" },
  gastos_elect:      { valor: 0, label: "Electricidad (override)",   grupo: "Gastos Override por Despacho", unidad: "$" },
  // Pesos de ganancia PEAD (Ganancias_1) — por código exacto de producto.
  // Distinto del peso de inventario (Producto.pesoUnitarioKg): este es el
  // peso que se usa SOLO para calcular la utilidad (cantidad × peso × 0.49).
  pead_peso_tuam_2:  { valor: 0.85, label: "TUAM-2-PEAD (2\")",            grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_3:  { valor: 1.20, label: "TUAM-3-PEAD (3\")",            grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_4:  { valor: 2.25, label: "TUAM-4-PEAD (4\")",            grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_6:  { valor: 5.50, label: "TUAM-6-PEAD (6\")",            grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_2r: { valor: 1.00, label: "TUAM-2-PEAD-R (2\" Reforzada)",grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_3r: { valor: 2.45, label: "TUAM-3-PEAD-R (3\" Reforzada)",grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuam_4r: { valor: 1.55, label: "TUAM-4-PEAD-R (4\" Reforzada)",grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tuna_4r: { valor: 2.90, label: "TUNA-4-PEAD-R (4\" Naranja Reforzada)", grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
  pead_peso_tugr_2:  { valor: 0.80, label: "TUGR-2-PEAD (2\" Gris)",       grupo: "Pesos de Ganancia PEAD (kg)", unidad: "kg" },
};

// Campo de Tablas de Ganancias ↔ código exacto del producto (para el motor)
export const PEAD_CAMPO_POR_CODIGO: Record<string, string> = {
  "TUAM-2-PEAD": "pead_peso_tuam_2", "TUAM-3-PEAD": "pead_peso_tuam_3",
  "TUAM-4-PEAD": "pead_peso_tuam_4", "TUAM-6-PEAD": "pead_peso_tuam_6",
  "TUAM-2-PEAD-R": "pead_peso_tuam_2r", "TUAM-3-PEAD-R": "pead_peso_tuam_3r",
  "TUAM-4-PEAD-R": "pead_peso_tuam_4r", "TUNA-4-PEAD-R": "pead_peso_tuna_4r",
  "TUGR-2-PEAD": "pead_peso_tugr_2",
};

// ─── GET /api/tablas?despachoId=N ─────────────────────────────────────────────
// Devuelve las tablas con sus overrides aplicados

export async function getTablasConOverrides(req: Request, res: Response) {
  const despachoId = req.query.despachoId ? Number(req.query.despachoId) : undefined;

  // Cargar overrides globales y de este despacho
  const dbRows = await prisma.configGanancias.findMany({
    where: despachoId
      ? { OR: [{ despachoId: null }, { despachoId }] }
      : { despachoId: null },
  });

  const globalMap = new Map<string, number>();
  const despachoMap = new Map<string, number>();

  for (const row of dbRows) {
    if (row.despachoId === null) globalMap.set(row.campo, Number(row.valor));
    else despachoMap.set(row.campo, Number(row.valor));
  }

  // Construir respuesta: para cada campo, valor efectivo + origen
  const result: Record<string, {
    campo: string; label: string; grupo: string; unidad: string;
    defaultVal: number; globalOverride: number | null;
    despachoOverride: number | null; efectivo: number;
  }> = {};

  for (const [campo, def] of Object.entries(DEFAULTS)) {
    const globalOv  = globalMap.has(campo)  ? globalMap.get(campo)!  : null;
    const despachoOv = despachoMap.has(campo) ? despachoMap.get(campo)! : null;
    const efectivo = despachoOv ?? globalOv ?? def.valor;
    result[campo] = {
      campo, label: def.label, grupo: def.grupo, unidad: def.unidad,
      defaultVal: def.valor, globalOverride: globalOv,
      despachoOverride: despachoOv, efectivo,
    };
  }

  res.json({ campos: result, despachoId: despachoId ?? null });
}

// ─── PATCH /api/tablas ────────────────────────────────────────────────────────
// Guarda o elimina un override (global o por despacho)

export async function setTablaOverride(req: Request, res: Response) {
  const { campo, valor, despachoId, eliminar } = req.body;

  if (!campo || !DEFAULTS[campo]) return res.status(400).json({ error: "Campo inválido" });

  if (eliminar) {
    await prisma.configGanancias.deleteMany({
      where: { campo, despachoId: despachoId ?? null },
    });
    return res.json({ ok: true, eliminado: true });
  }

  if (valor === undefined || valor === null || isNaN(Number(valor))) {
    return res.status(400).json({ error: "Valor inválido" });
  }

  // No usamos upsert con la clave compuesta: cuando despachoId es null, Prisma no
  // resuelve bien el unique compuesto (NULL != NULL en SQL). Buscamos manualmente.
  const dId = despachoId ?? null;
  const existente = await prisma.configGanancias.findFirst({ where: { campo, despachoId: dId } });
  if (existente) {
    await prisma.configGanancias.update({ where: { id: existente.id }, data: { valor: Number(valor) } });
  } else {
    await prisma.configGanancias.create({ data: { campo, valor: Number(valor), despachoId: dId } });
  }

  res.json({ ok: true });
}

// ─── PIN management ───────────────────────────────────────────────────────────

async function getSistema() {
  return prisma.configuracionSistema.upsert({
    where: { id: 1 }, update: {}, create: { id: 1 },
  });
}

export async function getPinEstado(_req: Request, res: Response) {
  const s = await getSistema();
  res.json({ configurado: !!s.pinTablaHash });
}

export async function verificarPin(req: Request, res: Response) {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: "PIN requerido" });
  const s = await getSistema();
  if (!s.pinTablaHash) return res.status(400).json({ error: "PIN no configurado" });
  const ok = await bcrypt.compare(String(pin), s.pinTablaHash);
  if (!ok) return res.status(401).json({ error: "PIN incorrecto" });
  res.json({ ok: true });
}

export async function setPin(req: Request, res: Response) {
  const { pinActual, pinNuevo } = req.body;
  if (!pinNuevo || String(pinNuevo).length < 4) {
    return res.status(400).json({ error: "El PIN debe tener al menos 4 dígitos" });
  }
  const s = await getSistema();
  // Si ya hay PIN, verificar el actual
  if (s.pinTablaHash) {
    if (!pinActual) return res.status(401).json({ error: "Debes proveer el PIN actual" });
    const ok = await bcrypt.compare(String(pinActual), s.pinTablaHash);
    if (!ok) return res.status(401).json({ error: "PIN actual incorrecto" });
  }
  const hash = await bcrypt.hash(String(pinNuevo), 10);
  await prisma.configuracionSistema.upsert({
    where: { id: 1 }, update: { pinTablaHash: hash }, create: { id: 1, pinTablaHash: hash },
  });
  res.json({ ok: true });
}
