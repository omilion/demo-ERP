-- Fix 2 (retry) + Fix 3 — 2026-07-09. Fix 1 (proveedores) ya commiteado.
\set ON_ERROR_STOP on

-- ============ FIX 2: delta ordenes + items ============
BEGIN;

-- productos legacy vendidos que faltan en catalogo v2 (minimos: codigo+nombre)
WITH ins AS (
  INSERT INTO catalogo.productos (codigo_interno, nombre)
  SELECT DISTINCT ON (upper(trim(i.codigo_interno)))
         trim(i.codigo_interno), COALESCE(NULLIF(trim(i.nombre),''), trim(i.codigo_interno))
  FROM staging_fix.delta_items i
  WHERE trim(coalesce(i.codigo_interno,'')) <> ''
    AND NOT EXISTS (SELECT 1 FROM catalogo.productos p
                    WHERE upper(trim(p.codigo_interno)) = upper(trim(i.codigo_interno)))
  RETURNING 1
)
SELECT 'fix2_productos_creados' AS paso, count(*) FROM ins;

-- cliente generico
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
       1,
       d.sucursal,
       COALESCE(c.id, (SELECT id FROM generic)),
       COALESCE(d.fecha_hora, now()),
       'Import delta legacy sisventa 2026-07-09'
FROM staging_fix.delta_ordenes d
LEFT JOIN cli c ON c.rutn = ltrim(regexp_replace(upper(d.rut_cliente),'[^0-9K]','','g'),'0')
ON CONFLICT (n_interno) DO NOTHING;

SELECT 'fix2_ordenes_insertadas' AS paso, count(*) FROM ventas.ordenes
  WHERE observaciones = 'Import delta legacy sisventa 2026-07-09';

INSERT INTO ventas.orden_items
  (orden_id, producto_id, cantidad, precio_unitario, precio_con_iva, codigo_interno, nombre, fecham)
SELECT o.id,
       pr.id,
       i.cant,
       COALESCE(i.precio, round(i.precio_coniva / 1.19), 0),
       COALESCE(i.precio_coniva, round(i.precio * 1.19), 0),
       NULLIF(trim(i.codigo_interno),''),
       NULLIF(trim(i.nombre),''),
       CASE WHEN i.fecham ~ '^\d{4}-\d{2}-\d{2}' AND i.fecham !~ '^0000'
            THEN i.fecham::timestamp ELSE NULL END
FROM staging_fix.delta_items i
JOIN ventas.ordenes o
  ON o.n_interno = i.n_interno
 AND o.observaciones = 'Import delta legacy sisventa 2026-07-09'
JOIN LATERAL (
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
SELECT 'verif_prov_pct0' AS chk, count(*)::text FROM catalogo.productos p
  JOIN catalogo.proveedores v ON v.id = p.proveedor_id
  WHERE coalesce(v.porc_venta_sala,0)=0 AND coalesce(v.porc_marco,0)=0 AND coalesce(v.porc_licitacion,0)=0
UNION ALL
SELECT 'verif_ordenes_total', count(*)::text FROM ventas.ordenes
UNION ALL
SELECT 'verif_import_rango', min(created_at)::date || '..' || max(created_at)::date FROM ventas.ordenes WHERE observaciones = 'Import delta legacy sisventa 2026-07-09'
UNION ALL
SELECT 'verif_import_sin_items', count(*)::text FROM ventas.ordenes o WHERE o.observaciones = 'Import delta legacy sisventa 2026-07-09' AND NOT EXISTS (SELECT 1 FROM ventas.orden_items x WHERE x.orden_id = o.id)
UNION ALL
SELECT 'verif_sucursales', count(*)::text FROM clientes.cliente_sucursales;
