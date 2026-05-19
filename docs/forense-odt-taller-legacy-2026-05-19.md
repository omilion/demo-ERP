# Forense ODT y taller legacy - 2026-05-19

## Decision

El ERP nuevo no debe heredar la logica suelta del ERP viejo.

Contrato objetivo:

```text
cliente canonico
  -> ventas.ordenes
    -> taller.odts / trabajo
      -> taller.odt_items
        -> taller.odt_item_talleres
      -> taller.bitacora_taller
      -> taller.taller_materiales
      -> taller.taller_historial_materiales
    -> bodega.despachos
    -> bodega.guias_despachos
```

Las filas historicas que no puedan relacionarse todavia deben quedar como legacy read-only o entrar a un sprint de reconciliacion. No deben seguir siendo modelo normal de operacion.

## Evidencia legacy

### ODT comercial

Tabla legacy:

- `odts`
- Fuente: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:505310`

Campos relevantes:

- `id`
- `n_interno`
- `odt`
- `fecha`
- `transporte`
- `user`
- `fecham`
- `estado`

Problema: no hay FK a venta. La relacion era por `n_interno`, no por llave.

Archivos que insertaban ODTs comerciales:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_directa\odts\guardar.php:8`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\venta_web\odts\guardar.php:8`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\licitacion_venta\odts\guardar.php:7`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\convenio_marco\odts\guardar.php:6`

Conclusion: la ODT comercial se colgaba del numero interno textual, no de una relacion formal.

### Trabajo de taller

Tabla legacy:

- `taller`
- Fuente: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:1468718`

Campos relevantes:

- `n_interno`
- `fecha_ingreso`
- `fecha_inicio`
- `fecha_termino`
- `estado_general`
- `prioridad`
- `obs_general`
- `sucursal`

Creacion automatica:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\pasar_taller\enviar_producto_a_taller.php:30`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\pasar_taller\enviar_producto_a_taller.php:40`

El codigo creaba una fila en `taller` si no existia para ese `n_interno`.

Conclusion: en el ERP viejo, el "trabajo" de taller era otra tabla paralela, tambien vinculada por `n_interno`.

### Items de taller

Tabla legacy:

- `productos_taller`
- Fuente: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:1437905`

Campos relevantes:

- `n_interno`
- `codigo_interno`
- `cant`
- `estado`
- `taller_confecciones`
- `estado_confecciones`
- `taller_espumas`
- `estado_espumas`
- `taller_externo`
- `estado_externo`

Problema: los talleres eran columnas fijas, no filas relacionales.

El ERP nuevo ya mejoro esto con:

- `taller.odt_items`
- `taller.odt_item_talleres`
- `taller.talleres`

Pero aun faltaba impedir nuevas filas sin taller asignado. Se agrego guardia en `POST /api/pasar-taller/enviar`.

### Materiales de taller

Tablas legacy:

- `taller_materiales`
- `taller_historial_materiales`

Fuentes:

- `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:1479498`
- `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:1479542`

Insert legacy:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\taller_confecciones\agregar_materiales\insertar.php:57`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\taller_confecciones\agregar_materiales\insertar.php:71`

Problema: materiales e historial se asociaban por `n_interno`, no por `odt_id`.

Destino correcto:

- `taller_materiales.odt_id`
- `taller_historial_materiales.odt_id`

Se agregaron guardas y constraints para que nuevas escrituras exijan ODT reconciliada.

### Bitacora diaria

Tabla legacy:

- `bitacora_taller`
- Fuente: `C:\Users\flipe\Downloads\plastim2_plastimar2014.sql\plastim2_plastimar2014.sql:13180`

Campos:

- `usuario`
- `fecha`
- `texto`
- `usuario_reporta`
- `sucursal`

Insert legacy:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\bitacora_taller\insertar.php:15`

Problema real: la tabla no tiene `n_interno`, `odt`, `orden` ni producto. Era bitacora diaria libre por operario.

Decision: no se debe inventar relacion a una ODT especifica sin evidencia. Para la nueva tecnologia:

- las nuevas entradas de `taller.bitacora_taller` exigen `odt_id`;
- la bitacora diaria legacy debe quedar como historico read-only o pasar por un sprint de clasificacion textual;
- no debe seguir existiendo "bitacora general" operativa sin trabajo.

