ALTER TABLE "auth"."users" ADD COLUMN IF NOT EXISTS "permisos_extra" JSONB;
