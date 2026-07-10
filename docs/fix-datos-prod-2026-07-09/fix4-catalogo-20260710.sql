-- Fix 4 — Import/enriquecimiento catalogo desde legacy catalogo2 — 2026-07-10
\set ON_ERROR_STOP on

DROP TABLE IF EXISTS staging_fix.cat_import;
CREATE TABLE staging_fix.cat_import (
  accion text, legacy_id int, codigo_interno text, nombre text,
  categoria_id int, subcategoria_id int, categoria text, codigo_barra text,
  precio_lista double precision, precio_marco double precision,
  stock int, stock_critico int, porc_desc double precision,
  proveedor_id int, proveedor text, estado_inventario text,
  visible_web boolean, orden_web int, destacado_web boolean,
  id_marco text, edad text, descripcion text, descripcion_web text,
  precio_web double precision
);
\copy staging_fix.cat_import FROM '/root/fix-20260709/stage_catalogo_import.csv' CSV HEADER

BEGIN;

-- backup de los productos a enriquecer
CREATE TABLE IF NOT EXISTS staging_fix.productos_enrich_bkp_20260710 AS
  SELECT p.* FROM catalogo.productos p
  JOIN staging_fix.cat_import s ON s.accion='enrich'
   AND upper(trim(p.codigo_interno)) = upper(trim(s.codigo_interno));

-- ENRICH: solo llena lo que este vacio/0 (no pisa datos ya cargados en v2)
UPDATE catalogo.productos p SET
  nombre            = CASE WHEN p.nombre = p.codigo_interno OR trim(coalesce(p.nombre,''))='' THEN s.nombre ELSE p.nombre END,
  categoria_id      = COALESCE(p.categoria_id, s.categoria_id),
  subcategoria_id   = COALESCE(p.subcategoria_id, s.subcategoria_id),
  categoria         = COALESCE(NULLIF(trim(p.categoria),''), NULLIF(s.categoria,'')),
  codigo_barra      = COALESCE(NULLIF(trim(p.codigo_barra),''), NULLIF(s.codigo_barra,'')),
  precio_lista      = CASE WHEN coalesce(p.precio_lista,0)=0 THEN coalesce(s.precio_lista,0) ELSE p.precio_lista END,
  precio_marco      = CASE WHEN coalesce(p.precio_marco,0)=0 THEN coalesce(s.precio_marco,0) ELSE p.precio_marco END,
  stock             = CASE WHEN coalesce(p.stock,0)=0 THEN coalesce(s.stock,0) ELSE p.stock END,
  stock_critico     = CASE WHEN coalesce(p.stock_critico,0)=0 THEN coalesce(s.stock_critico,0) ELSE p.stock_critico END,
  porc_desc         = CASE WHEN coalesce(p.porc_desc,0)=0 THEN coalesce(s.porc_desc,0) ELSE p.porc_desc END,
  proveedor_id      = COALESCE(p.proveedor_id, s.proveedor_id),
  proveedor         = COALESCE(NULLIF(trim(p.proveedor),''), NULLIF(s.proveedor,'')),
  estado_inventario = COALESCE(NULLIF(trim(p.estado_inventario),''), NULLIF(s.estado_inventario,'')),
  visible_web       = s.visible_web,
  orden_web         = COALESCE(p.orden_web, NULLIF(s.orden_web,0)),
  destacado_web     = s.destacado_web,
  id_marco          = COALESCE(NULLIF(trim(p.id_marco),''), NULLIF(s.id_marco,'')),
  edad              = COALESCE(NULLIF(trim(p.edad),''), NULLIF(s.edad,'')),
  descripcion       = COALESCE(NULLIF(trim(p.descripcion),''), NULLIF(s.descripcion,'')),
  descripcion_web   = COALESCE(NULLIF(trim(p.descripcion_web),''), NULLIF(s.descripcion_web,'')),
  precio_web        = COALESCE(p.precio_web, s.precio_web)
FROM staging_fix.cat_import s
WHERE s.accion='enrich'
  AND upper(trim(p.codigo_interno)) = upper(trim(s.codigo_interno));

SELECT 'fix4_enriquecidos' AS paso, count(*) FROM catalogo.productos p
  JOIN staging_fix.cat_import s ON s.accion='enrich'
   AND upper(trim(p.codigo_interno)) = upper(trim(s.codigo_interno))
  WHERE p.categoria_id IS NOT NULL OR p.precio_lista > 0;

-- INSERT gap
WITH ins AS (
  INSERT INTO catalogo.productos
    (codigo_interno, nombre, categoria_id, subcategoria_id, categoria, codigo_barra,
     precio_lista, precio_marco, stock, stock_critico, porc_desc,
     proveedor_id, proveedor, estado_inventario, visible_web, orden_web,
     destacado_web, id_marco, edad, descripcion, descripcion_web, precio_web)
  SELECT s.codigo_interno, s.nombre, s.categoria_id, s.subcategoria_id,
         NULLIF(s.categoria,''), NULLIF(s.codigo_barra,''),
         coalesce(s.precio_lista,0), coalesce(s.precio_marco,0),
         coalesce(s.stock,0), coalesce(s.stock_critico,0), coalesce(s.porc_desc,0),
         s.proveedor_id, NULLIF(s.proveedor,''), NULLIF(s.estado_inventario,''),
         coalesce(s.visible_web,false), NULLIF(s.orden_web,0),
         coalesce(s.destacado_web,false), NULLIF(s.id_marco,''), NULLIF(s.edad,''),
         NULLIF(s.descripcion,''), NULLIF(s.descripcion_web,''), s.precio_web
  FROM staging_fix.cat_import s
  WHERE s.accion='insert'
    AND NOT EXISTS (SELECT 1 FROM catalogo.productos p
                    WHERE upper(trim(p.codigo_interno)) = upper(trim(s.codigo_interno)))
  RETURNING 1
)
SELECT 'fix4_insertados' AS paso, count(*) FROM ins;

-- pseudo-items de correccion de sisventa: no son productos
UPDATE catalogo.productos SET activo = false, visible_web = false
WHERE upper(codigo_interno) IN ('ERROR_MAS','ERROR_RESTA');

COMMIT;

SELECT 'verif_total_productos' AS chk, count(*)::text FROM catalogo.productos
UNION ALL
SELECT 'verif_sin_categoria', count(*)::text FROM catalogo.productos WHERE categoria_id IS NULL AND activo
UNION ALL
SELECT 'verif_precio0_activos', count(*)::text FROM catalogo.productos WHERE coalesce(precio_lista,0)=0 AND activo;
