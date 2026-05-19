# Forense clientes ERP legacy - 2026-05-19

## Objetivo

Revisar los archivos del ERP PHP original para explicar por que existen ordenes con `rut_cliente` ambiguo y clientes duplicados.

La pregunta concreta era si los casos `ELEGIR_CLIENTE_O_FUSIONAR_DUPLICADOS` podian venir de la forma en que operaba el software antiguo, mas que de un error nuevo de migracion.

## Conclusion

Si. El codigo legacy confirma que el ERP antiguo trabajaba con una logica precaria de clientes:

- Las ventas y cotizaciones guardaban `rut_cliente` o `email` como texto en la orden/cotizacion.
- No guardaban una FK estable tipo `cliente_id`.
- La tabla `clientes` no tenia indice unico por RUT.
- Los modulos repetian formularios propios para crear clientes.
- Cuando habia mas de un cliente con el mismo RUT, el PHP tomaba el primer registro devuelto por MySQL con `fetch_assoc()`.

Por eso los duplicados por RUT son consistentes con el diseno original del sistema.

## Evidencia de codigo

### Tabla `clientes` sin unicidad por RUT

En el dump legacy:

- `CREATE TABLE clientes`: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:160259`
- `KEY email`: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:160272`

La tabla tiene indice por `email`, pero no tiene `UNIQUE(rut)` ni siquiera indice simple por `rut`.

### Ordenes guardaban RUT como texto

En el dump legacy:

- `orden_compra_sistema.rut_cliente`: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:556040`
- `cotizacion_licitacion.rut_cliente`: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:186794`

Eso significa que la orden no dependia de un `cliente_id` maestro, sino de un texto que luego se cruzaba contra `clientes`.

### Venta sala/directa

Archivos relevantes:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\crear_numero_interno.php:28`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\cliente\insertar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\cliente\insertar.php:22`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\cliente\guardar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\cliente\guardar.php:15`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\lista_productos_comprados.php:29`

Flujo observado:

1. Se crea la orden en `orden_compra_sistema` con `rut_cliente=''`.
2. Si el usuario ingresa un RUT, el sistema busca `SELECT rut FROM clientes where rut='$rut'`.
3. Si existe, actualiza la orden con `rut_cliente='$rut_bd'`.
4. Si no existe, crea un cliente nuevo en `clientes`.
5. Para mostrar datos del cliente, vuelve a buscar `SELECT * FROM clientes where rut='$rut_cliente_orden_compra'`.

No hay llave unica ni seleccion deterministica cuando existen varios clientes con el mismo RUT.

### Venta web

