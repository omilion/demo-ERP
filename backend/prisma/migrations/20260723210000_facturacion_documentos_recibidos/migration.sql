CREATE TABLE IF NOT EXISTS "facturacion"."documentos_recibidos" (
  "id" SERIAL PRIMARY KEY,
  "gmail_message_id" TEXT NOT NULL,
  "gmail_attachment_id" TEXT NOT NULL,
  "gmail_thread_id" TEXT,
  "archivo_nombre" TEXT,
  "recibido_en" TIMESTAMP(3),
  "remitente" TEXT,
  "asunto" TEXT,
  "xml" TEXT NOT NULL,
  "tipo_dte" INTEGER NOT NULL,
  "folio" INTEGER,
  "fecha_emision" TEXT,
  "rut_emisor" TEXT,
  "razon_social_emisor" TEXT,
  "receptor" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "items" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "detalles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "referencias" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totales" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "visto_en" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "documentos_recibidos_gmail_message_id_gmail_attachment_id_key" UNIQUE ("gmail_message_id", "gmail_attachment_id")
);
CREATE INDEX IF NOT EXISTS "documentos_recibidos_tipo_dte_fecha_emision_idx" ON "facturacion"."documentos_recibidos" ("tipo_dte", "fecha_emision");
CREATE INDEX IF NOT EXISTS "documentos_recibidos_estado_recibido_en_idx" ON "facturacion"."documentos_recibidos" ("estado", "recibido_en");
