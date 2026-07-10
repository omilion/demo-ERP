-- Fix datos prod plastimar_erp — 2026-07-09
-- Fuente: dump legacy plastim2_plastimar2014 (datos al 2026-07-09 18:12)
-- Backup previo: /root/backups/fix-20260709/pre-fix-20260709.dump
-- 1) Remap proveedor_id/proveedor en catalogo.productos (bug: codigo_proveedor legacy usado como PK v2)
-- 2) Import delta ordenes legacy 2026-04-27..07-09 + items
-- 3) Contactos legacy (fichas duplicadas por rut) -> clientes.cliente_sucursales

\set ON_ERROR_STOP on

CREATE SCHEMA IF NOT EXISTS staging_fix;

DROP TABLE IF EXISTS staging_fix.remap;
CREATE TABLE staging_fix.remap (producto_id int, prov_v2_id int, nombre_legacy text);
\copy staging_fix.remap FROM '/root/fix-20260709/stage_remap.csv' CSV HEADER

DROP TABLE IF EXISTS staging_fix.delta_ordenes;
CREATE TABLE staging_fix.delta_ordenes (n_interno int, orden_compra text, fecha_hora timestamp, sucursal int, usuario text, estado text, estado_pago text, rut_cliente text, tipo text, email text);
\copy staging_fix.delta_ordenes FROM '/root/fix-20260709/stage_delta_ordenes.csv' CSV HEADER

DROP TABLE IF EXISTS staging_fix.delta_items;
CREATE TABLE staging_fix.delta_items (n_interno int, codigo_interno text, nombre text, cant int, precio double precision, precio_coniva double precision, fecham text);
\copy staging_fix.delta_items FROM '/root/fix-20260709/stage_delta_items.csv' CSV HEADER

DROP TABLE IF EXISTS staging_fix.contactos;
CREATE TABLE staging_fix.contactos (cliente_id int, nombre text, contacto text, email text, telefono text, direccion text, region text, comuna text);
\copy staging_fix.contactos FROM '/root/fix-20260709/stage_contactos.csv' CSV HEADER

-- ============ FIX 1: proveedores ============
BEGIN;

CREATE TABLE IF NOT EXISTS staging_fix.productos_prov_bkp_20260709 AS
  SELECT id, proveedor_id, proveedor FROM catalogo.productos;

UPDATE catalogo.productos p
SET proveedor_id = r.prov_v2_id,
    proveedor    = r.nombre_legacy
FROM staging_fix.remap r
WHERE p.id = r.producto_id;

SELECT 'fix1_remapeados' AS paso, count(*) FROM catalogo.productos p
  JOIN staging_fix.remap r ON r.producto_id = p.id AND p.proveedor_id = r.prov_v2_id;

COMMIT;

-- ============ FIX 2: delta ordenes + items ============
BEGIN;

-- cliente generico para ordenes sin rut o sin ficha
INSERT INTO clientes.clientes (rut, nombre, razon_social, activo)
SELECT '66666666-6', 'CONSUMIDOR FINAL', 'CONSUMIDOR FINAL (ventas sin cliente identificado)', true
WHERE NOT EXISTS (SELECT 1 FROM clientes.clientes WHERE rut = '66666666-6');

WITH generic AS (
  SELECT id FROM clientes.clientes WHERE rut = '66666666-6' LIMIT 1
),
cli AS (
  SELECT DISTINCT ON (ltrim(regexp_replace(upper(rut),'[^0-9K]','','g'),'0'))
         ltrim(regexp_replace(upper(rut),'[^0-9K]','','g'),'0') AS rutn, id
  FROM clientes.clientes
  WHERE rut IS NOT NULL AND trim(rut) <> ''
  ORDER BY 1, id
)
INSERT INTO ventas.ordenes
  (n_interno, tipo, estado, estado_pago, rut_cliente, email_cliente,
   creador_nombre, user_id, sucursal_id, cliente_id, created_at, observaciones)
