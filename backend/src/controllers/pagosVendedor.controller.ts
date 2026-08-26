import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { prisma } from "../lib/prisma";

// ─── Pagos rendidos por VENDEDORES, con flujo de aprobación ──────────────────
// - El vendedor carga el pago → queda PENDIENTE (no toca facturas).
// - MASTER/ADMIN lo aprueba → se abona a las facturas del vendedor (FIFO).
// - Si MASTER/ADMIN lo carga directo → se aprueba y abona de inmediato.
// - El excedente cascada a la siguiente factura pendiente (cronológica) de
//   CUALQUIER cliente del vendedor; si no quedan, el resto queda sin asignar.

export const METODOS_PAGO: Record<string, { label: string; moneda: "USD" | "USDT" | "BS" | "COP" }> = {
  BINANCE:        { label: "Binance",                              moneda: "USDT" },
  DEPOSITO_USD:   { label: "Depósito en dólares",                  moneda: "USD" },
  DEPOSITO_BS:    { label: "Depósito en Bs (banco venezolano)",    moneda: "BS" },
  BANESCO_PANAMA: { label: "Transferencia Banesco Panamá",         moneda: "USD" },
  BANCO_COLOMBIA: { label: "Depósito banco colombiano",            moneda: "COP" },
  ZELLE:          { label: "Zelle",                                 moneda: "USD" },
};

const INCLUDE_PAGO = {
  vendedor:    { select: { id: true, nombre: true } },
  creadoPor:   { select: { id: true, nombre: true, rol: true } },
  aprobadoPor: { select: { id: true, nombre: true } },
  asignaciones: {
    include: { factura: { select: { id: true, numero: true, cliente: { select: { nombre: true } } } } },
    orderBy: { fechaAsignacion: "asc" as const },
  },
};

/** Facturas con saldo de los clientes del vendedor, más antigua primero. */
async function facturasPendientesDe(vendedorId: number) {
  return prisma.factura.findMany({
    where: {
      saldoPendiente: { gt: 0 },
      estado: { not: "ANULADA" },
      cliente: { vendedorId },
    },
    select: {
      id: true, numero: true, fechaEmision: true, totalNeto: true, saldoPendiente: true,
      cliente: { select: { id: true, nombre: true } },
    },
    orderBy: [{ fechaEmision: "asc" }, { creadoEn: "asc" }, { id: "asc" }],
  });
}

/** Abona el pago a las facturas del vendedor: destino elegido primero (si hay),
 *  luego FIFO cronológico. Devuelve el detalle de lo asignado y el sobrante. */
async function aplicarPagoVendedor(pagoId: number) {
  return prisma.$transaction(async (tx) => {
    const pago = await tx.pago.findUnique({ where: { id: pagoId } });
    if (!pago || !pago.vendedorId) throw new Error("Pago de vendedor no encontrado");

    let restante = Number(pago.montousd ?? pago.monto);
    const candidatas = await tx.factura.findMany({
      where: { saldoPendiente: { gt: 0 }, estado: { not: "ANULADA" }, cliente: { vendedorId: pago.vendedorId } },
      orderBy: [{ fechaEmision: "asc" }, { creadoEn: "asc" }, { id: "asc" }],
    });
    // La factura elegida va primero; el resto mantiene el orden cronológico
    if (pago.facturaDestinoId) {
      const idx = candidatas.findIndex((f) => f.id === pago.facturaDestinoId);
      if (idx > 0) candidatas.unshift(candidatas.splice(idx, 1)[0]);
    }

    const asignadas: { facturaId: number; numero: string; monto: number }[] = [];
    for (const f of candidatas) {
      if (restante <= 0.005) break;
      const saldo = Number(f.saldoPendiente);
      const abono = Math.min(restante, saldo);
      if (abono <= 0.005) continue;

      await tx.pagoAsignacion.create({
        data: { pagoId, facturaId: f.id, montoAsignado: abono, fechaAsignacion: pago.fecha, notas: "Pago de vendedor" },
      });
      const nuevoPagado = Number(f.totalPagado) + abono;
      const nuevoSaldo = saldo - abono;
      await tx.factura.update({
        where: { id: f.id },
        data: {
          totalPagado: nuevoPagado,
          saldoPendiente: nuevoSaldo,
          estado: nuevoSaldo <= 0.005 ? "COBRADA" : "COBRADA_PARCIAL",
        },
      });
      asignadas.push({ facturaId: f.id, numero: f.numero, monto: abono });
      restante -= abono;
    }

    const totalAsignado = asignadas.reduce((s, a) => s + a.monto, 0);
    // Si el pago entró sin cliente (modo automático), queda con el de la primera
    // factura abonada — así la pantalla de Pagos no lo muestra como "Libre".
    const clienteDeducido = !pago.clienteId && asignadas.length > 0
      ? (await tx.factura.findUnique({ where: { id: asignadas[0].facturaId }, select: { clienteId: true } }))?.clienteId ?? null
      : null;
    await tx.pago.update({
      where: { id: pagoId },
      data: {
        estado: restante <= 0.005 ? "ASIGNADO" : totalAsignado > 0 ? "PARCIAL" : "LIBRE",
        ...(clienteDeducido ? { clienteId: clienteDeducido } : {}),
      },
    });
    return { asignadas, sobrante: Math.max(0, restante) };
  });
}

