-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('MASTER', 'ADMIN', 'VENDEDOR');

-- AlterTable: add usuario relation to Vendedor (nothing needed, handled by FK below)

-- CreateTable
CREATE TABLE "Usuario" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL DEFAULT 'VENDEDOR',
    "vendedorId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimoAcceso" TIMESTAMP(3),

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_vendedorId_key" ON "Usuario"("vendedorId");

-- AddForeignKey
ALTER TABLE "Usuario" ADD CONSTRAINT "Usuario_vendedorId_fkey"
    FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