SELECT d.n_interno,
       COALESCE(NULLIF(trim(d.tipo),''),'Normal'),
       COALESCE(NULLIF(trim(d.estado),''),'Activa'),
       COALESCE(NULLIF(trim(d.estado_pago),''),'No pagada'),
       NULLIF(trim(d.rut_cliente),''),
       NULLIF(trim(d.email),''),
       COALESCE(NULLIF(trim(d.usuario),''),'import-legacy'),
       1,                         -- Admin
       d.sucursal,
       COALESCE(c.id, (SELECT id FROM generic)),
       COALESCE(d.fecha_hora, now()),
       'Import delta legacy sisventa 2026-07-09'
FROM staging_fix.delta_ordenes d
LEFT JOIN cli c ON c.rutn = ltrim(regexp_replace(upper(d.rut_cliente),'[^0-9K]','','g'),'0')
ON CONFLICT (n_interno) DO NOTHING;

SELECT 'fix2_ordenes_insertadas' AS paso, count(*) FROM ventas.ordenes
  WHERE observaciones = 'Import delta legacy sisventa 2026-07-09';

-- items: solo para ordenes del import que aun no tienen items
INSERT INTO ventas.orden_items
  (orden_id, producto_id, cantidad, precio_unitario, precio_con_iva, codigo_interno, nombre, fecham)
SELECT o.id,
       pr.id,
       i.cant,
       i.precio,
       i.precio_coniva,
       NULLIF(trim(i.codigo_interno),''),
       NULLIF(trim(i.nombre),''),
       CASE WHEN i.fecham ~ '^\d{4}-\d{2}-\d{2}' AND i.fecham !~ '^0000'
            THEN i.fecham::timestamp ELSE NULL END
FROM staging_fix.delta_items i
JOIN ventas.ordenes o
  ON o.n_interno = i.n_interno
 AND o.observaciones = 'Import delta legacy sisventa 2026-07-09'
LEFT JOIN LATERAL (
  SELECT id FROM catalogo.productos p
  WHERE upper(trim(p.codigo_interno)) = upper(trim(i.codigo_interno))
  ORDER BY id LIMIT 1
) pr ON true
WHERE NOT EXISTS (SELECT 1 FROM ventas.orden_items x WHERE x.orden_id = o.id);

SELECT 'fix2_items_insertados' AS paso, count(*) FROM ventas.orden_items x
  JOIN ventas.ordenes o ON o.id = x.orden_id
  WHERE o.observaciones = 'Import delta legacy sisventa 2026-07-09';

COMMIT;

-- ============ FIX 3: contactos -> cliente_sucursales ============
BEGIN;

INSERT INTO clientes.cliente_sucursales
  (cliente_id, nombre, contacto, email, telefono, direccion, region, comuna, is_principal, activo)
SELECT ct.cliente_id,
       NULLIF(trim(ct.nombre),''),
       NULLIF(trim(ct.contacto),''),
       NULLIF(trim(ct.email),''),
       NULLIF(trim(ct.telefono),''),
       NULLIF(trim(ct.direccion),''),
       NULLIF(trim(ct.region),''),
       NULLIF(trim(ct.comuna),''),
       false, true
FROM staging_fix.contactos ct
WHERE EXISTS (SELECT 1 FROM clientes.clientes c WHERE c.id = ct.cliente_id)
  AND NOT EXISTS (
    SELECT 1 FROM clientes.cliente_sucursales s
    WHERE s.cliente_id = ct.cliente_id
      AND coalesce(lower(trim(s.email)),'')  = coalesce(lower(trim(ct.email)),'')
      AND upper(coalesce(trim(s.nombre),'')) = upper(coalesce(trim(ct.nombre),''))
  );

SELECT 'fix3_sucursales_total' AS paso, count(*) FROM clientes.cliente_sucursales;

COMMIT;

-- ============ VERIFICACION ============
SELECT 'verif_prov_pct0' AS chk, count(*) FROM catalogo.productos p
  JOIN catalogo.proveedores v ON v.id = p.proveedor_id
  WHERE coalesce(v.porc_venta_sala,0)=0 AND coalesce(v.porc_marco,0)=0 AND coalesce(v.porc_licitacion,0)=0;
SELECT 'verif_ordenes_total' AS chk, count(*) FROM ventas.ordenes;
SELECT 'verif_ordenes_max_fecha' AS chk, max(created_at)::date FROM ventas.ordenes WHERE observaciones = 'Import delta legacy sisventa 2026-07-09';
SELECT 'verif_sucursales' AS chk, count(*) FROM clientes.cliente_sucursales;
