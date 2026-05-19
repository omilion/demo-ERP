-- Enforce the new ERP relational contract for future writes without blocking
-- existing legacy rows that still need reconciliation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ordenes_cliente_id_required_new'
      AND conrelid = 'ventas.ordenes'::regclass
  ) THEN
    ALTER TABLE ventas.ordenes
      ADD CONSTRAINT ordenes_cliente_id_required_new
      CHECK (cliente_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ordenes_cliente_id_fkey'
      AND conrelid = 'ventas.ordenes'::regclass
  ) THEN
    ALTER TABLE ventas.ordenes
      ADD CONSTRAINT ordenes_cliente_id_fkey
      FOREIGN KEY (cliente_id) REFERENCES clientes.clientes(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'odts_orden_id_required_new'
      AND conrelid = 'taller.odts'::regclass
  ) THEN
    ALTER TABLE taller.odts
      ADD CONSTRAINT odts_orden_id_required_new
      CHECK (orden_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bitacora_taller_odt_id_required_new'
      AND conrelid = 'taller.bitacora_taller'::regclass
  ) THEN
    ALTER TABLE taller.bitacora_taller
      ADD CONSTRAINT bitacora_taller_odt_id_required_new
      CHECK (odt_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taller_materiales_odt_id_required_new'
      AND conrelid = 'taller.taller_materiales'::regclass
  ) THEN
    ALTER TABLE taller.taller_materiales
      ADD CONSTRAINT taller_materiales_odt_id_required_new
      CHECK (odt_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'taller_historial_materiales_odt_id_required_new'
      AND conrelid = 'taller.taller_historial_materiales'::regclass
  ) THEN
    ALTER TABLE taller.taller_historial_materiales
      ADD CONSTRAINT taller_historial_materiales_odt_id_required_new
      CHECK (odt_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'despachos_orden_id_required_new'
      AND conrelid = 'bodega.despachos'::regclass
  ) THEN
    ALTER TABLE bodega.despachos
      ADD CONSTRAINT despachos_orden_id_required_new
      CHECK (orden_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'guias_despachos_orden_id_required_new'
      AND conrelid = 'bodega.guias_despachos'::regclass
  ) THEN
    ALTER TABLE bodega.guias_despachos
      ADD CONSTRAINT guias_despachos_orden_id_required_new
      CHECK (orden_id IS NOT NULL)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'taller_materiales_odt_id_fkey'
      AND conrelid = 'taller.taller_materiales'::regclass
  ) THEN
    ALTER TABLE taller.taller_materiales
      ADD CONSTRAINT taller_materiales_odt_id_fkey
      FOREIGN KEY (odt_id) REFERENCES taller.odts(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'taller_historial_materiales_odt_id_fkey'
      AND conrelid = 'taller.taller_historial_materiales'::regclass
  ) THEN
    ALTER TABLE taller.taller_historial_materiales
      ADD CONSTRAINT taller_historial_materiales_odt_id_fkey
      FOREIGN KEY (odt_id) REFERENCES taller.odts(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;
