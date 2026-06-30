CREATE SCHEMA IF NOT EXISTS "ai";

CREATE TABLE "ai"."sources" (
  "id" SERIAL NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_key" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "module" TEXT NOT NULL,
  "required_permission" TEXT NOT NULL DEFAULT 'read',
  "required_any" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "required_all" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "strict_admin" BOOLEAN NOT NULL DEFAULT false,
  "sucursal_id" INTEGER,
  "field_acl" JSONB,
  "sensitivity" TEXT NOT NULL DEFAULT 'media',
  "scope" TEXT NOT NULL,
  "source_path" TEXT,
  "table_name" TEXT,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "created_at_source" TIMESTAMP(3),
  "citation" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "indexed_at" TIMESTAMP(3),
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sources_source_type_chk" CHECK ("source_type" IN ('doc', 'db_snapshot', 'report', 'audit', 'generated_report')),
  CONSTRAINT "sources_scope_chk" CHECK ("scope" IN ('operacional', 'historico', 'documental', 'mixto')),
  CONSTRAINT "sources_sensitivity_chk" CHECK ("sensitivity" IN ('baja', 'media', 'alta', 'muy_alta', 'bloqueada')),
  CONSTRAINT "sources_required_any_array_chk" CHECK (jsonb_typeof("required_any") = 'array'),
  CONSTRAINT "sources_required_all_array_chk" CHECK (jsonb_typeof("required_all") = 'array'),
  CONSTRAINT "sources_module_not_blank_chk" CHECK (length(btrim("module")) > 0),
  CONSTRAINT "sources_permission_not_blank_chk" CHECK (length(btrim("required_permission")) > 0),
  CONSTRAINT "sources_citation_not_blank_chk" CHECK (length(btrim("citation")) > 0)
);

CREATE TABLE "ai"."chunks" (
  "id" SERIAL NOT NULL,
  "source_id" INTEGER NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "content_hash" TEXT NOT NULL,
  "token_count" INTEGER,
  "module" TEXT NOT NULL,
  "required_permission" TEXT NOT NULL DEFAULT 'read',
  "required_any" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "required_all" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "strict_admin" BOOLEAN NOT NULL DEFAULT false,
  "sucursal_id" INTEGER,
  "field_acl" JSONB,
  "sensitivity" TEXT NOT NULL DEFAULT 'media',
  "scope" TEXT NOT NULL,
  "entity_type" TEXT,
  "entity_id" TEXT,
  "created_at_source" TIMESTAMP(3),
  "citation" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "chunks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chunks_chunk_index_chk" CHECK ("chunk_index" >= 0),
  CONSTRAINT "chunks_token_count_chk" CHECK ("token_count" IS NULL OR "token_count" >= 0),
  CONSTRAINT "chunks_scope_chk" CHECK ("scope" IN ('operacional', 'historico', 'documental', 'mixto')),
  CONSTRAINT "chunks_sensitivity_chk" CHECK ("sensitivity" IN ('baja', 'media', 'alta', 'muy_alta', 'bloqueada')),
  CONSTRAINT "chunks_required_any_array_chk" CHECK (jsonb_typeof("required_any") = 'array'),
  CONSTRAINT "chunks_required_all_array_chk" CHECK (jsonb_typeof("required_all") = 'array'),
  CONSTRAINT "chunks_module_not_blank_chk" CHECK (length(btrim("module")) > 0),
  CONSTRAINT "chunks_permission_not_blank_chk" CHECK (length(btrim("required_permission")) > 0),
  CONSTRAINT "chunks_citation_not_blank_chk" CHECK (length(btrim("citation")) > 0),
  CONSTRAINT "chunks_content_not_blank_chk" CHECK (length(btrim("content")) > 0)
);

CREATE TABLE "ai"."embeddings" (
  "id" SERIAL NOT NULL,
  "chunk_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "embedding" DOUBLE PRECISION[] NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "embeddings_dimensions_chk" CHECK ("dimensions" > 0),
  CONSTRAINT "embeddings_provider_not_blank_chk" CHECK (length(btrim("provider")) > 0),
  CONSTRAINT "embeddings_model_not_blank_chk" CHECK (length(btrim("model")) > 0),
  CONSTRAINT "embeddings_dimensions_match_chk" CHECK (cardinality("embedding") = "dimensions")
);

