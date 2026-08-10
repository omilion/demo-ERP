ALTER TABLE "ventas"."ordenes"
  ADD COLUMN IF NOT EXISTS "email_contacto_despacho" TEXT,
  ADD COLUMN IF NOT EXISTS "plazo_entrega_dias" INTEGER,
  ADD COLUMN IF NOT EXISTS "plazo_entrega_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "marketplace_canal" TEXT,
  ADD COLUMN IF NOT EXISTS "marketplace_comision_pct" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "marketplace_comision_monto" DOUBLE PRECISION;

ALTER TABLE "ventas"."cotizacion_licitacion"
  ADD COLUMN IF NOT EXISTS "plazo_entrega_dias" INTEGER,
  ADD COLUMN IF NOT EXISTS "plazo_entrega_tipo" TEXT;

ALTER TABLE "bodega"."despachos"
  ADD COLUMN IF NOT EXISTS "email_contacto" TEXT;

ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN IF NOT EXISTS "asignado_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "asignacion_origen" TEXT;

CREATE TABLE IF NOT EXISTS "ventas"."crm_asignaciones_historial" (
  "id" SERIAL PRIMARY KEY,
  "crm_id" INTEGER NOT NULL,
  "vendedor_id" INTEGER,
  "vendedor_anterior_id" INTEGER,
  "origen" TEXT NOT NULL,
  "motivo" TEXT,
  "asignado_por_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "crm_asignaciones_historial_crm_id_created_at_idx" ON "ventas"."crm_asignaciones_historial"("crm_id", "created_at");
CREATE INDEX IF NOT EXISTS "crm_asignaciones_historial_vendedor_id_created_at_idx" ON "ventas"."crm_asignaciones_historial"("vendedor_id", "created_at");

CREATE TABLE IF NOT EXISTS "ventas"."notas_credito_internas" (
  "id" SERIAL PRIMARY KEY,
  "orden_id" INTEGER NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "motivo" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'activa',
  "usuario_id" INTEGER,
  "usuario_nombre" TEXT,
  "anulada_at" TIMESTAMP(3),
  "anulada_por" TEXT,
  "motivo_anulacion" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notas_credito_internas_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "notas_credito_internas_orden_id_estado_idx" ON "ventas"."notas_credito_internas"("orden_id", "estado");

CREATE TABLE IF NOT EXISTS "ventas"."notas_credito_interna_items" (
  "id" SERIAL PRIMARY KEY,
  "nota_id" INTEGER NOT NULL,
  "orden_item_id" INTEGER NOT NULL,
  "producto_id" INTEGER NOT NULL,
  "cantidad" INTEGER NOT NULL,
  "precio_unitario" DOUBLE PRECISION NOT NULL,
  "monto" DOUBLE PRECISION NOT NULL,
  "stock_reintegrado" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "notas_credito_interna_items_nota_id_fkey" FOREIGN KEY ("nota_id") REFERENCES "ventas"."notas_credito_internas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notas_credito_interna_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "notas_credito_interna_items_nota_id_idx" ON "ventas"."notas_credito_interna_items"("nota_id");
CREATE INDEX IF NOT EXISTS "notas_credito_interna_items_producto_id_idx" ON "ventas"."notas_credito_interna_items"("producto_id");

CREATE TABLE IF NOT EXISTS "facturacion"."folio_ajustes" (
  "id" SERIAL PRIMARY KEY,
  "caf_id" INTEGER NOT NULL,
  "tipo_dte" INTEGER NOT NULL,
  "folio_anterior" INTEGER NOT NULL,
  "folio_nuevo" INTEGER NOT NULL,
  "motivo" TEXT NOT NULL,
  "usuario_id" INTEGER,
  "usuario_nombre" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "folio_ajustes_caf_id_created_at_idx" ON "facturacion"."folio_ajustes"("caf_id", "created_at");
