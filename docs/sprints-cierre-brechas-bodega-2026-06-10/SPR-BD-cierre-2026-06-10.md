# Informe de cierre - Brechas cliente Bodega / Despachos / Ventas

Fecha: 2026-06-10
Plan base: `docs/plan-cierre-brechas-cliente-bodega-2026-06-10.md`

## Resultado ejecutivo

Se implementaron y verificaron los sprints no bloqueados por definiciones externas:

- S2 - Notificacion automatica `MK -> Taller`: cerrado.
- S3 - Campos de catalogo de producto: cerrado con edad/materialidad como texto libre, por no existir definicion de listas cerradas.
- S4 - Ubicacion fisica como desplegable: cerrado.
- S6 - Ajustes finos de filtros y navegacion: cerrado.

Los sprints marcados en el plan como dependientes de decisiones del cliente o alcance comercial separado quedan bloqueados, no cerrados por codigo:

- S1 - Codigo maestro: requiere confirmar reglas de agrupacion, precio ponderado y descuento de stock.
- S5 - Precio licitacion/manual y regla web: requiere formula aprobada por cliente.
- S7 - Excel nativo `.xlsx`: requiere confirmacion de que CSV no basta.
- S8 - Contraste/densidad: requiere validacion visual previa del cliente.
- S9 - Integracion SII: alcance comercial/arquitectura separado.

## Cambios implementados

### S2 - Notificacion MK

- Se agrego helper idempotente `ensureProductoMkNotification`.
- Al crear producto, actualizar producto o importar productos nuevos, si `codigoInterno` empieza con `MK` se crea una entrada en `taller.bitacora_taller`.
- La idempotencia se asegura con marcador `[producto-mk:<id>]`, evitando duplicados al re-guardar.
- Se agregaron tests para creacion directa, re-guardado e importacion masiva mixta MK/no-MK.

### S3 - Campos de catalogo

- Se agregaron campos en `catalogo.productos`: `descripcion_licitacion`, `link_compra`, `edad`, `materialidad`.
- Se extendieron create/update/import/list/get/export.
- El formulario de Bodega oculta "Descripcion larga" pero conserva `descripcion` en estado/payload para no perder historico.
- Se agregaron campos visibles: descripcion licitacion, link compra, edad, materialidad.
- `linkCompra` valida URL `http/https` en backend, frontend e importacion.
- Export de productos incluye los nuevos campos.

### S4 - Ubicacion desplegable

- Se agrego modelo `Ubicacion` y migracion `20260610120000_bodega_catalog_fields_ubicaciones`.
- La migracion crea `catalogo.ubicaciones`, agrega `producto.ubicacion_id`, siembra ubicaciones desde valores legacy y mapea productos existentes.
- Se agrego endpoint `/api/ubicaciones` con lectura por `catalogo:read` y escritura por `config:write`.
- `Producto.ubicacion` se mantiene como texto legacy sincronizado con el catalogo.
- Bodega usa select para filtrar por ubicacion.
- Formulario de producto usa select de ubicacion y permite crear nueva ubicacion si el usuario tiene permiso de configuracion.

### S6 - Filtros y navegacion

- Bodega: filtro de proveedor pasa de input a select con catalogo de proveedores.
- Consulta Precios: filtros de bodega, proveedor, categoria y subcategoria son combinables.
- Consulta Precios: se agrego columna `Web` con Si/No.
- Despachos: doble click en matriz abre el detalle de venta usando `ventaPath`.

## Evidencia de verificacion

Comandos ejecutados:

- `npm.cmd run db:generate` - OK.
- `npx.cmd prisma migrate deploy` - OK, aplicada en `plastimar_test`.
- `npm.cmd run test -- productos.test.js --reporter=dot` - OK, 27 tests pasados.
- `npm.cmd run test:full -- --reporter=dot` - OK, 67 archivos y 570 tests pasados.
- `npm.cmd run lint` - OK.
- `npm.cmd run build` - OK.
- `git diff --check` - OK, sin errores de whitespace. Solo advertencias de fin de linea CRLF.

Notas:

- `test:full` emitio una advertencia de deprecacion de `pg` sobre `client.query()` concurrente. No bloquea esta entrega.
- `build` emitio advertencia de chunk grande de Vite. No bloquea esta entrega.

## Smoke/QA ejecutado

- S2: crear MK genera aviso; re-guardar no duplica; importacion mixta genera aviso solo para MK.
- S3: persistencia de campos nuevos; validacion de link invalido; export incluye columnas nuevas.
- S4: producto con `ubicacionId` sincroniza texto legacy; filtro por `ubicacionId` devuelve el producto.
- S6: verificado por lint/build de frontend. La navegacion de doble click y filtros combinables quedan cubiertos a nivel de compilacion; no se ejecuto smoke manual en navegador dentro de esta corrida.

## Pendientes para desbloquear siguientes sprints

1. Responder decisiones de S1: si maestro reemplaza hijos, regla de ponderado y criterio de descuento de stock.
2. Responder formula S5: precio licitacion manual vs calculado y default de precio web.
3. Confirmar si S7 requiere `.xlsx` real o basta CSV compatible con Excel.
4. Validar visualmente S8 antes de cambios globales de contraste/densidad.
5. Definir alcance comercial S9 para emision DTE/SII.
