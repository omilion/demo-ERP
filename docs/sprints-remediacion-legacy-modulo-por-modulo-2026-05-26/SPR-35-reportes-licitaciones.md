# SPR-35-reportes-licitaciones - reportes_licitaciones

Prioridad: **P2 - completar equivalencia**
Dominio: **Comercial / Ventas**
Estado: **Cerrado y aprobado multiagente**

## Objetivo

Reparar el modulo `reportes_licitaciones` comparando cada funcion legacy contra la plataforma nueva, sin omitir filtros, columnas, acciones, exportaciones, estados ni permisos.

## Evidencia legacy revisada

- `reportes_licitaciones/index.php`
- `reportes_licitaciones/lista.php`
- `reportes_licitaciones/buscar_fechas.php`
- `reportes_licitaciones/buscar_estados_fechas.php`
- `reportes_licitaciones/buscar_id.php`
- `reportes_licitaciones/buscar_rut_cliente.php`
- `reportes_licitaciones/lista_excel.php`
- `reportes_licitaciones/lista_excel_d.php`
- `reportes_licitaciones/lista_pdf.php`
- `reportes_licitaciones/imprime_lista.php`
- `reportes_licitaciones/acepta_elimina.php`
- `reportes_licitaciones/eliminar.php`
- `reportes_licitaciones/clase_totales_cotizacion_licitacion.php`
- `cotizar_licitacion/imprimir_licitacion.php`

## Legacy detectado

- Vista principal default: licitaciones `Pendiente` por sucursal.
- Filtros: fechas de creacion, ID licitacion, RUT cliente, estado + fechas.
- Estados legacy: `Pendiente`, `Adjudicada`, `No Adjudicada`.
- Columnas: Operaciones, ID, Orden Compra, Detalle, Fecha Creacion, Fecha Licitacion, Plazo, Total Neto, IVA, Total C/IVA, Creada por, Estado, Cliente/RUT, Razon Social.
- Totales: neto = `sum(cant * precio)`, IVA = `round(neto * 0.19)`, total = neto + IVA.
- Acciones: Ver Cotizacion, Ficha Tec. y Eco., Ver Venta Licitacion, Eliminar Licitacion con confirmacion.
- Ficha Tec. y Eco.: documento imprimible dedicado con datos de organismo/cliente, referencia, plazo, ejecutivo, productos, foto referencial y totales.
- Exportaciones: PDF resumen, Excel resumen, Excel detalle, impresion.

## Implementacion realizada

- `backend/src/routes/cotizaciones/index.js`
  - Reporte `/api/cotizaciones/reportes` ahora soporta `fechaDesde`, `fechaHasta`, `estado`, `idLicitacion`, `rutCliente`, `search`, `page`, `limit` y scope por sucursal.
  - Sin filtros, el reporte legacy devuelve `Pendiente` por defecto; las pantallas no legacy pueden pedir `todosEstados=true`.
  - Devuelve `total` real, paginacion, detalle de productos, razon social/email de cliente, total neto, IVA, total C/IVA y total adjudicado.
  - Exporta `/api/cotizaciones/reportes/export?formato=resumen|detalle` con todo el resultado filtrado.
  - Reconoce venta vinculada por `ordenId` y tambien por datos legacy `orden.licitacion == idLicitacion` con tipo Licitacion y sucursal.
  - Normaliza el filtro RUT para aceptar busqueda con o sin puntos/guion.
  - Bloquea eliminacion si existe venta vinculada moderna o legacy, revalidando dentro de una transaccion con lock `FOR UPDATE`.

- `frontend/src/pages/reportes-licitaciones/ReportesLicitacionesPage.jsx`
  - Reemplazo de dashboard simple por reporte operacional equivalente al legacy.
  - Filtros visibles: fecha inicio, fecha termino, RUT cliente, ID licitacion, estado.
  - Tabla con columnas legacy completas y paginacion.
  - Acciones por fila: Ver Cotizacion, Ficha Tec. y Eco. dedicada, Ver Venta, Eliminar segun permisos.
  - `Ver Venta` usa la ruta de lectura `/ventas/:id`; no exige permiso de escritura para consultar una venta vinculada.
  - Botones: Excel Resumen, Excel Detalle, PDF/Imprimir, Cotizar Nueva Licitacion.
  - `PDF/Imprimir` carga todas las filas filtradas antes de imprimir, no solo la pagina visible.

