-- DropForeignKey
ALTER TABLE "caja"."movimientos_caja" DROP CONSTRAINT "movimientos_caja_turno_id_fkey";

-- AlterTable
ALTER TABLE "caja"."movimientos_caja" ADD COLUMN     "fecha" TIMESTAMP(3),
ADD COLUMN     "orden_id" INTEGER,
ADD COLUMN     "referencia" TEXT,
ADD COLUMN     "usuario" TEXT,
ALTER COLUMN "turno_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "catalogo"."proveedores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razon_social" TEXT,
    "giro" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "region" TEXT,
    "comuna" TEXT,
    "codigo_proveedor" INTEGER,
    "porc_venta_sala" INTEGER NOT NULL DEFAULT 0,
    "porc_marco" INTEGER NOT NULL DEFAULT 0,
    "porc_licitacion" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."cobranza_historico" (
    "id" SERIAL NOT NULL,
    "ejecutiva" TEXT,
    "interno" INTEGER,
    "ndoc" INTEGER,
    "monto" INTEGER,
    "monto_menos" INTEGER,
    "nc" INTEGER,
    "valor_factura" INTEGER,
    "multas" INTEGER,
    "cliente" TEXT,
    "rut" TEXT,
    "fecha_factura" TIMESTAMP(3),
    "mes_anio" TEXT,
    "estado" TEXT,
    "comision" TEXT,
    "pago_comision" TIMESTAMP(3),
    "despacho" TIMESTAMP(3),
    "fecha_gestion" TIMESTAMP(3),
    "ingreso_pago" TIMESTAMP(3),
    "fecha_pago" TIMESTAMP(3),
    "banco" TEXT,
    "reclamo" TEXT,
    "observacion" TEXT,

    CONSTRAINT "cobranza_historico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."crm_registros" (
    "id" SERIAL NOT NULL,
    "n_cotizacion" TEXT,
    "fecha" TIMESTAMP(3),
    "accion" TEXT,
    "competencia" BOOLEAN NOT NULL DEFAULT false,
    "fecha_proximo" TIMESTAMP(3),
    "prioridad" TEXT,
    "rut" TEXT,
    "nombre" TEXT,
    "r_social" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "ejecutiva" TEXT,
    "fecha_cotizacion" TIMESTAMP(3),
    "resultado" TEXT,
    "estado" INTEGER,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_registros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_rut_key" ON "catalogo"."proveedores"("rut");

-- AddForeignKey
ALTER TABLE "caja"."movimientos_caja" ADD CONSTRAINT "movimientos_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "caja"."turnos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
