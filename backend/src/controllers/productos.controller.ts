import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { buscarSimilares, puntaje, pareceBasura, ProductoLike } from "../lib/similitudProductos";

export async function listar(req: Request, res: Response) {
  const { categoria, origen } = req.query;
  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      ...(categoria ? { categoriaId: Number(categoria) } : {}),
      ...(origen ? { origen: origen as any } : {}),
    },
    include: { categoria: true },
    orderBy: [{ categoria: { nombre: "asc" } }, { nombre: "asc" }],
  });
  res.json(productos);
}

export async function buscar(req: Request, res: Response) {
  const { q } = req.query;
  const productos = await prisma.producto.findMany({
    where: {
      activo: true,
      OR: [
        { codigo: { contains: String(q || ""), mode: "insensitive" } },
        { nombre: { contains: String(q || ""), mode: "insensitive" } },
        { medida: { contains: String(q || ""), mode: "insensitive" } },
      ],
    },
    include: { categoria: true },
    take: 20,
    orderBy: { nombre: "asc" },
  });
  res.json(productos);
}

export async function obtener(req: Request, res: Response) {
  const producto = await prisma.producto.findUnique({
    where: { id: Number(req.params.id) },
    include: { categoria: true },
  });
  if (!producto) return res.status(404).json({ error: "Producto no encontrado" });
  res.json(producto);
}

export async function crear(req: Request, res: Response) {
  const { nombre, codigo, medida, origen, categoriaId, pesoUnitarioKg, costoCompra, descripcion, activo, imagenUrl, confirmarDuplicado } = req.body;

  // Filas que no son productos (un numero suelto, "Material gastado",
  // "Ganancia Sr Alberto"): entraron por importaciones viejas y no deben
  // volver a colarse al catalogo.
  const basura = pareceBasura({ nombre, medida });
  if (basura) {
    return res.status(400).json({ error: `"${nombre}" no parece un producto: ${basura}.` });
  }

  // Antes de crear, revisar si el mismo producto ya existe con otro nombre. Se
  // responde 409 con los candidatos: el frontend pregunta y reenvia con
  // confirmarDuplicado si de verdad es un producto distinto.
  if (!confirmarDuplicado) {
    const catalogo = await prisma.producto.findMany({
      select: { id: true, codigo: true, nombre: true, medida: true, activo: true },
    });
    const similares = buscarSimilares({ nombre, medida }, catalogo, 70);
    if (similares.length) {
      return res.status(409).json({
        error: "Ya existe un producto muy parecido en el catalogo.",
        codigoError: "PRODUCTO_SIMILAR",
        similares,
      });
    }
  }

  const producto = await prisma.producto.create({
    data: {
      nombre,
      codigo: codigo ?? null,
      medida,
      origen: origen ?? "INTERNO",
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      pesoUnitarioKg: pesoUnitarioKg !== undefined ? pesoUnitarioKg : undefined,
      costoCompra: costoCompra !== undefined && costoCompra !== null && costoCompra !== "" ? Number(costoCompra) : null,
      descripcion: descripcion ?? null,
      activo: activo ?? true,
      imagenUrl: imagenUrl ?? null,
    },
    include: { categoria: true },
  });
  res.status(201).json(producto);
}

export async function actualizar(req: Request, res: Response) {
  // Extraer solo los campos planos — excluir relaciones anidadas (categoria, etc.)
  const { nombre, codigo, medida, origen, categoriaId, pesoUnitarioKg, costoCompra, descripcion, activo, imagenUrl } = req.body;
  const codigoNorm = codigo ? String(codigo).trim().toUpperCase() : null;
  try {
    // Validar código duplicado con mensaje claro (en vez de un 409 críptico)
    if (codigoNorm) {
      const enUso = await prisma.producto.findFirst({
        where: { codigo: codigoNorm, id: { not: Number(req.params.id) } },
        select: { nombre: true, medida: true },
      });
      if (enUso) {
        return res.status(409).json({
          error: `El código "${codigoNorm}" ya lo usa otro producto: ${enUso.nombre} ${enUso.medida}. Usa un código distinto o revisa si es un producto duplicado.`,
        });
      }
    }
    const producto = await prisma.producto.update({
      where: { id: Number(req.params.id) },
      data: {
        nombre,
        codigo: codigoNorm,
        medida,
        origen,
        categoriaId: categoriaId ? Number(categoriaId) : undefined,
        pesoUnitarioKg: pesoUnitarioKg !== undefined ? pesoUnitarioKg : undefined,
        costoCompra: costoCompra !== undefined && costoCompra !== null && costoCompra !== "" ? Number(costoCompra) : null,
        descripcion: descripcion ?? null,
        activo,
        imagenUrl: imagenUrl ?? null,
      },
      include: { categoria: true },
    });
    res.json(producto);
  } catch (e: any) {
    if (e.code === "P2002") {
      return res.status(409).json({ error: `El código "${codigoNorm}" ya está en uso por otro producto.` });
    }
    res.status(500).json({ error: e.message });
  }
}