// ─── POST /pagos-vendedor ─────────────────────────────────────────────────────
export async function crear(req: Request, res: Response) {
  const usuario = req.usuario!;
  const { fecha, metodoPago, monto, tasa, facturaDestinoId, observaciones } = req.body;

  const metodo = METODOS_PAGO[String(metodoPago)];
  if (!metodo) return res.status(400).json({ error: "Modo de pago inválido" });
  if (!(Number(monto) > 0)) return res.status(400).json({ error: "La cantidad debe ser mayor a cero" });

  // Vendedor: solo puede cargar los suyos. Admin/Master: indica el vendedor.
  let vendedorId: number;
  if (usuario.rol === "VENDEDOR") {
    if (!usuario.vendedorId) return res.status(400).json({ error: "Tu usuario no está vinculado a un vendedor. Pide al administrador que lo vincule." });
    vendedorId = usuario.vendedorId;
  } else {
    vendedorId = Number(req.body.vendedorId);
    if (!vendedorId) return res.status(400).json({ error: "Debes indicar el vendedor" });
  }

  // Monto en USD. La tasa de Bs/COP la fija SIEMPRE el admin/master (tasa de
  // mercado, no oficial): el vendedor deja el equivalente abierto y se define
  // al aprobar; el admin/master la indica al cargar directo.
  const esUsd = metodo.moneda === "USD" || metodo.moneda === "USDT";
  const esAdminRol = usuario.rol === "MASTER" || usuario.rol === "ADMIN";
  let usd: number | null = null;
  let tasaNum: number | null = null;
  if (esUsd) {
    usd = Number(monto);
  } else if (esAdminRol) {
    tasaNum = Number(tasa);
    if (!(tasaNum > 0)) return res.status(400).json({ error: `Indica la tasa (${metodo.moneda} por USD) para calcular el equivalente` });
    usd = Math.round((Number(monto) / tasaNum) * 100) / 100;
  }

  // Validar factura destino (si se eligió): debe ser de un cliente de este vendedor y tener saldo
  let clienteIdPago: number | null = null;
  if (facturaDestinoId) {
    const f = await prisma.factura.findUnique({ where: { id: Number(facturaDestinoId) }, include: { cliente: { select: { vendedorId: true } } } });
    if (!f || f.cliente?.vendedorId !== vendedorId) return res.status(400).json({ error: "La factura elegida no pertenece a un cliente de este vendedor" });
    if (Number(f.saldoPendiente) <= 0) return res.status(400).json({ error: "La factura elegida ya está cobrada" });
    // De quién es el pago: sin esto la pantalla de Pagos lo mostraba como "Libre"
    clienteIdPago = f.clienteId;
  }

  const esAdmin = esAdminRol;
  const pago = await prisma.pago.create({
    data: {
      vendedorId,
      clienteId: clienteIdPago,
      metodoPago: String(metodoPago),
      monto: Number(monto),
      moneda: metodo.moneda as any,
      montousd: usd,
      tasaCambioBs: metodo.moneda === "BS" ? tasaNum : null,
      tasaCambioCop: metodo.moneda === "COP" ? tasaNum : null,
      fecha: fecha ? new Date(fecha) : new Date(),
      origenFondos: metodo.label,
      observaciones: observaciones?.trim() || null,
      aprobacion: esAdmin ? "APROBADO" : "PENDIENTE",
      creadoPorId: usuario.id,
      aprobadoPorId: esAdmin ? usuario.id : null,
      aprobadoEn: esAdmin ? new Date() : null,
      facturaDestinoId: facturaDestinoId ? Number(facturaDestinoId) : null,
      estado: "LIBRE",
    },
  });

  // Admin/Master: se abona de inmediato. Vendedor: espera aprobación.
  let resultado: { asignadas: any[]; sobrante: number } | null = null;
  if (esAdmin) resultado = await aplicarPagoVendedor(pago.id);

  const completo = await prisma.pago.findUnique({ where: { id: pago.id }, include: INCLUDE_PAGO });
  res.status(201).json({ pago: completo, resultado });
}

