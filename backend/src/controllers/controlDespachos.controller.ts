import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { esConexion, calcularGananciasDespacho } from "./ganancias.controller";

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
 *  - Total de Danny: Danny cobra por tres vias distintas en un mismo despacho
 *    (comision como vendedor, Comision 2, y su 33% del amarillo). Antes solo se
 *    veia el amarillo y habia que entrar al balance para armar el resto a mano.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

// Nombres de los renglones del balance que esta pantalla lee. Tienen que
// coincidir con los que escribe balance.controller al generar el balance.
const RENGLON_MATERIAL = "Material";
const RENGLON_CAPITAL = "40% Capital";

/** Quita tildes, mayusculas y espacios: "Comisión 2" -> "comision2". */
const clave = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");

const esDanny = (nombre?: string | null) => clave(nombre ?? "").includes("danny");

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
      conceptosExtra: { select: { nombre: true, monto: true } },
      balance: {
        select: {
          id: true, calculosJson: true,
          items: {
            where: { nombre: { in: [RENGLON_MATERIAL, RENGLON_CAPITAL] } },
            select: { id: true, nombre: true, montoTotal: true, cuotas: { select: { monto: true } } },
          },
        },
      },
    },
    orderBy: { fechaSalida: "desc" },
  });

  // Gastos operativos ya repartidos: cuentan como abono del renglón, igual que
  // una cuota (ver gastosOperativos.controller.ts).
  const asignados = await prisma.gastoOperativoAsignacion.groupBy({
    by: ["ordenDespachoId", "renglon"],
    _sum: { monto: true },
  });
  const gastoDe = (despachoId: number, renglon: string) =>
    Number(asignados.find((a) => a.ordenDespachoId === despachoId && a.renglon === renglon)?._sum.monto ?? 0);

  // El Capital (40% de la ganancia general) es un gasto fijo que nace al cerrar
  // el despacho: no hace falta esperar a que se genere el balance. Para los
  // despachos que todavía no lo tienen, se calcula al vuelo con el motor.
  const capitalSinBalance = new Map<number, number>();
  for (const d of despachos) {
    if (d.balance) continue;
    try {
      const g: any = await calcularGananciasDespacho(d.id);
      if (g) capitalSinBalance.set(d.id, Number(g.gananciaGeneral?.capital ?? 0));
    } catch { /* si el motor no puede con ese despacho, queda en 0 */ }
  }

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
    const itemMat = d.balance?.items.find((i) => i.nombre === RENGLON_MATERIAL);
    const costoMaterial = itemMat ? Number(itemMat.montoTotal) : null;
    const abonoMaterial = itemMat
      ? r2(itemMat.cuotas.reduce((s, c) => s + Number(c.monto), 0) + gastoDe(d.id, RENGLON_MATERIAL))
      : null;
    const deudaMaterial = costoMaterial != null && abonoMaterial != null ? r2(costoMaterial - abonoMaterial) : null;

    // ── Capital disponible ─────────────────────────────────────────────────
    // Generado = el 40% Capital del balance; si no hay balance, el calculado al
    // vuelo. Usado = lo que ya se abonó de ese renglón más los gastos
    // operativos que se le repartieron.
    const itemCap = d.balance?.items.find((i) => i.nombre === RENGLON_CAPITAL);
    const capitalGenerado = r2(itemCap ? Number(itemCap.montoTotal) : (capitalSinBalance.get(d.id) ?? 0));
    const capitalUsado = r2(
      (itemCap ? itemCap.cuotas.reduce((s, c) => s + Number(c.monto), 0) : 0) + gastoDe(d.id, RENGLON_CAPITAL),
    );
    const capitalDisponible = r2(capitalGenerado - capitalUsado);

    // ── Ganancias del snapshot del balance ──────────────────────────────────
    let comisionVendedor: number | null = null, dannyAmarillo: number | null = null, muchachasCurvas: number | null = null;
    let dannyComision = 0;
    if (d.balance?.calculosJson) {
      try {
        const g = JSON.parse(d.balance.calculosJson);
        comisionVendedor = Number(g?.comisionesVendedores?.total ?? 0);
        dannyAmarillo = Number(g?.gananciaAguasNegras?.dannyAmarillo ?? 0);
        muchachasCurvas = Number(g?.curvas?.pagoMuchachas ?? 0);
        // De la comision de vendedores, solo la parte que le toca a Danny: un
        // despacho puede llevar clientes de varios vendedores.
        for (const det of (g?.comisionesVendedores?.detalle ?? []) as any[]) {
          if (esDanny(det?.vendedorNombre)) dannyComision += Number(det?.monto) || 0;
        }
      } catch { /* snapshot ilegible: se deja en null */ }
    }

    // ── Todo lo que suma Danny en este despacho ─────────────────────────────
    // La Comision 2 se le cuenta solo cuando Danny es vendedor de alguna de las
    // facturas del despacho: asi nunca se le acredita la de un despacho ajeno.
    const dannyEsVendedor = d.facturas.some((f) => esDanny(f.cliente?.vendedor?.nombre));
    const dannyComision2 = dannyEsVendedor
      ? d.conceptosExtra
          .filter((c) => clave(c.nombre).includes("comision2"))
          .reduce((s, c) => s + (Number(c.monto) || 0), 0)
      : 0;
    const dannyTotal = d.balance
      ? r2(dannyComision + dannyComision2 + (dannyAmarillo ?? 0))
      : null;

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
      capitalGenerado, capitalUsado, capitalDisponible,
      capitalSinBalance: !d.balance,         // se calculó al vuelo, no viene del balance
      tieneBalance: !!d.balance,
      dannyAmarillo, muchachasCurvas,
      dannyComision: d.balance ? r2(dannyComision) : null,
      dannyComision2: d.balance ? r2(dannyComision2) : null,
      dannyTotal,
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
      capitalGenerado: suma("capitalGenerado"), capitalUsado: suma("capitalUsado"), capitalDisponible: suma("capitalDisponible"),
      dannyAmarillo: suma("dannyAmarillo"), muchachasCurvas: suma("muchachasCurvas"),
      dannyComision: suma("dannyComision"), dannyComision2: suma("dannyComision2"), dannyTotal: suma("dannyTotal"),
      despachosSinBalance: filas.filter((f) => !f.tieneBalance).length,
    },
  });
}
