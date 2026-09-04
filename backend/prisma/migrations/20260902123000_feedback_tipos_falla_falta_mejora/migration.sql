-- Clasificación operativa de feedback de marcha blanca. Los tipos anteriores
-- se conservan como señal: fallas técnicas pasan a "falla" y observaciones de
-- uso/capacitación a "mejora". No se borra ningún reporte existente.
DO $$ BEGIN
  CREATE TYPE "auth"."PilotFeedbackCategory" AS ENUM ('falla', 'falta', 'mejora');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "auth"."PilotFeedbackSeverity" AS ENUM ('bloqueante', 'alta', 'media', 'baja');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "auth"."PilotFeedbackReproducibility" AS ENUM ('siempre', 'a_veces', 'una_vez');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "auth"."pilot_feedback"
  ALTER COLUMN "category" DROP DEFAULT,
  ALTER COLUMN "category" TYPE "auth"."PilotFeedbackCategory"
  USING (
    CASE
      WHEN "category"::text IN ('falla', 'error_funcional', 'datos', 'permisos', 'integracion', 'rendimiento') THEN 'falla'::"auth"."PilotFeedbackCategory"
      WHEN "category"::text = 'falta' THEN 'falta'::"auth"."PilotFeedbackCategory"
      ELSE 'mejora'::"auth"."PilotFeedbackCategory"
    END
  ),
  ALTER COLUMN "category" SET NOT NULL;

ALTER TABLE "auth"."pilot_feedback"
  ALTER COLUMN "severity" DROP DEFAULT,
  ALTER COLUMN "severity" DROP NOT NULL,
  ALTER COLUMN "severity" TYPE "auth"."PilotFeedbackSeverity"
  USING (
    CASE
      WHEN "severity"::text IN ('bloqueante', 'critica') THEN 'bloqueante'::"auth"."PilotFeedbackSeverity"
      WHEN "severity"::text = 'alta' THEN 'alta'::"auth"."PilotFeedbackSeverity"
      WHEN "severity"::text = 'media' THEN 'media'::"auth"."PilotFeedbackSeverity"
      WHEN "severity"::text = 'baja' THEN 'baja'::"auth"."PilotFeedbackSeverity"
      ELSE NULL
    END
  );

ALTER TABLE "auth"."pilot_feedback"
  RENAME COLUMN "expected" TO "comportamiento_esperado";

ALTER TABLE "auth"."pilot_feedback"
  ADD COLUMN "es_reproducible" "auth"."PilotFeedbackReproducibility",
  ADD COLUMN "que_falta" TEXT,
  ADD COLUMN "para_que_se_necesita" TEXT,
  ADD COLUMN "bloquea_flujo" BOOLEAN,
  ADD COLUMN "que_existe_hoy" TEXT,
  ADD COLUMN "que_se_propone" TEXT,
  ADD COLUMN "impacto_esperado" TEXT;

-- Los reportes existentes mantienen sentido bajo el nuevo contrato. La API
-- exige los campos específicos para todo reporte creado desde esta migración.
UPDATE "auth"."pilot_feedback"
SET "es_reproducible" = 'a_veces'::"auth"."PilotFeedbackReproducibility"
WHERE "category" = 'falla' AND "es_reproducible" IS NULL;

UPDATE "auth"."pilot_feedback"
SET "severity" = NULL
WHERE "category" <> 'falla';

UPDATE "auth"."pilot_feedback"
SET "que_se_propone" = "note"
WHERE "category" = 'mejora' AND "que_se_propone" IS NULL;
