# Auditoria legacy vs nuevo - descuentos_marco

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\descuentos_marco`

Estado: **Cerrado / aprobado en SPR-18**

## Pregunta funcional

Comprobar si el catalogo legacy de descuentos Convenio Marco existe hoy, si se administra correctamente y si realmente se usa al crear o editar ventas Convenio Marco.

## Como se mostraba / funcionaba en legacy

- `lista.php` listaba `descuentos_porc_marco` ordenado por `valor`.
- Columna visible: `Valor % aplicado venta total Convenio Marco`.
- `nuevo.php` y `modificar.php` usaban un solo campo `valor`.
- Ayuda visible: `EJ: 1.8 (utilice punto para decimales)`.
- `guardar.php` insertaba el valor en `descuentos_porc_marco`.
- `actualizar.php` modificaba solo `valor`.
- `acepta_eliminar.php` pedia confirmacion `Acepto` / `No Acepto`.
- `eliminar.php` borraba el registro.
- El catalogo se usaba en Convenio Marco como selector de descuentos.
- El monto se calculaba como descuento porcentual de la base de venta, redondeado antes de restar.
- No habia busqueda, filtros, exportacion, auditoria ni validacion robusta.

## Como se muestra hoy en la plataforma nueva

- Pantalla: `frontend/src/pages/descuentos/DescuentosPage.jsx`.
- API: `backend/src/routes/descuentos/index.js`.
- El catalogo Marco aparece separado visualmente del catalogo normal.
- Se puede crear, editar y eliminar porcentajes.
- La venta Convenio Marco usa selector de porcentajes activos desde catalogo.
- El backend valida que el porcentaje aplicado a Convenio Marco exista activo en el catalogo.
- El descuento se calcula sobre productos + cargos, con redondeo de pesos igual que legacy.

## Brechas encontradas y resolucion

| Brecha | Estado | Resolucion |
| --- | --- | --- |
| Faltaba editar porcentajes Marco | Resuelta | Se agrego `PUT /api/descuentos/marco/:id` y edicion inline en UI. |
| El catalogo podia quedar aislado de ventas | Resuelta | La venta Convenio Marco carga descuentos activos desde el catalogo y backend rechaza valores no autorizados. |
| Formula nueva podia devolver fracciones o no considerar cargos | Resuelta | `computeDiscountAmount` redondea el monto y `computeTotal` usa productos + cargos como base. |
| Impresion/detalle podian mostrar otro monto | Resuelta | Formulario, detalle e impresion usan el mismo redondeo. |
| Eliminacion hard delete legacy | Mejora aprobada | Plataforma nueva usa soft delete para trazabilidad. |
| Duplicados activos | Mejora aprobada | Se rechazan duplicados activos en alta y edicion. |
| Exportacion/filtros | No aplica | El legacy no tenia exportacion ni filtros para este modulo. |

## Extras actuales frente a legacy

- Permisos backend para administrar descuentos.
- Validacion numerica 0..100.
- Mensajes de error visibles.
- Confirmacion antes de eliminar.
- Soft delete trazable.
- Compatibilidad con ventas historicas que tengan un descuento antiguo no catalogado, siempre que el descuento no se modifique.
- Pruebas automatizadas de catalogo y aplicacion en ventas.

## Riesgos residuales

- `descuentos_porc` normal se revisa y cierra en SPR-19.
- Los datos historicos fuera de catalogo no se corrigen automaticamente; se preservan para no bloquear edicion administrativa.

## Evidencia de validacion

- Suite enfocada ventas/descuentos: **37 tests OK**.
- `frontend` lint: **OK**.
- `frontend` build: **OK**, con advertencia conocida de chunk grande.
- Backend `test:ci`: **102 tests OK**.
- Backend suite completa: **350 tests OK**.

## Decision

**Modulo aprobado.** La plataforma nueva cubre el comportamiento operativo de `descuentos_marco`, mejora permisos/trazabilidad y mantiene la aplicacion real del catalogo en Convenio Marco.
