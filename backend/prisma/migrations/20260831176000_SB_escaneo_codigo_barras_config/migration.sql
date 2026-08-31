-- Interruptor explícito: se despliega apagado porque el catálogo productivo
-- aún no tiene códigos completos. Bodega lo habilita cuando termine la carga.
ALTER TABLE config.empresa
  ADD COLUMN IF NOT EXISTS escaneo_codigo_barras_obligatorio BOOLEAN NOT NULL DEFAULT FALSE;
