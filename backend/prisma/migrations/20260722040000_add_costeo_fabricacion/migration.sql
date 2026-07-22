-- AlterTable taller.bodega_taller
ALTER TABLE "taller"."bodega_taller" ADD COLUMN IF NOT EXISTS "taller_id" INTEGER;

-- CreateTable taller.bodega_taller_precio_historial
CREATE TABLE IF NOT EXISTS "taller"."bodega_taller_precio_historial" (
    "id" SERIAL NOT NULL,
    "bodega_taller_id" INTEGER NOT NULL,
    "precio_anterior" DOUBLE PRECISION NOT NULL,
    "precio_nuevo" DOUBLE PRECISION NOT NULL,
    "motivo" TEXT,
    "user_id" INTEGER,
    "user_nombre" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bodega_taller_precio_historial_pkey" PRIMARY KEY ("id")
);

-- CreateTable taller.tarifas_proceso
CREATE TABLE IF NOT EXISTS "taller"."tarifas_proceso" (
    "id" SERIAL NOT NULL,
    "taller_id" INTEGER NOT NULL,
    "proceso" TEXT NOT NULL,
    "valor_hora" DOUBLE PRECISION NOT NULL,
    "vigente_desde" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifas_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable taller.producto_recetas
CREATE TABLE IF NOT EXISTS "taller"."producto_recetas" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "taller_id" INTEGER,
    "margen_transferencia" DOUBLE PRECISION NOT NULL DEFAULT 35,
    "ajuste_global_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accesorios_monto" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "producto_recetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable taller.receta_materiales
CREATE TABLE IF NOT EXISTS "taller"."receta_materiales" (
    "id" SERIAL NOT NULL,
    "receta_id" INTEGER NOT NULL,
    "bodega_taller_id" INTEGER,
    "tela_id" INTEGER,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT,
    "notas" TEXT,

    CONSTRAINT "receta_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable taller.receta_procesos
CREATE TABLE IF NOT EXISTS "taller"."receta_procesos" (
    "id" SERIAL NOT NULL,
    "receta_id" INTEGER NOT NULL,
    "taller_id" INTEGER NOT NULL,
    "proceso" TEXT NOT NULL,
    "horas" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "receta_procesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable taller.costeo_snapshots
CREATE TABLE IF NOT EXISTS "taller"."costeo_snapshots" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "costo_materiales" DOUBLE PRECISION NOT NULL,
    "costo_mano_obra" DOUBLE PRECISION NOT NULL,
    "costo_accesorios" DOUBLE PRECISION NOT NULL,
    "costo_fabricacion" DOUBLE PRECISION NOT NULL,
    "ajuste_global_pct" DOUBLE PRECISION NOT NULL,
    "costo_ajustado" DOUBLE PRECISION NOT NULL,
    "margen_transferencia" DOUBLE PRECISION NOT NULL,
    "costo_transferencia" DOUBLE PRECISION NOT NULL,
    "precio_lista_anterior" DOUBLE PRECISION,
    "aplicado" BOOLEAN NOT NULL DEFAULT false,
    "detalle" JSONB NOT NULL,
    "user_id" INTEGER,
    "user_nombre" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "costeo_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes & Constraints
CREATE UNIQUE INDEX IF NOT EXISTS "producto_recetas_producto_id_key" ON "taller"."producto_recetas"("producto_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tarifas_proceso_taller_id_proceso_vigente_desde_key" ON "taller"."tarifas_proceso"("taller_id", "proceso", "vigente_desde");
CREATE INDEX IF NOT EXISTS "bodega_taller_taller_id_idx" ON "taller"."bodega_taller"("taller_id");
CREATE INDEX IF NOT EXISTS "bodega_taller_precio_historial_bodega_taller_id_idx" ON "taller"."bodega_taller_precio_historial"("bodega_taller_id");
CREATE INDEX IF NOT EXISTS "tarifas_proceso_taller_id_activo_idx" ON "taller"."tarifas_proceso"("taller_id", "activo");
CREATE INDEX IF NOT EXISTS "receta_materiales_receta_id_idx" ON "taller"."receta_materiales"("receta_id");
CREATE INDEX IF NOT EXISTS "receta_procesos_receta_id_idx" ON "taller"."receta_procesos"("receta_id");
CREATE INDEX IF NOT EXISTS "costeo_snapshots_producto_id_created_at_idx" ON "taller"."costeo_snapshots"("producto_id", "created_at");

-- Foreign Keys
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bodega_taller_taller_id_fkey') THEN
        ALTER TABLE "taller"."bodega_taller" ADD CONSTRAINT "bodega_taller_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bodega_taller_precio_historial_bodega_taller_id_fkey') THEN
        ALTER TABLE "taller"."bodega_taller_precio_historial" ADD CONSTRAINT "bodega_taller_precio_historial_bodega_taller_id_fkey" FOREIGN KEY ("bodega_taller_id") REFERENCES "taller"."bodega_taller"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tarifas_proceso_taller_id_fkey') THEN
        ALTER TABLE "taller"."tarifas_proceso" ADD CONSTRAINT "tarifas_proceso_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_recetas_producto_id_fkey') THEN
        ALTER TABLE "taller"."producto_recetas" ADD CONSTRAINT "producto_recetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'producto_recetas_taller_id_fkey') THEN
        ALTER TABLE "taller"."producto_recetas" ADD CONSTRAINT "producto_recetas_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receta_materiales_receta_id_fkey') THEN
        ALTER TABLE "taller"."receta_materiales" ADD CONSTRAINT "receta_materiales_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "taller"."producto_recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receta_materiales_bodega_taller_id_fkey') THEN
        ALTER TABLE "taller"."receta_materiales" ADD CONSTRAINT "receta_materiales_bodega_taller_id_fkey" FOREIGN KEY ("bodega_taller_id") REFERENCES "taller"."bodega_taller"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receta_materiales_tela_id_fkey') THEN
        ALTER TABLE "taller"."receta_materiales" ADD CONSTRAINT "receta_materiales_tela_id_fkey" FOREIGN KEY ("tela_id") REFERENCES "taller"."telas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receta_procesos_receta_id_fkey') THEN
        ALTER TABLE "taller"."receta_procesos" ADD CONSTRAINT "receta_procesos_receta_id_fkey" FOREIGN KEY ("receta_id") REFERENCES "taller"."producto_recetas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receta_procesos_taller_id_fkey') THEN
        ALTER TABLE "taller"."receta_procesos" ADD CONSTRAINT "receta_procesos_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'costeo_snapshots_producto_id_fkey') THEN
        ALTER TABLE "taller"."costeo_snapshots" ADD CONSTRAINT "costeo_snapshots_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
