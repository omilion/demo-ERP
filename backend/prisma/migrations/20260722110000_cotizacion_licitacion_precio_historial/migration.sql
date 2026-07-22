-- CreateTable ventas.cotizacion_licitacion_precio_historial
CREATE TABLE IF NOT EXISTS "ventas"."cotizacion_licitacion_precio_historial" (
    "id" SERIAL NOT NULL,
    "item_id" INTEGER NOT NULL,
    "precio_anterior" DOUBLE PRECISION NOT NULL,
    "precio_nuevo" DOUBLE PRECISION NOT NULL,
    "usuario_nombre" TEXT,
    "motivo" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_licitacion_precio_historial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cotizacion_licitacion_precio_historial_item_id_idx" ON "ventas"."cotizacion_licitacion_precio_historial"("item_id");

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cotizacion_licitacion_precio_historial_item_id_fkey') THEN
        ALTER TABLE "ventas"."cotizacion_licitacion_precio_historial" ADD CONSTRAINT "cotizacion_licitacion_precio_historial_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ventas"."cotizacion_licitacion_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
