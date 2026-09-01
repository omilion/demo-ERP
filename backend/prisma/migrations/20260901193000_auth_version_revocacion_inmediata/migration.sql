-- Revocación inmediata de access tokens al modificar credenciales o permisos.
-- Los tokens emitidos antes de esta migración se consideran versión 0.
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;
