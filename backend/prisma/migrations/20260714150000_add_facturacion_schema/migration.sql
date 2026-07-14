-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "facturacion";

-- CreateTable
CREATE TABLE "facturacion"."empresa" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rut" TEXT NOT NULL,
    "razon_social" TEXT NOT NULL,
    "giro" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "comuna" TEXT NOT NULL,
    "ciudad" TEXT,
    "acteco" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'certificacion',
    "rut_envia" TEXT,
    "fch_resol" TEXT,
    "nro_resol" INTEGER NOT NULL DEFAULT 0,
    "cert_pass" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturacion"."cafs" (
    "id" SERIAL NOT NULL,
    "tipo_dte" INTEGER NOT NULL,
    "folio_desde" INTEGER NOT NULL,
    "folio_hasta" INTEGER NOT NULL,
    "siguiente_folio" INTEGER NOT NULL,
    "fecha_autorizacion" TEXT,
    "ambiente" TEXT NOT NULL DEFAULT 'certificacion',
    "xml" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cafs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facturacion"."documentos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER,
    "orden_id" INTEGER,
    "guia_despacho_id" INTEGER,
    "tipo_dte" INTEGER NOT NULL,
    "folio" INTEGER,
    "fecha_emision" TEXT,
    "receptor" JSONB NOT NULL DEFAULT '{}',
    "items" JSONB NOT NULL DEFAULT '[]',
    "referencias" JSONB NOT NULL DEFAULT '[]',
    "extra" JSONB NOT NULL DEFAULT '{}',
    "totales" JSONB NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "estado_detalle" TEXT,
    "track_id" TEXT,
    "ambiente" TEXT,
    "xml" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cafs_tipo_dte_ambiente_idx" ON "facturacion"."cafs"("tipo_dte", "ambiente");

-- CreateIndex
CREATE INDEX "documentos_tipo_dte_folio_idx" ON "facturacion"."documentos"("tipo_dte", "folio");

-- CreateIndex
CREATE INDEX "documentos_cliente_id_idx" ON "facturacion"."documentos"("cliente_id");

-- CreateIndex
CREATE INDEX "documentos_orden_id_idx" ON "facturacion"."documentos"("orden_id");

-- Seed Plastimar emisor (idempotent)
INSERT INTO "facturacion"."empresa"
  (id, rut, razon_social, giro, direccion, comuna, ciudad, ambiente, nro_resol, updated_at)
VALUES
  (1, '76.354.051-0', 'PLASTIMAR LIMITADA', 'ACABADO DE PRODUCTOS TEXTILES',
   '5 Oriente 134', 'Viña del Mar', 'Viña del Mar', 'certificacion', 0, now())
ON CONFLICT (id) DO NOTHING;
