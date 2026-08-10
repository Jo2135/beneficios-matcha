import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

// ─── TRADUCTOR DE PRODUCTOS HISTÓRICOS (PLANTILLA → CATÁLOGO) ─────────────────
function _norm(s: string): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
/** Forma canónica del nombre: sin acentos, sin "de", en singular (quita 's' final
 *  de cada palabra). Tolera variaciones manuales: "Manguera de Riego" == "Manguera Riego",
 *  "Curva Electrica Blancas" == "Curva Eléctrica Blanca". */
function _canon(s: string): string {
  return _norm(s)
    .replace(/\bde\b/g, " ")
    .replace(/\s+/g, " ").trim()
    .split(" ").filter(Boolean).map((w) => w.replace(/s$/, "")).join(" ");
}
// Nombre en los despachos → nombre en el catálogo
const ALIAS_NOMBRE: Record<string, string> = {
  "manguera agricola": "Manguera Riego",
  "manguera tubo": "Manguera Azul Agua Blanca",
  "curvas electricas blancas": "Curva Eléctrica Blanca",
  "curvas electricas negras": "Curva Eléctrica Negra",
  "niples": "Niple Azul",
  "tubo azul agua blanca": "Tubo Azul Agua Blanca",
  "tubo gris agua blanca": "Tubo Gris Agua Blanca PVC",
  "tubo electrico negro": "Tubo Eléctrico Negro",
  "tubo electrico blanco pesado": "Tubo Eléctrico Blanco Pesado",
  "tubo electrico blanco liviano": "Tubo Eléctrico Blanco Liviano",
  "tuberia agua negra": "Tubería Agua Negra Amarilla PEAD",
  "tuberia agua negra pesado": "Tubería Agua Negra Amarilla PEAD Reforzada",
  "tuberia agua negra naranja": "Tubería Agua Negra Naranja PEAD Reforzada",
  "tuberia agua negra - gris": "Tubería Agua Negra Gris",
};
const IGNORAR_NOMBRE = new Set(["estantillo plastico", "codo amarillo", "descripcion producto"]);

