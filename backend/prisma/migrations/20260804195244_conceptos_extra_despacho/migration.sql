-- CreateTable
CREATE TABLE "DespachoConceptoExtra" (
    "id" SERIAL NOT NULL,
    "ordenDespachoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "cobradoAlCliente" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DespachoConceptoExtra_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DespachoConceptoExtra" ADD CONSTRAINT "DespachoConceptoExtra_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;
