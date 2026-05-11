-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "bodega";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "caja";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "catalogo";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clientes";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "taller";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "ventas";

-- CreateEnum
CREATE TYPE "auth"."Role" AS ENUM ('admin', 'vendedor', 'bodeguero', 'cajero', 'taller', 'rrhh', 'solo_lectura');

-- CreateTable
CREATE TABLE "auth"."users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "auth"."Role" NOT NULL,
    "nombre" TEXT NOT NULL,
    "sucursal_id" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientes"."clientes" (
    "id" SERIAL NOT NULL,
    "rut" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "razon_social" TEXT,
    "limite_credito" DOUBLE PRECISION,
    "dias_inactivo_alerta" INTEGER,
    "segmento" TEXT DEFAULT 'C',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalogo"."productos" (
    "id" SERIAL NOT NULL,
    "codigo_interno" TEXT NOT NULL,
    "codigo_barra" TEXT,
    "nombre" TEXT NOT NULL,
    "categoria_id" INTEGER,
    "proveedor_id" INTEGER,
    "precio_lista" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "precio_marco" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "stock_critico" INTEGER NOT NULL DEFAULT 0,
    "ubicacion" TEXT,
    "visible_web" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."ordenes" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "estado_pago" TEXT NOT NULL DEFAULT 'no_pagada',
    "estado_entrega" TEXT NOT NULL DEFAULT 'pendiente',
    "cliente_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "sucursal_id" INTEGER,
    "descuento_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requiere_aprobacion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventas"."orden_items" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "precio_unitario" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "orden_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja"."cajas" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "sucursal_id" INTEGER,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "cajas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja"."turnos" (
    "id" SERIAL NOT NULL,
    "caja_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'abierto',
    "apertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cierre" TIMESTAMP(3),

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caja"."movimientos_caja" (
    "id" SERIAL NOT NULL,
    "turno_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "medio_pago" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_caja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."odts" (
    "id" SERIAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "prioridad" TEXT NOT NULL DEFAULT 'normal',
    "vendedor_id" INTEGER,
    "operario_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taller"."odt_items" (
    "id" SERIAL NOT NULL,
    "odt_id" INTEGER NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "cantidad" INTEGER NOT NULL,

    CONSTRAINT "odt_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bodega"."movimientos" (
    "id" SERIAL NOT NULL,
    "producto_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "auth"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "auth"."sessions"("refresh_token");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_rut_key" ON "clientes"."clientes"("rut");

-- CreateIndex
CREATE UNIQUE INDEX "productos_codigo_interno_key" ON "catalogo"."productos"("codigo_interno");

-- AddForeignKey
ALTER TABLE "auth"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventas"."orden_items" ADD CONSTRAINT "orden_items_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja"."turnos" ADD CONSTRAINT "turnos_caja_id_fkey" FOREIGN KEY ("caja_id") REFERENCES "caja"."cajas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caja"."movimientos_caja" ADD CONSTRAINT "movimientos_caja_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "caja"."turnos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taller"."odt_items" ADD CONSTRAINT "odt_items_odt_id_fkey" FOREIGN KEY ("odt_id") REFERENCES "taller"."odts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