export async function eliminar(req: Request, res: Response) {
  await prisma.producto.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  res.status(204).send();
}

/**
 * Importación masiva desde Excel — ENFOCADA EN EL CÓDIGO.
 * Cada fila: { codigo, nombre, medida, categoria, origen?, pesoUnitarioKg?, descripcion? }
 * - SOLO se procesan filas que tengan código (las demás se omiten en silencio).
 * - Si el código ya existe en la BD → actualiza ese producto.
 * - Si el código no existe → crea uno nuevo.
 */
export async function importar(req: Request, res: Response) {
  const filas: {
    codigo?: string;
    nombre: string;
    medida: string;
    categoria: string;
    origen?: string;
    pesoUnitarioKg?: number;
    costoCompra?: number;
    descripcion?: string;
  }[] = req.body;

  if (!Array.isArray(filas) || filas.length === 0) {
    return res.status(400).json({ error: "No hay filas para importar" });
  }

  // Cargar categorías para resolver por nombre
  const categorias = await prisma.categoriaCosto.findMany();
  const catMap = new Map(categorias.map((c) => [c.nombre.toLowerCase().trim(), c.id]));

  const creados: string[] = [];
  const actualizados: string[] = [];
  const errores: { fila: number; mensaje: string }[] = [];
  let omitidasSinCodigo = 0;

  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const numFila = i + 2; // referencia aproximada de fila

    const codigo = fila.codigo ? String(fila.codigo).trim().toUpperCase() || null : null;

    // ENFOQUE EN CÓDIGO: sin código → se omite (no es error)
    if (!codigo) {
      omitidasSinCodigo++;
      continue;
    }

    const nombre = String(fila.nombre ?? "").trim();
    const medida = String(fila.medida ?? "").trim();
    const categoriaNombre = String(fila.categoria ?? "").trim().toLowerCase();

    if (!nombre) {
      errores.push({ fila: numFila, mensaje: `Código ${codigo}: falta el nombre del producto` });
      continue;
    }

    const categoriaId = catMap.get(categoriaNombre);
    if (!categoriaId) {
      errores.push({ fila: numFila, mensaje: `Código ${codigo}: categoría "${fila.categoria}" no existe. Disponibles: ${[...catMap.keys()].join(", ")}` });
      continue;
    }

    const origen = (fila.origen ?? "INTERNO").toString().toUpperCase() === "EXTERNO" ? "EXTERNO" : "INTERNO";
    const pesoUnitarioKg = fila.pesoUnitarioKg ? Number(fila.pesoUnitarioKg) : null;
    const costoCompra = fila.costoCompra ? Number(fila.costoCompra) : null;
    const descripcion = fila.descripcion ? String(fila.descripcion).trim() || null : null;

    try {
      // Buscar SOLO por código
      const existente = await prisma.producto.findFirst({ where: { codigo } });

      if (existente) {
        await prisma.producto.update({
          where: { id: existente.id },
          // costoCompra: solo lo sobreescribe si la fila trae valor (no borra el existente)
          data: { nombre, medida, codigo, categoriaId, origen: origen as any, pesoUnitarioKg,
                  ...(costoCompra !== null ? { costoCompra } : {}), descripcion, activo: true },
        });
        actualizados.push(`${codigo} — ${nombre} ${medida}`);
      } else {
        await prisma.producto.create({
          data: { nombre, medida, codigo, categoriaId, origen: origen as any, pesoUnitarioKg, costoCompra, descripcion },
        });
        creados.push(`${codigo} — ${nombre} ${medida}`);
      }
    } catch (e: any) {
      errores.push({ fila: numFila, mensaje: `Código ${codigo}: ${e.message}` });
    }
  }

  res.json({
    creados: creados.length,
    actualizados: actualizados.length,
    omitidasSinCodigo,
    errores,
    total: filas.length,
  });
}

