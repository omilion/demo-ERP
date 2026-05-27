# Auditoria legacy vs nuevo - descuentos_porc

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\descuentos_porc`

Estado: **Cerrado / aprobado en SPR-19**

## Pregunta funcional

Comprobar si el catalogo legacy de descuentos normales existe hoy, si respeta la regla de enteros, si se usa al vender y si no queda como una pantalla aislada.

## Como se mostraba / funcionaba en legacy

- `index.php` mostraba `% Descuentos para ventas`.
- `lista.php` ejecutaba `SELECT * FROM descuentos_porc order by valor`.
- Columna visible: `Valor % aplicado venta total`.
- `nuevo.php` y `modificar.php` usaban un solo campo `valor`.
- Placeholder visible: `Solo enteros sin puntos`.
- `guardar.php` insertaba en `descuentos_porc`.
- `actualizar.php` modificaba solo `valor`.
- `acepta_eliminar.php` pedia confirmacion `Acepto` / `No Acepto`.
- `eliminar.php` borraba el registro.
- En venta directa, el selector aparecia solo si la venta estaba activa y el usuario tenia permiso de descuentos.
- `inserta_descuento_venta.php` guardaba el porcentaje aplicado por `n_interno`.
- La formula aplicaba descuento sobre venta total despues de cargo de transporte.

## Como se muestra hoy en la plataforma nueva

- Pantalla: `frontend/src/pages/descuentos/DescuentosPage.jsx`.
- API catalogos: `backend/src/routes/descuentos/index.js`.
- API ventas: `backend/src/routes/ventas/create.js` y `backend/src/routes/ventas/update.js`.
- El catalogo normal aparece en la seccion `Descuentos normales`.
- Crear/editar normales solo permite enteros 0..100.
- La venta `Normal`, `Venta Sala`, `Venta Web` o `Venta directa` usa selector de catalogo normal.
- El backend rechaza descuentos normales que no existan activos en `descuentoPorc`.
- El calculo de total usa productos + cargos como base y redondea el monto descontado.
- Saldos de clientes y exportacion de clientes usan la misma formula.

## Brechas encontradas y resolucion

| Brecha | Estado | Resolucion |
| --- | --- | --- |
| Ventas normales tenian input libre | Resuelta | Se cambio a selector de `descuentos_porc` para ventas normales/directas. |
| Backend aceptaba cualquier 0..100 | Resuelta | Se valida catalogo activo por tipo de venta. |
| Normales aceptaban decimales | Resuelta | Normales ahora exigen enteros; Marco mantiene decimales. |
| Permiso dependia de `ventas.delete` | Resuelta | Descuentos usa admin, `permisoDescuentos` o `descuentos.write`. |
| Formula no descontaba cargos | Resuelta | `computeTotal` descuenta sobre productos + cargos. |
| SQL de saldos/exportaciones tenia formula propia | Resuelta | SQL de clientes/reportes fue alineado con redondeo y base total. |
| Migracion guardaba descuentos historicos en tabla auxiliar pero no en runtime | Resuelta | `migrate-legacy-extra.mjs` backfillea `ordenes.descuento_pct`. |
| Eliminacion hard delete legacy | Mejora aprobada | Plataforma nueva usa soft delete. |
| Exportacion/filtros | No aplica | El legacy no tenia exportacion ni filtros para este modulo. |

## Extras actuales frente a legacy

- Validacion server-side real.
- Validacion frontend para enteros normales.
- Antiduplicados activos.
- Soft delete.
- Permiso separado para descuentos.
- Pruebas automatizadas.
- Compatibilidad con ventas antiguas si el descuento no cambia.

## Riesgos residuales

- Si el sistema ya tiene datos migrados antes de este ajuste, se debe ejecutar una correccion de datos para poblar `ordenes.descuento_pct` desde tablas legacy operacionales.
- La plataforma nueva no reabre el modelo legacy completo neto + IVA dentro de este sprint; mantiene su contrato actual de precios y totales, con descuento aplicado a venta total.

## Evidencia de validacion

- Sintaxis migracion: **OK**.
- Suite enfocada clientes/ventas/descuentos/reportes: **64 tests OK**.
- `frontend` lint: **OK**.
- `frontend` build: **OK**, con advertencia conocida de chunk grande.
- Backend `test:ci`: **102 tests OK**.
- Backend suite completa: **352 tests OK**.

## Decision

**Modulo aprobado.** La plataforma nueva cubre el catalogo `descuentos_porc`, su uso operativo en ventas normales/directas, permisos, formula de descuento y migracion de descuentos historicos.
