CREATE TABLE IF NOT EXISTS "catalogo"."usuarios_web" (
  "id" SERIAL NOT NULL,
  "email" TEXT NOT NULL,
  "password_hash" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "rut" TEXT,
  "telefono" TEXT,
  "direccion" TEXT,
  "comuna" TEXT,
  "region" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usuarios_web_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_web_email_key" ON "catalogo"."usuarios_web"("email");

CREATE TABLE IF NOT EXISTS "catalogo"."banners" (
  "id" SERIAL NOT NULL,
  "titulo" TEXT NOT NULL,
  "subtitulo" TEXT,
  "imagen_url" TEXT,
  "link" TEXT,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "desde" TIMESTAMP(3),
  "hasta" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);
