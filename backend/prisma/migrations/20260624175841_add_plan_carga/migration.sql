-- CreateTable
CREATE TABLE "PlanCarga" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "fecha" TIMESTAMP(3),
    "notas" TEXT,
    "clientesJson" TEXT NOT NULL DEFAULT '[]',
    "productosJson" TEXT NOT NULL DEFAULT '[]',
    "cantidadesJson" TEXT NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanCarga_pkey" PRIMARY KEY ("id")
);
