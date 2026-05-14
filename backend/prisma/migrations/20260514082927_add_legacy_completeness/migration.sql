-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "config";

-- AlterTable
ALTER TABLE "auth"."users" ADD COLUMN     "codigo_vendedor" TEXT,
ADD COLUMN     "permiso_descuentos" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rut" TEXT;

-- AlterTable
ALTER TABLE "caja"."movimientos_caja" ADD COLUMN     "cuotas" INTEGER,
ADD COLUMN     "documento" TEXT,
ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "estado_doc" TEXT,
ADD COLUMN     "estado_pago_doc" TEXT,
ADD COLUMN     "fecham" TIMESTAMP(3),
ADD COLUMN     "gasto_tipo_id" INTEGER,
ADD COLUMN     "n_doc" TEXT,
ADD COLUMN     "n_medio_pago" TEXT,
ADD COLUMN     "numero_nc_interna" TEXT,
ADD COLUMN     "origen_medio_pago" TEXT,
ADD COLUMN     "paga_con" DOUBLE PRECISION,
ADD COLUMN     "tipo_documento" TEXT,
ADD COLUMN     "user_mod" TEXT;

-- AlterTable
ALTER TABLE "catalogo"."pagos_proveedores" ADD COLUMN     "nc_numero" TEXT,
ADD COLUMN     "sucursal_id" INTEGER;

-- AlterTable
ALTER TABLE "catalogo"."productos" ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "estado_inventario" TEXT,
ADD COLUMN     "id_marco" TEXT,
ADD COLUMN     "porc_desc" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subcategoria_id" INTEGER,
ADD COLUMN     "unidad_medida" TEXT;

-- AlterTable
ALTER TABLE "catalogo"."proveedores" ADD COLUMN     "pago_factura" TEXT;

-- AlterTable
ALTER TABLE "clientes"."clientes" ADD COLUMN     "comuna" TEXT,
ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "giro" TEXT,
ADD COLUMN     "region" TEXT;

-- AlterTable
ALTER TABLE "taller"."bitacora_taller" ADD COLUMN     "fecha" TIMESTAMP(3),
ADD COLUMN     "sucursal_id" INTEGER,
ADD COLUMN     "usuario_reporta" TEXT;

-- AlterTable
ALTER TABLE "taller"."odt_items" ADD COLUMN     "codigo_interno" TEXT,
ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_listo" TIMESTAMP(3),
ADD COLUMN     "nombre" TEXT,
ADD COLUMN     "obs" TEXT,
ADD COLUMN     "usuario" TEXT;

-- AlterTable
ALTER TABLE "taller"."odts" ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emergencia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_ingreso" TIMESTAMP(3),
ADD COLUMN     "obs_general" TEXT,
ADD COLUMN     "sucursal_id" INTEGER;

-- AlterTable
ALTER TABLE "ventas"."orden_compra_online" ADD COLUMN     "historial_cargo" TEXT,
ADD COLUMN     "n_impresiones" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ventas"."orden_items" ADD COLUMN     "cargo_transporte" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "codigo_interno" TEXT,
ADD COLUMN     "descripcion" TEXT,
ADD COLUMN     "eliminado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecham" TIMESTAMP(3),
ADD COLUMN     "n_entregados" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nombre" TEXT,
ADD COLUMN     "precio_con_iva" DOUBLE PRECISION,
ADD COLUMN     "user_mod" TEXT;

-- AlterTable
ALTER TABLE "ventas"."ordenes" ADD COLUMN     "eliminada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_cliente" TEXT,
ADD COLUMN     "fecha_estado_entrega" TIMESTAMP(3),
ADD COLUMN     "fecham" TIMESTAMP(3),
ADD COLUMN     "n_impresiones" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "n_interno" INTEGER,
ADD COLUMN     "rut_cliente" TEXT,
ADD COLUMN     "user_mod" TEXT;

