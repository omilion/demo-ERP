ALTER TABLE "facturacion"."documentos_recibidos"
  ADD COLUMN IF NOT EXISTS "pago_proveedor_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "documentos_recibidos_pago_proveedor_id_key"
  ON "facturacion"."documentos_recibidos" ("pago_proveedor_id")
  WHERE "pago_proveedor_id" IS NOT NULL;

DO $$ BEGIN
  ALTER TABLE "facturacion"."documentos_recibidos"
    ADD CONSTRAINT "documentos_recibidos_pago_proveedor_id_fkey"
    FOREIGN KEY ("pago_proveedor_id") REFERENCES "catalogo"."pagos_proveedores"("id") ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
