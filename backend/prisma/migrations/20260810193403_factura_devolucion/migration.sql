-- CreateTable
CREATE TABLE "FacturaDevolucion" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "facturaLineaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "montoDevuelto" DECIMAL(12,2) NOT NULL,
    "motivo" TEXT,
    "creadoPorId" INTEGER,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacturaDevolucion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaDevolucionDespacho" (
    "id" SERIAL NOT NULL,
    "devolucionId" INTEGER NOT NULL,
    "despachoLineaId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "FacturaDevolucionDespacho_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "FacturaDevolucion" ADD CONSTRAINT "FacturaDevolucion_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDevolucion" ADD CONSTRAINT "FacturaDevolucion_facturaLineaId_fkey" FOREIGN KEY ("facturaLineaId") REFERENCES "FacturaLinea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDevolucion" ADD CONSTRAINT "FacturaDevolucion_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDevolucion" ADD CONSTRAINT "FacturaDevolucion_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDevolucionDespacho" ADD CONSTRAINT "FacturaDevolucionDespacho_devolucionId_fkey" FOREIGN KEY ("devolucionId") REFERENCES "FacturaDevolucion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaDevolucionDespacho" ADD CONSTRAINT "FacturaDevolucionDespacho_despachoLineaId_fkey" FOREIGN KEY ("despachoLineaId") REFERENCES "DespachoLinea"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
