-- Auditoría gerencial Plastimar — consultas de solo lectura, 2026-09-01.

SELECT current_database() AS base,
       pg_size_pretty(pg_database_size(current_database())) AS tamano_base,
       (SELECT count(*) FROM pg_stat_activity) AS conexiones,
       (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') AS activas,
       EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS pg_stat_statements;

SELECT schemaname, relname AS tabla, n_live_tup AS filas_estimadas,
       pg_size_pretty(pg_total_relation_size(format('%I.%I', schemaname, relname)::regclass)) AS tamano_total
FROM pg_stat_user_tables
WHERE (schemaname, relname) IN (
  ('ventas','ordenes'), ('ventas','orden_items'), ('ventas','orden_compra_online'),
  ('ventas','cotizacion_licitacion'), ('ventas','cotizacion_licitacion_items'),
  ('ventas','cobranza_historico'), ('caja','movimientos_caja'),
  ('bodega','movimientos'), ('taller','bodega_taller_movimientos'),
  ('taller','tela_movimientos'), ('taller','odts'), ('bodega','despachos'),
  ('bodega','guias_despachos'), ('facturacion','documentos')
)
ORDER BY n_live_tup DESC;

SELECT schemaname, relname AS tabla, last_analyze, last_autoanalyze,
       analyze_count, autoanalyze_count, last_autovacuum, autovacuum_count
FROM pg_stat_user_tables
WHERE (schemaname, relname) IN (
  ('ventas','ordenes'), ('ventas','orden_items'), ('ventas','cotizacion_licitacion_items'),
  ('ventas','cobranza_historico'), ('caja','movimientos_caja'), ('taller','odts')
)
ORDER BY schemaname, relname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE (schemaname, tablename) IN (
  ('ventas','ordenes'), ('ventas','orden_compra_online'),
  ('ventas','cotizacion_licitacion'), ('ventas','cobranza_historico'),
  ('caja','movimientos_caja'), ('bodega','movimientos'),
  ('taller','bodega_taller_movimientos'), ('taller','tela_movimientos'),
  ('taller','odts'), ('bodega','despachos'), ('bodega','guias_despachos')
)
ORDER BY schemaname, tablename, indexname;

SELECT role, activo, count(*) AS usuarios
FROM auth.users
GROUP BY role, activo
ORDER BY activo DESC, role;

SELECT
  count(*) FILTER (WHERE orden_id IS NOT NULL) AS licitaciones_convertidas,
  count(*) FILTER (
    WHERE orden_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM ventas.cotizacion_licitacion_items i
        WHERE i.cotizacion_id = l.id AND coalesce(i.cant_adjudicados, 0) > 0
      )
  ) AS convertidas_con_monto_adjudicado
FROM ventas.cotizacion_licitacion l;

SELECT
  count(*) AS documentos_cobranza,
  count(*) FILTER (WHERE upper(coalesce(estado,'')) = 'PENDIENTE') AS pendientes,
  count(*) FILTER (WHERE fecha_factura IS NULL) AS sin_fecha_factura,
  count(*) FILTER (WHERE valor_factura IS NULL) AS sin_valor_factura
FROM ventas.cobranza_historico;

SELECT
  count(*) AS odts,
  count(*) FILTER (WHERE fecha_entrega_compromiso IS NULL) AS sin_fecha_comprometida
FROM taller.odts
WHERE eliminado = false;

SELECT
  (SELECT max(id) FROM ventas.ordenes) AS max_id_ordenes,
  (SELECT max(id) FROM ventas.orden_items) AS max_id_items,
  (SELECT max(id) FROM ventas.cotizacion_licitacion) AS max_id_licitaciones,
  (SELECT max(id) FROM ventas.cotizacion_licitacion_items) AS max_id_items_licitacion,
  (SELECT max(id) FROM caja.movimientos_caja) AS max_id_movimientos_caja,
  (SELECT max(id) FROM ventas.cobranza_historico) AS max_id_cobranza,
  (SELECT max(id) FROM taller.odts) AS max_id_odts;