// ─── GET /pagos-vendedor ──────────────────────────────────────────────────────
export async function listar(req: Request, res: Response) {
  const usuario = req.usuario!;
  const { vendedorId, aprobacion } = req.query;

  const where: any = { vendedorId: { not: null } };
  if (usuario.rol === "VENDEDOR") {
    if (!usuario.vendedorId) return res.json([]);
    where.vendedorId = usuario.vendedorId;   // el vendedor solo ve los suyos
  } else if (vendedorId) {
    where.vendedorId = Number(vendedorId);
  }
  if (aprobacion) where.aprobacion = String(aprobacion);

  const pagos = await prisma.pago.findMany({ where, include: INCLUDE_PAGO, orderBy: { fecha: "desc" } });
  res.json(pagos);
}

// ─── GET /pagos-vendedor/facturas-pendientes ─────────────────────────────────
export async function facturasPendientes(req: Request, res: Response) {
  const usuario = req.usuario!;
  let vendedorId: number | null = null;
  if (usuario.rol === "VENDEDOR") vendedorId = usuario.vendedorId ?? null;
  else if (req.query.vendedorId) vendedorId = Number(req.query.vendedorId);
  if (!vendedorId) return res.json([]);
  res.json(await facturasPendientesDe(vendedorId));
}

// ─── POST /pagos-vendedor/:id/aprobar (MASTER/ADMIN) ─────────────────────────
export async function aprobar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const usuario = req.usuario!;
  const pago = await prisma.pago.findUnique({ where: { id } });
  if (!pago || !pago.vendedorId) return res.status(404).json({ error: "Pago de vendedor no encontrado" });
  if (pago.aprobacion !== "PENDIENTE") return res.status(400).json({ error: `Este pago ya fue ${pago.aprobacion === "APROBADO" ? "aprobado" : "rechazado"}` });

  // Bs/COP: el aprobador fija la tasa de mercado y con ella se calcula el USD a abonar
  const data: any = { aprobacion: "APROBADO", aprobadoPorId: usuario.id, aprobadoEn: new Date() };
  if (pago.moneda === "BS" || pago.moneda === "COP") {
    const tasa = Number(req.body?.tasa);
    if (!(tasa > 0)) return res.status(400).json({ error: `Indica la tasa (${pago.moneda} por USD) para aprobar este pago` });
    data.montousd = Math.round((Number(pago.monto) / tasa) * 100) / 100;
    if (pago.moneda === "BS") data.tasaCambioBs = tasa; else data.tasaCambioCop = tasa;
  }

  await prisma.pago.update({ where: { id }, data });
  const resultado = await aplicarPagoVendedor(id);
  const completo = await prisma.pago.findUnique({ where: { id }, include: INCLUDE_PAGO });
  res.json({ pago: completo, resultado });
}

