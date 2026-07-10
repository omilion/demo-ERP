-- Base RRHH: schema y tabla trabajadores.
-- La tabla se creo originalmente fuera de migraciones (directo en prod/dev);
-- las migraciones 20260616120000 y 20260625141200 la alteran/referencian y
-- rompian en bases frescas (CI). Todo idempotente para bases ya existentes.
-- Sin sueldo_base/valor_hora_extra: los agrega 20260616120000.

CREATE SCHEMA IF NOT EXISTS "rrhh";

CREATE TABLE IF NOT EXISTS "rrhh"."trabajadores" (
    "id" SERIAL PRIMARY KEY,
    "empresa" TEXT NOT NULL,
    "apellido_paterno" TEXT NOT NULL,
    "apellido_materno" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "fecha_nacimiento" TEXT,
    "estado_civil" TEXT,
    "cargas_familiares" TEXT,
    "direccion" TEXT,
    "comuna" TEXT,
    "nacionalidad" TEXT,
    "afp" TEXT,
    "salud" TEXT,
    "telefono" TEXT,
    "contacto_emergencia" TEXT,
    "numero_emergencia" TEXT,
    "email" TEXT,
    "banco" TEXT,
    "tipo_cuenta" TEXT,
    "numero_cuenta" TEXT,
    "cargo" TEXT,
    "fecha_ingreso" TEXT,
    "fecha_termino" DATE,
    "tipo_contrato" TEXT,
    "sueldo_liquido" TEXT,
    "observacion" TEXT,
    "user" TEXT,
    "estado" BOOLEAN NOT NULL DEFAULT true,
    "foto" TEXT,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "trabajadores_empresa_idx" ON "rrhh"."trabajadores"("empresa");
CREATE INDEX IF NOT EXISTS "trabajadores_rut_idx" ON "rrhh"."trabajadores"("rut");