## Estado ERP nuevo antes de este ajuste

Lo bueno:

- `taller.odt_items` ya exige `odt_id`.
- `taller.odt_item_talleres` normaliza los estados por taller.
- `bodega.guias_despachos` y `bodega.despachos` ya tenian `orden_id`.

Brechas detectadas:

| Area | Brecha |
| --- | --- |
| ventas | `ventas.ordenes.cliente_id` era nullable |
| taller | `taller.odts.orden_id` era nullable |
| taller | `taller.bitacora_taller.odt_id` era nullable |
| taller | `taller.taller_materiales.odt_id` era nullable |
| taller | `taller.taller_historial_materiales.odt_id` era nullable |
| taller | `pasar-taller` permitia item sin `tallerId` |
| bodega | `bodega.despachos.orden_id` era nullable |
| bodega | `bodega.guias_despachos.orden_id` era nullable |

## Ajuste aplicado en codigo

Archivos:

- `backend/src/routes/relation-guards.js`
- `backend/src/routes/ventas/create.js`
- `backend/src/routes/odts/create.js`
- `backend/src/routes/odts/update.js`
- `backend/src/routes/odts/bitacora.js`
- `backend/src/routes/bitacora-taller/index.js`
- `backend/src/routes/historial-materiales/index.js`
- `backend/src/routes/pasar-taller/index.js`
- `backend/src/routes/despachos/index.js`
- `frontend/src/pages/taller/TallerFormPage.jsx`

Cambios:

- Nueva venta exige `clienteId` existente.
- Nueva ODT exige `ordenId` existente.
- Nuevas bitacoras de taller exigen ODT existente y reconciliada con orden.
- Nuevos movimientos de materiales de taller exigen ODT.
- Pasar a taller exige `tallerId`.
- Nuevos despachos y guias exigen orden, directa por `ordenId` o resoluble por `nInterno`.
- El formulario de ODT ahora pide orden vinculada.

## Ajuste aplicado en base de datos

Migracion:

- `backend/prisma/migrations/20260519100000_enforce_work_relations_for_new_writes/migration.sql`

Tipo de constraint:

- `CHECK (... IS NOT NULL) NOT VALID`
- FK `NOT VALID` donde faltaba relacion formal

Esto significa:

- no bloquea filas legacy existentes;
- si se corre la migracion, bloquea nuevas filas huerfanas;
- permite reconciliar historico por sprint antes de validar definitivamente los constraints.

## Pendientes de datos

Desde artefactos ya existentes:

| Hallazgo | Cantidad |
| --- | ---: |
| `taller.bitacora_taller` sin `odt_id` | 12740 |
| `backend/gaps/odts_sin_orden.csv` | 19 filas incluyendo header |
| `backend/gaps/odt_items_sin_taller.csv` | 2709 filas incluyendo header |
| `backend/gaps/guias_sin_orden.csv` | 3 filas incluyendo header |

Los conteos con header implican:

- ODTs sin orden: 18 registros de datos.
- ODT items sin taller: 2708 registros de datos.
- Guias sin orden: 2 registros de datos.

## Sprint recomendado

Sprint Trabajo/ODT 1:

1. Cargar dump legacy en sandbox si no esta cargado.
2. Reconciliar `taller.odts.orden_id` usando `legacy.taller.n_interno` y `legacy.odts.n_interno` contra `ventas.ordenes.n_interno`.
3. Reconciliar `taller.taller_materiales.odt_id` y `taller.taller_historial_materiales.odt_id` usando `n_interno`.
4. Reconciliar `bodega.guias_despachos.orden_id` para los 2 casos restantes si existe `n_interno` valido.
5. Clasificar `bitacora_taller` legacy:
   - si el texto contiene numero interno o ODT inequívoca, asociar;
   - si no, mover a historico read-only de bitacora diaria legacy o crear trabajo interno legacy explicitamente marcado.
6. Validar constraints definitivos una vez que las filas historicas queden saneadas.

No se debe pedir al cliente que resuelva todo manualmente antes de hacer esta pasada. Primero debemos explotar la evidencia tecnica del ERP viejo.
