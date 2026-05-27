# SPR-29-matriz-ventas - matriz_ventas

Prioridad: **P0 - critico operativo**  
Dominio: **Comercial / Ventas**  
Subagentes especialistas: **Harvey (paridad funcional/UI)** y **Hypatia (datos/seguridad)**  
Estado: **Aprobado por implementacion, pruebas y doble revision de agentes**

## Objetivo

Reparar el modulo `matriz_ventas` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Evidencia legacy revisada

- `matriz_ventas/index.php`
- `matriz_ventas/lista.php`
- `matriz_ventas/pasar_a_get.php`
- `matriz_ventas/buscar_ninterno.php`
- `matriz_ventas/buscar_idlicitacion.php`
- `matriz_ventas/buscar_oc.php`
- `matriz_ventas/buscar_odt.php`
- `matriz_ventas/buscar_guia.php`
- `matriz_ventas/buscar_nc.php`
- `matriz_ventas/buscar_nd.php`
- `matriz_ventas/buscar_fechas.php`
- `matriz_ventas/buscar_rut_cliente.php`
- `matriz_ventas/buscar_tipo_venta.php`
- `matriz_ventas/lista_excel.php`
- `matriz_ventas/lista_excel_detalles_productos.php`
- `matriz_ventas/lista_excel_guias.php`
- `matriz_ventas/lista_excel_ndnc.php`
- `matriz_ventas/lista_pdf.php`
- `matriz_ventas/imprime_lista.php`
- `matriz_ventas/eliminar.php`
- `matriz_ventas/eliminar2.php`

## Como se mostraba en legacy

- La vista default mostraba **Ventas Hoy**.
- Incluia accesos por boton para N Interno, ID Licitacion, OC, ODT, Guias Desp., NC, ND, Fechas, Cliente y Tipo Venta.
- Incluia accesos directos de estado: No pagadas, Pendiente entrega y Entregadas no pagadas.
- La tabla mostraba N Interno, cliente, OC/ID, total venta, abono, facturado, saldo, estado, estado pago, estado entrega, detalle de productos, ODT, guias y documentos.
- Exportaba resumen, detalle de productos, guias y NC/ND.
- La eliminacion era una accion critica porque impacta caja, stock, taller/despacho y trazabilidad.

## Hallazgos iniciales de subagentes

- **P0:** La plataforma nueva no partia en Ventas Hoy.
- **P0:** Faltaba aislamiento por sucursal en matriz, totales y exportaciones.
- **P0:** El endpoint generico `PUT /ventas/:id` podia intentar estados destructivos sin pasar por el flujo auditado.
- **P1:** Los totales de matriz no usaban el helper canonico con cargos.
- **P1:** Las exportaciones eran genericas de ventas, no exportaciones de matriz.
- **P1:** Faltaban filtros NC/ND, shortcuts legacy y separacion clara de OC vs ID Licitacion.
- **P1:** Las licitaciones vinculadas podian contarse dos veces.
- **P2:** La UI no mostraba detalle operativo inline equivalente al legacy.

## Implementacion realizada

- `backend/src/routes/matriz-ventas/index.js`
  - Default sin filtros ahora aplica **Ventas Hoy** con fecha local del servidor.
  - Agregado scope por sucursal a ordenes, OC online, licitaciones, ODT/guia lookups, documentos, totales y exportaciones.
  - Agregados filtros legacy: `ventasHoy`, `noPagada`, `pendienteEntrega`, `entregada`, `nombre`, `idLicitacion`, `nc`, `nd`, `odt`, `guia`, `estadoPago`, `estadoEntrega`.
  - Separada la union por origen para no devolver OC online o licitaciones cuando un filtro solo aplica a ordenes.
  - Totales y estado financiero de orden usan el helper canonico `computeVentaFinancialState`, con items, descuentos, cargos, abonos, NC/ND y multas.
  - NC/ND se resuelven desde `MovimientoCaja` por `documento` o `tipoDocumento`, se exponen como totales por fila y respetan `estadoDoc`.
  - Los documentos `estadoDoc = Nula` no afectan filtros, totales, saldo, documentos inline ni exportaciones.
  - El saldo usa la regla aprobada para Ventas/Caja: `total - abono - NC - ND - multas`.
  - El filtro `idLicitacion` busca tanto en `CotizacionLicitacion.idLicitacion` como en `Orden.licitacion`, cubriendo datos migrados legacy.
  - Licitaciones con `ordenId` ya no salen como fila standalone, evitando doble conteo.
  - Exportaciones propias de matriz:
    - `formato=resumen`
    - `formato=detalle-productos`
    - `formato=guias`
    - `formato=ndnc`
  - El export resumen incluye documentos concatenados como en legacy (`documento-n_doc`).
  - El export detalle productos incluye categoria, subcategoria y proveedor.
  - Los KPI/totales usan la misma matriz filtrada que la tabla, evitando diferencias por filtros activos.

