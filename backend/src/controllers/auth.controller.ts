import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generarToken } from "../middleware/auth";

function sinPassword(u: any) {
  const { passwordHash: _, ...rest } = u;
  return rest;
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  const identificador = email.toLowerCase().trim();
  // Buscar por email si tiene @, de lo contrario buscar por nombre
  const usuario = identificador.includes("@")
    ? await prisma.usuario.findUnique({
        where: { email: identificador },
        include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
      })
    : await prisma.usuario.findFirst({
        where: { nombre: { equals: email.trim(), mode: "insensitive" } },
        include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
      });

  if (!usuario || !usuario.activo) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const passwordOk = await bcrypt.compare(password, usuario.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcceso: new Date() },
  });

  const token = generarToken({
    id: usuario.id,
    rol: usuario.rol,
    vendedorId: usuario.vendedorId,
    nombre: usuario.nombre,
  });

  res.json({
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      vendedorId: usuario.vendedorId,
      vendedor: usuario.vendedor,
    },
  });
}

export async function me(req: Request, res: Response) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.usuario!.id },
    include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
  });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(sinPassword(usuario));
}

export async function listarUsuarios(req: Request, res: Response) {
  const usuarios = await prisma.usuario.findMany({
    include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
    orderBy: { nombre: "asc" },
  });
  res.json(usuarios.map(sinPassword));
}

export async function listarVendedores(req: Request, res: Response) {
  const vendedores = await prisma.vendedor.findMany({
    where: { activo: true },
    select: { id: true, nombre: true, comisionPct: true },
    orderBy: { nombre: "asc" },
  });
  res.json(vendedores);
}

export async function actualizarComision(req: Request, res: Response) {
  const usuarioId = Number(req.params.id);
  const { comisionPct } = req.body;

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { vendedorId: true },
  });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
  if (!usuario.vendedorId) return res.status(400).json({ error: "El usuario no está vinculado a un vendedor" });

  const vendedor = await prisma.vendedor.update({
    where: { id: usuario.vendedorId },
    data: { comisionPct: Number(comisionPct) },
  });
  res.json({ comisionPct: vendedor.comisionPct });
}

export async function crearUsuario(req: Request, res: Response) {
  const { nombre, email, password, rol, vendedorId } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Nombre, email y contraseña son requeridos" });
  }

  if (rol === "MASTER" && req.usuario?.rol !== "MASTER") {
    return res.status(403).json({ error: "Solo el usuario Master puede crear otro Master" });
  }

  const existe = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existe) {
    return res.status(409).json({ error: "Ya existe un usuario con ese email" });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Si es VENDEDOR y no se vincula a uno existente, reutilizar un vendedor activo
  // sin usuario con el mismo nombre (evita duplicados) o crear uno nuevo.
  let vendedorIdFinal: number | null = vendedorId ? Number(vendedorId) : null;
  if ((rol === "VENDEDOR" || !rol) && !vendedorIdFinal) {
    const existente = await prisma.vendedor.findFirst({
      where: { nombre: { equals: String(nombre).trim(), mode: "insensitive" }, activo: true, usuario: { is: null } },
    });
    if (existente) {
      vendedorIdFinal = existente.id;
    } else {
      const nuevoVendedor = await prisma.vendedor.create({ data: { nombre } });
      vendedorIdFinal = nuevoVendedor.id;
    }
  }

  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      email: email.toLowerCase().trim(),
      passwordHash,
      rol: rol || "VENDEDOR",
      vendedorId: vendedorIdFinal,
    },
    include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
  });

  res.status(201).json(sinPassword(usuario));
}

export async function vincularVendedor(req: Request, res: Response) {
  const usuarioId = Number(req.params.id);

  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { nombre: true, rol: true, vendedorId: true },
  });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
  if (usuario.vendedorId) return res.status(400).json({ error: "El usuario ya tiene un vendedor vinculado" });

  // Reutilizar un vendedor activo sin usuario con el mismo nombre (evita duplicados) o crear uno nuevo
  let vendedor = await prisma.vendedor.findFirst({
    where: { nombre: { equals: usuario.nombre.trim(), mode: "insensitive" }, activo: true, usuario: { is: null } },
  });
  if (!vendedor) {
    vendedor = await prisma.vendedor.create({ data: { nombre: usuario.nombre } });
  }
  const actualizado = await prisma.usuario.update({
    where: { id: usuarioId },
    data: { vendedorId: vendedor.id },
    include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
  });
  res.json(sinPassword(actualizado));
}

export async function cambiarPassword(req: Request, res: Response) {
  const { passwordActual, passwordNuevo } = req.body;
  const usuarioId = Number(req.params.id);

  if (req.usuario!.id !== usuarioId && req.usuario!.rol !== "MASTER") {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  if (req.usuario!.rol !== "MASTER" || req.usuario!.id === usuarioId) {
    const ok = await bcrypt.compare(passwordActual, usuario.passwordHash);
    if (!ok) return res.status(400).json({ error: "Contraseña actual incorrecta" });
  }

  const passwordHash = await bcrypt.hash(passwordNuevo, 12);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { passwordHash } });
  res.json({ ok: true });
}

export async function actualizarUsuario(req: Request, res: Response) {
  const id = Number(req.params.id);
  const { nombre, email, rol, vendedorId, password } = req.body;

  const data: any = {};
  if (nombre)  data.nombre = nombre;
  if (email)   data.email  = email;
  if (rol)     data.rol    = rol;
  data.vendedorId = vendedorId ? Number(vendedorId) : null;
  if (password && password.length >= 6) {
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  try {
    const usuario = await prisma.usuario.update({
      where: { id },
      data,
      include: { vendedor: { select: { id: true, nombre: true, comisionPct: true } } },
    });
    res.json(sinPassword(usuario));
  } catch (e: any) {
    if (e.code === "P2002") return res.status(400).json({ error: "Ese email/usuario ya está en uso" });
    res.status(500).json({ error: e.message });
  }
}

export async function toggleActivo(req: Request, res: Response) {
  const usuario = await prisma.usuario.update({
    where: { id: Number(req.params.id) },
    data: { activo: req.body.activo },
  });
  res.json(sinPassword(usuario));
}

export async function setup(req: Request, res: Response) {
  const count = await prisma.usuario.count();
  if (count > 0) {
    return res.status(403).json({ error: "El sistema ya fue configurado" });
  }

  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Nombre, email y contraseña requeridos" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const usuario = await prisma.usuario.create({
    data: { nombre, email: email.toLowerCase().trim(), passwordHash, rol: "MASTER" },
  });

  const token = generarToken({
    id: usuario.id,
    rol: usuario.rol,
    vendedorId: null,
    nombre: usuario.nombre,
  });

  res.status(201).json({ token, usuario: sinPassword(usuario) });
}
