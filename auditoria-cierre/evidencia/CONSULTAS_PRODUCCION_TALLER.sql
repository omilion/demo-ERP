-- Auditoría de cierre Talleres Plastimar — 2026-09-01
-- Consultas de solo lectura. Ajustar nombres de esquema si cambia la instalación.

-- 1. ODT por estado y origen
SELECT lower(estado) AS estado, count(*)
FROM taller.odts
WHERE eliminado = false
GROUP BY 1
ORDER BY 2 DESC;

SELECT
  count(*) AS total,
  count(orden_id) AS con_venta,
  count(centro_costo_id) AS con_centro_costo,
  count(*) FILTER (WHERE orden_id IS NULL) AS sin_venta,
  count(fecha_inicio) AS con_inicio,
  count(fecha_termino) AS con_termino,
  count(fecha_entrega_compromiso) AS con_fecha_compromiso
FROM taller.odts
WHERE eliminado = false;

-- 2. Carga por taller y estado
SELECT t.nombre AS taller, oit.estado, count(*)
FROM taller.odt_item_talleres oit
JOIN taller.talleres t ON t.id = oit.taller_id
GROUP BY t.nombre, oit.estado
ORDER BY t.nombre, count(*) DESC;

SELECT
  count(*) AS total,
  count(operario_responsable_id) AS con_responsable,
  count(fecha_inicio) AS con_inicio,
  count(fecha_listo) AS con_listo,
  count(obs) AS con_observacion
FROM taller.odt_item_talleres;

-- 3. Eventos de operación
SELECT
  (SELECT count(*) FROM taller.odt_avances) AS avances,
  (SELECT count(*) FROM taller.taller_evidencias) AS evidencias,
  (SELECT count(*) FROM taller.bitacora_taller) AS bitacora,
  (SELECT count(*) FROM taller.taller_materiales) AS consumos,
  (SELECT count(*) FROM taller.taller_historial_materiales) AS historial_materiales;

-- 4. Costeo
SELECT
  (SELECT count(*) FROM taller.producto_recetas) AS recetas,
  (SELECT count(*) FROM taller.receta_materiales) AS materiales_receta,
  (SELECT count(*) FROM taller.receta_procesos) AS procesos_receta,
  (SELECT count(*) FROM taller.costeo_snapshots) AS snapshots;

-- 5. Maestros y trazabilidad de Espuma
SELECT
  count(*) AS materiales_activos,
  count(densidad_kg_m3) AS con_densidad,
  count(espesor_mm) AS con_espesor,
  count(formato) AS con_formato
FROM taller.bodega_taller
WHERE activo = true
  AND taller_id = (
    SELECT id FROM taller.talleres
    WHERE lower(nombre) = 'espumas'
    LIMIT 1
  );

SELECT
  (SELECT count(*) FROM taller.bodega_taller_lotes) AS lotes,
  (SELECT count(*) FROM taller.bodega_taller_movimientos) AS movimientos;

-- 6. Calidad del consumo
SELECT
  count(*) AS total,
  count(lote_codigo) AS con_lote,
  count(calidad) AS con_calidad,
  count(*) FILTER (WHERE coalesce(merma_cantidad, 0) > 0) AS con_merma,
  count(merma_motivo) AS con_motivo_merma
FROM taller.taller_historial_materiales;
