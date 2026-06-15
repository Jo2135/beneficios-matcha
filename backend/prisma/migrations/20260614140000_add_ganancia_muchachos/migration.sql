-- AlterTable: % de pago a "los muchachos" (flete) sobre la venta del vendedor — gasto extra independiente
ALTER TABLE "Vendedor" ADD COLUMN IF NOT EXISTS "gananciaMuchachosPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
