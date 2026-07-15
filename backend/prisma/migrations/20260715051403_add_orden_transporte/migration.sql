-- CreateTable
CREATE TABLE "ventas"."ordenes_transporte" (
    "id" SERIAL NOT NULL,
    "orden_id" INTEGER NOT NULL,
    "numero" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "transportista" TEXT NOT NULL,
    "usuario" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordenes_transporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordenes_transporte_orden_id_idx" ON "ventas"."ordenes_transporte"("orden_id");

-- AddForeignKey
ALTER TABLE "ventas"."ordenes_transporte" ADD CONSTRAINT "ordenes_transporte_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
