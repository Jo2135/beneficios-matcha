-- CreateEnum
CREATE TYPE "OrigenProducto" AS ENUM ('INTERNO', 'EXTERNO');

-- CreateEnum
CREATE TYPE "EstadoCotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'APROBADA', 'EN_DESPACHO', 'COMPLETADA', 'RECHAZADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "EstadoDespacho" AS ENUM ('PENDIENTE', 'EN_RUTA', 'ENTREGADO', 'PARCIAL');

-- CreateEnum
CREATE TYPE "EstadoLinea" AS ENUM ('PENDIENTE', 'DESPACHADO', 'FALTO', 'PARCIAL');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('EMITIDA', 'PENDIENTE_COBRO', 'COBRADA_PARCIAL', 'COBRADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('USD', 'USDT', 'BS', 'COP');

-- CreateEnum
CREATE TYPE "EstadoPago" AS ENUM ('LIBRE', 'ASIGNADO', 'PARCIAL');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('ENTRADA', 'SALIDA', 'TRANSFERENCIA', 'COMISION');

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rif" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "comisionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "comisionReferidoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "referidoPorId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaCosto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "factorCostoKg" DECIMAL(8,4) NOT NULL,
    "gananciaKg" DECIMAL(8,4) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "CategoriaCosto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "medida" TEXT NOT NULL,
    "descripcion" TEXT,
    "origen" "OrigenProducto" NOT NULL DEFAULT 'INTERNO',
    "categoriaId" INTEGER NOT NULL,
    "pesoUnitarioKg" DECIMAL(8,4),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Producto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaPrecio" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "clienteId" INTEGER,
    "vigenciaDesde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vigenciaHasta" TIMESTAMP(3),
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListaPrecio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaPrecioDetalle" (
    "id" SERIAL NOT NULL,
    "listaPrecioId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "precioUnitario" DECIMAL(10,4) NOT NULL,
    "descuentoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ListaPrecioDetalle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rif" TEXT,
    "direccion" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "vendedorId" INTEGER,
    "listaPrecioId" INTEGER,
    "empresaFactura" TEXT NOT NULL DEFAULT 'ECOPLAST F.P.',
    "fletePct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "diasCredito" INTEGER NOT NULL DEFAULT 0,
    "condicionPago" TEXT,
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotizacion" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "vendedorId" INTEGER,
    "empresaId" INTEGER,
    "estado" "EstadoCotizacion" NOT NULL DEFAULT 'BORRADOR',
    "validezDias" INTEGER NOT NULL DEFAULT 30,
    "fechaVencimiento" TIMESTAMP(3),
    "totalBruto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuentoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalNeto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotizacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotizacionLinea" (
    "id" SERIAL NOT NULL,
    "cotizacionId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "notaCantidad" TEXT,
    "precioUnitarioAplicado" DECIMAL(10,4) NOT NULL,
    "descuentoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "precioFinal" DECIMAL(10,4) NOT NULL,
    "totalLinea" DECIMAL(12,2) NOT NULL,
    "listaPrecioOrigenId" INTEGER,
    "pesoTotalKg" DECIMAL(10,4),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CotizacionLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdenDespacho" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaSalida" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chofer" TEXT,
    "vehiculo" TEXT,
    "estado" "EstadoDespacho" NOT NULL DEFAULT 'PENDIENTE',
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrdenDespacho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespachoLinea" (
    "id" SERIAL NOT NULL,
    "ordenDespachoId" INTEGER NOT NULL,
    "cotizacionId" INTEGER,
    "productoId" INTEGER NOT NULL,
    "cantidadPedida" DECIMAL(10,2) NOT NULL,
    "cantidadDespachada" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "cantidadFaltante" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" "EstadoLinea" NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT "DespachoLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "ordenDespachoId" INTEGER,
    "empresaId" INTEGER,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'EMITIDA',
    "fechaEmision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "totalBruto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descuentoTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalNeto" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPagado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldoPendiente" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacturaLinea" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "productoId" INTEGER NOT NULL,
    "cantidad" DECIMAL(10,2) NOT NULL,
    "precioUnitario" DECIMAL(10,4) NOT NULL,
    "descuentoPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "totalLinea" DECIMAL(12,2) NOT NULL,
    "motivoAjuste" TEXT,
    "origen" "OrigenProducto" NOT NULL DEFAULT 'INTERNO',
    "pesoTotalKg" DECIMAL(10,4),
    "orden" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FacturaLinea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER,
    "cuentaId" INTEGER,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "Moneda" NOT NULL DEFAULT 'USD',
    "montousd" DECIMAL(12,2),
    "tasaCambioBs" DECIMAL(12,4),
    "tasaCambioCop" DECIMAL(12,4),
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" "EstadoPago" NOT NULL DEFAULT 'LIBRE',
    "origenFondos" TEXT,
    "destinoUso" TEXT,
    "observaciones" TEXT,
    "fechaProximoAbono" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagoAsignacion" (
    "id" SERIAL NOT NULL,
    "pagoId" INTEGER NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "montoAsignado" DECIMAL(12,2) NOT NULL,
    "fechaAsignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notas" TEXT,

    CONSTRAINT "PagoAsignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cuenta" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "propietario" TEXT NOT NULL,
    "comisionPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "saldoActual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimoMovimiento" TIMESTAMP(3),

    CONSTRAINT "Cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimientoTesoreria" (
    "id" SERIAL NOT NULL,
    "cuentaId" INTEGER NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "tasaAplicada" DECIMAL(12,4),
    "facturaId" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descripcion" TEXT,
    "alertaUsdt" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MovimientoTesoreria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DespachoGasto" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "renglon" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "formulaAplicada" TEXT,
    "esVariable" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,

    CONSTRAINT "DespachoGasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistribucionGanancia" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "beneficiario" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "porcentaje" DECIMAL(5,2) NOT NULL,
    "montoCalculado" DECIMAL(12,2) NOT NULL,
    "montoAbonado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldoPendiente" DECIMAL(12,2) NOT NULL,
    "notas" TEXT,

    CONSTRAINT "DistribucionGanancia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Secuencia" (
    "id" SERIAL NOT NULL,
    "prefijo" TEXT NOT NULL,
    "ultimo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Secuencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_rif_key" ON "Empresa"("rif");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaCosto_nombre_key" ON "CategoriaCosto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "ListaPrecioDetalle_listaPrecioId_productoId_key" ON "ListaPrecioDetalle"("listaPrecioId", "productoId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotizacion_numero_key" ON "Cotizacion"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "OrdenDespacho_numero_key" ON "OrdenDespacho"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "Secuencia_prefijo_key" ON "Secuencia"("prefijo");

-- AddForeignKey
ALTER TABLE "Vendedor" ADD CONSTRAINT "Vendedor_referidoPorId_fkey" FOREIGN KEY ("referidoPorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Producto" ADD CONSTRAINT "Producto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaCosto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecio" ADD CONSTRAINT "ListaPrecio_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecioDetalle" ADD CONSTRAINT "ListaPrecioDetalle_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaPrecioDetalle" ADD CONSTRAINT "ListaPrecioDetalle_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_listaPrecioId_fkey" FOREIGN KEY ("listaPrecioId") REFERENCES "ListaPrecio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotizacion" ADD CONSTRAINT "Cotizacion_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionLinea" ADD CONSTRAINT "CotizacionLinea_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotizacionLinea" ADD CONSTRAINT "CotizacionLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_cotizacionId_fkey" FOREIGN KEY ("cotizacionId") REFERENCES "Cotizacion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoLinea" ADD CONSTRAINT "DespachoLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_ordenDespachoId_fkey" FOREIGN KEY ("ordenDespachoId") REFERENCES "OrdenDespacho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacturaLinea" ADD CONSTRAINT "FacturaLinea_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAsignacion" ADD CONSTRAINT "PagoAsignacion_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "Pago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagoAsignacion" ADD CONSTRAINT "PagoAsignacion_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimientoTesoreria" ADD CONSTRAINT "MovimientoTesoreria_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "Cuenta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DespachoGasto" ADD CONSTRAINT "DespachoGasto_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistribucionGanancia" ADD CONSTRAINT "DistribucionGanancia_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
