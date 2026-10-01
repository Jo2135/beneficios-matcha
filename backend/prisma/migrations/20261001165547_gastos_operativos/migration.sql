-- CreateTable
CREATE TABLE "GastoOperativo" (
    "id" SERIAL NOT NULL,
    "fecha" DATE NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "medioPago" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creadoPorId" INTEGER,

    CONSTRAINT "GastoOperativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GastoOperativoAsignacion" (
    "id" SERIAL NOT NULL,
    "gastoId" INTEGER NOT NULL,
    "ordenDespachoId" INTEGER NOT NULL,
    "renglon" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoOperativoAsignacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GastoOperativo_fecha_idx" ON "GastoOperativo"("fecha");

-- CreateIndex
CREATE INDEX "GastoOperativoAsignacion_ordenDespachoId_renglon_idx" ON "GastoOperativoAsignacion"("ordenDespachoId", "renglon");

-- AddForeignKey
ALTER TABLE "GastoOperativo" ADD CONSTRAINT "GastoOperativo_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativoAsignacion" ADD CONSTRAINT "GastoOperativoAsignacion_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "GastoOperativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GastoOperativoAsignacion" ADD CONSTRAINT "GastoOperativoAsignacion_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
