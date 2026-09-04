-- Feedback de marcha blanca: separado de los datos operativos y de la bitácora
-- inmutable. Las capturas se guardan fuera de /uploads y sólo se sirven a través
-- de una ruta autenticada.
CREATE TABLE IF NOT EXISTS "auth"."pilot_feedback" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" INTEGER,
  "reporter_name" TEXT,
  "reporter_email" TEXT,
  "reporter_role" TEXT,
  "module" TEXT NOT NULL,
  "submodule" TEXT,
  "route" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "related_entities" JSONB,
  "workflow_state" TEXT,
  "flow_origin" TEXT,
  "external_api" BOOLEAN NOT NULL DEFAULT false,
  "category" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'media',
  "priority" TEXT DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'nuevo',
  "note" TEXT NOT NULL,
  "expected" TEXT,
  "browser" TEXT,
  "viewport" TEXT,
  "app_version" TEXT,
  "annotation" JSONB,
  "screenshot_path" TEXT,
  "screenshot_mime" TEXT,
  "screenshot_sha256" TEXT,
  "redaction_version" TEXT,
  "sanitized_error" JSONB,
  "assignee_id" INTEGER,
  "resolution_reference" TEXT,
  "resolution_note" TEXT,
  "retention_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pilot_feedback_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_feedback_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pilot_feedback_status_created_at_idx"
  ON "auth"."pilot_feedback" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "pilot_feedback_module_created_at_idx"
  ON "auth"."pilot_feedback" ("module", "created_at");
CREATE INDEX IF NOT EXISTS "pilot_feedback_user_id_created_at_idx"
  ON "auth"."pilot_feedback" ("user_id", "created_at");