// POST /productos/similares — chequeo en vivo mientras se escribe el formulario.
export async function similares(req: Request, res: Response) {
  const { nombre, medida, id } = req.body as { nombre?: string; medida?: string; id?: number };
  if (!nombre || String(nombre).trim().length < 3) return res.json({ similares: [] });
  const catalogo = await prisma.producto.findMany({
    select: { id: true, codigo: true, nombre: true, medida: true, activo: true },
  });
  res.json({ similares: buscarSimilares({ id, nombre, medida }, catalogo, 70) });
}

// GET /productos/duplicados — auditoria del catalogo completo.
// Agrupa por clique (todos contra todos) para no encadenar productos que solo
// se parecen de a pares, e informa cuanto se usa cada registro para saber cual
// conviene conservar.
export async function duplicados(_req: Request, res: Response) {
  const prods = await prisma.producto.findMany({
    orderBy: { id: "asc" },
    include: { categoria: { select: { nombre: true } } },
  });

  const uso = new Map<number, number>();
  for (const t of ["cotizacionLinea", "despachoLinea", "facturaLinea"] as const) {
    const g = await (prisma as any)[t].groupBy({ by: ["productoId"], _count: { _all: true } });
    for (const r of g) uso.set(r.productoId, (uso.get(r.productoId) ?? 0) + r._count._all);
  }
  const pd = await prisma.listaPrecioDetalle.groupBy({ by: ["productoId"], _count: { _all: true } });
  const enListas = new Map(pd.map((p) => [p.productoId, p._count._all]));

  const pt = new Map<string, number>();
  const pares: { a: number; b: number; pt: number; motivos: string[] }[] = [];
  for (let i = 0; i < prods.length; i++) {
    for (let j = i + 1; j < prods.length; j++) {
      const r = puntaje(prods[i] as ProductoLike, prods[j] as ProductoLike);
      if (r.puntaje >= 70) {
        pares.push({ a: prods[i].id, b: prods[j].id, pt: r.puntaje, motivos: r.motivos });
        pt.set(prods[i].id + "-" + prods[j].id, r.puntaje);
        pt.set(prods[j].id + "-" + prods[i].id, r.puntaje);
      }
    }
  }
  const compat = (x: number, y: number) => (pt.get(x + "-" + y) ?? 0) >= 70;
  const asignado = new Set<number>();
  const grupos: any[] = [];
  for (const par of [...pares].sort((a, b) => b.pt - a.pt)) {
    if (asignado.has(par.a) || asignado.has(par.b)) continue;
    const ids = [par.a, par.b];
    for (const p of prods) {
      if (asignado.has(p.id) || ids.includes(p.id)) continue;
      if (ids.every((g) => compat(g, p.id))) ids.push(p.id);
    }
    ids.forEach((g) => asignado.add(g));
    const det = ids
      .map((id) => {
        const p = prods.find((x) => x.id === id)!;
        return {
          id, codigo: p.codigo, nombre: p.nombre, medida: p.medida, activo: p.activo,
          categoria: p.categoria.nombre,
          usos: uso.get(id) ?? 0, listas: enListas.get(id) ?? 0,
        };
      })
      .sort((a, b) => b.usos - a.usos || b.listas - a.listas);
    grupos.push({ motivos: par.motivos, principal: det[0].id, productos: det });
  }
  grupos.sort((a, b) => b.productos[0].usos - a.productos[0].usos);

  const basura = prods
    .map((p) => ({ p, motivo: pareceBasura(p as ProductoLike) }))
    .filter((x) => x.motivo)
    .map((x) => ({
      id: x.p.id, nombre: x.p.nombre, medida: x.p.medida, activo: x.p.activo,
      usos: uso.get(x.p.id) ?? 0, motivo: x.motivo,
    }));

  res.json({ totalProductos: prods.length, grupos, basura });
}
