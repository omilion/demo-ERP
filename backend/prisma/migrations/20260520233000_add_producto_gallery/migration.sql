ALTER TABLE catalogo.productos
  ADD COLUMN IF NOT EXISTS fotos_galeria JSONB;
