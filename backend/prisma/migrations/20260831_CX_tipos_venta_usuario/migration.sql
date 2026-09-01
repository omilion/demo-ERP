ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS tipos_venta_permitidos JSONB;
