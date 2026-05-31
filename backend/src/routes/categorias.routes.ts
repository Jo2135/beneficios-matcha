import { Router } from "express";
import { prisma } from "../lib/prisma";

export const categoriasRouter = Router();

categoriasRouter.get("/", async (_req, res) => {
  const categorias = await prisma.categoriaCosto.findMany({ orderBy: { nombre: "asc" } });
  res.json(categorias);
});

categoriasRouter.post("/", async (req, res) => {
  const cat = await prisma.categoriaCosto.create({ data: req.body });
  res.status(201).json(cat);
});

categoriasRouter.put("/:id", async (req, res) => {
  const cat = await prisma.categoriaCosto.update({
    where: { id: Number(req.params.id) },
    data: req.body,
  });
  res.json(cat);
});
