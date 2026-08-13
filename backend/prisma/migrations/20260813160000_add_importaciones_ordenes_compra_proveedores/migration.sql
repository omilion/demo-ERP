-- CreateTable Importaciones
CREATE TABLE IF NOT EXISTS "bodega"."importaciones" (
  "id" SERIAL PRIMARY KEY,
  "numero_contenedor" TEXT NOT NULL,
  "tipo_transporte" TEXT NOT NULL DEFAULT 'Marítimo',
  "proveedor_id" INTEGER,
  "proveedor_nombre" TEXT,
  "origen" TEXT,
  "puerto_destino" TEXT,
  "naviera_agencia" TEXT,
  "fecha_embarque" TIMESTAMP(3),
  "fecha_eta" TIMESTAMP(3),
  "fecha_recepcion" TIMESTAMP(3),
  "estado" TEXT NOT NULL DEFAULT 'En tránsito',
  "documento_aduana" TEXT,
  "costo_flete" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costo_seguro" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costo_aduana" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total_cif" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "observaciones" TEXT,
  "user_id" INTEGER,
  "usuario_nombre" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "importaciones_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "catalogo"."proveedores"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "importaciones_numero_contenedor_idx" ON "bodega"."importaciones"("numero_contenedor");
CREATE INDEX IF NOT EXISTS "importaciones_estado_idx" ON "bodega"."importaciones"("estado");
CREATE INDEX IF NOT EXISTS "importaciones_fecha_eta_idx" ON "bodega"."importaciones"("fecha_eta");

-- CreateTable ImportacionItems
CREATE TABLE IF NOT EXISTS "bodega"."importacion_items" (
  "id" SERIAL PRIMARY KEY,
  "importacion_id" INTEGER NOT NULL,
  "producto_id" INTEGER,
  "codigo_interno" TEXT,
  "nombre" TEXT,
  "cantidad_esperada" INTEGER NOT NULL,
  "cantidad_recibida" INTEGER NOT NULL DEFAULT 0,
  "costo_unitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "recibido" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "importacion_items_importacion_id_fkey" FOREIGN KEY ("importacion_id") REFERENCES "bodega"."importaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "importacion_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "importacion_items_importacion_id_idx" ON "bodega"."importacion_items"("importacion_id");
CREATE INDEX IF NOT EXISTS "importacion_items_producto_id_idx" ON "bodega"."importacion_items"("producto_id");

-- CreateTable OrdenesCompraProveedores
CREATE TABLE IF NOT EXISTS "bodega"."ordenes_compra_proveedores" (
  "id" SERIAL PRIMARY KEY,
  "numero_oc" TEXT NOT NULL,
  "proveedor_id" INTEGER NOT NULL,
  "proveedor_nombre" TEXT,
  "proveedor_rut" TEXT,
  "proveedor_email" TEXT,
  "proveedor_contacto" TEXT,
  "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "fecha_requerida" TIMESTAMP(3),
  "fecha_rango_ventas_desde" TIMESTAMP(3),
  "fecha_rango_ventas_hasta" TIMESTAMP(3),
  "estado" TEXT NOT NULL DEFAULT 'Borrador',
  "subtotal_neto" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "iva" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "moneda" TEXT NOT NULL DEFAULT 'CLP',
  "condicion_pago" TEXT,
  "observaciones" TEXT,
  "motivo_rechazo" TEXT,
  "creador_id" INTEGER,
  "creador_nombre" TEXT,
  "aprobador_id" INTEGER,
  "aprobador_nombre" TEXT,
  "fecha_aprobacion" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ordenes_compra_proveedores_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "catalogo"."proveedores"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ordenes_compra_proveedores_numero_oc_key" ON "bodega"."ordenes_compra_proveedores"("numero_oc");
CREATE INDEX IF NOT EXISTS "ordenes_compra_proveedores_proveedor_id_idx" ON "bodega"."ordenes_compra_proveedores"("proveedor_id");
CREATE INDEX IF NOT EXISTS "ordenes_compra_proveedores_estado_idx" ON "bodega"."ordenes_compra_proveedores"("estado");
CREATE INDEX IF NOT EXISTS "ordenes_compra_proveedores_fecha_emision_idx" ON "bodega"."ordenes_compra_proveedores"("fecha_emision");

-- CreateTable OrdenCompraProveedorItems
CREATE TABLE IF NOT EXISTS "bodega"."orden_compra_proveedor_items" (
  "id" SERIAL PRIMARY KEY,
  "orden_compra_proveedor_id" INTEGER NOT NULL,
  "producto_id" INTEGER,
  "codigo_interno" TEXT,
  "nombre" TEXT,
  "cantidad_pedida" INTEGER NOT NULL,
  "cantidad_recepcionada" INTEGER NOT NULL DEFAULT 0,
  "costo_unitario" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "ventas_periodo" INTEGER DEFAULT 0,
  "stock_actual" INTEGER DEFAULT 0,
  "stock_critico" INTEGER DEFAULT 0,
  "en_transito" INTEGER DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "orden_compra_proveedor_items_orden_compra_proveedor_id_fkey" FOREIGN KEY ("orden_compra_proveedor_id") REFERENCES "bodega"."ordenes_compra_proveedores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "orden_compra_proveedor_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "catalogo"."productos"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "orden_compra_proveedor_items_orden_compra_proveedor_id_idx" ON "bodega"."orden_compra_proveedor_items"("orden_compra_proveedor_id");
CREATE INDEX IF NOT EXISTS "orden_compra_proveedor_items_producto_id_idx" ON "bodega"."orden_compra_proveedor_items"("producto_id");
