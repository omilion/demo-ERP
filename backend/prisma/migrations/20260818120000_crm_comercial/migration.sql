ALTER TABLE "ventas"."crm_registros"
  ADD COLUMN IF NOT EXISTS "etapa_comercial" TEXT,
  ADD COLUMN IF NOT EXISTS "subestado_espera" TEXT,
  ADD COLUMN IF NOT EXISTS "canal_venta" TEXT,
  ADD COLUMN IF NOT EXISTS "tipo_venta" TEXT,
  ADD COLUMN IF NOT EXISTS "resultado_cierre" TEXT,
  ADD COLUMN IF NOT EXISTS "motivo_perdida" TEXT,
  ADD COLUMN IF NOT EXISTS "motivo_perdida_detalle" TEXT,
  ADD COLUMN IF NOT EXISTS "ultima_gestion_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "estado_cambiado_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "venta_aprobada_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "cerrado_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmacion_tipo" TEXT,
  ADD COLUMN IF NOT EXISTS "confirmacion_referencia" TEXT,
  ADD COLUMN IF NOT EXISTS "cliente_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "orden_id" INTEGER;

CREATE INDEX IF NOT EXISTS "crm_registros_etapa_comercial_idx" ON "ventas"."crm_registros"("etapa_comercial");
CREATE INDEX IF NOT EXISTS "crm_registros_resultado_cierre_idx" ON "ventas"."crm_registros"("resultado_cierre");
CREATE INDEX IF NOT EXISTS "crm_registros_ultima_gestion_at_idx" ON "ventas"."crm_registros"("ultima_gestion_at");
CREATE INDEX IF NOT EXISTS "crm_registros_cliente_id_idx" ON "ventas"."crm_registros"("cliente_id");
CREATE INDEX IF NOT EXISTS "crm_registros_orden_id_idx" ON "ventas"."crm_registros"("orden_id");

DO $$ BEGIN
  ALTER TABLE "ventas"."crm_registros"
    ADD CONSTRAINT "crm_registros_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"."clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ventas"."crm_registros"
    ADD CONSTRAINT "crm_registros_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "ventas"."crm_gestiones" (
  "id" SERIAL PRIMARY KEY,
  "crm_id" INTEGER NOT NULL,
  "tipo" TEXT NOT NULL,
  "realizada_at" TIMESTAMP(3) NOT NULL,
  "resultado" TEXT,
  "siguiente_accion" TEXT,
  "fecha_proximo" TIMESTAMP(3),
  "responsable_id" INTEGER,
  "creado_por_id" INTEGER,
  "creado_por_nombre" TEXT,
  "origen" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_gestiones_crm_id_fkey" FOREIGN KEY ("crm_id") REFERENCES "ventas"."crm_registros"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "crm_gestiones_crm_id_realizada_at_idx" ON "ventas"."crm_gestiones"("crm_id", "realizada_at");
CREATE INDEX IF NOT EXISTS "crm_gestiones_responsable_id_fecha_proximo_idx" ON "ventas"."crm_gestiones"("responsable_id", "fecha_proximo");

CREATE TABLE IF NOT EXISTS "ventas"."crm_estados_historial" (
  "id" SERIAL PRIMARY KEY,
  "crm_id" INTEGER NOT NULL,
  "estado_anterior" TEXT,
  "estado_nuevo" TEXT NOT NULL,
  "resultado_cierre" TEXT,
  "motivo" TEXT,
  "detalle" TEXT,
  "actor_id" INTEGER,
  "actor_nombre" TEXT,
  "origen" TEXT NOT NULL DEFAULT 'manual',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_estados_historial_crm_id_fkey" FOREIGN KEY ("crm_id") REFERENCES "ventas"."crm_registros"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "crm_estados_historial_crm_id_created_at_idx" ON "ventas"."crm_estados_historial"("crm_id", "created_at");
CREATE INDEX IF NOT EXISTS "crm_estados_historial_estado_nuevo_created_at_idx" ON "ventas"."crm_estados_historial"("estado_nuevo", "created_at");
