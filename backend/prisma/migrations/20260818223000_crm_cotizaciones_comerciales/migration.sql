CREATE TABLE IF NOT EXISTS "ventas"."crm_cotizaciones" (
  "id" SERIAL PRIMARY KEY,
  "crm_id" INTEGER NOT NULL UNIQUE,
  "tipo" TEXT NOT NULL,
  "cliente_sucursal_id" INTEGER,
  "vendedor_id" INTEGER,
  "licitacion" TEXT,
  "licitacion_fecha" TIMESTAMP(3),
  "licitacion_plazo" TEXT,
  "licitacion_referencia" TEXT,
  "licitacion_oc" TEXT,
  "observaciones" TEXT,
  "descuento_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "envios_parciales" BOOLEAN NOT NULL DEFAULT FALSE,
  "monto_despacho" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "fecha_plazo" TIMESTAMP(3),
  "plazo_entrega_dias" INTEGER,
  "plazo_entrega_tipo" TEXT,
  "direccion_despacho" TEXT,
  "direccion_despacho_extra" TEXT,
  "contacto_despacho" TEXT,
  "telefono_contacto_despacho" TEXT,
  "email_contacto_despacho" TEXT,
  "region_despacho" TEXT,
  "comuna_despacho" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_cotizaciones_crm_id_fkey" FOREIGN KEY ("crm_id") REFERENCES "ventas"."crm_registros"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "crm_cotizaciones_tipo_idx" ON "ventas"."crm_cotizaciones"("tipo");

CREATE TABLE IF NOT EXISTS "ventas"."crm_cotizacion_items" (
  "id" SERIAL PRIMARY KEY,
  "cotizacion_id" INTEGER NOT NULL,
  "producto_id" INTEGER NOT NULL,
  "codigo_interno" TEXT,
  "nombre" TEXT,
  "descripcion" TEXT,
  "cantidad" INTEGER NOT NULL,
  "precio_unitario" DOUBLE PRECISION NOT NULL,
  CONSTRAINT "crm_cotizacion_items_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "ventas"."crm_cotizaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "crm_cotizacion_items_cotizacion_id_idx" ON "ventas"."crm_cotizacion_items"("cotizacion_id");
CREATE INDEX IF NOT EXISTS "crm_cotizacion_items_producto_id_idx" ON "ventas"."crm_cotizacion_items"("producto_id");