CREATE TABLE "ai"."query_logs" (
  "id" SERIAL NOT NULL,
  "request_id" TEXT,
  "user_id" INTEGER,
  "user_email" TEXT,
  "user_nombre" TEXT,
  "role" TEXT,
  "sucursal_id" INTEGER,
  "permisos_extra_hash" TEXT,
  "question" TEXT NOT NULL,
  "question_hash" TEXT,
  "normalized_query" TEXT,
  "requested_modules" JSONB,
  "allowed_modules" JSONB,
  "denied_modules" JSONB,
  "scope" TEXT NOT NULL DEFAULT 'operacional',
  "used_tools" JSONB,
  "citations" JSONB,
  "status" TEXT NOT NULL DEFAULT 'ok',
  "refusal_reason" TEXT,
  "answer_preview" TEXT,
  "model" TEXT,
  "token_usage" JSONB,
  "latency_ms" INTEGER,
  "error" TEXT,
  "ip" TEXT,
  "user_agent" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "query_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "query_logs_scope_chk" CHECK ("scope" IN ('operacional', 'historico', 'documental', 'mixto', 'todos')),
  CONSTRAINT "query_logs_status_chk" CHECK ("status" IN ('ok', 'refused', 'error')),
  CONSTRAINT "query_logs_latency_chk" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0),
  CONSTRAINT "query_logs_question_not_blank_chk" CHECK (length(btrim("question")) > 0)
);

CREATE TABLE "ai"."report_jobs" (
  "id" SERIAL NOT NULL,
  "request_id" TEXT,
  "query_log_id" INTEGER,
  "user_id" INTEGER,
  "user_email" TEXT,
  "role" TEXT,
  "sucursal_id" INTEGER,
  "permisos_extra_hash" TEXT,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "title" TEXT NOT NULL,
  "report_type" TEXT NOT NULL,
  "requested_modules" JSONB,
  "allowed_modules" JSONB,
  "denied_modules" JSONB,
  "filters" JSONB,
  "scope" TEXT NOT NULL DEFAULT 'operacional',
  "output_format" TEXT NOT NULL DEFAULT 'markdown',
  "output_path" TEXT,
  "output_hash" TEXT,
  "result_metadata" JSONB,
  "citations" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),

  CONSTRAINT "report_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_jobs_status_chk" CHECK ("status" IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT "report_jobs_progress_chk" CHECK ("progress" >= 0 AND "progress" <= 100),
  CONSTRAINT "report_jobs_scope_chk" CHECK ("scope" IN ('operacional', 'historico', 'documental', 'mixto', 'todos')),
  CONSTRAINT "report_jobs_output_format_chk" CHECK ("output_format" IN ('markdown', 'html', 'pdf')),
  CONSTRAINT "report_jobs_title_not_blank_chk" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "report_jobs_type_not_blank_chk" CHECK (length(btrim("report_type")) > 0),
  CONSTRAINT "report_jobs_dates_chk" CHECK ("completed_at" IS NULL OR "started_at" IS NULL OR "completed_at" >= "started_at")
);

CREATE UNIQUE INDEX "sources_source_key_key" ON "ai"."sources"("source_key");
CREATE INDEX "sources_module_required_permission_active_idx" ON "ai"."sources"("module", "required_permission", "active");
CREATE INDEX "sources_scope_active_idx" ON "ai"."sources"("scope", "active");
CREATE INDEX "sources_sensitivity_active_idx" ON "ai"."sources"("sensitivity", "active");
CREATE INDEX "sources_strict_admin_active_idx" ON "ai"."sources"("strict_admin", "active");
CREATE INDEX "sources_sucursal_id_idx" ON "ai"."sources"("sucursal_id");
CREATE INDEX "sources_entity_type_entity_id_idx" ON "ai"."sources"("entity_type", "entity_id");
CREATE INDEX "sources_created_at_source_idx" ON "ai"."sources"("created_at_source");
CREATE INDEX "sources_source_type_idx" ON "ai"."sources"("source_type");
CREATE INDEX "sources_required_any_gin_idx" ON "ai"."sources" USING GIN ("required_any");
CREATE INDEX "sources_required_all_gin_idx" ON "ai"."sources" USING GIN ("required_all");
CREATE INDEX "sources_field_acl_gin_idx" ON "ai"."sources" USING GIN ("field_acl");

