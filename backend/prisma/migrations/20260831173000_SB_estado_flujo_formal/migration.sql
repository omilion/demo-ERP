-- Estado operativo persistido de la venta.
-- Se separa del estado calculado (pago/entrega) para poder validar
-- transiciones y conservar autor, fecha y motivo de cada movimiento.
--
-- No se infieren ni reescriben estados históricos en esta migración: hacerlo
-- masivamente requeriría una decisión de negocio para cada caso heredado.
ALTER TABLE ventas.ordenes
  ADD COLUMN IF NOT EXISTS estado_flujo_formal TEXT NOT NULL DEFAULT 'CREADA',
  ADD COLUMN IF NOT EXISTS fecha_estado_flujo TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS ventas.orden_estado_flujo_historial (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER NOT NULL REFERENCES ventas.ordenes(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  motivo TEXT,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  usuario_rol TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orden_estado_flujo_historial_orden_id_created_at_idx
  ON ventas.orden_estado_flujo_historial(orden_id, created_at);
CREATE INDEX IF NOT EXISTS orden_estado_flujo_historial_estado_nuevo_idx
  ON ventas.orden_estado_flujo_historial(estado_nuevo);