Archivos relevantes:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\cliente\insertar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\cliente\insertar.php:22`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\cliente\guardar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\cliente\guardar.php:15`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\lista_productos_comprados_web.php:19`

Flujo observado:

- En venta web se asociaba cliente principalmente por `email`, no por `rut`.
- La orden guardaba `email` como texto.
- El cliente se resolvia con `SELECT * FROM clientes where email='$email_cliente_orden_compra'`.

Esto explica por que algunos datos historicos web pueden calzar mejor por email que por RUT.

### Cotizacion / licitacion

Archivos relevantes:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion\cliente\insertar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion\cliente\insertar.php:22`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion\cliente\guardar.php:11`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion\cliente\guardar.php:15`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cotizar_licitacion\lista_productos_cotizados.php:85`

Flujo observado:

- `cotizacion_licitacion` guardaba `rut_cliente` como texto.
- Para asociar cliente se actualizaba `rut_cliente` en la cotizacion.
- Para mostrar el cliente se buscaba por RUT en `clientes`.

## Impacto en la migracion actual

La migracion nueva intenta llevar el modelo hacia una relacion normalizada con `ventas.ordenes.cliente_id`.

El problema es que el ERP antiguo no tenia una relacion equivalente. Tenia:

- `orden_compra_sistema.rut_cliente`
- `orden_compra_sistema.email`
- `cotizacion_licitacion.rut_cliente`
- multiples filas en `clientes` con el mismo RUT

Por eso, cuando una orden trae un RUT que existe en varios clientes, no basta con decir "hay ambiguedad"; hay que replicar la logica legacy:

1. buscar el primer cliente que el ERP antiguo habria devuelto para ese RUT/email;
2. si ese cliente se identifica de forma unica en produccion, usarlo como maestro sugerido;
3. si hay empate identico, proponer fusion por mismo RUT/datos equivalentes;
4. si no hay cliente destino, pedir crear/validar cliente.

## Clasificacion forense aplicada

Se genero una nueva planilla:

- `docs/revision-cliente-saneamiento-2026-05-19/18_ordenes_cliente_clasificacion_forense.csv`

Resultado:

| Clasificacion | Ordenes | Interpretacion |
| --- | ---: | --- |
| `DUPLICADO_LEGACY_RESOLUBLE` | 1649 | Se encontro cliente sugerido replicando la logica legacy. |
| `DUPLICADO_EMPATE_IDENTICO` | 6 | Hay duplicados practicamente identicos; se sugiere aprobar fusion y usar ID menor como maestro operativo. |
| `SIN_CLIENTE_DESTINO_SIN_EVIDENCIA_LEGACY` | 201 | El RUT de la orden no tiene cliente destino claro en produccion ni evidencia suficiente en el dump legacy parseado. |

Lectura operativa:

- De los 1655 casos antes marcados como ambiguos, los 1655 son explicables como duplicados estructurales del ERP legacy.
- 1649 tienen candidato sugerido fuerte.
- 6 son empates de duplicados casi identicos.
- Quedan 201 casos reales para crear/validar cliente o dejar historicos.

## Ajuste de politica canonica

La regla anterior explica el comportamiento legacy, pero para la nueva tecnologia se agrego una restriccion adicional:

- solo automatizar RUTs validos por digito verificador;
- no fusionar ni corregir masivamente RUTs invalidos o genericos.

Con esa restriccion, el universo aplicable queda asi:

| Resultado canonico | Ordenes |
| --- | ---: |
| Corregibles con RUT valido y cliente canonico sugerido | 1645 |
| Revision manual final | 211 |
| De las manuales: sin cliente destino | 188 |
| De las manuales: RUT invalido/generico | 23 |

Archivos:

- `docs/revision-cliente-saneamiento-2026-05-19/19_mapeo_cliente_canonico_dry_run.csv`
- `docs/revision-cliente-saneamiento-2026-05-19/20_clientes_revision_manual_final.csv`

## Regla recomendada para pedir aprobacion al cliente

No pedir al cliente que revise 1655 ordenes una a una.

Pedir aprobacion de regla:

> El ERP antiguo asociaba clientes por `rut_cliente` o `email` texto, sin `cliente_id` ni RUT unico. Para los RUT duplicados, proponemos fusionar/usar como maestro el cliente que reproduce la resolucion legacy. En empates con datos equivalentes, usar el ID menor como maestro operativo. Los casos sin cliente destino quedan para revision manual.

Si el cliente aprueba esta regla, el siguiente sprint puede preparar un apply controlado para:

1. actualizar `ventas.ordenes.cliente_id` en 1645 ordenes con RUT valido y cliente canonico sugerido;
2. dejar fuera del apply los RUTs invalidos/genericos aunque el legacy los resolviera;
3. dejar 211 ordenes para revision manual final.

## Riesgo

La regla es defendible tecnicamente porque replica el comportamiento original, pero igual debe aprobarse como politica de saneamiento.

No conviene fusionar fisicamente clientes ni borrar duplicados en este mismo paso. Primero se recomienda corregir `ventas.ordenes.cliente_id` con auditoria; despues debe venir la inactivacion/fusion/alias auditado para que el ERP nuevo no opere con duplicados heredados.
