# Auditoria legacy vs nuevo - proveedores

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\proveedores`

Estado final SPR-34: **Aprobado localmente con doble revision multiagente**
Deploy: **No deployado**

## Funcion real del modulo legacy

`proveedores` era el maestro operativo de proveedores. Permitía crear, buscar por RUT/nombre, modificar datos comerciales, mantener porcentajes usados para precios, eliminar proveedores y exportar listados Excel/PDF.

## Comparacion punto por punto

| Punto legacy | Legacy | Plataforma nueva | Estado |
|---|---|---|---|
| Crear proveedor | Formulario con RUT, nombre, razon social, giro, email, fono, direccion, region, comuna y % venta sala. Codigo era max + 1. | Formulario y backend validan campos requeridos; codigo automatico bajo lock. | Corregido |
| Modificar proveedor | Permitía editar campos completos, codigo y porcentajes. | `PUT /proveedores/:id` valida registro final y no permite vaciar campos requeridos/codigo. | Corregido |
| Buscar por nombre | Pantalla dedicada. | Modo `Nombre` y filtro backend `nombre`. | Resuelto |
| Buscar por RUT | Pantalla dedicada. | Modo `RUT` y filtro backend `rut`. | Resuelto |
| Buscar por codigo | Campo visible y operativo en tabla/export. | Modo `Codigo` y filtro backend `codigoProveedor`. | Corregido |
| Tabla | Codigo, nombre, RUT, razon social, giro, email, telefono, direccion, region, comuna y porcentajes. | Tabla nueva muestra informacion operativa equivalente. | Corregido |
| Export Excel | `lista_excel.php` / `lista_excel2.php`. | CSV compatible Excel, activo-only, filtrable, con columnas legacy completas. | Corregido |
| PDF | `lista_pdf.php` con mPDF landscape. | Boton imprimir/guardar PDF desde navegador. | Reemplazo operativo |
| Eliminar | Confirmacion y delete fisico. | Confirmacion y soft-delete con permiso `proveedores:delete`. | Mejorado |
| Permisos | Sesion activa general. | RBAC `proveedores:*`; lectura de catalogo no ve margenes. | Mejorado |
| RUT duplicado | Validacion frontend legacy. | Validacion backend modulo 11 y duplicado por RUT normalizado. | Mejorado |
| Codigo proveedor | Campo critico para precios/pagos. | Duplicados bloqueados; asignacion concurrente protegida. | Corregido |
| Pagos asociados | No era parte central del modulo legacy, pero proveedor impacta pagos/stock. | Ficha maneja pagos por `proveedorId` y pagos legacy code-only seguros. | Mejorado |

## Pendientes reales

- **Deploy**: cambios no publicados.
- **PDF server-side exacto**: no se implementa en este sprint; se usa print-to-PDF como reemplazo operativo.
- **Saneamiento de datos**: si existen codigos proveedor duplicados activos en produccion, deben revisarse para recuperar fallback historico por codigo sin ambiguedad.

## Pruebas

| Prueba | Resultado |
|---|---|
| `npm.cmd exec vitest run test/proveedores.test.js --reporter=dot` | OK, 14/14 tests. |
| `npm.cmd exec vitest run test/proveedores.test.js test/pagos-proveedores-stock.test.js test/cobranza-pagos-proveedores.test.js --reporter=dot` | OK, 22/22 tests. |
| `npm.cmd run test:full -- --reporter=dot` backend | OK, 45/45 archivos, 413/413 tests. |
| `npm.cmd run lint` frontend | OK. |
| `npm.cmd run build` frontend | OK. |

## Conclusion

SPR-34 queda **aprobado localmente con doble revision multiagente**: el maestro de proveedores queda alineado con legacy en campos, busquedas, exportacion, permisos y validaciones, con mejoras de seguridad para pagos, stock, duplicados y datos migrados. Falta solo despliegue.
