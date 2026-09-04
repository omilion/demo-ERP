-- Indices para los filtros por fecha de la reporteria gerencial.
--
-- La auditoria midio el endpoint de ventas en 2.614 ms y la exportacion en 3.070 ms, y
-- EXPLAIN mostro sequential scan en ordenes, cobranza, caja, licitaciones y ODT: cada
-- consulta recorria la tabla entera para quedarse con un rango de fechas.
--
-- Cada indice cubre el campo por el que ese reporte filtra de verdad, que no es el
-- mismo en todas las tablas:
--
--   Orden                 createdAt
--   OrdenCompraOnline     fechaHora
--   CotizacionLicitacion  fecha
--   CobranzaHistorico     fechaFactura
--   MovimientoCaja        fecha
--   Odt                   createdAt
--
-- Se usa CREATE INDEX simple y no CONCURRENTLY porque Prisma ejecuta la migracion
-- dentro de una transaccion y CONCURRENTLY no lo admite. A los tamanos actuales
-- -la base entera pesa 544 MB y la tabla mayor ronda las 16 mil filas- la construccion
-- toma milisegundos y el bloqueo es despreciable. Si alguna tabla creciera un orden de
-- magnitud, conviene crearlos a mano con CONCURRENTLY fuera de la migracion.

CREATE INDEX IF NOT EXISTS "ordenes_created_at_idx"
  ON "ventas"."ordenes" ("created_at");

CREATE INDEX IF NOT EXISTS "orden_compra_online_fecha_hora_idx"
  ON "ventas"."orden_compra_online" ("fecha_hora");

CREATE INDEX IF NOT EXISTS "cotizacion_licitacion_fecha_idx"
  ON "ventas"."cotizacion_licitacion" ("fecha");

CREATE INDEX IF NOT EXISTS "cobranza_historico_fecha_factura_idx"
  ON "ventas"."cobranza_historico" ("fecha_factura");

CREATE INDEX IF NOT EXISTS "movimientos_caja_fecha_idx"
  ON "caja"."movimientos_caja" ("fecha");

CREATE INDEX IF NOT EXISTS "odts_created_at_idx"
  ON "taller"."odts" ("created_at");

-- El planificador no tenia estadisticas de estas tablas: pg_stat_user_tables no
-- registraba ANALYZE ni autoanalyze previo, asi que elegia el plan a ciegas.
ANALYZE "ventas"."ordenes";
ANALYZE "ventas"."orden_compra_online";
ANALYZE "ventas"."cotizacion_licitacion";
ANALYZE "ventas"."cobranza_historico";
ANALYZE "caja"."movimientos_caja";
ANALYZE "taller"."odts";
