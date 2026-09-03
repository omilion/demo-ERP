-- AlterTable catalogo.pagos_proveedores
ALTER TABLE "catalogo"."pagos_proveedores"
  ADD COLUMN IF NOT EXISTS "neto" DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "iva" DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "exento" DECIMAL(12, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "monto_pagado" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "saldo" DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- CreateTable catalogo.abonos_pagos_proveedores
CREATE TABLE IF NOT EXISTS "catalogo"."abonos_pagos_proveedores" (
  "id" SERIAL NOT NULL,
  "pago_id" INTEGER NOT NULL,
  "monto" DECIMAL(12, 2) NOT NULL,
  "fecha_pago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "medio_pago" TEXT NOT NULL,
  "origen_fondos" TEXT NOT NULL,
  "banco_origen" TEXT,
  "numero_operacion" TEXT,
  "movimiento_caja_id" INTEGER,
  "usuario" TEXT,
  "comprobante_url" TEXT,
  "obs" TEXT,
  "anulado" BOOLEAN NOT NULL DEFAULT false,
  "motivo_anulacion" TEXT,
  "anulado_at" TIMESTAMP(3),
  "anulado_por" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "abonos_pagos_proveedores_pkey" PRIMARY KEY ("id")
);

-- Unique and Indexes for abonos_pagos_proveedores
CREATE UNIQUE INDEX IF NOT EXISTS "abonos_pagos_proveedores_movimiento_caja_id_key"
  ON "catalogo"."abonos_pagos_proveedores" ("movimiento_caja_id")
  WHERE "movimiento_caja_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "abonos_pagos_proveedores_pago_id_idx"
  ON "catalogo"."abonos_pagos_proveedores" ("pago_id");

CREATE INDEX IF NOT EXISTS "abonos_pagos_proveedores_anulado_idx"
  ON "catalogo"."abonos_pagos_proveedores" ("anulado");

CREATE INDEX IF NOT EXISTS "abonos_pagos_proveedores_fecha_pago_idx"
  ON "catalogo"."abonos_pagos_proveedores" ("fecha_pago");

-- Foreign Keys for abonos_pagos_proveedores
DO $$ BEGIN
  ALTER TABLE "catalogo"."abonos_pagos_proveedores"
    ADD CONSTRAINT "abonos_pagos_proveedores_pago_id_fkey"
    FOREIGN KEY ("pago_id") REFERENCES "catalogo"."pagos_proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "catalogo"."abonos_pagos_proveedores"
    ADD CONSTRAINT "abonos_pagos_proveedores_movimiento_caja_id_fkey"
    FOREIGN KEY ("movimiento_caja_id") REFERENCES "caja"."movimientos_caja"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes for pagos_proveedores
CREATE INDEX IF NOT EXISTS "pagos_proveedores_fecha_vencimiento_idx"
  ON "catalogo"."pagos_proveedores" ("fecha_vencimiento");

CREATE INDEX IF NOT EXISTS "pagos_proveedores_estado_idx"
  ON "catalogo"."pagos_proveedores" ("estado");

CREATE INDEX IF NOT EXISTS "pagos_proveedores_sucursal_id_eliminado_estado_idx"
  ON "catalogo"."pagos_proveedores" ("sucursal_id", "eliminado", "estado");

CREATE INDEX IF NOT EXISTS "pagos_proveedores_fecha_doc_idx"
  ON "catalogo"."pagos_proveedores" ("fecha_doc");

-- Backfill monto_pagado, saldo, neto, iva for existing records
UPDATE "catalogo"."pagos_proveedores"
SET
  "monto_pagado" = CASE
    WHEN "estado" = 'Pagado' THEN round("total"::numeric, 2)
    ELSE 0
  END,
  "saldo" = CASE
    WHEN "estado" = 'Pagado' THEN 0
    ELSE GREATEST(0, round(("total" - COALESCE("nc_monto", 0))::numeric, 2))
  END,
  "neto" = CASE
    WHEN "documento" = 'Factura' THEN round(("total" / 1.19)::numeric, 2)
    ELSE round("total"::numeric, 2)
  END,
  "iva" = CASE
    WHEN "documento" = 'Factura' THEN round(("total" - ("total" / 1.19))::numeric, 2)
    ELSE 0
  END,
  "exento" = 0
WHERE "total" > 0 AND ("monto_pagado" = 0 AND "saldo" = 0);
