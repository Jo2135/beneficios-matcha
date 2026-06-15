-- AlterTable: comision del vendedor (seccion superior del balance, no suma)
ALTER TABLE "BalancePago" ADD COLUMN IF NOT EXISTS "gananciaVendedor" DECIMAL(12,2) DEFAULT 0;
