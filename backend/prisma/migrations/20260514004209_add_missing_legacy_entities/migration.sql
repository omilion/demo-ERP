-- CreateTable
CREATE TABLE "auth"."sucursales" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT,
    "comuna" TEXT,
    "region" TEXT,
    "telefono" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes"."regiones" (
    "id" SERIAL NOT NULL,
    "codigo" INTEGER,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "regiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes"."comunas" (
    "id" SERIAL NOT NULL,
    "codigo_comuna" INTEGER,
    "codigo_region" INTEGER,
    "codigo_provincia" INTEGER,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "comunas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes"."competencia" (
    "id" SERIAL NOT NULL,
    "rut" TEXT,
    "email" TEXT,
    "nombre" TEXT,
    "razon_social" TEXT,

    CONSTRAINT "competencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."categorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "porc_desc" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mostrar" BOOLEAN NOT NULL DEFAULT true,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."subcategorias" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subcategorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."cargo_transporte" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cargo_transporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."detalle_facturas_proveedor" (
    "id" SERIAL NOT NULL,
    "pago_id" INTEGER NOT NULL,
    "codigo_interno" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "detalle_facturas_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."cotizacion_licitacion" (
    "id" SERIAL NOT NULL,
    "id_licitacion" TEXT NOT NULL,
    "fecha" TIMESTAMP(3),
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuario" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Pendiente',
    "rut_cliente" TEXT,
    "obs" TEXT,
    "plazo" TEXT,
    "orden_compra" TEXT,
    "sucursal_id" INTEGER,
    "referencia" TEXT,

    CONSTRAINT "cotizacion_licitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."cotizacion_licitacion_items" (
    "id" SERIAL NOT NULL,
    "cotizacion_id" INTEGER NOT NULL,
    "codigo_interno" TEXT,
    "nombre" TEXT,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 0,
    "cant_adjudicados" INTEGER NOT NULL DEFAULT 0,
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "cotizacion_licitacion_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."orden_compra_online" (
    "id" SERIAL NOT NULL,
    "n_compra" TEXT NOT NULL,
    "fecha_hora" TIMESTAMP(3) NOT NULL,
    "fecha_cotizacion" TIMESTAMP(3),
    "email_comprador" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estado_compra" TEXT,
    "tipo_documento" TEXT,
    "codigo_vendedor" TEXT,
    "sucursal_id" INTEGER,
    "obs_cliente" TEXT,
    "canal" TEXT,
    "texto_pie" TEXT,
    "tipo_cotizacion" TEXT,
    "costo_envio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cargo_servicio" TEXT,
    "crm_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orden_compra_online_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."multas" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER,
    "interno" TEXT,
    "monto" INTEGER,
    "n_documento" TEXT,
    "fecha" TIMESTAMP(3),
    "numero" TEXT,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "multas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."descuentos_marco" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "descuentos_marco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."historial_email" (
    "id" SERIAL NOT NULL,
    "n_compra" TEXT,
    "orden_id" INTEGER,
    "situacion" TEXT,
    "obs" TEXT,
    "usuario" TEXT,
    "fecha_hora" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historial_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."bodega_taller" (
    "id" SERIAL NOT NULL,
    "codigo_interno" TEXT NOT NULL,
    "codigo_barra" TEXT,
    "nombre" TEXT NOT NULL,
    "unidad_medida" TEXT,
    "categoria_id" INTEGER,
    "subcategoria_id" INTEGER,
    "stock_critico" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "proveedor_id" INTEGER,
    "sucursal_id" INTEGER,
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "bodega_taller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."taller_materiales" (
    "id" SERIAL NOT NULL,
    "odt_id" INTEGER,
    "codigo_interno" TEXT,
    "nombre" TEXT,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "unidad" TEXT,
    "taller" TEXT,

    CONSTRAINT "taller_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."taller_historial_materiales" (
    "id" SERIAL NOT NULL,
    "odt_id" INTEGER,
    "codigo_interno" TEXT,
    "nombre" TEXT,
    "egreso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ingreso" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unidad" TEXT,
    "usuario" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "taller" TEXT,
    "sucursal_id" INTEGER,

    CONSTRAINT "taller_historial_materiales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodega"."guias_despachos" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER,
    "n_interno" INTEGER,
    "n_guia" TEXT NOT NULL,
    "fecha_guia" TIMESTAMP(3) NOT NULL,
    "origen" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guias_despachos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodega"."despachos" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER,
    "interno" TEXT,
    "plazo_entrega" TEXT,
    "fecha_interno" TIMESTAMP(3),
    "fecha_entrega" TIMESTAMP(3),
    "tipo_despacho" TEXT,
    "transporte" TEXT,
    "monto_envio" INTEGER,
    "direccion" TEXT,
    "contacto" TEXT,
    "region" TEXT,
    "comuna" TEXT,
    "parcial" BOOLEAN NOT NULL DEFAULT false,
    "tiene_multa" BOOLEAN NOT NULL DEFAULT false,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "despachos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regiones_codigo_key" ON "clientes"."regiones"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "comunas_codigo_comuna_key" ON "clientes"."comunas"("codigo_comuna");

-- CreateIndex
CREATE INDEX "comunas_codigo_region_idx" ON "clientes"."comunas"("codigo_region");

-- CreateIndex
CREATE INDEX "subcategorias_categoria_id_idx" ON "catalogo"."subcategorias"("categoria_id");

-- CreateIndex
CREATE INDEX "detalle_facturas_proveedor_pago_id_idx" ON "catalogo"."detalle_facturas_proveedor"("pago_id");

-- CreateIndex
CREATE INDEX "cotizacion_licitacion_id_licitacion_idx" ON "ventas"."cotizacion_licitacion"("id_licitacion");

-- CreateIndex
CREATE INDEX "cotizacion_licitacion_rut_cliente_idx" ON "ventas"."cotizacion_licitacion"("rut_cliente");

-- CreateIndex
CREATE INDEX "cotizacion_licitacion_items_cotizacion_id_idx" ON "ventas"."cotizacion_licitacion_items"("cotizacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "orden_compra_online_n_compra_key" ON "ventas"."orden_compra_online"("n_compra");

-- CreateIndex
CREATE INDEX "orden_compra_online_email_comprador_idx" ON "ventas"."orden_compra_online"("email_comprador");

-- CreateIndex
CREATE INDEX "orden_compra_online_codigo_vendedor_idx" ON "ventas"."orden_compra_online"("codigo_vendedor");

-- CreateIndex
CREATE INDEX "orden_compra_online_estado_compra_idx" ON "ventas"."orden_compra_online"("estado_compra");

-- CreateIndex
CREATE INDEX "multas_orden_id_idx" ON "ventas"."multas"("orden_id");

-- CreateIndex
CREATE INDEX "descuentos_marco_orden_id_idx" ON "ventas"."descuentos_marco"("orden_id");

-- CreateIndex
CREATE INDEX "historial_email_n_compra_idx" ON "ventas"."historial_email"("n_compra");

-- CreateIndex
CREATE INDEX "historial_email_orden_id_idx" ON "ventas"."historial_email"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "bodega_taller_codigo_interno_key" ON "taller"."bodega_taller"("codigo_interno");

-- CreateIndex
CREATE INDEX "taller_materiales_odt_id_idx" ON "taller"."taller_materiales"("odt_id");

-- CreateIndex
CREATE INDEX "taller_historial_materiales_odt_id_idx" ON "taller"."taller_historial_materiales"("odt_id");

-- CreateIndex
CREATE INDEX "guias_despachos_n_interno_idx" ON "bodega"."guias_despachos"("n_interno");

-- CreateIndex
CREATE INDEX "guias_despachos_orden_id_idx" ON "bodega"."guias_despachos"("orden_id");

-- CreateIndex
CREATE INDEX "despachos_orden_id_idx" ON "bodega"."despachos"("orden_id");

-- AddForeignKey
ALTER TABLE "catalogo"."subcategorias" ADD CONSTRAINT "subcategorias_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "catalogo"."categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas"."cotizacion_licitacion_items" ADD CONSTRAINT "cotizacion_licitacion_items_cotizacion_id_fkey" FOREIGN KEY ("cotizacion_id") REFERENCES "ventas"."cotizacion_licitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
