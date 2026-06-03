-- AlterTable
ALTER TABLE "Cliente"
  ADD COLUMN "fleteTuberiaPct"       DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "fleteConexionesPct"    DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "comisionTuberiaPct"    DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "comisionConexionesPct" DECIMAL(5,2) NOT NULL DEFAULT 0;
