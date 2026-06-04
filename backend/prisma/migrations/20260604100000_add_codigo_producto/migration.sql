-- AlterTable
ALTER TABLE "Producto" ADD COLUMN "codigo" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");
