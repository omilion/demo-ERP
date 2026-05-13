-- AlterTable
ALTER TABLE "catalogo"."productos" ADD COLUMN     "bodega" TEXT NOT NULL DEFAULT 'Inventario',
ADD COLUMN     "categoria" TEXT,
ADD COLUMN     "proveedor" TEXT;

-- AlterTable
ALTER TABLE "clientes"."clientes" ADD COLUMN     "ciudad" TEXT,
ADD COLUMN     "tipo" TEXT;

-- AlterTable
ALTER TABLE "taller"."odts" ADD COLUMN     "cliente_nombre" TEXT,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "orden_id" INTEGER,
ADD COLUMN     "plazo" TIMESTAMP(3),
ADD COLUMN     "tipo" TEXT,
ALTER COLUMN "estado" SET DEFAULT 'Pendiente';

-- AlterTable
ALTER TABLE "ventas"."ordenes" ADD COLUMN     "abono" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "creador_nombre" TEXT,
ADD COLUMN     "facturado" DOUBLE PRECISION,
ADD COLUMN     "guias" INTEGER,
ADD COLUMN     "licitacion" TEXT,
ADD COLUMN     "observaciones" TEXT,
ALTER COLUMN "estado" SET DEFAULT 'Activa',
ALTER COLUMN "estado_pago" SET DEFAULT 'No pagada',
ALTER COLUMN "estado_entrega" SET DEFAULT 'Pendiente entrega';

-- CreateTable
CREATE TABLE "catalogo"."precio_historial" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "precio_anterior" DOUBLE PRECISION NOT NULL,
    "precio_nuevo" DOUBLE PRECISION NOT NULL,
    "pct" DOUBLE PRECISION NOT NULL,
    "usuario_nombre" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "precio_historial_pkey" PRIMARY KEY ("id")
);
