-- Conversaciones persistentes del asistente IA: historial reabrible por usuario.
-- Idempotente para CI/dev y `prisma migrate deploy` en produccion.

CREATE TABLE IF NOT EXISTS "ai"."conversaciones" (
    "id"         SERIAL PRIMARY KEY,
    "user_id"    INTEGER NOT NULL,
    "titulo"     TEXT NOT NULL DEFAULT 'Nueva conversación',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "conversaciones_user_id_updated_at_idx"
    ON "ai"."conversaciones" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "ai"."mensajes" (
    "id"              SERIAL PRIMARY KEY,
    "conversacion_id" INTEGER NOT NULL,
    "role"            TEXT NOT NULL,
    "content"         TEXT NOT NULL,
    "documents"       JSONB,
    "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "mensajes_conversacion_id_created_at_idx"
    ON "ai"."mensajes" ("conversacion_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'mensajes_conversacion_id_fkey'
  ) THEN
    ALTER TABLE "ai"."mensajes"
      ADD CONSTRAINT "mensajes_conversacion_id_fkey"
      FOREIGN KEY ("conversacion_id") REFERENCES "ai"."conversaciones"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
