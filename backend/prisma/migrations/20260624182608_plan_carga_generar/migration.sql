-- AlterTable
ALTER TABLE "PlanCarga" ADD COLUMN     "cotizacionesIds" TEXT NOT NULL DEFAULT '[]',
ADD COLUMN     "despachoId" INTEGER;
