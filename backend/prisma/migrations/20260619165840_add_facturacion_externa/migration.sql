-- CreateTable
CREATE TABLE "CompraExterna" (
    "id" SERIAL NOT NULL,
    "proveedor" TEXT NOT NULL,
    "numero" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "imagenUrl" TEXT,
    "totalCosto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompraExterna_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraExternaLinea" (
    "id" SERIAL NOT NULL,
    "compraExternaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "costoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "notas" TEXT,

    CONSTRAINT "CompraExternaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraExternaAsignacion" (
    "id" SERIAL NOT NULL,
    "lineaId" INTEGER NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "cantidad" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompraExternaAsignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompraExternaPago" (
    "id" SERIAL NOT NULL,
    "compraExternaId" INTEGER NOT NULL,
    "cuentaId" INTEGER,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'USD',
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origenFondos" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompraExternaPago_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CompraExternaLinea" ADD CONSTRAINT "CompraExternaLinea_compraExternaId_fkey" FOREIGN KEY ("compraExternaId") REFERENCES "CompraExterna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraExternaLinea" ADD CONSTRAINT "CompraExternaLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraExternaAsignacion" ADD CONSTRAINT "CompraExternaAsignacion_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "CompraExternaLinea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraExternaAsignacion" ADD CONSTRAINT "CompraExternaAsignacion_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraExternaPago" ADD CONSTRAINT "CompraExternaPago_compraExternaId_fkey" FOREIGN KEY ("compraExternaId") REFERENCES "CompraExterna"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompraExternaPago" ADD CONSTRAINT "CompraExternaPago_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
