-- CreateTable
CREATE TABLE "BalancePago" (
    "id" SERIAL NOT NULL,
    "ordenDespachoId" INTEGER NOT NULL,
    "nombre" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalancePago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalancePagoItem" (
    "id" SERIAL NOT NULL,
    "balancePagoId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "montoTotal" DECIMAL(12,2) NOT NULL,
    "esEditable" BOOLEAN NOT NULL DEFAULT false,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT,

    CONSTRAINT "BalancePagoItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BalancePagoCuota" (
    "id" SERIAL NOT NULL,
    "balancePagoItemId" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalancePagoCuota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalancePago_ordenDespachoId_key" ON "BalancePago"("ordenDespachoId");

-- AddForeignKey
ALTER TABLE "BalancePago" ADD CONSTRAINT "BalancePago_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalancePagoItem" ADD CONSTRAINT "BalancePagoItem_balancePagoId_fkey" FOREIGN KEY ("balancePagoId") REFERENCES "BalancePago"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalancePagoCuota" ADD CONSTRAINT "BalancePagoCuota_balancePagoItemId_fkey" FOREIGN KEY ("balancePagoItemId") REFERENCES "BalancePagoItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
