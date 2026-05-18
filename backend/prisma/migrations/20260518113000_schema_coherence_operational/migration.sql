-- Formalizes the schema coherence fixes that previously existed only as a manual SQL script.
-- The foreign keys are added NOT VALID so existing production rows can be audited and cleaned
-- without blocking deploy; PostgreSQL still enforces them for new writes.

ALTER TABLE ventas.cobranza_historico
  ALTER COLUMN monto TYPE double precision USING monto::double precision,
  ALTER COLUMN monto_menos TYPE double precision USING monto_menos::double precision,
  ALTER COLUMN nc TYPE double precision USING nc::double precision,
  ALTER COLUMN valor_factura TYPE double precision USING valor_factura::double precision,
  ALTER COLUMN multas TYPE double precision USING multas::double precision;

ALTER TABLE ventas.cotizacion_licitacion
  ADD COLUMN IF NOT EXISTS descuento_pct double precision NOT NULL DEFAULT 0;

ALTER TABLE ventas.crm_registros
  ALTER COLUMN estado TYPE text USING estado::text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guias_despachos_orden_id_fkey'
      AND conrelid = 'bodega.guias_despachos'::regclass
  ) THEN
    ALTER TABLE bodega.guias_despachos
      ADD CONSTRAINT guias_despachos_orden_id_fkey
      FOREIGN KEY (orden_id) REFERENCES ventas.ordenes(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'despachos_orden_id_fkey'
      AND conrelid = 'bodega.despachos'::regclass
  ) THEN
    ALTER TABLE bodega.despachos
      ADD CONSTRAINT despachos_orden_id_fkey
      FOREIGN KEY (orden_id) REFERENCES ventas.ordenes(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;
