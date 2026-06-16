-- Versiona el schema `ai` y la tabla ai.query_logs (registro de consultas al
-- asistente IA gerencial). La tabla ya existe en produccion (aplicada fuera de
-- Prisma); este migration la formaliza de forma idempotente para que entornos
-- nuevos (CI, dev) la creen y para que `prisma migrate deploy` la registre.

CREATE SCHEMA IF NOT EXISTS "ai";

CREATE TABLE IF NOT EXISTS "ai"."query_logs" (
    "id"                  SERIAL PRIMARY KEY,
    "request_id"          TEXT,
    "user_id"             INTEGER,
    "user_email"          TEXT,
    "user_nombre"         TEXT,
    "role"                TEXT,
    "sucursal_id"         INTEGER,
    "permisos_extra_hash" TEXT,
    "question"            TEXT NOT NULL,
    "question_hash"       TEXT,
    "normalized_query"    TEXT,
    "requested_modules"   JSONB,
    "allowed_modules"     JSONB,
    "denied_modules"      JSONB,
    "scope"               TEXT NOT NULL DEFAULT 'operacional',
    "used_tools"          JSONB,
    "citations"           JSONB,
    "status"              TEXT NOT NULL DEFAULT 'ok',
    "refusal_reason"      TEXT,
    "answer_preview"      TEXT,
    "model"               TEXT,
    "token_usage"         JSONB,
    "latency_ms"          INTEGER,
    "error"               TEXT,
    "ip"                  TEXT,
    "user_agent"          TEXT,
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "query_logs_request_id_key" ON "ai"."query_logs"("request_id");
CREATE INDEX IF NOT EXISTS "query_logs_user_id_created_at_idx" ON "ai"."query_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "query_logs_status_created_at_idx" ON "ai"."query_logs"("status", "created_at");
