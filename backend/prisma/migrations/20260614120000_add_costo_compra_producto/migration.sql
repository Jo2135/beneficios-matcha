-- AlterTable: agregar costo de compra publicado al producto (usado en cálculo de Conexiones)
ALTER TABLE "Producto" ADD COLUMN IF NOT EXISTS "costoCompra" DECIMAL(12,4);
