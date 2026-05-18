-- Represent auth.audit_log locally without breaking production databases
-- where the table may already exist.
CREATE TABLE IF NOT EXISTS "auth"."audit_log" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER,
  "user_email" TEXT,
  "user_nombre" TEXT,
  "role" TEXT,
  "method" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "status" INTEGER,
  "entity" TEXT,
  "entity_id" TEXT,
  "payload" JSONB,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "auth"."audit_log"
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "user_email" TEXT,
  ADD COLUMN IF NOT EXISTS "user_nombre" TEXT,
  ADD COLUMN IF NOT EXISTS "role" TEXT,
  ADD COLUMN IF NOT EXISTS "method" TEXT,
  ADD COLUMN IF NOT EXISTS "path" TEXT,
  ADD COLUMN IF NOT EXISTS "status" INTEGER,
  ADD COLUMN IF NOT EXISTS "entity" TEXT,
  ADD COLUMN IF NOT EXISTS "entity_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payload" JSONB,
  ADD COLUMN IF NOT EXISTS "ip" TEXT,
  ADD COLUMN IF NOT EXISTS "user_agent" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "audit_log_user_id_idx" ON "auth"."audit_log"("user_id");
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx" ON "auth"."audit_log"("entity");
CREATE INDEX IF NOT EXISTS "audit_log_method_idx" ON "auth"."audit_log"("method");
CREATE INDEX IF NOT EXISTS "audit_log_created_at_idx" ON "auth"."audit_log"("created_at");

ALTER TABLE "catalogo"."pagos_proveedores"
  ADD COLUMN IF NOT EXISTS "stock_aplicado_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "pagos_proveedores_proveedor_id_idx" ON "catalogo"."pagos_proveedores"("proveedor_id");
CREATE INDEX IF NOT EXISTS "pagos_proveedores_codigo_proveedor_idx" ON "catalogo"."pagos_proveedores"("codigo_proveedor");
CREATE INDEX IF NOT EXISTS "pagos_proveedores_n_doc_idx" ON "catalogo"."pagos_proveedores"("n_doc");