-- CreateTable
CREATE TABLE "auth"."accesos" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "usuario" TEXT NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'erp',
    "estado" TEXT NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."empresa" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "rut" TEXT NOT NULL,
    "razon_social" TEXT,
    "giro" TEXT,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "region" TEXT,
    "comuna" TEXT,
    "codigo_empresa" INTEGER,
    "logo_url" TEXT,
    "texto_pie" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."firmas_email" (
    "id" SERIAL NOT NULL,
    "alias" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firma" TEXT NOT NULL,
    "foto_url" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "firmas_email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config"."bloqueo_pagina" (
    "id" SERIAL NOT NULL,
    "modulo" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "texto" TEXT,

    CONSTRAINT "bloqueo_pagina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."relacion_productos" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "relacionado_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'relacionado',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relacion_productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."orden_cargos" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "orden_cargos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."orden_compra_online_items" (
    "id" SERIAL NOT NULL,
    "orden_compra_id" INTEGER NOT NULL,
    "codigo_interno" TEXT,
    "nombre" TEXT,
    "descripcion" TEXT,
    "cantidad" INTEGER NOT NULL,
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "orden_compra_online_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."descuentos_ventas" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "descuentos_ventas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."descuentos_porc" (
    "id" SERIAL NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "descuentos_porc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."descuentos_porc_marco" (
    "id" SERIAL NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "descuentos_porc_marco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja"."cierres_caja" (
    "id" SERIAL NOT NULL,
    "turno_id" INTEGER NOT NULL,
    "efectivo" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credito" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cheque_dia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cheque_fecha" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transferencia" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "webpay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "transbank" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "comision" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otros" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "obs" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja"."gastos" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."talleres" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "talleres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."odt_item_talleres" (
    "id" SERIAL NOT NULL,
    "odt_item_id" INTEGER NOT NULL,
    "taller_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "obs" TEXT,
    "fecha_inicio" TIMESTAMP(3),
    "fecha_listo" TIMESTAMP(3),
    "usuario" TEXT,
    "usuario_listo" TEXT,

    CONSTRAINT "odt_item_talleres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."telas" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipo" TEXT,
    "nombre" TEXT,
    "ubicacion" TEXT,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."tela_movimientos" (
    "id" SERIAL NOT NULL,
    "tela_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,
    "factura" TEXT,
    "cortador" TEXT,
    "ubicacion" TEXT,
    "usuario" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tela_movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accesos_user_id_idx" ON "auth"."accesos"("user_id");

-- CreateIndex
CREATE INDEX "accesos_fecha_idx" ON "auth"."accesos"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "bloqueo_pagina_modulo_key" ON "config"."bloqueo_pagina"("modulo");

-- CreateIndex
CREATE INDEX "relacion_productos_producto_id_idx" ON "catalogo"."relacion_productos"("producto_id");

-- CreateIndex
CREATE UNIQUE INDEX "relacion_productos_producto_id_relacionado_id_key" ON "catalogo"."relacion_productos"("producto_id", "relacionado_id");

-- CreateIndex
CREATE INDEX "orden_cargos_orden_id_idx" ON "ventas"."orden_cargos"("orden_id");

-- CreateIndex
CREATE INDEX "orden_compra_online_items_orden_compra_id_idx" ON "ventas"."orden_compra_online_items"("orden_compra_id");

-- CreateIndex
CREATE INDEX "descuentos_ventas_orden_id_idx" ON "ventas"."descuentos_ventas"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_caja_turno_id_key" ON "caja"."cierres_caja"("turno_id");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_nombre_key" ON "caja"."gastos"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "talleres_nombre_key" ON "taller"."talleres"("nombre");

-- CreateIndex
CREATE INDEX "odt_item_talleres_taller_id_idx" ON "taller"."odt_item_talleres"("taller_id");

-- CreateIndex
CREATE UNIQUE INDEX "odt_item_talleres_odt_item_id_taller_id_key" ON "taller"."odt_item_talleres"("odt_item_id", "taller_id");

-- CreateIndex
CREATE UNIQUE INDEX "telas_codigo_key" ON "taller"."telas"("codigo");

-- CreateIndex
CREATE INDEX "tela_movimientos_tela_id_idx" ON "taller"."tela_movimientos"("tela_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_codigo_vendedor_key" ON "auth"."users"("codigo_vendedor");

-- CreateIndex
CREATE INDEX "users_codigo_vendedor_idx" ON "auth"."users"("codigo_vendedor");

-- CreateIndex
CREATE INDEX "movimientos_caja_gasto_tipo_id_idx" ON "caja"."movimientos_caja"("gasto_tipo_id");

-- CreateIndex
CREATE INDEX "productos_subcategoria_id_idx" ON "catalogo"."productos"("subcategoria_id");

-- CreateIndex
CREATE INDEX "productos_categoria_id_idx" ON "catalogo"."productos"("categoria_id");

-- CreateIndex
CREATE INDEX "odt_items_odt_id_idx" ON "taller"."odt_items"("odt_id");

-- CreateIndex
CREATE INDEX "orden_items_orden_id_idx" ON "ventas"."orden_items"("orden_id");

-- CreateIndex
CREATE UNIQUE INDEX "ordenes_n_interno_key" ON "ventas"."ordenes"("n_interno");

-- CreateIndex
CREATE INDEX "ordenes_n_interno_idx" ON "ventas"."ordenes"("n_interno");

-- CreateIndex
CREATE INDEX "ordenes_rut_cliente_idx" ON "ventas"."ordenes"("rut_cliente");

-- AddForeignKey
ALTER TABLE "auth"."accesos" ADD CONSTRAINT "accesos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalogo"."productos" ADD CONSTRAINT "productos_subcategoria_id_fkey" FOREIGN KEY ("subcategoria_id") REFERENCES "catalogo"."subcategorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas"."orden_cargos" ADD CONSTRAINT "orden_cargos_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas"."orden_compra_online_items" ADD CONSTRAINT "orden_compra_online_items_orden_compra_id_fkey" FOREIGN KEY ("orden_compra_id") REFERENCES "ventas"."orden_compra_online"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja"."movimientos_caja" ADD CONSTRAINT "movimientos_caja_gasto_tipo_id_fkey" FOREIGN KEY ("gasto_tipo_id") REFERENCES "caja"."gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja"."cierres_caja" ADD CONSTRAINT "cierres_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "caja"."turnos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taller"."odt_item_talleres" ADD CONSTRAINT "odt_item_talleres_odt_item_id_fkey" FOREIGN KEY ("odt_item_id") REFERENCES "taller"."odt_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taller"."odt_item_talleres" ADD CONSTRAINT "odt_item_talleres_taller_id_fkey" FOREIGN KEY ("taller_id") REFERENCES "taller"."talleres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taller"."tela_movimientos" ADD CONSTRAINT "tela_movimientos_tela_id_fkey" FOREIGN KEY ("tela_id") REFERENCES "taller"."telas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

