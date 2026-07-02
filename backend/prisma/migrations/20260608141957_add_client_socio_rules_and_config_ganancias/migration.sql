-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "socioEquivalente" TEXT,
ADD COLUMN     "vendedorEsMaster" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ConfigGanancias" (
    "id" SERIAL NOT NULL,
    "despachoId" INTEGER,
    "campo" TEXT NOT NULL,
    "valor" DECIMAL(14,6) NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigGanancias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionSistema" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "pinTablaHash" TEXT,

    CONSTRAINT "ConfiguracionSistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConfigGanancias_despachoId_campo_key" ON "ConfigGanancias"("despachoId", "campo");
