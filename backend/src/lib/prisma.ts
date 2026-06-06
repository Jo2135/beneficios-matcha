import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Fallback: lee el .env manualmente si dotenv no lo cargó (soluciona problemas de codificación en Windows)
if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    const content = fs.readFileSync(envPath, "utf8").replace(/^﻿/, ""); // quita BOM si existe
    for (const line of content.split(/\r?\n/)) {
      const eqIdx = line.indexOf("=");
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (key === "DATABASE_URL") process.env.DATABASE_URL = val;
        if (key === "PORT") process.env.PORT = val;
        if (key === "NODE_ENV") process.env.NODE_ENV = val;
      }
    }
  } catch (_) { /* .env no encontrado */ }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// En producción usamos singleton para no crear múltiples clientes.
// En desarrollo NO cacheamos en globalThis para que tsx watch siempre
// cargue el cliente regenerado después de `prisma generate`.
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  process.env.NODE_ENV === "production"
    ? (globalForPrisma.prisma ?? (globalForPrisma.prisma = new PrismaClient({ adapter, log: ["error"] })))
    : new PrismaClient({ adapter, log: ["error"] });