- `frontend/src/pages/matriz-ventas/MatrizVentasPage.jsx`
  - Nueva barra de shortcuts: Ventas hoy, No pagadas, Pendiente entrega y Entregadas no pagadas.
  - Filtros separados para RUT, Nombre cliente, N interno, ID licitacion, OC, ODT, N guia, NC, ND, Estado pago, Estado entrega y Alcance.
  - Exportaciones desde `/matriz-ventas/export`, no desde el reporte generico de ventas.
  - Tabla con detalle de productos inline, ODT, guias, documentos, NC, ND, saldo y acciones de navegacion.

- `backend/src/routes/ventas/update.js`
  - Bloqueado el cambio destructivo de `estado` por `PUT /ventas/:id`.
  - Bloqueado cambio directo de `abono`, `estadoPago` y `facturado`; esos datos se actualizan desde Cobranza/Caja.
  - Las anulaciones/reactivaciones deben ir por el flujo auditado correspondiente.

- `backend/src/routes/ventas/create.js`
  - Bloqueado `facturado` directo en creacion de ventas; debe registrarse desde Cobranza/Caja.

- `backend/src/routes/ventas/cargos.js` y `backend/src/routes/ventas/delete.js`
  - Anulacion/reactivacion/eliminacion verifican scope por sucursal antes de modificar una orden.

- `frontend/src/api/ventas.js`
  - Invalida `matriz-ventas` cuando se actualizan, anulan, reactivan, eliminan o cambian cargos/entregas de una venta.

- Pruebas:
  - Nuevo `backend/test/matriz-ventas.test.js`.
  - Actualizado `backend/test/ventas.test.js`.

## Validacion ejecutada

- `npm.cmd exec prisma validate` en backend: **OK**
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd exec vitest run matriz-ventas.test.js`: **5 tests OK**
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd exec vitest run test/ventas.test.js`: **39 tests OK**
- `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public npm.cmd run test:full`: **43 archivos, 374 tests OK**
- `npm.cmd run lint` en frontend: **OK**
- `npm.cmd run build` en frontend: **OK**

Nota: el build mantiene el warning conocido de Vite por chunk mayor a 500 kB. No bloquea este sprint.

## Revision de agentes

- **Harvey:** aprobado, sin P0/P1 pendientes. Valido que Matriz filtra documentos activos en filas, filtros NC/ND y export NC/ND.
- **Hypatia:** aprobado, sin P0/P1 pendientes. Valido cierre de `idLicitacion` legacy, clasificacion NC/ND por `documento`/`tipoDocumento`, bloqueo de `facturado` directo y exclusion de documentos `Nula`.

## Riesgos residuales

- La exportacion legacy PDF/print no se replico como PDF nativo en este sprint. Se reemplaza operativamente por CSV de resumen/detalle/guias/NC-ND, que cubre los datos auditados. Si el cliente exige el formato impreso exacto, debe abrirse una tarea de reporte/PDF.
- La matriz calcula la union en aplicacion para conservar paridad entre fuentes. Ya no queda cap de 500 filas, pero en volumen muy alto puede requerir optimizacion SQL/keyset posterior.

## Decision final

**Aprobado.** El sprint cierra los P0/P1 detectados: default Ventas Hoy, scope por sucursal, filtros legacy, exportaciones de matriz, totales financieros canonicos con cargos/NC/ND/multas, documentos anulados excluidos, deduplicacion de licitaciones vinculadas y bloqueo de edicion financiera/destructiva por endpoints genericos.
