ALTER TABLE catalogo.detalle_facturas_proveedor
  ADD COLUMN IF NOT EXISTS destino TEXT NOT NULL DEFAULT 'producto';

ALTER TABLE taller.tela_movimientos
  ADD COLUMN IF NOT EXISTS pago_proveedor_id INTEGER,
  ADD COLUMN IF NOT EXISTS origen_tipo TEXT,
  ADD COLUMN IF NOT EXISTS origen_id INTEGER;

CREATE INDEX IF NOT EXISTS tela_movimientos_pago_proveedor_id_idx
  ON taller.tela_movimientos(pago_proveedor_id);

CREATE INDEX IF NOT EXISTS tela_movimientos_origen_tipo_origen_id_idx
  ON taller.tela_movimientos(origen_tipo, origen_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tela_movimientos_pago_proveedor_id_fkey'
  ) THEN
    ALTER TABLE taller.tela_movimientos
      ADD CONSTRAINT tela_movimientos_pago_proveedor_id_fkey
      FOREIGN KEY (pago_proveedor_id) REFERENCES catalogo.pagos_proveedores(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS taller.bodega_taller_movimientos (
  id SERIAL PRIMARY KEY,
  bodega_taller_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  cantidad DOUBLE PRECISION NOT NULL,
  motivo TEXT,
  user_id INTEGER,
  pago_proveedor_id INTEGER,
  origen_tipo TEXT,
  origen_id INTEGER,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bodega_taller_movimientos_bodega_taller_id_fkey
    FOREIGN KEY (bodega_taller_id) REFERENCES taller.bodega_taller(id) ON DELETE CASCADE,
  CONSTRAINT bodega_taller_movimientos_pago_proveedor_id_fkey
    FOREIGN KEY (pago_proveedor_id) REFERENCES catalogo.pagos_proveedores(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bodega_taller_movimientos_bodega_taller_id_idx
  ON taller.bodega_taller_movimientos(bodega_taller_id);

CREATE INDEX IF NOT EXISTS bodega_taller_movimientos_pago_proveedor_id_idx
  ON taller.bodega_taller_movimientos(pago_proveedor_id);

CREATE INDEX IF NOT EXISTS bodega_taller_movimientos_origen_tipo_origen_id_idx
  ON taller.bodega_taller_movimientos(origen_tipo, origen_id);
