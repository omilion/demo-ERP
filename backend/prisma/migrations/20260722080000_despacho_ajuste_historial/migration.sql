-- CreateTable bodega.despacho_ajuste_historial
CREATE TABLE IF NOT EXISTS "bodega"."despacho_ajuste_historial" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "monto_anterior" DOUBLE PRECISION NOT NULL,
    "monto_nuevo" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "usuario_nombre" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despacho_ajuste_historial_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "despacho_ajuste_historial_orden_id_idx" ON "bodega"."despacho_ajuste_historial"("orden_id");

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'despacho_ajuste_historial_orden_id_fkey') THEN
        ALTER TABLE "bodega"."despacho_ajuste_historial" ADD CONSTRAINT "despacho_ajuste_historial_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
