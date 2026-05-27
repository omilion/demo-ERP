# Auditoria legacy vs nuevo - precios

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\precios`

Estado final SPR-33: **Aprobado localmente con doble revision multiagente**
Deploy: **No deployado**

## Funcion real del modulo legacy

`precios` era una pantalla de mantencion operativa de precios sobre `catalogo2`. Permitía buscar productos, ver precios calculados, editar rapidamente el precio costo, editar el producto completo y exportar la lista filtrada.

## Comparacion punto por punto

| Punto legacy | Legacy | Plataforma nueva | Estado |
|---|---|---|---|
| Accesos de busqueda | Botones por codigo barra, codigo interno, ID Marco, nombre, proveedor, categoria. | Modos de busqueda en `ConsultaPreciosPage`. | Resuelto |
| Nombre sin tildes | `eliminar_tildes($nombre)`. | Normalizacion sin diacriticos en backend para filtro `nombre`. | Corregido |
| Proveedor legacy | `catalogo2.proveedor = proveedores.codigo_proveedor`. | `proveedorId` tambien busca `producto.proveedor` por codigo/nombre/razon. | Corregido |
| Tabla | Foto, codigos, ID Marco, nombre, categoria, subcategoria, precio costo, venta+IVA, convenio marco, licitacion, proveedor. | Misma informacion funcional; costo solo con permiso bodega. | Corregido |
| Precio venta + IVA | Costo + porc venta sala proveedor + IVA. | Calculado por `attachConsultaPreciosData`. | Corregido |
| Precio licitacion | Costo + porc licitacion proveedor. | Calculado por `attachConsultaPreciosData`. | Corregido |
| Edicion rapida precio costo | Input inline actualizaba `precio1`. | Input inline con guardado explicito, permisos y historial. | Corregido |
| Formulario completo | `modificar.php` + `actualizar.php`. | `BodegaFormPage` + `PUT /api/productos/:id`. | Resuelto |
| Excel | `lista_excel.php` / `lista_excel3.php`. | CSV compatible Excel desde `reportes/export/productos`. | Corregido |
| PDF | `lista_pdf.php` con mPDF. | Boton imprimir/guardar PDF desde navegador. | Reemplazo operativo |
| Historial | No era confiable/auditado. | Historial real solo desde cambio transaccional de precio. | Mejorado |
| Permisos | Sesion activa general. | RBAC por `catalogo`/`bodega`; costo oculto a vendedor. | Mejorado |
| Catalogo web publico | No aplica a esta pantalla, pero comparte precios. | No expone `precioLista`; solo precio publico `precioWeb` o `null`. | Corregido |
| Crear productos con precio/stock | Formulario legacy de bodega/precios. | Crear con campos sensibles exige `bodega:write`. | Corregido |

## Pendientes reales

- **Deploy**: cambios no publicados.
- **PDF server-side exacto**: no se implementa en este sprint porque el stack actual no tiene motor PDF backend; se reemplaza por print-to-PDF. Si el cliente lo exige como archivo descargable automatico, levantar como mejora tecnica.

## Pruebas

| Prueba | Resultado |
|---|---|
| `npm.cmd exec vitest run productos.test.js --reporter=dot` | OK, 23/23 tests. |
| `npm.cmd run lint` frontend | OK. |
| `npm.cmd run build` frontend | OK. |
| `npm.cmd run test:full -- --reporter=dot` backend | OK, 44/44 archivos, 399/399 tests. |

## Conclusion

SPR-33 queda **aprobado localmente con doble revision multiagente**: la mantencion de precios legacy queda cubierta en pantalla, filtros, edicion, exportacion y permisos. Falta solo despliegue.
