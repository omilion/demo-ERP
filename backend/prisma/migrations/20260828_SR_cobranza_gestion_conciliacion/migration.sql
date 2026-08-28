-- Venta Sala puede representar una boleta anonima. Los demas tipos siguen
-- obligados a vincular un cliente en cada escritura nueva.
ALTER TABLE ventas.ordenes
  DROP CONSTRAINT IF EXISTS ordenes_cliente_id_required_new;

ALTER TABLE ventas.ordenes
  ADD CONSTRAINT ordenes_cliente_id_required_new
  CHECK (cliente_id IS NOT NULL OR lower(tipo) = 'venta sala')
  NOT VALID;

CREATE TABLE IF NOT EXISTS ventas.cobranza_gestiones (
  id SERIAL PRIMARY KEY,
  orden_id INTEGER,
  cobranza_historico_id INTEGER,
  tipo TEXT NOT NULL,
  canal TEXT,
  resultado TEXT,
  detalle TEXT NOT NULL,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS cobranza_gestiones_orden_id_created_at_idx
  ON ventas.cobranza_gestiones (orden_id, created_at);
CREATE INDEX IF NOT EXISTS cobranza_gestiones_historico_id_created_at_idx
  ON ventas.cobranza_gestiones (cobranza_historico_id, created_at);

CREATE TABLE IF NOT EXISTS ventas.cobranza_compromisos_pago (
  id SERIAL PRIMARY KEY,
  gestion_id INTEGER UNIQUE,
  orden_id INTEGER,
  cobranza_historico_id INTEGER,
  fecha_compromiso TIMESTAMPTZ NOT NULL,
  monto DOUBLE PRECISION NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  observacion TEXT,
  usuario_id INTEGER,
  usuario_nombre TEXT,
  cumplido_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cobranza_compromiso_objetivo_chk
    CHECK (orden_id IS NOT NULL OR cobranza_historico_id IS NOT NULL),
  CONSTRAINT cobranza_compromiso_monto_chk CHECK (monto > 0),
  CONSTRAINT cobranza_compromiso_estado_chk
    CHECK (estado IN ('PENDIENTE', 'CUMPLIDO', 'INCUMPLIDO', 'CANCELADO'))
);

CREATE INDEX IF NOT EXISTS cobranza_compromisos_estado_fecha_idx
  ON ventas.cobranza_compromisos_pago (estado, fecha_compromiso);
CREATE INDEX IF NOT EXISTS cobranza_compromisos_orden_id_idx
  ON ventas.cobranza_compromisos_pago (orden_id);
CREATE INDEX IF NOT EXISTS cobranza_compromisos_historico_id_idx
  ON ventas.cobranza_compromisos_pago (cobranza_historico_id);

CREATE TABLE IF NOT EXISTS ventas.cobranza_cartola_movimientos (
  id SERIAL PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  fecha TIMESTAMPTZ NOT NULL,
  descripcion TEXT NOT NULL,
  referencia TEXT,
  monto DOUBLE PRECISION NOT NULL,
  moneda TEXT NOT NULL DEFAULT 'CLP',
  banco TEXT,
  cuenta TEXT,
  estado TEXT NOT NULL DEFAULT 'PENDIENTE',
  orden_id INTEGER,
  cobranza_historico_id INTEGER,
  movimiento_caja_id INTEGER,
  conciliado_por_id INTEGER,
  conciliado_por_nombre TEXT,
  conciliado_at TIMESTAMPTZ,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT cobranza_cartola_monto_chk CHECK (monto <> 0),
  CONSTRAINT cobranza_cartola_estado_chk
    CHECK (estado IN ('PENDIENTE', 'CONCILIADO', 'DESCARTADO'))
);

CREATE INDEX IF NOT EXISTS cobranza_cartola_estado_fecha_idx
  ON ventas.cobranza_cartola_movimientos (estado, fecha);
CREATE INDEX IF NOT EXISTS cobranza_cartola_orden_id_idx
  ON ventas.cobranza_cartola_movimientos (orden_id);
CREATE INDEX IF NOT EXISTS cobranza_cartola_movimiento_caja_id_idx
  ON ventas.cobranza_cartola_movimientos (movimiento_caja_id);
