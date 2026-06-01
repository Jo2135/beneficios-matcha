import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "ecoplast-secret-change-in-production";

export interface UsuarioToken {
  id: number;
  rol: "MASTER" | "ADMIN" | "VENDEDOR";
  vendedorId?: number | null;
  nombre: string;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioToken;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autorizado" });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET) as UsuarioToken;
    req.usuario = payload;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

export function requireRol(...roles: Array<"MASTER" | "ADMIN" | "VENDEDOR">) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "Sin permisos para esta acción" });
    }
    next();
  };
}

export function generarToken(payload: UsuarioToken): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}
