import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

/**
 * Cuánto hay pedido de lo que se fabrica/compra aparte: curvas, niples y conexiones.
 * Se arma sobre las cotizaciones, no sobre los despachos, porque la pregunta es
 * "¿qué me falta por hacer/comprar?" y eso nace del pedido del cliente.
 */

export type Grupo = "curvas" | "niples" | "conexiones";
export const GRUPOS: Grupo[] = ["curvas", "niples", "conexiones"];

const ESTADOS_VALIDOS = ["BORRADOR", "ENVIADA", "APROBADA", "EN_DESPACHO", "COMPLETADA", "RECHAZADA", "VENCIDA"] as const;
type Estado = (typeof ESTADOS_VALIDOS)[number];

const norm = (s: string) =>
  String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

type ProdClasif = {
  codigo: string | null;
  nombre: string;
  origen: string;
  categoria: { nombre: string };
};

/**
 * A qué grupo pertenece un producto. Devuelve null si no es ninguno de los tres.
 *
 * Conexiones: las que se COMPRAN. Ecoplast fabrica internamente algunos codos
 * (CODO 90° 2" y 4"), y esos están marcados origen=INTERNO en el catálogo, así que
 * quedan fuera solos — no hay lista de excepciones que mantener.
 * Ojo: no vale usar "todo lo EXTERNO", porque la categoría Externo mezcla
 * conexiones con tubos y mangueras compradas.
 */
export function grupoDeProducto(p: ProdClasif): Grupo | null {
  const n = norm(p.nombre);
  const cod = String(p.codigo ?? "").toUpperCase();
  if (cod.startsWith("CVBL") || cod.startsWith("CVNG") || n.includes("curva")) return "curvas";
  if (cod.startsWith("NI-") || n.includes("niple")) return "niples";
  if (p.categoria?.nombre === "Conexiones" && p.origen === "EXTERNO") return "conexiones";
  return null;
}

type Pedido = { cliente: string; vendedor: string | null; numero: string; estado: string; fecha: Date; cantidad: number };
type Item = { productoId: number; codigo: string | null; nombre: string; medida: string; cantidad: number; pedidos: Pedido[] };

export async function demandaPedidos(req: Request, res: Response) {
  // El permiso se lee de la base, no del token: así marcar/desmarcar la casilla
  // surte efecto de una vez, sin que la persona tenga que volver a entrar.
  const u = await prisma.usuario.findUnique({
    where: { id: req.usuario!.id },
    select: { rol: true, puedeVerCurvas: true },
  });
  if (!u) return res.status(401).json({ error: "No autorizado" });

  const esAdmin = u.rol === "MASTER" || u.rol === "ADMIN";
  if (!esAdmin && !u.puedeVerCurvas) {
    return res.status(403).json({ error: "Sin permisos para ver los pedidos de producción" });
  }
  const permitidos: Grupo[] = esAdmin ? GRUPOS : ["curvas"];

  const pedidos = String(req.query.estados ?? "APROBADA")
    .split(",").map((s) => s.trim().toUpperCase())
    .filter((s): s is Estado => (ESTADOS_VALIDOS as readonly string[]).includes(s));
  const estados: Estado[] = pedidos.length > 0 ? pedidos : ["APROBADA"];

  const cotizaciones = await prisma.cotizacion.findMany({
    where: { estado: { in: estados } },
    select: {
      numero: true, estado: true, creadoEn: true,
      cliente: { select: { nombre: true } },
      vendedor: { select: { nombre: true } },
      lineas: {
        select: {
          cantidad: true,
          producto: {
            select: {
              id: true, codigo: true, nombre: true, medida: true, origen: true,
              categoria: { select: { nombre: true } },
            },
          },
        },
      },
    },
    orderBy: { creadoEn: "desc" },
  });

  const acum: Record<Grupo, Map<number, Item>> = { curvas: new Map(), niples: new Map(), conexiones: new Map() };

  for (const cot of cotizaciones) {
    for (const l of cot.lineas) {
      const p = l.producto;
      const g = grupoDeProducto(p);
      if (!g || !permitidos.includes(g)) continue;
      const cant = Number(l.cantidad);
      if (!(cant > 0)) continue;

      const mapa = acum[g];
      if (!mapa.has(p.id)) {
        mapa.set(p.id, { productoId: p.id, codigo: p.codigo, nombre: p.nombre, medida: p.medida, cantidad: 0, pedidos: [] });
      }
      const item = mapa.get(p.id)!;
      item.cantidad += cant;
      item.pedidos.push({
        cliente: cot.cliente.nombre,
        vendedor: cot.vendedor?.nombre ?? null,
        numero: cot.numero,
        estado: cot.estado,
        fecha: cot.creadoEn,
        cantidad: cant,
      });
    }
  }

  const armar = (g: Grupo) => {
    const items = [...acum[g].values()].sort((a, b) => b.cantidad - a.cantidad);
    return { total: items.reduce((s, i) => s + i.cantidad, 0), items };
  };

  res.json({
    estados,
    puedeVer: permitidos,
    grupos: Object.fromEntries(permitidos.map((g) => [g, armar(g)])),
  });
}