CREATE UNIQUE INDEX "chunks_source_id_chunk_index_key" ON "ai"."chunks"("source_id", "chunk_index");
CREATE UNIQUE INDEX "chunks_source_id_content_hash_key" ON "ai"."chunks"("source_id", "content_hash");
CREATE INDEX "chunks_module_required_permission_active_idx" ON "ai"."chunks"("module", "required_permission", "active");
CREATE INDEX "chunks_scope_active_idx" ON "ai"."chunks"("scope", "active");
CREATE INDEX "chunks_sensitivity_active_idx" ON "ai"."chunks"("sensitivity", "active");
CREATE INDEX "chunks_strict_admin_active_idx" ON "ai"."chunks"("strict_admin", "active");
CREATE INDEX "chunks_sucursal_id_idx" ON "ai"."chunks"("sucursal_id");
CREATE INDEX "chunks_entity_type_entity_id_idx" ON "ai"."chunks"("entity_type", "entity_id");
CREATE INDEX "chunks_created_at_source_idx" ON "ai"."chunks"("created_at_source");
CREATE INDEX "chunks_required_any_gin_idx" ON "ai"."chunks" USING GIN ("required_any");
CREATE INDEX "chunks_required_all_gin_idx" ON "ai"."chunks" USING GIN ("required_all");
CREATE INDEX "chunks_field_acl_gin_idx" ON "ai"."chunks" USING GIN ("field_acl");

CREATE UNIQUE INDEX "embeddings_chunk_id_provider_model_key" ON "ai"."embeddings"("chunk_id", "provider", "model");
CREATE INDEX "embeddings_provider_model_idx" ON "ai"."embeddings"("provider", "model");
CREATE INDEX "embeddings_dimensions_idx" ON "ai"."embeddings"("dimensions");

CREATE UNIQUE INDEX "query_logs_request_id_key" ON "ai"."query_logs"("request_id");
CREATE INDEX "query_logs_user_id_created_at_idx" ON "ai"."query_logs"("user_id", "created_at");
CREATE INDEX "query_logs_role_created_at_idx" ON "ai"."query_logs"("role", "created_at");
CREATE INDEX "query_logs_sucursal_id_created_at_idx" ON "ai"."query_logs"("sucursal_id", "created_at");
CREATE INDEX "query_logs_scope_created_at_idx" ON "ai"."query_logs"("scope", "created_at");
CREATE INDEX "query_logs_status_created_at_idx" ON "ai"."query_logs"("status", "created_at");
CREATE INDEX "query_logs_requested_modules_gin_idx" ON "ai"."query_logs" USING GIN ("requested_modules");
CREATE INDEX "query_logs_allowed_modules_gin_idx" ON "ai"."query_logs" USING GIN ("allowed_modules");
CREATE INDEX "query_logs_denied_modules_gin_idx" ON "ai"."query_logs" USING GIN ("denied_modules");
CREATE INDEX "query_logs_citations_gin_idx" ON "ai"."query_logs" USING GIN ("citations");

CREATE UNIQUE INDEX "report_jobs_request_id_key" ON "ai"."report_jobs"("request_id");
CREATE INDEX "report_jobs_user_id_created_at_idx" ON "ai"."report_jobs"("user_id", "created_at");
CREATE INDEX "report_jobs_sucursal_id_created_at_idx" ON "ai"."report_jobs"("sucursal_id", "created_at");
CREATE INDEX "report_jobs_status_created_at_idx" ON "ai"."report_jobs"("status", "created_at");
CREATE INDEX "report_jobs_report_type_created_at_idx" ON "ai"."report_jobs"("report_type", "created_at");
CREATE INDEX "report_jobs_scope_created_at_idx" ON "ai"."report_jobs"("scope", "created_at");
CREATE INDEX "report_jobs_requested_modules_gin_idx" ON "ai"."report_jobs" USING GIN ("requested_modules");
CREATE INDEX "report_jobs_allowed_modules_gin_idx" ON "ai"."report_jobs" USING GIN ("allowed_modules");
CREATE INDEX "report_jobs_denied_modules_gin_idx" ON "ai"."report_jobs" USING GIN ("denied_modules");
CREATE INDEX "report_jobs_citations_gin_idx" ON "ai"."report_jobs" USING GIN ("citations");

ALTER TABLE "ai"."chunks"
  ADD CONSTRAINT "chunks_source_id_fkey"
  FOREIGN KEY ("source_id") REFERENCES "ai"."sources"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai"."embeddings"
  ADD CONSTRAINT "embeddings_chunk_id_fkey"
  FOREIGN KEY ("chunk_id") REFERENCES "ai"."chunks"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai"."query_logs"
  ADD CONSTRAINT "query_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai"."report_jobs"
  ADD CONSTRAINT "report_jobs_query_log_id_fkey"
  FOREIGN KEY ("query_log_id") REFERENCES "ai"."query_logs"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai"."report_jobs"
  ADD CONSTRAINT "report_jobs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
