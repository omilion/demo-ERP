-- Schema coherence fixes
-- 1) CobranzaHistorico montos Int -> Float
ALTER TABLE ventas.cobranza_historico ALTER COLUMN monto TYPE double precision USING monto::double precision;
ALTER TABLE ventas.cobranza_historico ALTER COLUMN monto_menos TYPE double precision USING monto_menos::double precision;
ALTER TABLE ventas.cobranza_historico ALTER COLUMN nc TYPE double precision USING nc::double precision;
ALTER TABLE ventas.cobranza_historico ALTER COLUMN valor_factura TYPE double precision USING valor_factura::double precision;
ALTER TABLE ventas.cobranza_historico ALTER COLUMN multas TYPE double precision USING multas::double precision;

-- 2) CotizacionLicitacion descuento_pct
ALTER TABLE ventas.cotizacion_licitacion ADD COLUMN IF NOT EXISTS descuento_pct double precision NOT NULL DEFAULT 0;

-- 3) GuiaDespacho FK
ALTER TABLE bodega.guias_despachos DROP CONSTRAINT IF EXISTS guias_despachos_orden_id_fkey;
ALTER TABLE bodega.guias_despachos ADD CONSTRAINT guias_despachos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ventas.ordenes(id) ON DELETE SET NULL;

-- 4) Despacho FK
ALTER TABLE bodega.despachos DROP CONSTRAINT IF EXISTS despachos_orden_id_fkey;
ALTER TABLE bodega.despachos ADD CONSTRAINT despachos_orden_id_fkey FOREIGN KEY (orden_id) REFERENCES ventas.ordenes(id) ON DELETE SET NULL;

-- 5) CrmRegistro estado Int -> String
ALTER TABLE ventas.crm_registros ALTER COLUMN estado TYPE text USING estado::text;
