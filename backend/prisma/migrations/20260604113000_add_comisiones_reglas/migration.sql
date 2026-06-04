CREATE TABLE "ventas"."comision_reglas" (
  "id" SERIAL NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "tipo_venta" TEXT,
  "vendedor_id" INTEGER,
  "modalidad" TEXT NOT NULL DEFAULT 'FIJA',
  "base" TEXT NOT NULL DEFAULT 'VENDIDO',
  "porcentaje" DOUBLE PRECISION,
  "prioridad" INTEGER NOT NULL DEFAULT 100,
  "vigente_desde" TIMESTAMP(3),
  "vigente_hasta" TIMESTAMP(3),
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "comision_reglas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comision_reglas_modalidad_chk"
    CHECK ("modalidad" IN ('FIJA', 'ESCALA_MONTO')),
  CONSTRAINT "comision_reglas_base_chk"
    CHECK ("base" IN ('VENDIDO', 'COBRADO')),
  CONSTRAINT "comision_reglas_fija_porcentaje_chk"
    CHECK ("modalidad" <> 'FIJA' OR ("porcentaje" IS NOT NULL AND "porcentaje" >= 0)),
  CONSTRAINT "comision_reglas_vigencia_chk"
    CHECK ("vigente_hasta" IS NULL OR "vigente_desde" IS NULL OR "vigente_hasta" >= "vigente_desde")
);

CREATE TABLE "ventas"."comision_regla_tramos" (
  "id" SERIAL NOT NULL,
  "regla_id" INTEGER NOT NULL,
  "monto_desde" DOUBLE PRECISION NOT NULL,
  "monto_hasta" DOUBLE PRECISION,
  "porcentaje" DOUBLE PRECISION NOT NULL,

  CONSTRAINT "comision_regla_tramos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "comision_regla_tramos_montos_chk"
    CHECK ("monto_desde" >= 0 AND ("monto_hasta" IS NULL OR "monto_hasta" > "monto_desde")),
  CONSTRAINT "comision_regla_tramos_porcentaje_chk"
    CHECK ("porcentaje" >= 0)
);

CREATE INDEX "comision_reglas_tipo_venta_activo_prioridad_idx"
  ON "ventas"."comision_reglas"("tipo_venta", "activo", "prioridad");

CREATE INDEX "comision_reglas_vendedor_id_activo_idx"
  ON "ventas"."comision_reglas"("vendedor_id", "activo");

CREATE INDEX "comision_reglas_vigente_desde_vigente_hasta_idx"
  ON "ventas"."comision_reglas"("vigente_desde", "vigente_hasta");

CREATE INDEX "comision_regla_tramos_regla_id_monto_desde_idx"
  ON "ventas"."comision_regla_tramos"("regla_id", "monto_desde");

ALTER TABLE "ventas"."comision_reglas"
  ADD CONSTRAINT "comision_reglas_vendedor_id_fkey"
  FOREIGN KEY ("vendedor_id") REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ventas"."comision_regla_tramos"
  ADD CONSTRAINT "comision_regla_tramos_regla_id_fkey"
  FOREIGN KEY ("regla_id") REFERENCES "ventas"."comision_reglas"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
