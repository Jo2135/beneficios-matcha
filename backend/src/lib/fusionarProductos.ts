// Une dos fichas del catalogo que son el mismo producto.
//
// Toda la historia (cotizaciones, despachos, facturas, devoluciones, compras)
// pasa a la ficha que se conserva, y la copia queda INACTIVA — no se borra, para
// poder rastrear de donde vino. Los planes de carga guardan ids de producto
// dentro de su JSON, asi que tambien se reescriben.
import { prisma } from "./prisma";

export interface ResultadoFusion {
  ok: boolean;
  error?: string;
  principal?: { id: number; codigo: string | null; nombre: string; medida: string };
  copia?: { id: number; nombre: string; medida: string };
  movidas: { cotizaciones: number; despachos: number; facturas: number; devoluciones: number; compras: number };
  preciosMudados: number;
  preciosDescartados: number;
  planesActualizados: number[];
}

export async function fusionarProductos(
  principalId: number,
  copiaId: number,
  opciones: { simular?: boolean } = {}
): Promise<ResultadoFusion> {
  const simular = opciones.simular === true;
  const vacio: ResultadoFusion["movidas"] = { cotizaciones: 0, despachos: 0, facturas: 0, devoluciones: 0, compras: 0 };

  if (principalId === copiaId) {
    return { ok: false, error: "Es el mismo producto.", movidas: vacio, preciosMudados: 0, preciosDescartados: 0, planesActualizados: [] };
  }
  const [pri, cop] = await Promise.all([
    prisma.producto.findUnique({ where: { id: principalId } }),
    prisma.producto.findUnique({ where: { id: copiaId } }),
  ]);
  if (!pri || !cop) {
    return { ok: false, error: "Uno de los dos productos no existe.", movidas: vacio, preciosMudados: 0, preciosDescartados: 0, planesActualizados: [] };
  }

  const movidas = {
    cotizaciones: await prisma.cotizacionLinea.count({ where: { productoId: copiaId } }),
    despachos: await prisma.despachoLinea.count({ where: { productoId: copiaId } }),
    facturas: await prisma.facturaLinea.count({ where: { productoId: copiaId } }),
    devoluciones: await prisma.facturaDevolucion.count({ where: { productoId: copiaId } }),
    compras: await prisma.compraExternaLinea.count({ where: { productoId: copiaId } }),
  };

  // Precios de lista: solo se mudan los de listas donde el principal aun no
  // tiene precio; si ya lo tiene, manda el suyo.
  const precios = await prisma.listaPrecioDetalle.findMany({ where: { productoId: copiaId } });
  const yaTiene = await prisma.listaPrecioDetalle.findMany({
    where: { productoId: principalId, listaPrecioId: { in: precios.map((p) => p.listaPrecioId) } },
    select: { listaPrecioId: true },
  });
  const ocupadas = new Set(yaTiene.map((p) => p.listaPrecioId));
  const mudar = precios.filter((p) => !ocupadas.has(p.listaPrecioId));
  const descartar = precios.filter((p) => ocupadas.has(p.listaPrecioId));

  const planes = await prisma.planCarga.findMany();
  const planesActualizados: number[] = [];
  for (const pl of planes) {
    const prods: { id: number; costo: number }[] = JSON.parse(pl.productosJson || "[]");
    if (!prods.some((x) => x.id === copiaId)) continue;
    planesActualizados.push(pl.id);
    if (simular) continue;

    const nuevos = prods.filter((x) => x.id !== copiaId);
    if (!nuevos.some((x) => x.id === principalId)) {
      const viejo = prods.find((x) => x.id === copiaId)!;
      nuevos.push({ id: principalId, costo: viejo.costo });
    }
    const remap = (json: string, sumar: boolean) => {
      const obj: Record<string, number> = JSON.parse(json || "{}");
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(obj)) {
        const [cli, pro] = k.split("_");
        if (Number(pro) !== copiaId) { out[k] = v; continue; }
        const nk = cli + "_" + principalId;
        out[nk] = sumar ? Number(out[nk] ?? 0) + Number(v) : (out[nk] ?? v);
      }
      return JSON.stringify(out);
    };
    await prisma.planCarga.update({
      where: { id: pl.id },
      data: {
        productosJson: JSON.stringify(nuevos),
        cantidadesJson: remap(pl.cantidadesJson, true),
        preciosJson: remap(pl.preciosJson, false),
      },
    });
  }

  if (!simular) {
    await prisma.$transaction(async (tx) => {
      await tx.cotizacionLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
      await tx.despachoLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
      await tx.facturaLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
      await tx.facturaDevolucion.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
      await tx.compraExternaLinea.updateMany({ where: { productoId: copiaId }, data: { productoId: principalId } });
      for (const p of mudar) await tx.listaPrecioDetalle.update({ where: { id: p.id }, data: { productoId: principalId } });
      for (const p of descartar) await tx.listaPrecioDetalle.delete({ where: { id: p.id } });
      await tx.producto.update({
        where: { id: copiaId },
        data: {
          activo: false,
          descripcion: "Unificado con #" + principalId + " (" + (pri.codigo ?? pri.nombre) + ") el " +
            new Date().toISOString().slice(0, 10),
        },
      });
    });
  }

  return {
    ok: true,
    principal: { id: pri.id, codigo: pri.codigo, nombre: pri.nombre, medida: pri.medida },
    copia: { id: cop.id, nombre: cop.nombre, medida: cop.medida },
    movidas,
    preciosMudados: mudar.length,
    preciosDescartados: descartar.length,
    planesActualizados,
  };
}
