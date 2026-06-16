-- Ajustes solicitados en la reunion con Plastimar: campos de licitacion/despacho,
-- clasificacion de taller en productos, cliente conflictivo, meta mensual, sueldo
-- de trabajadores, compromiso de entrega en ODT y responsable de taller por item.
-- Idempotente (IF NOT EXISTS) para CI/dev y `prisma migrate deploy` en produccion.

-- config.empresa: meta mensual de ventas para el dashboard
ALTER TABLE "config"."empresa"
  ADD COLUMN IF NOT EXISTS "meta_mensual_ventas" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- clientes.clientes: marca de cliente conflictivo
ALTER TABLE "clientes"."clientes"
  ADD COLUMN IF NOT EXISTS "conflictivo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "conflictivo_detalle" TEXT;

-- catalogo.productos: clasificacion de taller y tiempo teorico de produccion
ALTER TABLE "catalogo"."productos"
  ADD COLUMN IF NOT EXISTS "taller_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "tiempo_teorico" INTEGER;

-- ventas.ordenes: datos de despacho y plazo a nivel de venta
ALTER TABLE "ventas"."ordenes"
  ADD COLUMN IF NOT EXISTS "envios_parciales" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "monto_despacho" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "fecha_plazo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "direccion_despacho" TEXT,
  ADD COLUMN IF NOT EXISTS "contacto_despacho" TEXT,
  ADD COLUMN IF NOT EXISTS "region_despacho" TEXT,
  ADD COLUMN IF NOT EXISTS "comuna_despacho" TEXT,
  ADD COLUMN IF NOT EXISTS "ciudad_despacho" TEXT;

-- ventas.cotizacion_licitacion: plazo, envios parciales y monto de despacho
ALTER TABLE "ventas"."cotizacion_licitacion"
  ADD COLUMN IF NOT EXISTS "fecha_plazo" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "envios_parciales" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "monto_despacho" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- taller.odts: fecha formal de compromiso de entrega
ALTER TABLE "taller"."odts"
  ADD COLUMN IF NOT EXISTS "fecha_entrega_compromiso" TIMESTAMP(3);

-- taller.odt_item_talleres: operario responsable del subproceso
ALTER TABLE "taller"."odt_item_talleres"
  ADD COLUMN IF NOT EXISTS "operario_responsable_id" INTEGER;

-- rrhh.trabajadores: sueldo base y valor de hora extra
ALTER TABLE "rrhh"."trabajadores"
  ADD COLUMN IF NOT EXISTS "sueldo_base" INTEGER,
  ADD COLUMN IF NOT EXISTS "valor_hora_extra" INTEGER;

-- FK: producto -> taller (clasificacion de taller del producto)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'productos_taller_id_fkey'
  ) THEN
    ALTER TABLE "catalogo"."productos"
      ADD CONSTRAINT "productos_taller_id_fkey"
      FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- FK: odt_item_talleres -> users (operario responsable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'odt_item_talleres_operario_responsable_id_fkey'
  ) THEN
    ALTER TABLE "taller"."odt_item_talleres"
      ADD CONSTRAINT "odt_item_talleres_operario_responsable_id_fkey"
      FOREIGN KEY ("operario_responsable_id") REFERENCES "auth"."users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "productos_taller_id_idx" ON "catalogo"."productos"("taller_id");
