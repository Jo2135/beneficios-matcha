import multer from "multer";
import path from "path";
import fs from "fs";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";

const uploadDir = path.join(process.cwd(), "public", "uploads", "productos");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `producto-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB máximo
  fileFilter: (_req, file, cb) => {
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP"));
  },
});

export const uploadMiddleware = upload.single("imagen");

export async function subirImagen(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: "No se recibió ninguna imagen" });

  const productoId = Number(req.params.id);

  // Eliminar imagen anterior si existe
  const productoActual = await prisma.producto.findUnique({
    where: { id: productoId },
    select: { imagenUrl: true },
  });
  if (productoActual?.imagenUrl) {
    const oldFile = path.join(process.cwd(), "public", productoActual.imagenUrl.replace(/^\//, ""));
    if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
  }

  const imagenUrl = `/uploads/productos/${req.file.filename}`;
  const producto = await prisma.producto.update({
    where: { id: productoId },
    data: { imagenUrl },
  });

  res.json({ imagenUrl: producto.imagenUrl });
}

export async function eliminarImagen(req: Request, res: Response) {
  const productoId = Number(req.params.id);
  const producto = await prisma.producto.findUnique({
    where: { id: productoId },
    select: { imagenUrl: true },
  });

  if (producto?.imagenUrl) {
    const filePath = path.join(process.cwd(), "public", producto.imagenUrl.replace(/^\//, ""));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  await prisma.producto.update({ where: { id: productoId }, data: { imagenUrl: null } });
  res.json({ ok: true });
}
