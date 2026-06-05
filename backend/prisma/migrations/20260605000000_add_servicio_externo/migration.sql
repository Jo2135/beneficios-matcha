ALTER TABLE "DespachoLinea"
  ADD COLUMN "esServicioExterno" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "costoServicioExterno" DECIMAL(12,2);
