# SPR-15-cotizar-licitacion - Cotizar Licitacion

Prioridad: **P1 - critico funcional**  
Dominio: **Comercial / Ventas**  
Estado: **Aprobado con observaciones documentadas**  
Fecha de cierre: **2026-05-27**

## Objetivo

Revisar y reparar `cotizar_licitacion` comparando legacy contra la plataforma nueva, incluyendo alta de licitacion, cliente, productos, adjudicacion, conversion a venta, stock, reportes, permisos y exportacion/impresion.

## Resultado ejecutivo

SPR-15 queda aprobado para continuar al siguiente sprint. Las brechas criticas detectadas fueron corregidas y validadas:

- ID licitacion obligatorio, normalizado sin espacios y protegido contra duplicados.
- Fecha licitacion obligatoria como en legacy.
- Estado `No Adjudicada` disponible y clasificado correctamente como perdida.
- Conversion a venta exige: cliente, estado Adjudicada, plazo, OC e items adjudicados.
- Conversion a venta descuenta stock inventariado para tipo `Licitación`.
- Actualizacion de venta vinculada implementada con lock transaccional, reconciliacion de stock y bloqueo si hay caja/documentos.
- Items validados: cantidad mayor a 0, precio no negativo y adjudicado no mayor a cantidad cuando se envia junto.
- Buscador de productos de catalogo en detalle de licitacion con precio de licitacion.
- Adjudicacion masiva disponible como `Adjudicar todo`.
- Cotizacion permite editar/asociar RUT de organismo desde detalle.
- No se permite eliminar cotizacion con venta vinculada.
- Reporte gerencial de licitaciones respeta scope por sucursal para usuarios no admin.
- OC se conserva dentro de observaciones de la venta generada.

## Comparacion punto por punto

| Punto legacy | Estado nuevo | Implementacion / decision |
|---|---:|---|
| Crear licitacion con ID y fecha | **Corregido** | Backend exige fecha, normaliza ID sin espacios y bloquea duplicados con advisory lock. |
| Estado inicial Pendiente | **Resuelto** | Formulario mantiene `Pendiente` por defecto. |
| Estados Pendiente / Adjudicada / No Adjudicada | **Corregido** | UI y reportes reconocen `No Adjudicada` como perdida. |
| Agregar producto por codigo | **Mejorado** | Detalle incluye buscador de catalogo; trae codigo, nombre, descripcion y precio de licitacion. |
| Precio licitacion con margen proveedor | **Resuelto** | Usa `consultaPrecios.precioLicitacion` calculado en catalogo/productos. |
| Producto externo | **Reemplazo documentado** | Se habilita acceso a `Bodega > Nuevo` para crear producto externo en catalogo; la conversion bloquea faltantes para evitar ventas parciales. |
| Editar cantidad, nombre, descripcion y valor | **Resuelto** | Detalle permite editar item y backend valida valores. |
| Cantidad adjudicada por item | **Resuelto** | Campo editable con validaciones; conversion usa solo adjudicados. |
| Adjudicacion masiva | **Parcial mejorado** | Se agrego accion `Adjudicar todo`. Legacy permitia seleccion multiple parcial; si se requiere identico, entra como mejora UX posterior. |
| Cliente asociado por RUT | **Corregido parcial** | RUT se crea y edita en cotizacion; conversion exige cliente canonico activo. Crear/modificar cliente completo sigue en modulo Clientes. |
| Pasar a venta | **Corregido** | Conversion valida estado, cliente, plazo, OC, adjudicados y productos existentes; crea venta y descuenta stock. |
| Actualizar venta asociada | **Corregido** | Nuevo endpoint sincroniza venta vinculada si no hay pagos/documentos y reconcilia stock. |
| Stock al convertir | **Corregido** | Tipo `Licitación` entra al circuito de stock de ventas. |
| Reportes por licitacion | **Corregido en seguridad** | Reporte gerencial respeta sucursal para no admin. |
| Ficha tecnica/economica PDF exacta | **No replicada** | La impresion actual es `window.print`; el PDF exacto con membrete/fotos queda como nuevo alcance si el cliente lo exige. |
| Excel resumen/detalle legacy | **No replicado exacto** | Export actual es CSV. XLS/PDF legacy quedan documentados como alcance adicional. |

## Archivos modificados

- `backend/src/routes/cotizaciones/index.js`
- `backend/src/routes/ventas/stock.js`
- `backend/src/routes/reportes/index.js`
- `backend/test/ventas.test.js`
- `frontend/src/api/cotizaciones.js`
- `frontend/src/pages/licitaciones/LicitacionesPage.jsx`
- `frontend/src/pages/licitaciones/LicitacionDetallePage.jsx`
- `frontend/src/pages/licitaciones/LicitacionFormPage.jsx`

## Pruebas ejecutadas

- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd test -- ventas.test.js --reporter=dot` -> **34/34 OK**
- `DATABASE_URL=... npm.cmd test -- ventas.test.js reportes-gerenciales.test.js --reporter=dot` -> **40/40 OK**
- `DATABASE_URL=... npm.cmd run test:ci -- --reporter=dot` -> **95/95 OK**
- `DATABASE_URL=... npm.cmd test -- --reporter=dot` -> **39 files, 342 tests OK**
- `frontend: npm.cmd run lint` -> **OK**
- `frontend: npm.cmd run build` -> **OK** con advertencia conocida de chunk Vite mayor a 500 kB.

## Riesgos residuales

- No se clono la ficha tecnica/economica PDF exacta con membrete/fotos/totales IVA. La impresion actual es funcional, pero no identica.
- No se clono Excel XLS resumen/detalle legacy; la plataforma mantiene CSV/reportes.
- La adjudicacion masiva actual adjudica todos los items, no una seleccion parcial como legacy.
- La gestion completa de cliente sigue en modulo Clientes; desde Licitacion se edita el RUT asociado.

## Decision final

**Aprobado para continuar al siguiente sprint.**  
Los riesgos residuales son de formato/reporteria o UX avanzada; la operacion critica de cotizar, adjudicar, convertir a venta y mantener stock/trazabilidad queda corregida y probada.
