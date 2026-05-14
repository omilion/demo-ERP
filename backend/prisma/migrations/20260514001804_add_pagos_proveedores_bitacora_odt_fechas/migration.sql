-- AlterTable
ALTER TABLE "taller"."odts" ADD COLUMN     "fecha_inicio" TIMESTAMP(3),
ADD COLUMN     "fecha_termino" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "catalogo"."pagos_proveedores" (
    "id" SERIAL NOT NULL,
    "proveedor_id" INTEGER,
    "codigo_proveedor" INTEGER,
    "documento" TEXT,
    "n_doc" TEXT,
    "fecha_doc" TIMESTAMP(3),
    "fecha_pago" TIMESTAMP(3),
    "fecha_vencimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usuario" TEXT,
    "bodega" TEXT,
    "nc" BOOLEAN NOT NULL DEFAULT false,
    "nc_monto" DOUBLE PRECISION,
    "obs" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_proveedores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."bitacora_taller" (
    "id" SERIAL NOT NULL,
    "odt_id" INTEGER NOT NULL,
    "usuario" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_taller_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "taller"."bitacora_taller" ADD CONSTRAINT "bitacora_taller_odt_id_fkey" FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
