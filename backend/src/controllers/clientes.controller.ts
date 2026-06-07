import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

export async function listar(req: Request, res: Response) {
  const usuario = req.usuario!;
  const where: any = { activo: true };
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId) {
    where.vendedorId = usuario.vendedorId;
  }
  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      vendedor: { select: { id: true, nombre: true } },
      listaPrecio: { select: { id: true, nombre: true } },
    },
    orderBy: { nombre: "asc" },
  });
  res.json(clientes);
}

export async function buscar(req: Request, res: Response) {
  const { q } = req.query;
  const usuario = req.usuario!;
  const where: any = {
    activo: true,
    nombre: { contains: String(q || ""), mode: "insensitive" },
  };
  if (usuario.rol === "VENDEDOR" && usuario.vendedorId) {
    where.vendedorId = usuario.vendedorId;
  }
  const clientes = await prisma.cliente.findMany({
    where,
    include: {
      vendedor: { select: { id: true, nombre: true } },
      listaPrecio: { select: { id: true, nombre: true } },
    },
    take: 10,
    orderBy: { nombre: "asc" },
  });
  res.json(clientes);
}

export async function obtener(req: Request, res: Response) {
  const cliente = await prisma.cliente.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      vendedor: true,
      listaPrecio: {
        include: {
          detalle: { include: { producto: true } },
        },
      },
    },
  });
  if (!cliente) return res.status(404).json({ error: "Cliente no encontrado" });
  res.json(cliente);
}

export async function actualizar(req: Request, res: Response) {
  try {
    const { nombre, rif, telefono, direccion, empresaFactura, diasCredito,
            fleteTuberiaPct, fleteConexionesPct, comisionTuberiaPct, comisionConexionesPct,
            condicionPago, observaciones, vendedorId, listaPrecioId } = req.body;
    console.log("[actualizar cliente]", req.params.id, { nombre, fleteTuberiaPct, fleteConexionesPct, comisionTuberiaPct, comisionConexionesPct });
    const cliente = await prisma.cliente.update({
      where: { id: Number(req.params.id) },
      data: { nombre, rif, telefono, direccion, empresaFactura, diasCredito: Number(diasCredito) || 0,
              fleteTuberiaPct, fleteConexionesPct, comisionTuberiaPct, comisionConexionesPct,
              condicionPago, observaciones, vendedorId: vendedorId || null, listaPrecioId: listaPrecioId || null },
    });
    res.json(cliente);
  } catch (e: any) {
    console.error("[error actualizar cliente]", e.message);
    res.status(500).json({ error: e.message });
  }
}

export async function crear(req: Request, res: Response) {
  try {
    const { nombre, rif, telefono, direccion, empresaFactura, diasCredito,
            fleteTuberiaPct, fleteConexionesPct, comisionTuberiaPct, comisionConexionesPct,
            condicionPago, observaciones, vendedorId, listaPrecioId } = req.body;
    const cliente = await prisma.cliente.create({
      data: { nombre, rif, telefono, direccion, empresaFactura, diasCredito: Number(diasCredito) || 0,
              fleteTuberiaPct, fleteConexionesPct, comisionTuberiaPct, comisionConexionesPct,
              condicionPago, observaciones, vendedorId: vendedorId || null, listaPrecioId: listaPrecioId || null },
    });
    res.status(201).json(cliente);
  } catch (e: any) {
    console.error("[error crear cliente]", e.message);
    // Unique constraint: nombre o RIF duplicado
    if (e.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un cliente con ese nombre o RIF. Verifica los datos e intenta de nuevo." });
    }
    res.status(500).json({ error: e.message });
  }
}

export async function eliminar(req: Request, res: Response) {
  await prisma.cliente.update({
    where: { id: Number(req.params.id) },
    data: { activo: false },
  });
  res.status(204).send();
}
