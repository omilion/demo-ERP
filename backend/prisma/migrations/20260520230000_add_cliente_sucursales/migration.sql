CREATE TABLE IF NOT EXISTS clientes.cliente_sucursales (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  direccion TEXT,
  region TEXT,
  comuna TEXT,
  ciudad TEXT,
  contacto TEXT,
  email TEXT,
  telefono TEXT,
  is_principal BOOLEAN NOT NULL DEFAULT false,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cliente_sucursales_cliente_id_fkey
    FOREIGN KEY (cliente_id) REFERENCES clientes.clientes(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS cliente_sucursales_cliente_id_nombre_key
  ON clientes.cliente_sucursales(cliente_id, nombre);

CREATE INDEX IF NOT EXISTS cliente_sucursales_cliente_id_idx
  ON clientes.cliente_sucursales(cliente_id);

ALTER TABLE ventas.ordenes
  ADD COLUMN IF NOT EXISTS cliente_sucursal_id INTEGER;

CREATE INDEX IF NOT EXISTS ordenes_cliente_sucursal_id_idx
  ON ventas.ordenes(cliente_sucursal_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ordenes_cliente_sucursal_id_fkey'
  ) THEN
    ALTER TABLE ventas.ordenes
      ADD CONSTRAINT ordenes_cliente_sucursal_id_fkey
      FOREIGN KEY (cliente_sucursal_id) REFERENCES clientes.cliente_sucursales(id) ON DELETE SET NULL;
  END IF;
END $$;

INSERT INTO clientes.cliente_sucursales (
  cliente_id, nombre, direccion, region, comuna, ciudad, email, telefono, is_principal, activo
)
SELECT
  c.id,
  'Principal',
  c.direccion,
  c.region,
  c.comuna,
  c.ciudad,
  c.email,
  c.telefono,
  true,
  true
FROM clientes.clientes c
WHERE c.activo = true
  AND NOT EXISTS (
    SELECT 1 FROM clientes.cliente_sucursales s WHERE s.cliente_id = c.id
  );
