-- CreateEnum
CREATE TYPE "TipoSeguimiento" AS ENUM ('NOTA', 'ENVIADA', 'SEGUIMIENTO', 'RECORDATORIO', 'MOTIVO_RECHAZO');

-- CreateTable
CREATE TABLE "TasaCambio" (
    "id" SERIAL NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bsUSDT" DECIMAL(12,4) NOT NULL,
    "copUSDT" DECIMAL(12,4),
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TasaCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeguimientoCotizacion" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "tipo" "TipoSeguimiento" NOT NULL DEFAULT 'NOTA',
    "nota" TEXT NOT NULL,
    "fechaProxSeguimiento" TIMESTAMP(3),
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeguimientoCotizacion_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SeguimientoCotizacion" ADD CONSTRAINT "SeguimientoCotizacion_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeguimientoCotizacion" ADD CONSTRAINT "SeguimientoCotizacion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
