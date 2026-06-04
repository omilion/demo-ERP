CREATE TABLE "ventas"."descuento_reglas" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "alcance" TEXT NOT NULL DEFAULT 'ventas',
  "tipo_descuento" TEXT NOT NULL DEFAULT 'porcentaje',
  "prioridad" INTEGER NOT NULL DEFAULT 100,
  "condiciones" JSONB,
  "efecto" JSONB,
  "porcentaje_max" DOUBLE PRECISION,
  "monto_max" DOUBLE PRECISION,
  "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false,
  "vigente_desde" TIMESTAMP(3),
  "vigente_hasta" TIMESTAMP(3),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "descuento_reglas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ventas"."descuento_solicitudes" (
  "id" SERIAL NOT NULL,
  "regla_id" INTEGER,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "origen_tipo" TEXT,
  "solicitante_id" INTEGER,
  "solicitante_nombre" TEXT,
  "aprobador_id" INTEGER,
  "aprobador_nombre" TEXT,
  "descuento_pct_solicitado" DOUBLE PRECISION,
  "descuento_pct_aprobado" DOUBLE PRECISION,
  "descuento_monto_solicitado" DOUBLE PRECISION,
  "descuento_monto_aprobado" DOUBLE PRECISION,
  "subtotal_base" DOUBLE PRECISION,
  "motivo" TEXT,
  "comentario_resolucion" TEXT,
  "contexto_snapshot" JSONB,
  "resultado_snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "resuelto_at" TIMESTAMP(3),

  CONSTRAINT "descuento_solicitudes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ventas"."ordenes"
  ADD COLUMN IF NOT EXISTS "descuento_solicitud_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "descuento_monto" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "descuento_snapshot" JSONB;

ALTER TABLE "ventas"."cotizacion_licitacion"
  ADD COLUMN IF NOT EXISTS "descuento_solicitud_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "descuento_monto" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "descuento_snapshot" JSONB;

CREATE UNIQUE INDEX "descuento_reglas_codigo_version_key"
  ON "ventas"."descuento_reglas"("codigo", "version");

CREATE INDEX "descuento_reglas_codigo_activo_idx"
  ON "ventas"."descuento_reglas"("codigo", "activo");

CREATE INDEX "descuento_reglas_activo_prioridad_idx"
  ON "ventas"."descuento_reglas"("activo", "prioridad");

CREATE INDEX "descuento_reglas_alcance_activo_idx"
  ON "ventas"."descuento_reglas"("alcance", "activo");

CREATE INDEX "descuento_reglas_vigente_desde_vigente_hasta_idx"
  ON "ventas"."descuento_reglas"("vigente_desde", "vigente_hasta");

CREATE INDEX "descuento_solicitudes_regla_id_idx"
  ON "ventas"."descuento_solicitudes"("regla_id");

CREATE INDEX "descuento_solicitudes_estado_created_at_idx"
  ON "ventas"."descuento_solicitudes"("estado", "created_at");

CREATE INDEX "descuento_solicitudes_solicitante_id_created_at_idx"
  ON "ventas"."descuento_solicitudes"("solicitante_id", "created_at");

CREATE INDEX "descuento_solicitudes_aprobador_id_resuelto_at_idx"
  ON "ventas"."descuento_solicitudes"("aprobador_id", "resuelto_at");

CREATE UNIQUE INDEX IF NOT EXISTS "ordenes_descuento_solicitud_id_key"
  ON "ventas"."ordenes"("descuento_solicitud_id");

CREATE UNIQUE INDEX IF NOT EXISTS "cotizacion_licitacion_descuento_solicitud_id_key"
  ON "ventas"."cotizacion_licitacion"("descuento_solicitud_id");

ALTER TABLE "ventas"."descuento_solicitudes"
  ADD CONSTRAINT "descuento_solicitudes_regla_id_fkey"
  FOREIGN KEY ("regla_id") REFERENCES "ventas"."descuento_reglas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ordenes_descuento_solicitud_id_fkey'
      AND conrelid = 'ventas.ordenes'::regclass
  ) THEN
    ALTER TABLE "ventas"."ordenes"
      ADD CONSTRAINT "ordenes_descuento_solicitud_id_fkey"
      FOREIGN KEY ("descuento_solicitud_id") REFERENCES "ventas"."descuento_solicitudes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cotizacion_licitacion_descuento_solicitud_id_fkey'
      AND conrelid = 'ventas.cotizacion_licitacion'::regclass
  ) THEN
    ALTER TABLE "ventas"."cotizacion_licitacion"
      ADD CONSTRAINT "cotizacion_licitacion_descuento_solicitud_id_fkey"
      FOREIGN KEY ("descuento_solicitud_id") REFERENCES "ventas"."descuento_solicitudes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;
