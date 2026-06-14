-- CreateTable: tabla de unión cliente ↔ lista de precios (muchos a muchos)
CREATE TABLE "ClienteListaPrecios" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "listaPrecioId" INTEGER NOT NULL,

    CONSTRAINT "ClienteListaPrecios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClienteListaPrecios_clienteId_listaPrecioId_key" ON "ClienteListaPrecios"("clienteId", "listaPrecioId");

-- AddForeignKey
ALTER TABLE "ClienteListaPrecios" ADD CONSTRAINT "ClienteListaPrecios_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteListaPrecios" ADD CONSTRAINT "ClienteListaPrecios_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrar datos existentes: cada cliente con listaPrecioId pasa a la tabla de unión
INSERT INTO "ClienteListaPrecios" ("clienteId", "listaPrecioId")
SELECT "id", "listaPrecioId"
FROM "Cliente"
WHERE "listaPrecioId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Cliente" DROP CONSTRAINT "Cliente_listaPrecioId_fkey";

-- AlterTable: eliminar columna listaPrecioId del cliente
ALTER TABLE "Cliente" DROP COLUMN "listaPrecioId";
