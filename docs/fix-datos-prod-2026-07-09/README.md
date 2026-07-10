# Fix de datos en producción — 2026-07-09

Auditoría y corrección de datos en `plastimar_erp` (VPS producción), usando como fuente
el dump legacy fresco `plastim2_plastimar2014 (2).sql` (datos hasta 2026-07-09 18:12,
sisventa/sisgestion seguían operando).

**Backup previo a todo:** `/root/backups/fix-20260709/pre-fix-20260709.dump` (pg_dump -Fc de
`catalogo.productos`, `catalogo.proveedores`, `ventas.ordenes`, `ventas.orden_items`,
`clientes.cliente_sucursales`). Además tabla `staging_fix.productos_prov_bkp_20260709`
con el estado anterior de `proveedor_id`/`proveedor` por producto.

Staging CSVs usados: `/root/fix-20260709/` en el VPS (generados desde el dump legacy).

## Fix 1 — Remap proveedores en `catalogo.productos` (24.501 productos)

**Bug:** la migración guardó el `codigo_proveedor` legacy directo en `productos.proveedor_id`,
que en v2 es el **PK** de `catalogo.proveedores` (y en v2 `id ≠ codigo_proveedor`).
Resultado: 24.530 productos apuntaban a un proveedor equivocado; solo 6.430 coincidían de
casualidad. Efecto visible: 12.355 productos con proveedor de %canal 0/0/0 → **no se podía
calcular el precio por canal** (venta sala / convenio marco / licitación).

**Fix:** cruce `productos.codigo_interno` → `catalogo2.proveedor` (código legacy) →
`proveedores.codigo_proveedor` (v2). 22.703 remapeados por código; 1.798 cuyo código no
existe en v2 se resolvieron por RUT del proveedor legacy. `productos.proveedor` (string de
display) quedó con el **nombre legacy** asignado (regla de negocio: la identidad del
proveedor es el nombre, un RUT puede tener varios nombres).

**Resultado:** productos con proveedor %0/0/0 bajó de 12.355 → 505 (los 505 son proveedores
que también en legacy tienen 0%). Verificado caso testigo: `BingoAndino` →
MERCADOLIBRE CHILE LIMITADA (50/0/40), antes apuntaba a DECATHLON (0/0/0).

## Fix 2 — Import delta de órdenes legacy (503 órdenes + 4.093 ítems)

La última migración fue el 2026-04-27 y sisventa siguió operando: 503 órdenes de
`orden_compra_sistema` (2026-04-27 → 2026-07-09) no estaban en `ventas.ordenes`.

- Insertadas las 503 con `ON CONFLICT (n_interno) DO NOTHING` (idempotente),
  `observaciones = 'Import delta legacy sisventa 2026-07-09'` para identificarlas.
- Cliente linkeado por RUT normalizado; las sin RUT/ficha quedaron bajo el cliente
  genérico **CONSUMIDOR FINAL (rut 66666666-6)**, creado en este fix.
- Ítems desde `productos_comprados_local`: 4.093 insertados (todos). 259 productos
  vendidos en sisventa que no existían en el catálogo v2 se crearon con datos mínimos
  (`codigo_interno` + `nombre`) — **pendiente enriquecerlos** (categoría, precios, fotos).
- `precio_unitario` nulo en legacy → derivado de `precio_coniva / 1.19`.
- `user_id = 1` (Admin), `sucursal_id = 2` (5 Oriente, todas venían de ahí).

## Fix 3 — Contactos legacy → `clientes.cliente_sucursales` (6.094 filas)

En la BD legacy los clientes estaban "duplicados": 1.949 RUTs con múltiples fichas.
No era basura — cada ficha es un **contacto/sucursal real** de la misma empresa
(ej. Fundación Integra rut 70574900-0 con 136 fichas = 136 jardines/contactos).
La migración original colapsó todo a 1 fila por RUT y dejó solo 10 sucursales.

**Fix:** las fichas adicionales se insertaron como `cliente_sucursales` colgando del
cliente v2 por RUT, con dedup por `(cliente_id, nombre)` (constraint única de la tabla).
Total sucursales: 10 → 6.104.

## Verificación post-fix

- `catalogo.productos` con proveedor %0/0/0: 505 (antes 12.355)
- `ventas.ordenes` importadas con tag: 503, todas con ítems (0 huérfanas), rango 04-27..07-09
- `cliente_sucursales`: 6.104
- API prod respondiendo 200, pm2 online

## Pendientes

- Enriquecer los 259 productos creados con datos mínimos (categoría, precio, foto).
- 505 productos siguen con proveedor sin % de canal (también así en legacy — definir % con Plastimar).
- 224 órdenes legacy históricas referencian RUTs sin ficha de cliente.
- Gap de catálogo: legacy tiene ~34.5k productos vs ~32.8k en v2; evaluar import completo del delta.
- Los `%canal` viven duplicados por nombre de proveedor; revisar reglas de precio en el módulo antes de exponer canal licitación.

## Archivos

- `fix-20260709.sql` — staging + Fix 1 (el bloque de Fix 2 de este archivo falló por
  NOT NULL de `producto_id`; versión corregida en el siguiente).
- `fix2-20260709.sql` — Fix 2 corregido (crea productos faltantes primero) + Fix 3.
  Nota: el Fix 3 se re-ejecutó con dedup `(cliente_id, nombre)` por la constraint única.

Auditoría completa (CSVs legacy vs v2): `D:\downloads\plastimar-audit-20260709\` (local Sebastián).
