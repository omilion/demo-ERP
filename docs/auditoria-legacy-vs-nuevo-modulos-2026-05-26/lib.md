# Auditoria legacy vs nuevo - lib

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\lib`

Estado final: **Resuelto / no se migra vendor legacy**

## Que era en legacy

`lib` contiene PHPExcel como dependencia tecnica antigua. No es un modulo de negocio ni una pantalla operativa.

## Uso directo encontrado

- `readxls.php` requiere `lib/PHPExcel.php`.
- Ese archivo permite seleccionar un Excel y leer columnas `A/B/C` como `CODIGO/NOMBRE/STOCK`.
- El resultado se imprime en pantalla, pero no se actualiza base de datos.
- La accion de descarga en ese archivo no estaba implementada.

## Flujo operativo relacionado

La operacion diaria de stock masivo estaba fuera de `lib`:

- `bodega/importar_stock_excel.php`: acepta `.xlsx`, actualiza `catalogo2.stock` por `codigo_interno` y registra `movimientos_stock`.
- `bodega/descargar_stock.php`: genera un `.xls` con `Cod Interno`, `Nombre`, `Stock`.

## Como queda hoy en la plataforma nueva

- Bodega tiene importador masivo con permisos, prevalidacion, confirmacion y trazabilidad.
- El importador permite actualizar precios, stock, visibilidad web y crear productos.
- Para stock exige motivo obligatorio y registra `MovimientoBodega`.
- Se agrego compatibilidad de lectura `.xlsx` al frontend, ademas del CSV existente.
- La importacion se procesa por los endpoints actuales de `/productos/importar/*`, por lo que no se relajan permisos ni validaciones.

## Decision

| Elemento legacy | Estado nuevo | Observacion |
| --- | --- | --- |
| `legacy/lib/PHPExcel` | No migrado | Vendor obsoleto, sin logica propia y con reemplazo moderno. |
| `readxls.php` | No migrado | Prototipo incompleto, sin persistencia. |
| Subida Excel real de stock | Resuelta | La plataforma nueva acepta `.xlsx` en el importador de Bodega. |
| Descarga `.xls` legacy | Parcial | Hoy existe CSV compatible Excel con mas columnas. XLSX nativo queda como P2 si el cliente lo exige. |

## Archivos nuevos/modificados relevantes

- `frontend/src/utils/csv.js`
- `frontend/src/utils/csv.test.js`
- `frontend/src/pages/bodega/BodegaPage.jsx`
- `frontend/package.json`
- `frontend/package-lock.json`

## Validacion

- `npm.cmd exec vitest run src/utils/csv.test.js`: 3 tests OK.
- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK, con warning conocido de chunk grande.
- `read-excel-file@9.0.10`: instalacion sin vulnerabilidades reportadas.

## Riesgo residual

No se acepta `.xls` como entrada porque el flujo legacy operativo de subida era `.xlsx` y la libreria que cubria `.xls` fue descartada por vulnerabilidades altas. Si el cliente pide descarga `.xlsx` binaria, se recomienda tratarlo como mejora P2 de Bodega/Reportes.
