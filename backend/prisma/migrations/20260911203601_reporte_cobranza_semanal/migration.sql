-- AlterTable
ALTER TABLE "ConfiguracionSistema" ADD COLUMN     "cobranzaActivadoEn" TIMESTAMP(3),
ADD COLUMN     "cobranzaActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cobranzaCorreos" TEXT,
ADD COLUMN     "cobranzaUltimoEnvio" TIMESTAMP(3),
ADD COLUMN     "cobranzaUltimoError" TEXT;
