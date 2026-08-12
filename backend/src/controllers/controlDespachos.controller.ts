import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { esConexion } from "./ganancias.controller";

/**
 * Control de Despachos + Deudas — una fila por despacho facturado, con las dos
 * cifras que importan en tiempo real: cuánto falta por COBRAR y cuánto se debe
 * de MATERIA PRIMA. Replica el Excel "Control Despachos + Deudas.xlsx".
 *
 * De dónde sale cada dato:
 *  - Cobros (total/abonado/pendiente): de la Factura EN VIVO.
 *  - Material (costo/abonado/deuda): de la fila "Material" del Balance y sus
 *    abonos (BalancePagoCuota) — también en vivo.
 *  - Tubería/conexiones: de las líneas de la factura, clasificadas con la misma
 *    regla del motor.
 *  - Comisión vendedor, Danny amarillo, muchachas curvas: del snapshot que el
 *    balance guarda al generarse (calculosJson), para no recalcular el motor
 *    completo por cada despacho.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function listar(req: Request, res: Response) {
  const { desde, hasta } = req.query as { desde?: string; hasta?: string };

  const despachos = await prisma.ordenDespacho.findMany({
    where: {
      facturas: { some: { estado: { not: "ANULADA" } } },
      ...(desde || hasta
        ? { fechaSalida: { ...(desde ? { gte: new Date(desde) } : {}), ...(hasta ? { lte: new Date(hasta + "T23:59:59") } : {}) } }
        : {}),
    },
    select: {
      id: true, numero: true, fechaSalida: true, chofer: true, estado: true,
      facturas: {
        where: { estado: { not: "ANULADA" } },
        select: {
          id: true, numero: true, totalNeto: true, totalPagado: true, saldoPendiente: true, estado: true,
          cliente: { select: { nombre: true, vendedor: { select: { nombre: true } } } },
          lineas: {
            select: {
              totalLinea: true,
              producto: { select: { codigo: true, nombre: true, categoria: { select: { nombre: true } } } },
            },
          },
        },
      },
      balance: {
        select: {
          id: true, calculosJson: true,
          items: {
            where: { nombre: "Material" },
            select: { id: true, montoTotal: true, cuotas: { select: { monto: true } } },
          },
        },
      },
    },
    orderBy: { fechaSalida: "desc" },
  });

  const filas = despachos.map((d) => {
    // ── Cobros (en vivo) ────────────────────────────────────────────────────
    const totalFactura = d.facturas.reduce((s, f) => s + Number(f.totalNeto), 0);
    const abonoFactura = d.facturas.reduce((s, f) => s + Number(f.totalPagado), 0);
    const pendienteFactura = d.facturas.reduce((s, f) => s + Number(f.saldoPendiente), 0);

    // ── Tubería vs conexiones (desde las líneas facturadas) ─────────────────
    let montoTuberia = 0, montoConexiones = 0;
    for (const f of d.facturas) {
      for (const l of f.lineas) {
        const monto = Number(l.totalLinea);
        if (esConexion(l.producto?.codigo ?? null, l.producto?.nombre ?? "", l.producto?.categoria?.nombre)) montoConexiones += monto;
        else montoTuberia += monto;
      }
    }

    // ── Material (en vivo, de la fila del balance) ──────────────────────────
    const itemMat = d.balance?.items[0];
    const costoMaterial = itemMat ? Number(itemMat.montoTotal) : null;
    const abonoMaterial = itemMat ? itemMat.cuotas.reduce((s, c) => s + Number(c.monto), 0) : null;
    const deudaMaterial = costoMaterial != null && abonoMaterial != null ? r2(costoMaterial - abonoMaterial) : null;

    // ── Ganancias del snapshot del balance ──────────────────────────────────
    let comisionVendedor: number | null = null, dannyAmarillo: number | null = null, muchachasCurvas: number | null = null;
    if (d.balance?.calculosJson) {
      try {
        const g = JSON.parse(d.balance.calculosJson);
        comisionVendedor = Number(g?.comisionesVendedores?.total ?? 0);
        dannyAmarillo = Number(g?.gananciaAguasNegras?.dannyAmarillo ?? 0);
        muchachasCurvas = Number(g?.curvas?.pagoMuchachas ?? 0);
      } catch { /* snapshot ilegible: se deja en null */ }
    }

    const clientes = [...new Set(d.facturas.map((f) => f.cliente?.nombre).filter(Boolean))];
    const vendedores = [...new Set(d.facturas.map((f) => f.cliente?.vendedor?.nombre).filter(Boolean))];

    return {
      despachoId: d.id, numero: d.numero, fecha: d.fechaSalida, chofer: d.chofer,
      cliente: clientes.join(" / ") || "—",
      vendedor: vendedores.join(" / ") || "—",
      facturas: d.facturas.map((f) => ({ id: f.id, numero: f.numero, estado: f.estado })),
      montoTuberia: r2(montoTuberia), montoConexiones: r2(montoConexiones),
      comisionVendedor, totalFactura: r2(totalFactura), abonoFactura: r2(abonoFactura), pendienteFactura: r2(pendienteFactura),
      costoMaterial, abonoMaterial, deudaMaterial,
      materialItemId: itemMat?.id ?? null,   // para registrar el abono desde la pantalla
      tieneBalance: !!d.balance,
      dannyAmarillo, muchachasCurvas,
    };
  });

  const suma = (campo: keyof (typeof filas)[number]) =>
    r2(filas.reduce((s, f) => s + (Number(f[campo] ?? 0) || 0), 0));

  res.json({
    filas,
    totales: {
      montoTuberia: suma("montoTuberia"), montoConexiones: suma("montoConexiones"),
      comisionVendedor: suma("comisionVendedor"),
      totalFactura: suma("totalFactura"), abonoFactura: suma("abonoFactura"), pendienteFactura: suma("pendienteFactura"),
      costoMaterial: suma("costoMaterial"), abonoMaterial: suma("abonoMaterial"), deudaMaterial: suma("deudaMaterial"),
      dannyAmarillo: suma("dannyAmarillo"), muchachasCurvas: suma("muchachasCurvas"),
      despachosSinBalance: filas.filter((f) => !f.tieneBalance).length,
    },
  });
}
