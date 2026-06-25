-- Migración para añadir subrecursos de RRHH: subcontratos, certificados_antecedentes, vacunas.
-- Idempotente para `prisma migrate deploy`.

-- CreateTable subcontratos
CREATE TABLE IF NOT EXISTS "rrhh"."subcontratos" (
    "id" SERIAL PRIMARY KEY,
    "trabajador_id" INTEGER NOT NULL,
    "empresa" TEXT,
    "contrato" TEXT,
    "inicio" DATE,
    "termino" DATE,
    "documento" TEXT,
    "imagen" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "subcontratos_trabajador_id_idx" ON "rrhh"."subcontratos"("trabajador_id");

-- CreateTable certificados_antecedentes
CREATE TABLE IF NOT EXISTS "rrhh"."certificados_antecedentes" (
    "id" SERIAL PRIMARY KEY,
    "trabajador_id" INTEGER NOT NULL,
    "fecha_emision" DATE,
    "fecha_vencimiento" DATE,
    "documento" TEXT,
    "imagen" TEXT,
    "observacion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "certificados_antecedentes_trabajador_id_idx" ON "rrhh"."certificados_antecedentes"("trabajador_id");

-- CreateTable vacunas
CREATE TABLE IF NOT EXISTS "rrhh"."vacunas" (
    "id" SERIAL PRIMARY KEY,
    "trabajador_id" INTEGER NOT NULL,
    "tipo" TEXT,
    "dosis" TEXT,
    "fecha" DATE,
    "documento" TEXT,
    "imagen" TEXT,
    "observacion" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "vacunas_trabajador_id_idx" ON "rrhh"."vacunas"("trabajador_id");

-- AddForeignKey subcontratos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subcontratos_trabajador_id_fkey'
  ) THEN
    ALTER TABLE "rrhh"."subcontratos"
      ADD CONSTRAINT "subcontratos_trabajador_id_fkey"
      FOREIGN KEY ("trabajador_id") REFERENCES "rrhh"."trabajadores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey certificados_antecedentes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'certificados_antecedentes_trabajador_id_fkey'
  ) THEN
    ALTER TABLE "rrhh"."certificados_antecedentes"
      ADD CONSTRAINT "certificados_antecedentes_trabajador_id_fkey"
      FOREIGN KEY ("trabajador_id") REFERENCES "rrhh"."trabajadores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey vacunas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vacunas_trabajador_id_fkey'
  ) THEN
    ALTER TABLE "rrhh"."vacunas"
      ADD CONSTRAINT "vacunas_trabajador_id_fkey"
      FOREIGN KEY ("trabajador_id") REFERENCES "rrhh"."trabajadores"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
