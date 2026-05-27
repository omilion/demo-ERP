# Auditoria legacy vs nuevo - despacho

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\despacho`

Estado actual: **Aprobado / paridad operativa cerrada en SPR-20**

## Como se mostraba / funcionaba en legacy

- Matriz compacta por venta con N interno, cliente, OC, total venta, total facturado, estado, pago, entrega, detalle de productos, fechas, ODTs, guias, documentos, direccion, region y comuna.
- Busquedas/botones por Ventas Hoy, N interno, RUT cliente, OC, ID licitacion, guia, NC, ND, ODT, fechas, cliente y tipo de venta.
- Exportaciones separadas para lista, guias, NC/ND y detalle de productos.
- Acciones destructivas de venta completa delegaban a matriz ventas y afectaban stock, caja, ODTs, guias y descuentos.

## Como se muestra hoy en la plataforma nueva

- `frontend/src/pages/despachos/DespachosPage.jsx` abre por defecto en **Matriz despacho**, basada en `Orden`, por lo que tambien muestra ventas pendientes sin registro de despacho.
- Tabs disponibles: **Matriz despacho**, **Registros** y **Guias**.
- La matriz muestra N interno, cliente/RUT, OC/ID licitacion, total, facturado, abono/saldo, pago, entrega, productos, ODTs, guias, documentos y destino.
- Filtros disponibles: fechas, ventas hoy, N interno, RUT, cliente, OC, ID licitacion, guia, NC, ND, ODT, tipo venta, pago, entrega, estado despacho, region, comuna, ciudad y busqueda libre.
- Export CSV backend completo para matriz, registros y guias, sin limitarse a la pagina visible.
- Despachos y guias usan soft-delete con motivo, usuario y fecha de modificacion.
- `includeEliminados=true` solo se permite a usuarios con permiso `despacho.delete`; la UI muestra "Ver eliminados" solo a esos usuarios.
- Guias se pueden crear, editar y eliminar con trazabilidad.
- `nGuia` no se puede duplicar ni reutilizar aunque una guia anterior este eliminada.
- El estado de entrega de la orden se recalcula al crear, editar, mover o eliminar despachos/guias.

## Brechas cerradas

- Matriz legacy reemplazada por endpoint `GET /api/despachos/matriz` y vista principal.
- Columnas operativas legacy presentes en matriz nueva.
- Filtros legacy principales presentes o reemplazados por filtro equivalente.
- Exportacion de matriz, registros y guias movida a backend para exportar todo el filtro y no solo la pagina cargada.
- Eliminacion fisica reemplazada por soft-delete con motivo.
- Permisos de borrado corregidos: UI y backend requieren `despacho.delete`.
- Entrega directa sin evidencia logistica bloqueada desde ventas.
- Guias ahora tienen edicion backend/UI.

## Fuera de este cierre

- Formato exacto PDF/XLS legacy no se replico pixel a pixel; el alcance de datos queda cubierto por CSV backend e impresion de pantalla.
- La eliminacion completa de una venta pertenece al flujo de ventas/matriz ventas, no al mantenimiento de registros de despacho.
- La unicidad de `nGuia` esta protegida en API; si se requiere blindaje ante cargas directas o concurrencia fuera de API, corresponde agregar constraint o indice unico de base de datos.

## Evidencia legacy revisada

- `despacho\acepta_elimina.php`
- `despacho\buscar_fechas.php`
- `despacho\buscar_guia.php`
- `despacho\buscar_idlicitacion.php`
- `despacho\buscar_nc.php`
- `despacho\buscar_nd.php`
- `despacho\buscar_ninterno.php`
- `despacho\buscar_oc.php`
- `despacho\buscar_odt.php`
- `despacho\buscar_rut_cliente.php`
- `despacho\buscar_tipo_venta.php`
- `despacho\clase_totales_ventas.php`
- `despacho\clase_totales_ventas_licitacion.php`
- `despacho\clase_totales_ventas_marco.php`
- `despacho\clase_totales_ventas_web.php`
- `despacho\datatables.php`
- `despacho\eliminar.php`
- `despacho\imprime_lista.php`
- `despacho\index.php`
- `despacho\lista.php`
- `despacho\lista3.php`
- `despacho\lista_excel - copia.php`
- `despacho\lista_excel.php`
- `despacho\lista_excel2.php`
- `despacho\lista_excel_detalles_productos.php`
- `despacho\lista_excel_guias.php`
- `despacho\lista_excel_ndnc.php`
- `despacho\lista_original.php`
- `despacho\lista_pdf.php`
- `despacho\mensaje_eliminado.php`
- `despacho\pasar_a_get.php`

## Validacion

- Pruebas enfocadas SPR-20: **52/52 OK**.
- `test:ci` backend: **102/102 OK**.
- Frontend lint/build: **OK**.
- Revision multiagente final: **aprobado sin P0/P1**.
