-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "aprobacion" TEXT NOT NULL DEFAULT 'APROBADO',
ADD COLUMN     "aprobadoEn" TIMESTAMP(3),
ADD COLUMN     "aprobadoPorId" INTEGER,
ADD COLUMN     "creadoPorId" INTEGER,
ADD COLUMN     "facturaDestinoId" INTEGER,
ADD COLUMN     "metodoPago" TEXT,
ADD COLUMN     "motivoRechazo" TEXT,
ADD COLUMN     "vendedorId" INTEGER;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_aprobadoPorId_fkey" FOREIGN KEY ("aprobadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
