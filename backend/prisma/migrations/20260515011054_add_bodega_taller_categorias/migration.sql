-- CreateTable
CREATE TABLE IF NOT EXISTS "taller"."categorias_bodega_taller" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "categorias_bodega_taller_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "categorias_bodega_taller_nombre_key" ON "taller"."categorias_bodega_taller"("nombre");

-- CreateTable
CREATE TABLE IF NOT EXISTS "taller"."subcategorias_bodega_taller" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "subcategorias_bodega_taller_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "subcategorias_bodega_taller_categoria_id_idx" ON "taller"."subcategorias_bodega_taller"("categoria_id");

ALTER TABLE "taller"."subcategorias_bodega_taller"
  ADD CONSTRAINT "subcategorias_bodega_taller_categoria_id_fkey"
  FOREIGN KEY ("categoria_id") REFERENCES "taller"."categorias_bodega_taller"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
