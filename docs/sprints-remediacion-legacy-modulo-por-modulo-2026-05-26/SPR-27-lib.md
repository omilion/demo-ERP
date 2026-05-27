# SPR-27-lib - lib

Prioridad: **P3 - soporte tecnico**
Dominio: **Soporte / Assets / Infraestructura**
Subagentes revisores: **Hubble + Rawls**
Estado: **Aprobado**

## Objetivo

Revisar `legacy/lib` sin tratarlo como pantalla: confirmar que no haya logica de negocio oculta que deba migrarse y resolver cualquier dependencia funcional que el legacy usara para operaciones diarias.

## Evidencia legacy revisada

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\lib`: libreria vendor PHPExcel, 225 archivos.
- Uso directo encontrado: `C:\Users\flipe\Downloads\sisgestion\sisgestion\readxls.php`.
- `readxls.php` carga `lib/PHPExcel.php`, lee columnas `A/B/C` como `CODIGO/NOMBRE/STOCK` y solo imprime filas. No actualiza base de datos.
- En `readxls.php`, la accion `Descargar EXCEL Stock` no estaba implementada: termina en `die("descargar")`.
- Flujo legacy operativo relacionado, fuera de `lib`: `bodega/importar_stock_excel.php` acepta `.xlsx`, actualiza `catalogo2.stock` por codigo interno y registra `movimientos_stock`.
- Descarga legacy relacionada, fuera de `lib`: `bodega/descargar_stock.php` genera un `.xls` con `Cod Interno`, `Nombre`, `Stock`.

## Como se mostraba / funcionaba en legacy

- `lib` no se mostraba al usuario. Era una dependencia tecnica antigua para leer Excel.
- El archivo raiz `readxls.php` parecia prototipo: permitia subir Excel y listar valores, pero no hacia persistencia.
- La operacion real de Bodega para stock masivo estaba en `bodega/importar_stock_excel.php`, no en `lib`.

## Como se muestra hoy

- Bodega tiene modal de importacion masiva con tipos: precios, stock, web y nuevos productos.
- El backend mantiene validaciones reales: permisos `bodega.write`, prevalidacion `dryRun`, confirmacion explicita, limite de filas, motivo obligatorio para stock y trazabilidad en `MovimientoBodega`.
- Antes de este sprint, el frontend leia CSV solamente.
- Ahora el frontend acepta CSV y Excel `.xlsx` en el mismo flujo de importacion.

## Brecha detectada y decision

| Punto | Estado | Decision |
| --- | --- | --- |
| Migrar `legacy/lib/PHPExcel` | Descartado | No se migra: es vendor obsoleto y no contiene logica de negocio propia. |
| `readxls.php` | Descartado | No se migra como pantalla porque no persiste datos y su descarga estaba incompleta. |
| Importacion real de stock Excel legacy | Resuelto | Se agrego lectura `.xlsx` al importador nuevo de Bodega. |
| Exportacion legacy `.xls` de stock | Cubierto parcialmente | Hoy existe exportacion de productos CSV compatible Excel con mas columnas. Un XLSX nativo queda como mejora P2 si el cliente exige archivo Excel binario exacto. |

## Implementacion realizada

- Se instalo `read-excel-file@9.0.10` en frontend.
- Se descarto `xlsx` de SheetJS tras `npm audit`: reportaba vulnerabilidad alta sin fix disponible.
- `frontend/src/utils/csv.js` ahora incorpora:
  - `parseTabularFile(file)`.
  - lectura CSV existente.
  - lectura Excel `.xlsx` via `read-excel-file/browser`.
  - conversion segura de filas de planilla a objetos de importacion.
- `frontend/src/pages/bodega/BodegaPage.jsx` ahora permite seleccionar `.csv` o `.xlsx` y reporta formato, filas y columnas detectadas.
- Se agrego `frontend/src/utils/csv.test.js` para validar CSV y conversion de filas de planilla.

## Archivos modificados

- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/utils/csv.js`
- `frontend/src/utils/csv.test.js`
- `frontend/src/pages/bodega/BodegaPage.jsx`
- `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/lib.md`
- `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-27-lib.md`

## Pruebas ejecutadas

- `npm.cmd exec vitest run src/utils/csv.test.js` en frontend: **3 tests OK**.
- `npm.cmd run lint` en frontend: **OK**.
- `npm.cmd run build` en frontend: **OK**. Queda el warning conocido de chunk grande.
- `npm.cmd install read-excel-file`: **0 vulnerabilidades reportadas**.
- `npm.cmd audit` sobre `xlsx`: **rechazado por vulnerabilidad alta**, dependencia retirada.

## Riesgos residuales

- No se implemento importacion `.xls` antigua porque el flujo legacy operativo de subida exigia `.xlsx` y la libreria que cubria `.xls` (`xlsx`) no paso seguridad.
- La exportacion sigue siendo CSV compatible Excel. Si el cliente exige archivo `.xlsx` binario para descarga de stock, conviene tratarlo como mejora P2 de Bodega/Reportes, no como migracion de `lib`.

## Validacion de agentes

- Hubble: sin P0/P1 para `lib`; recomendo no migrar PHPExcel y documentar compatibilidad Excel como deuda de Bodega.
- Rawls: marco P1 si no se resolvia la carga nativa `.xlsx`; queda resuelto con `read-excel-file`.

## Validacion del lead

- **Aprobado.**
- Motivo: no se migra vendor inseguro, se cubre la brecha funcional real de Excel `.xlsx` en Bodega, se conserva la seguridad del backend y se valida con test/lint/build.

## Decision final

`SPR-27-lib` queda cerrado. Se puede avanzar a `SPR-28-licitacion-venta`.
