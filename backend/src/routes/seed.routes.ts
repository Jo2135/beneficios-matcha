import { Router } from "express";
import { prisma } from "../lib/prisma";

export const seedRouter = Router();

// Solo disponible en desarrollo
seedRouter.post("/", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "No disponible en producción" });
  }

  // Empresas
  await prisma.empresa.upsert({
    where: { rif: "V-09331724-2" },
    update: {},
    create: { nombre: "ECOPLAST F.P.", rif: "V-09331724-2" },
  });
  await prisma.empresa.upsert({
    where: { rif: "MAXPLASTIC-001" },
    update: {},
    create: { nombre: "MAXPLASTIC F.P.", rif: "MAXPLASTIC-001" },
  });

  // Vendedores
  const henry = await prisma.vendedor.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, nombre: "Henry", comisionPct: 0 },
  });
  const felix = await prisma.vendedor.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, nombre: "Felix", comisionPct: 1, referidoPorId: null },
  });
  const miguel = await prisma.vendedor.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, nombre: "Miguel", comisionPct: 1, referidoPorId: null },
  });

  // Categorías con factores
  const categorias = [
    { nombre: "Manguera_3/4", factorCostoKg: 1.083, gananciaKg: 0.125 },
    { nombre: "Manguera_1-3", factorCostoKg: 1.09, gananciaKg: 0.200 },
    { nombre: "Azul", factorCostoKg: 1.58, gananciaKg: 0.190 },
    { nombre: "Negro", factorCostoKg: 1.28, gananciaKg: 0.180 },
    { nombre: "Blanco", factorCostoKg: 1.58, gananciaKg: 0.370 },
    { nombre: "Amarillo_PEAD", factorCostoKg: 1.59, gananciaKg: 0.490 },
    { nombre: "Negro_PEAD", factorCostoKg: 1.59, gananciaKg: 0.350 },
    { nombre: "Externo", factorCostoKg: 0, gananciaKg: 0 },
  ];

  for (const cat of categorias) {
    await prisma.categoriaCosto.upsert({
      where: { nombre: cat.nombre },
      update: { factorCostoKg: cat.factorCostoKg, gananciaKg: cat.gananciaKg },
      create: { nombre: cat.nombre, factorCostoKg: cat.factorCostoKg, gananciaKg: cat.gananciaKg },
    });
  }

  // Cuentas de tesorería
  const cuentas = [
    { nombre: "Banesco Panamá", moneda: "USD" as const, propietario: "Empresa", comisionPct: 0 },
    { nombre: "Binance", moneda: "USDT" as const, propietario: "Empresa", comisionPct: 0 },
    { nombre: "Banco Venezuela", moneda: "BS" as const, propietario: "Empresa", comisionPct: 0 },
    { nombre: "Banesco Venezuela", moneda: "BS" as const, propietario: "Empresa", comisionPct: 0 },
    { nombre: "Bancamiga", moneda: "USD" as const, propietario: "Cuñado", comisionPct: 3 },
    { nombre: "Bancolombia", moneda: "COP" as const, propietario: "Cuñada", comisionPct: 0 },
  ];

  for (const cuenta of cuentas) {
    const exists = await prisma.cuenta.findFirst({ where: { nombre: cuenta.nombre } });
    if (!exists) {
      await prisma.cuenta.create({ data: cuenta });
    }
  }

  // Clientes base
  const listaHermanosM = await prisma.listaPrecio.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, nombre: "Lista Hermanos M" },
  });

  await prisma.cliente.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      nombre: "Hermanos M",
      rif: "J-50122611-3",
      direccion: "Caracas",
      vendedorId: henry.id,
      listaPrecioId: listaHermanosM.id,
      empresaFactura: "ECOPLAST F.P.",
    },
  });

  const listaGandica = await prisma.listaPrecio.upsert({
    where: { id: 2 },
    update: {},
    create: { id: 2, nombre: "Lista Gandica" },
  });

  await prisma.cliente.upsert({
    where: { id: 2 },
    update: {},
    create: {
      id: 2,
      nombre: "Piezas y Conexiones Gandica",
      vendedorId: 2,
      listaPrecioId: listaGandica.id,
      empresaFactura: "ECOPLAST F.P.",
      fletePct: 0,
    },
  });

  const listaInfinito = await prisma.listaPrecio.upsert({
    where: { id: 3 },
    update: {},
    create: { id: 3, nombre: "Lista Ferretería Infinito" },
  });

  await prisma.cliente.upsert({
    where: { id: 3 },
    update: {},
    create: {
      id: 3,
      nombre: "Ferretería Infinito",
      direccion: "Puerto La Ordaz",
      listaPrecioId: listaInfinito.id,
      empresaFactura: "MAXPLASTIC F.P.",
      condicionPago: "30% al despachar + 15 días crédito",
      diasCredito: 15,
    },
  });

  // Secuencias
  for (const prefijo of ["COT", "FAC", "DES"]) {
    await prisma.secuencia.upsert({
      where: { prefijo },
      update: {},
      create: { prefijo, ultimo: 0 },
    });
  }

  res.json({ mensaje: "Datos iniciales cargados correctamente" });
});
