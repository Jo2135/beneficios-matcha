import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ─── Subida de imagen de la factura externa ──────────────────────────────────
const uploadDir = path.join(process.cwd(), "public", "uploads", "compras-externas");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `compra-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes (JPG, PNG, WEBP) o PDF"));
  },
});
export const uploadCompraMiddleware = upload.single("imagen");

// ─── Helpers ──────────────────────────────────────────────────────────────
const includeFull = {
  lineas: {
    include: {
      producto: { select: { id: true, codigo: true, nombre: true, medida: true } },
      asignaciones: {
        include: {
          factura: {
            select: {
              id: true, numero: true, fechaEmision: true, totalNeto: true,
              cliente: { select: { id: true, nombre: true } },
            },
          },
        },
        orderBy: { creadoEn: "asc" as const },
      },
    },
    orderBy: { id: "asc" as const },
  },
  pagos: {
    include: { cuenta: { select: { id: true, nombre: true, moneda: true } } },
    orderBy: { fecha: "asc" as const },
  },
};

function conTotales(c: any) {
  const lineas = (c.lineas ?? []).map((l: any) => {
    const asignado = (l.asignaciones ?? []).reduce((s: number, a: any) => s + Number(a.cantidad), 0);
    const cantidad = Number(l.cantidad);
    return { ...l, asignado, disponible: Math.max(0, cantidad - asignado) };
  });
  const totalPagado = (c.pagos ?? []).reduce((s: number, p: any) => s + Number(p.monto), 0);
  const totalCosto = Number(c.totalCosto);
  const totalBruto = Number(c.totalBruto ?? 0);
  return {
    ...c,
    lineas,
    totalPagado,
    ahorroDescuentos: Math.round((totalBruto - totalCosto) * 100) / 100,
    saldoProveedor: Math.max(0, totalCosto - totalPagado),
  };
}

/** Aplica los dos descuentos en cadena, como los factura el proveedor:
 *  primero uno sobre el bruto, y el segundo sobre lo que quedó. */
export function aplicarDescuentos(bruto: number, d1: number, d2: number): number {
  const n = bruto * (1 - (Number(d1) || 0) / 100) * (1 - (Number(d2) || 0) / 100);
  return Math.round(n * 100) / 100;
}

async function recomputarTotal(compraId: number) {
  const compra = await prisma.compraExterna.findUnique({ where: { id: compraId } });
  if (!compra) return;
  const lineas = await prisma.compraExternaLinea.findMany({ where: { compraExternaId: compraId } });
  const bruto = lineas.reduce((s, l) => s + Number(l.cantidad) * Number(l.costoUnitario), 0);
  await prisma.compraExterna.update({
    where: { id: compraId },
    data: {
      totalBruto: bruto,
      totalCosto: aplicarDescuentos(bruto, Number(compra.descuento1Pct), Number(compra.descuento2Pct)),
    },
  });
}

function parseFecha(v: any): Date {
  if (!v) return new Date();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ─── Listado y detalle ──────────────────────────────────────────────────────
export async function listar(req: Request, res: Response) {
  const { q } = req.query;
  const where: any = {};
  if (q) {
    where.OR = [
      { proveedor: { contains: q as string, mode: "insensitive" } },
      { numero: { contains: q as string, mode: "insensitive" } },
    ];
  }
  const compras = await prisma.compraExterna.findMany({
    where,
    include: includeFull,
    orderBy: { fecha: "desc" },
  });
  res.json(compras.map(conTotales));
}

export async function obtener(req: Request, res: Response) {
  const id = Number(req.params.id);
  const compra = await prisma.compraExterna.findUnique({ where: { id }, include: includeFull });
  if (!compra) return res.status(404).json({ error: "Compra externa no encontrada" });
  res.json(conTotales(compra));
}

// ─── Crear / editar ───────────────────────────────────────────────────────
export async function crear(req: Request, res: Response) {
  const { proveedor, numero, fecha, notas, lineas, descuento1Pct, descuento2Pct } = req.body;
  if (!proveedor?.trim()) return res.status(400).json({ error: "El proveedor es obligatorio" });

  const lineasData = (lineas ?? [])
    .filter((l: any) => l.productoId && Number(l.cantidad) > 0)
    .map((l: any) => ({
      productoId: Number(l.productoId),
      cantidad: Number(l.cantidad),
      costoUnitario: Number(l.costoUnitario) || 0,
      notas: l.notas?.trim() || null,
    }));

  const d1 = Number(descuento1Pct) || 0;
  const d2 = Number(descuento2Pct) || 0;
  const totalBruto = lineasData.reduce((s: number, l: any) => s + l.cantidad * l.costoUnitario, 0);
  const totalCosto = aplicarDescuentos(totalBruto, d1, d2);

  const compra = await prisma.compraExterna.create({
    data: {
      proveedor: proveedor.trim(),
      numero: numero?.trim() || null,
      fecha: parseFecha(fecha),
      notas: notas?.trim() || null,
      descuento1Pct: d1,
      descuento2Pct: d2,
      totalBruto,
      totalCosto,
      lineas: { create: lineasData },
    },
    include: includeFull,
  });
  res.status(201).json(conTotales(compra));
}

export async function actualizar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { proveedor, numero, fecha, notas, descuento1Pct, descuento2Pct } = req.body;
  const data: any = {};
  if (proveedor !== undefined) data.proveedor = String(proveedor).trim();
  if (numero !== undefined) data.numero = numero?.trim() || null;
  if (fecha !== undefined) data.fecha = parseFecha(fecha);
  if (notas !== undefined) data.notas = notas?.trim() || null;
  if (descuento1Pct !== undefined) data.descuento1Pct = Number(descuento1Pct) || 0;
  if (descuento2Pct !== undefined) data.descuento2Pct = Number(descuento2Pct) || 0;

  await prisma.compraExterna.update({ where: { id }, data });
  // Cambiar un descuento cambia lo que se le debe al proveedor.
  if (descuento1Pct !== undefined || descuento2Pct !== undefined) await recomputarTotal(id);
  const compra = await prisma.compraExterna.findUnique({ where: { id }, include: includeFull });
  res.json(conTotales(compra));
}

export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const compra = await prisma.compraExterna.findUnique({ where: { id } });
  if (!compra) return res.status(404).json({ error: "Compra externa no encontrada" });

  if (compra.imagenUrl) {
    const f = path.join(process.cwd(), "public", compra.imagenUrl.replace(/^\//, ""));
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  // onDelete: Cascade limpia líneas, asignaciones y pagos
  await prisma.compraExterna.delete({ where: { id } });
  res.json({ ok: true });
}

// ─── Imagen ─────────────────────────────────────────────────────────────────
export async function subirImagen(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });
  const id = Number(req.params.id);

  const actual = await prisma.compraExterna.findUnique({ where: { id }, select: { imagenUrl: true } });
  if (actual?.imagenUrl) {
    const old = path.join(process.cwd(), "public", actual.imagenUrl.replace(/^\//, ""));
    if (fs.existsSync(old)) fs.unlinkSync(old);
  }
  const imagenUrl = `/uploads/compras-externas/${req.file.filename}`;
  await prisma.compraExterna.update({ where: { id }, data: { imagenUrl } });
  res.json({ imagenUrl });
}

export async function eliminarImagen(req: Request, res: Response) {
  const id = Number(req.params.id);
  const actual = await prisma.compraExterna.findUnique({ where: { id }, select: { imagenUrl: true } });
  if (actual?.imagenUrl) {
    const f = path.join(process.cwd(), "public", actual.imagenUrl.replace(/^\//, ""));
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  await prisma.compraExterna.update({ where: { id }, data: { imagenUrl: null } });
  res.json({ ok: true });
}

// ─── Líneas (productos comprados) ────────────────────────────────────────────
export async function agregarLinea(req: Request, res: Response) {
  const compraExternaId = Number(req.params.id);
  const { productoId, cantidad, costoUnitario, notas } = req.body;
  if (!productoId || !(Number(cantidad) > 0))
    return res.status(400).json({ error: "Producto y cantidad son obligatorios" });

  await prisma.compraExternaLinea.create({
    data: {
      compraExternaId,
      productoId: Number(productoId),
      cantidad: Number(cantidad),
      costoUnitario: Number(costoUnitario) || 0,
      notas: notas?.trim() || null,
    },
  });
  await recomputarTotal(compraExternaId);
  const compra = await prisma.compraExterna.findUnique({ where: { id: compraExternaId }, include: includeFull });
  res.json(conTotales(compra));
}

export async function eliminarLinea(req: Request, res: Response) {
  const lineaId = Number(req.params.lineaId);
  const linea = await prisma.compraExternaLinea.findUnique({
    where: { id: lineaId },
    include: { asignaciones: true },
  });
  if (!linea) return res.status(404).json({ error: "Línea no encontrada" });
  if (linea.asignaciones.length > 0)
    return res.status(400).json({ error: "No se puede eliminar: la línea tiene cantidades asignadas. Quita primero las asignaciones." });

  const compraId = linea.compraExternaId;
  await prisma.compraExternaLinea.delete({ where: { id: lineaId } });
  await recomputarTotal(compraId);
  const compra = await prisma.compraExterna.findUnique({ where: { id: compraId }, include: includeFull });
  res.json(conTotales(compra));
}

// ─── Asignaciones (reparto a facturas de clientes) ────────────────────────────
export async function asignar(req: Request, res: Response) {
  const { lineaId, facturaId, cantidad, notas } = req.body;
  const cant = Number(cantidad);
  if (!lineaId || !facturaId || !(cant > 0))
    return res.status(400).json({ error: "Línea, factura y cantidad son obligatorios" });

  const linea = await prisma.compraExternaLinea.findUnique({
    where: { id: Number(lineaId) },
    include: { asignaciones: true },
  });
  if (!linea) return res.status(404).json({ error: "Línea no encontrada" });

  const yaAsignado = linea.asignaciones.reduce((s, a) => s + Number(a.cantidad), 0);
  const disponible = Number(linea.cantidad) - yaAsignado;
  if (cant > disponible + 0.001)
    return res.status(400).json({ error: `Solo hay ${disponible} disponibles para asignar en esta línea.` });

  const factura = await prisma.factura.findUnique({ where: { id: Number(facturaId) }, select: { id: true } });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });

  await prisma.compraExternaAsignacion.create({
    data: {
      lineaId: Number(lineaId),
      facturaId: Number(facturaId),
      cantidad: cant,
      notas: notas?.trim() || null,
    },
  });
  const compra = await prisma.compraExterna.findUnique({ where: { id: linea.compraExternaId }, include: includeFull });
  res.json(conTotales(compra));
}

export async function eliminarAsignacion(req: Request, res: Response) {
  const id = Number(req.params.asignacionId);
  const asg = await prisma.compraExternaAsignacion.findUnique({
    where: { id },
    include: { linea: { select: { compraExternaId: true } } },
  });
  if (!asg) return res.status(404).json({ error: "Asignación no encontrada" });

  await prisma.compraExternaAsignacion.delete({ where: { id } });
  const compra = await prisma.compraExterna.findUnique({ where: { id: asg.linea.compraExternaId }, include: includeFull });
  res.json(conTotales(compra));
}

// ─── Pagos al proveedor ───────────────────────────────────────────────────────
export async function registrarPago(req: Request, res: Response) {
  const compraExternaId = Number(req.params.id);
  const { monto, fecha, cuentaId, origenFondos, moneda, notas } = req.body;
  if (!(Number(monto) > 0)) return res.status(400).json({ error: "El monto debe ser mayor a cero" });

  await prisma.compraExternaPago.create({
    data: {
      compraExternaId,
      monto: Number(monto),
      fecha: parseFecha(fecha),
      cuentaId: Number(cuentaId) || null,
      origenFondos: origenFondos?.trim() || null,
      moneda: moneda || "USD",
      notas: notas?.trim() || null,
    },
  });
  const compra = await prisma.compraExterna.findUnique({ where: { id: compraExternaId }, include: includeFull });
  res.json(conTotales(compra));
}

export async function eliminarPago(req: Request, res: Response) {
  const id = Number(req.params.pagoId);
  const pago = await prisma.compraExternaPago.findUnique({ where: { id } });
  if (!pago) return res.status(404).json({ error: "Pago no encontrado" });

  await prisma.compraExternaPago.delete({ where: { id } });
  const compra = await prisma.compraExterna.findUnique({ where: { id: pago.compraExternaId }, include: includeFull });
  res.json(conTotales(compra));
}