// ─── Comprobante del pago (imagen o PDF del depósito) ────────────────────────
// Mismo esquema que las facturas de compras externas: multer a disco + estático /uploads.

const comprobantesDir = path.join(process.cwd(), "public", "uploads", "comprobantes");
if (!fs.existsSync(comprobantesDir)) fs.mkdirSync(comprobantesDir, { recursive: true });

const comprobanteStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, comprobantesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `pago-${req.params.id}-${Date.now()}${ext}`);
  },
});
export const uploadComprobanteMiddleware = multer({
  storage: comprobanteStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes JPG, PNG, WEBP o PDF"));
  },
}).single("imagen");

const borrarArchivo = (url: string | null) => {
  if (!url) return;
  const f = path.join(process.cwd(), "public", url.replace(/^\//, ""));
  if (fs.existsSync(f)) fs.unlinkSync(f);
};

// POST /pagos-vendedor/:id/comprobante — lo anexa el vendedor dueño del pago o un admin/master
export async function subirComprobante(req: Request, res: Response) {
  const id = Number(req.params.id);
  const usuario = req.usuario!;
  if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo" });

  const pago = await prisma.pago.findUnique({ where: { id }, select: { vendedorId: true, comprobanteUrl: true } });
  const esAdmin = usuario.rol === "MASTER" || usuario.rol === "ADMIN";
  const esDueno = usuario.rol === "VENDEDOR" && pago?.vendedorId != null && pago.vendedorId === usuario.vendedorId;
  if (!pago || !pago.vendedorId || (!esAdmin && !esDueno)) {
    // multer ya guardó el archivo: no dejar huérfanos
    borrarArchivo(`/uploads/comprobantes/${req.file.filename}`);
    if (!pago || !pago.vendedorId) return res.status(404).json({ error: "Pago de vendedor no encontrado" });
    return res.status(403).json({ error: "Solo puedes anexar comprobantes a tus propios pagos" });
  }

  borrarArchivo(pago.comprobanteUrl); // si reemplaza uno anterior
  const comprobanteUrl = `/uploads/comprobantes/${req.file.filename}`;
  await prisma.pago.update({ where: { id }, data: { comprobanteUrl } });
  res.json({ comprobanteUrl });
}

// DELETE /pagos-vendedor/:id/comprobante — solo MASTER/ADMIN (la ruta lo exige)
export async function eliminarComprobante(req: Request, res: Response) {
  const id = Number(req.params.id);
  const pago = await prisma.pago.findUnique({ where: { id }, select: { vendedorId: true, comprobanteUrl: true } });
  if (!pago || !pago.vendedorId) return res.status(404).json({ error: "Pago de vendedor no encontrado" });
  if (!pago.comprobanteUrl) return res.status(400).json({ error: "Este pago no tiene comprobante" });

  borrarArchivo(pago.comprobanteUrl);
  await prisma.pago.update({ where: { id }, data: { comprobanteUrl: null } });
  res.json({ ok: true });
}

// ─── POST /pagos-vendedor/:id/rechazar (MASTER/ADMIN) ────────────────────────
export async function rechazar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const usuario = req.usuario!;
  const { motivo } = req.body;
  const pago = await prisma.pago.findUnique({ where: { id } });
  if (!pago || !pago.vendedorId) return res.status(404).json({ error: "Pago de vendedor no encontrado" });
  if (pago.aprobacion !== "PENDIENTE") return res.status(400).json({ error: "Solo se pueden rechazar pagos pendientes" });

  await prisma.pago.update({
    where: { id },
    data: { aprobacion: "RECHAZADO", motivoRechazo: motivo?.trim() || null, aprobadoPorId: usuario.id, aprobadoEn: new Date() },
  });
  const completo = await prisma.pago.findUnique({ where: { id }, include: INCLUDE_PAGO });
  res.json({ pago: completo });
}