function _frac(t: string): number {
  t = t.replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4").replace(/\s+/g, " ").trim();
  let m = t.match(/^(\d+)\s+(\d+)\/(\d+)/); if (m) return +m[1] + (+m[2]) / (+m[3]);
  m = t.match(/^(\d+)\/(\d+)/); if (m) return (+m[1]) / (+m[2]);
  m = t.match(/^(\d+(\.\d+)?)/); if (m) return +m[1];
  return NaN;
}
// "Firma" de la medida: diámetro + presión(Lbs) + longitud(mts/cm/mm)
function _sig(md: string): Set<string> {
  const s = String(md ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4");
  const out = new Set<string>();
  const h = (s.match(/\d+\s+\d+\/\d+|\d+\/\d+|\d+(\.\d+)?/) || [])[0];
  const d = h ? _frac(h) : NaN;
  if (!isNaN(d)) out.add("d:" + d);
  for (const t of s.match(/\d+\s*lbs/g) || []) out.add("p:" + t.replace(/\s+/g, ""));
  for (const t of s.match(/\d+\s*(mts|cm|mm)/g) || []) out.add("l:" + t.replace(/\s+/g, ""));
  return out;
}
function _subset(a: Set<string>, b: Set<string>): boolean {
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

export async function listar(req: Request, res: Response) {
  const { estado, clienteId } = req.query;
  // estado puede ser un valor único o varios separados por coma: "EMITIDA,PENDIENTE_COBRO"
  const estadoFiltro = estado
    ? String(estado).includes(",")
      ? { in: String(estado).split(",") as any[] }
      : (estado as any)
    : undefined;
  const facturas = await prisma.factura.findMany({
    where: {
      ...(estadoFiltro ? { estado: estadoFiltro } : {}),
      ...(clienteId ? { clienteId: Number(clienteId) } : {}),
    },
    include: {
      cliente: { select: { id: true, nombre: true } },
      empresa: { select: { id: true, nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });
  res.json(facturas);
}

export async function obtener(req: Request, res: Response) {
  const factura = await prisma.factura.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      cliente: { include: { vendedor: true } },
      empresa: true,
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { orden: "asc" },
      },
      pagos: {
        include: {
          pago: {
            include: {
              cuenta: { select: { nombre: true, moneda: true } },
            },
          },
        },
        orderBy: { fechaAsignacion: "desc" },
      },
      gastos: { orderBy: { renglon: "asc" } },
      ganancias: { orderBy: { beneficiario: "asc" } },
      devoluciones: {
        include: { producto: { select: { nombre: true, medida: true } }, creadoPor: { select: { nombre: true } } },
        orderBy: { creadoEn: "desc" },
      },
    },
  });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  res.json(factura);
}

export async function resumenCliente(req: Request, res: Response) {
  const { clienteId } = req.params;
  const facturas = await prisma.factura.findMany({
    where: { clienteId: Number(clienteId), estado: { not: "ANULADA" } },
    include: {
      cliente: { select: { nombre: true } },
      _count: { select: { pagos: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const totalDeuda = facturas.reduce((s, f) => s + Number(f.saldoPendiente), 0);
  res.json({ facturas, totalDeuda });
}

export async function crearManual(req: Request, res: Response) {
  const { clienteId, numero, fechaEmision, totalNeto, notas, empresaId, pagosIniciales = [] } = req.body;

  if (!clienteId || !numero || totalNeto === undefined) {
    return res.status(400).json({ error: "clienteId, numero y totalNeto son requeridos" });
  }

  const sumaPagos = (pagosIniciales as any[]).reduce((s: number, p: any) => s + Number(p.monto), 0);
  const saldoPendiente = Math.max(0, Number(totalNeto) - sumaPagos);
  const estado =
    saldoPendiente <= 0 ? "COBRADA" : sumaPagos > 0 ? "COBRADA_PARCIAL" : "EMITIDA";
  const fechaBase = fechaEmision ? new Date(fechaEmision) : new Date();

  const factura = await prisma.$transaction(async (tx) => {
    const f = await tx.factura.create({
      data: {
        numero,
        clienteId: Number(clienteId),
        empresaId: empresaId ? Number(empresaId) : undefined,
        fechaEmision: fechaBase,
        totalNeto: Number(totalNeto),
        totalBruto: Number(totalNeto),
        totalPagado: sumaPagos,
        saldoPendiente,
        estado: estado as any,
        notas: notas ?? null,
      },
    });

    for (const p of pagosIniciales as any[]) {
      const fechaPago = p.fecha ? new Date(p.fecha) : fechaBase;
      const pago = await tx.pago.create({
        data: {
          clienteId: Number(clienteId),
          cuentaId: p.cuentaId ? Number(p.cuentaId) : undefined,
          monto: Number(p.monto),
          moneda: p.moneda ?? "USD",
          fecha: fechaPago,
          estado: "ASIGNADO" as any,
          origenFondos: p.origenFondos ?? null,
          observaciones: "Importación histórica",
        },
      });
      await tx.pagoAsignacion.create({
        data: {
          pagoId: pago.id,
          facturaId: f.id,
          montoAsignado: Number(p.monto),
          fechaAsignacion: fechaPago,
          notas: "Importación histórica",
        },
      });
    }

    return f;
  });

  res.status(201).json(factura);
}

/** Importación masiva de facturas históricas (formato PLANTILLA GENERAL).
 *  El frontend ya parseó cada archivo. Empata cliente y producto por nombre;
 *  crea los productos que no existan. Entran como COBRADAS (histórico). */
export async function importarHistorico(req: Request, res: Response) {
  const { anio, facturas } = req.body as {
    anio: number;
    facturas: { archivo: string; hoja?: string; cliente: string; fecha: string;
      lineas: { producto: string; medida: string; cantidad: number; monto: number }[] }[];
  };
  if (!Array.isArray(facturas) || facturas.length === 0) {
    return res.status(400).json({ error: "No hay facturas para importar" });
  }
  const year = Number(anio) || new Date().getFullYear();

  // Empate de clientes por nombre
  const clientes = await prisma.cliente.findMany({ select: { id: true, nombre: true } });
  const findCliente = (nombre: string): number | null => {
    const key = String(nombre).toLowerCase().trim();
    if (!key) return null;
    const exact = clientes.find((c) => c.nombre.toLowerCase().trim() === key);
    if (exact) return exact.id;
    const part = clientes.find((c) => {
      const cn = c.nombre.toLowerCase();
      return cn.includes(key) || key.includes(cn);
    });
    return part?.id ?? null;
  };

  // Categoría por defecto para productos nuevos
  const catExterno = await prisma.categoriaCosto.findFirst({ where: { nombre: "Externo" } });
  const catDefaultId = catExterno?.id ?? (await prisma.categoriaCosto.findFirst())!.id;

  // Productos existentes agrupados por nombre CANÓNICO (para el traductor tolerante)
  const productos = await prisma.producto.findMany({ select: { id: true, nombre: true, medida: true, categoriaId: true } });
  const catByCanon = new Map<string, { id: number; medida: string; categoriaId: number }[]>();
  for (const p of productos) {
    const k = _canon(p.nombre);
    if (!catByCanon.has(k)) catByCanon.set(k, []);
    catByCanon.get(k)!.push({ id: p.id, medida: p.medida, categoriaId: p.categoriaId });
  }
  /** Traduce un producto del despacho al catálogo. Devuelve {id} o {crearNombre} o {ignorar} */
  function resolverProducto(nombre: string, medida: string): { id?: number; crearNombre?: string; ignorar?: boolean } {
    const nn = _norm(nombre);
    if (IGNORAR_NOMBRE.has(nn)) return { ignorar: true };
    const target = ALIAS_NOMBRE[nn] ?? nombre;        // alias para diferencias de palabra
    const cands = catByCanon.get(_canon(target)) ?? []; // canónico tolera de/plural/acentos
    const tsig = _sig(medida);
    let best: { id: number } | null = null, bestN = -1;
    for (const c of cands) {
      const cs = _sig(c.medida);
      if (_subset(cs, tsig) && cs.size > bestN) { best = c; bestN = cs.size; }
    }
    if (best) return { id: best.id };
    return { crearNombre: target };
  }

  const MESES_NOMBRE: Record<string, number> = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
    julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
  };
  const parseFecha = (f: string, archivo: string): Date => {
    const s = String(f ?? "").trim();
    // Fecha completa ISO: 2025-01-28
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
    // DD-MM o DD/MM (con año opcional)
    const dm = s.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
    if (dm) {
      const y = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : year;
      return new Date(y, Number(dm[2]) - 1, Number(dm[1]), 12);
    }
    // Sin fecha legible: usar el mes que aparezca en la fecha o en el NOMBRE del archivo
    const txt = (s + " " + archivo).toLowerCase();
    for (const [nombre, idx] of Object.entries(MESES_NOMBRE)) {
      if (txt.includes(nombre)) return new Date(year, idx, 15, 12);
    }
    return new Date(year, 0, 1, 12);
  };
  const sanit = (s: string) => String(s).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  // Igual que sanit pero sin quitar extensión: el nombre de una pestaña no la tiene,
  // y si trae un punto (ej. "PLANTILLA 1.5") sanit se comería el final.
  const sanitHoja = (s: string) => String(s).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

  let creadas = 0, omitidas = 0;
  const productosCreados: string[] = [];
  const clientesNoEncontrados: string[] = [];
  const errores: { archivo: string; mensaje: string }[] = [];

  for (const fac of facturas) {
    // Un archivo puede traer varias pestañas: la hoja entra en el identificador
    // para que cada despacho tenga su propio número. Si no viene hoja (archivo de
    // una sola plantilla) el número queda igual que siempre.
    const ident = fac.hoja ? `${fac.archivo} - ${fac.hoja}` : fac.archivo;
    try {
      const clienteId = findCliente(fac.cliente);
      if (!clienteId) {
        if (!clientesNoEncontrados.includes(fac.cliente)) clientesNoEncontrados.push(fac.cliente);
        errores.push({ archivo: ident, mensaje: `Cliente no encontrado: "${fac.cliente}"` });
        continue;
      }
      const numero = fac.hoja
        ? `HIST-${year}-${sanit(fac.archivo)}-${sanitHoja(fac.hoja)}`
        : `HIST-${year}-${sanit(fac.archivo)}`;
      const ya = await prisma.factura.findUnique({ where: { numero } });
      if (ya) { omitidas++; continue; }

      const lineasData: any[] = [];
      for (const l of fac.lineas) {
        const nombre = String(l.producto ?? "").trim();
        const medida = String(l.medida ?? "").trim();
        const cantidad = Number(l.cantidad) || 0;
        const monto = Number(l.monto) || 0;
        if (!nombre || cantidad <= 0 || monto <= 0) continue;

        const res = resolverProducto(nombre, medida);
        if (res.ignorar) continue;               // estantillo, codo amarillo, etc.
        let pid = res.id;
        if (!pid) {
          // Crear bajo el nombre del catálogo (traducido). Hereda categoría de la familia si existe.
          const crearNombre = res.crearNombre ?? nombre;
          const fam = catByCanon.get(_canon(crearNombre));
          const catId = fam && fam.length ? fam[0].categoriaId : catDefaultId;
          const nuevo = await prisma.producto.create({
            data: { nombre: crearNombre, medida, categoriaId: catId, origen: "EXTERNO" },
          });
          pid = nuevo.id;
          const ck = _canon(crearNombre);
          if (!catByCanon.has(ck)) catByCanon.set(ck, []);
          catByCanon.get(ck)!.push({ id: pid, medida, categoriaId: catId });
          productosCreados.push(`${crearNombre} ${medida}`);
        }
        lineasData.push({
          productoId: pid, cantidad,
          precioUnitario: cantidad > 0 ? monto / cantidad : monto,
          totalLinea: monto, origen: "EXTERNO", orden: lineasData.length,
        });
      }
      if (lineasData.length === 0) { errores.push({ archivo: ident, mensaje: "Sin productos con cantidad/monto" }); continue; }

      const totalNeto = lineasData.reduce((s, l) => s + l.totalLinea, 0);
      await prisma.factura.create({
        data: {
          numero, clienteId, fechaEmision: parseFecha(fac.fecha, ident),
          totalBruto: totalNeto, totalNeto, totalPagado: totalNeto, saldoPendiente: 0,
          estado: "COBRADA", notas: `Histórico: ${ident}`,
          lineas: { create: lineasData },
        },
      });
      creadas++;
    } catch (e: any) {
      errores.push({ archivo: ident, mensaje: e.message });
    }
  }

  res.json({ creadas, omitidas, productosCreados, clientesNoEncontrados, errores, total: facturas.length });
}

export async function actualizarNotas(req: Request, res: Response) {
  const factura = await prisma.factura.update({
    where: { id: Number(req.params.id) },
    data: { notas: req.body.notas },
  });
  res.json(factura);
}

/** Ajuste (descuento pactado) de la comisión del vendedor SOLO en esta factura.
 *  null / vacío = volver al % normal del cliente. */
export async function actualizarComisionVendedor(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { comisionTuberiaPct, comisionConexionesPct } = req.body;
  const parse = (v: any) => (v === null || v === undefined || v === "" ? null : Number(v));
  const tub = parse(comisionTuberiaPct);
  const conex = parse(comisionConexionesPct);
  if ((tub != null && (isNaN(tub) || tub < 0 || tub > 100)) || (conex != null && (isNaN(conex) || conex < 0 || conex > 100))) {
    return res.status(400).json({ error: "Los porcentajes deben estar entre 0 y 100" });
  }
  const factura = await prisma.factura.update({
    where: { id },
    data: { comisionTuberiaPctOverride: tub, comisionConexionesPctOverride: conex },
    select: { id: true, numero: true, comisionTuberiaPctOverride: true, comisionConexionesPctOverride: true },
  });
  res.json(factura);
}

export async function balanceGeneral(_req: Request, res: Response) {
  const facturas = await prisma.factura.findMany({
    where: { estado: { not: "ANULADA" } },
    include: {
      cliente: { select: { id: true, nombre: true, vendedor: { select: { id: true, nombre: true } } } },
      empresa: { select: { nombre: true } },
    },
    orderBy: { creadoEn: "desc" },
  });

  const totalEmitido = facturas.reduce((s, f) => s + Number(f.totalNeto), 0);
  const totalCobrado = facturas.reduce((s, f) => s + Number(f.totalPagado), 0);
  const totalPendiente = facturas.reduce((s, f) => s + Number(f.saldoPendiente), 0);

  res.json({ facturas, totalEmitido, totalCobrado, totalPendiente });
}

export async function listarClienteConPagos(req: Request, res: Response) {
  const facturas = await prisma.factura.findMany({
    where: { clienteId: Number(req.params.clienteId), estado: { not: "ANULADA" } },
    include: {
      cliente: { include: { vendedor: true } },
      empresa: true,
      lineas: {
        include: { producto: { include: { categoria: true } } },
        orderBy: { orden: "asc" },
      },
      pagos: {
        include: {
          pago: {
            include: { cuenta: { select: { nombre: true, moneda: true } } },
          },
        },
        orderBy: { fechaAsignacion: "asc" },
      },
    },
    orderBy: { creadoEn: "asc" },
  });
  res.json(facturas);
}

export async function eliminar(req: Request, res: Response) {
  const id = Number(req.params.id);
  const factura = await prisma.factura.findUnique({
    where: { id },
    select: { numero: true, pagos: { select: { id: true } } },
  });
  if (!factura) return res.status(404).json({ error: "Factura no encontrada" });
  // La ruta es solo-MASTER. Se permite eliminar aunque figure como cobrada.
  // Se quitan las referencias (asignaciones de pago, gastos y distribuciones) primero.
  await prisma.pagoAsignacion.deleteMany({ where: { facturaId: id } });
  await prisma.despachoGasto.deleteMany({ where: { facturaId: id } });
  await prisma.distribucionGanancia.deleteMany({ where: { facturaId: id } });
  await prisma.facturaLinea.deleteMany({ where: { facturaId: id } });
  await prisma.factura.delete({ where: { id } });
  res.json({ ok: true });
}
