CREATE TABLE "ventas"."excepcion_reglas" (
  "id" SERIAL NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "descripcion" TEXT,
  "estado_destino" TEXT,
  "severidad" TEXT NOT NULL DEFAULT 'alta',
  "horas_escalamiento" INTEGER NOT NULL DEFAULT 24,
  "rol_responsable" TEXT NOT NULL DEFAULT 'coordinador_comercial',
  "rol_escalamiento" TEXT NOT NULL DEFAULT 'admin',
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "excepcion_reglas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "excepcion_reglas_codigo_key" ON "ventas"."excepcion_reglas"("codigo");
CREATE INDEX "excepcion_reglas_activo_estado_destino_idx" ON "ventas"."excepcion_reglas"("activo", "estado_destino");

CREATE TABLE "ventas"."excepcion_alertas" (
  "id" SERIAL NOT NULL,
  "regla_id" INTEGER NOT NULL,
  "orden_id" INTEGER,
  "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
  "severidad" TEXT NOT NULL,
  "rol_responsable" TEXT NOT NULL,
  "rol_escalamiento" TEXT NOT NULL,
  "vence_at" TIMESTAMP(3) NOT NULL,
  "escalada_at" TIMESTAMP(3),
  "resuelta_at" TIMESTAMP(3),
  "resuelta_por_id" INTEGER,
  "evidencia" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "excepcion_alertas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "excepcion_alertas_regla_id_fkey" FOREIGN KEY ("regla_id") REFERENCES "ventas"."excepcion_reglas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "excepcion_alertas_orden_id_fkey" FOREIGN KEY ("orden_id") REFERENCES "ventas"."ordenes"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "excepcion_alertas_estado_vence_at_idx" ON "ventas"."excepcion_alertas"("estado", "vence_at");
CREATE INDEX "excepcion_alertas_orden_id_estado_idx" ON "ventas"."excepcion_alertas"("orden_id", "estado");

INSERT INTO "ventas"."excepcion_reglas" ("codigo", "nombre", "descripcion", "estado_destino", "severidad", "horas_escalamiento", "rol_responsable", "rol_escalamiento") VALUES
('VENTA_ANULADA', 'Venta anulada', 'Toda anulación requiere revisión comercial y evidencia de resolución.', 'ANULADA', 'alta', 4, 'coordinador_comercial', 'admin')
ON CONFLICT ("codigo") DO NOTHING;
