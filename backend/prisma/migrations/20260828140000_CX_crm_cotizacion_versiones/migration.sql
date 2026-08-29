-- Versionado de la cotizacion CRM y registro de la aceptacion del cliente.
--
-- CU-06 pide "versionar propuesta original y cambios posteriores" y "registrar
-- aceptacion del cliente". Hoy editar una cotizacion hace deleteMany + create
-- sobre los items, de modo que la propuesta anterior se destruye: no hay forma
-- de saber que se le ofrecio al cliente ni que fue lo que acepto.
CREATE TABLE "ventas"."crm_cotizacion_versiones" (
    "id"                SERIAL       NOT NULL,
    "cotizacion_id"     INTEGER      NOT NULL,
    "version"           INTEGER      NOT NULL,
    -- Copia completa de la propuesta: items y las condiciones comerciales que
    -- cambian el precio. Se guarda como JSON y no como filas relacionadas
    -- porque es un registro historico inmutable, no algo que se vuelva a editar.
    "snapshot"          JSONB        NOT NULL,
    "total"             DOUBLE PRECISION NOT NULL DEFAULT 0,
    "motivo"            TEXT,
    "creada_por_id"     INTEGER,
    "creada_por_nombre" TEXT,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_cotizacion_versiones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "crm_cotizacion_versiones_cotizacion_version_key"
    ON "ventas"."crm_cotizacion_versiones" ("cotizacion_id", "version");

ALTER TABLE "ventas"."crm_cotizacion_versiones"
    ADD CONSTRAINT "crm_cotizacion_versiones_cotizacion_id_fkey"
    FOREIGN KEY ("cotizacion_id") REFERENCES "ventas"."crm_cotizaciones"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Aceptacion del cliente. Se guarda contra que VERSION acepto: si despues la
-- cotizacion se edita, queda a la vista que lo aceptado ya no es lo vigente.
ALTER TABLE "ventas"."crm_cotizaciones"
    ADD COLUMN "aceptada_at"            TIMESTAMP(3),
    ADD COLUMN "aceptada_version"       INTEGER,
    ADD COLUMN "aceptada_por"           TEXT,
    ADD COLUMN "aceptacion_medio"       TEXT,
    ADD COLUMN "aceptacion_referencia"  TEXT,
    ADD COLUMN "aceptacion_registrada_por_id" INTEGER;

-- El medio tiene que ser uno de los acordados: sin esto termina siendo texto
-- libre y no se puede reportar, que es el mismo problema de la ejecutiva.
ALTER TABLE "ventas"."crm_cotizaciones"
    ADD CONSTRAINT "crm_cotizaciones_aceptacion_medio_check"
    CHECK ("aceptacion_medio" IS NULL OR "aceptacion_medio" IN ('OC', 'CORREO', 'PORTAL', 'VERBAL', 'OTRO'));