- `frontend/src/pages/licitaciones/LicitacionFichaPage.jsx`
  - Nueva vista `/licitaciones/:id/ficha`, protegida por `licitaciones:read`.
  - Replica la ficha tecnica/economica legacy como pagina imprimible separada: encabezado, datos de cliente/organismo, RUT, unidad de compra, region/comuna, referencia, plazo, ejecutivo, items, foto referencial, neto/IVA/total y observaciones.
  - El boton del reporte ahora abre esta ficha; el detalle de licitacion tambien incluye acceso directo a la ficha.

- `frontend/src/components/LegacyRedirects.jsx`, `frontend/src/pages/ventas/VentasPage.jsx` y listados de licitaciones
  - `/ventas/:id` abre el listado de ventas filtrado y despliega automaticamente el panel de lectura de esa venta.
  - Los enlaces de consulta desde reportes/listado/detalle de licitacion ya no apuntan a `/editar` salvo en flujos que realmente modifican.

- `frontend/src/api/cotizaciones.js`
  - Al eliminar una licitacion se invalidan tambien los reportes.

- `frontend/src/pages/licitaciones/LicitacionesPage.jsx`
  - Mantiene KPI/listado general sin quedar afectado por el default legacy de pendientes.

- `backend/test/cotizaciones-reportes.test.js`
  - Cobertura para filtros legacy, RUT sin formato, totales, export resumen/detalle, permisos y ventas legacy vinculadas por `orden.licitacion`.

## Reemplazos y alcance

- Excel legacy se implementa como CSV compatible con Excel, siguiendo el patron actual de la plataforma.
- PDF resumen legacy server-side se reemplaza por `PDF/Imprimir` desde navegador con todas las filas filtradas. No se agrega motor PDF backend nuevo en este sprint porque la plataforma ya usa impresion/PDF de navegador en otros modulos y evita una dependencia nueva para la misma salida operativa.
- Ficha Tec. y Eco. se implementa como vista imprimible dedicada en frontend, alimentada por el detalle protegido de licitacion.
- Hard delete se mantiene por paridad con legacy, pero ahora bloquea ventas vinculadas. Auditoria/soft-delete queda recomendado como mejora transversal, no como bloqueo de SPR-35.

## Pruebas ejecutadas

- Backend afectado: `npm.cmd exec vitest run test/cotizaciones-reportes.test.js test/ventas.test.js --reporter=dot` -> 44/44 OK.
- Backend completo: `npm.cmd run test:full -- --reporter=dot` -> 46 archivos, 418/418 OK.
- Frontend lint: `npm.cmd run lint` -> OK.
- Frontend build: `npm.cmd run build` -> OK, con warning conocido de chunk grande.

## Riesgos residuales

- No se pudo completar QA visual con navegador integrado: el puerto 5173 estaba ocupado por otra app y el navegador interno bloqueo el puerto alternativo servido para revision estatica.
- Validacion multiagente completada: Sagan y Peirce aprobaron el sprint tras corregir la ficha dedicada y los enlaces de venta en modo lectura.

## Checklist final

- [x] Revisar archivos legacy principales.
- [x] Comparar pantalla/API nueva equivalente.
- [x] Implementar filtros legacy.
- [x] Implementar columnas y totales legacy.
- [x] Implementar export resumen/detalle.
- [x] Implementar acciones por fila y permisos.
- [x] Cubrir ventas legacy vinculadas por `orden.licitacion`.
- [x] Agregar pruebas de integracion.
- [x] Ejecutar pruebas focalizadas y build.
- [x] Aprobacion final multiagente.
- [x] Decision final del lead.
