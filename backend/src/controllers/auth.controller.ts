import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { generarToken } from "../middleware/auth";

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email y contraseña requeridos" });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase().trim() },
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
    omit: { passwordHash: true },
  });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });
  res.json(usuario);
}

export async function listarUsuarios(req: Request, res: Response) {
  const usuarios = await prisma.usuario.findMany({
    include: { vendedor: { select: { id: true, nombre: true } } },
    omit: { passwordHash: true },
    orderBy: { nombre: "asc" },
  });
  res.json(usuarios);
}

export async function crearUsuario(req: Request, res: Response) {
  const { nombre, email, password, rol, vendedorId } = req.body;

  if (!nombre || !email || !password) {
    return res.status(400).json({ error: "Nombre, email y contraseña son requeridos" });
  }

  // Solo MASTER puede crear MASTER. ADMIN puede crear ADMIN y VENDEDOR.
  if (rol === "MASTER" && req.usuario?.rol !== "MASTER") {
    return res.status(403).json({ error: "Solo el usuario Master puede crear otro Master" });
  }

  const existe = await prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existe) {
    return res.status(409).json({ error: "Ya existe un usuario con ese email" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const usuario = await prisma.usuario.create({
    data: {
      nombre,
      email: email.toLowerCase().trim(),
      passwordHash,
      rol: rol || "VENDEDOR",
      vendedorId: vendedorId || null,
    },
    omit: { passwordHash: true },
  });

  res.status(201).json(usuario);
}

export async function cambiarPassword(req: Request, res: Response) {
  const { passwordActual, passwordNuevo } = req.body;
  const usuarioId = Number(req.params.id);

  // Solo el propio usuario o el MASTER puede cambiar contraseña
  if (req.usuario!.id !== usuarioId && req.usuario!.rol !== "MASTER") {
    return res.status(403).json({ error: "Sin permisos" });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) return res.status(404).json({ error: "Usuario no encontrado" });

  // Si no es MASTER cambiando otra cuenta, verificar contraseña actual
  if (req.usuario!.rol !== "MASTER" || req.usuario!.id === usuarioId) {
    const ok = await bcrypt.compare(passwordActual, usuario.passwordHash);
    if (!ok) return res.status(400).json({ error: "Contraseña actual incorrecta" });
  }

  const passwordHash = await bcrypt.hash(passwordNuevo, 12);
  await prisma.usuario.update({ where: { id: usuarioId }, data: { passwordHash } });
  res.json({ ok: true });
}

export async function toggleActivo(req: Request, res: Response) {
  const usuario = await prisma.usuario.update({
    where: { id: Number(req.params.id) },
    data: { activo: req.body.activo },
    omit: { passwordHash: true },
  });
  res.json(usuario);
}

// Endpoint especial: solo funciona si no hay usuarios (primer uso del sistema)
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
    omit: { passwordHash: true },
  });

  const token = generarToken({
    id: usuario.id,
    rol: usuario.rol,
    vendedorId: null,
    nombre: usuario.nombre,
  });

  res.status(201).json({ token, usuario });
}
