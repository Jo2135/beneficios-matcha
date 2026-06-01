import { Request, Response, NextFunction } from "express";

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error("[ERROR]", err?.message ?? err);

  if (err?.code === "P2025") {
    return res.status(404).json({ error: "Registro no encontrado" });
  }
  if (err?.code === "P2002") {
    return res.status(409).json({ error: "Ya existe un registro con ese valor único" });
  }
  if (err?.code === "P2003") {
    return res.status(400).json({ error: "Referencia inválida (registro relacionado no existe)" });
  }

  const status = err?.status ?? err?.statusCode ?? 500;
  const message = status < 500 ? err.message : "Error interno del servidor";
  res.status(status).json({ error: message });
}
