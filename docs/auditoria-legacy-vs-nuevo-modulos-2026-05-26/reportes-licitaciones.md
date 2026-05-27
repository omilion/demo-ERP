# Auditoria legacy vs nuevo - reportes_licitaciones

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\reportes_licitaciones`

Estado: **Equivalencia funcional implementada en SPR-35**

## Como funcionaba en legacy

- Pantalla principal `index.php` mostraba `Licitaciones Cotizadas`.
- Al entrar sin filtros listaba solo `Pendiente` de la sucursal.
- Botones superiores:
  - Ir atras.
  - Cotizar Nueva Licitacion.
  - Fechas.
  - Rut Cliente.
  - ID Licitacion.
  - Por estados y fechas.
  - Pendientes.
- Filtros:
  - Fecha de Inicio + Fecha de Termino.
  - Estado + Fechas.
  - ID Licitacion.
  - Rut Cliente.
- Tabla:
  - Operaciones.
  - ID.
  - Orden Compra.
  - Detalle.
  - Fecha Creacion.
  - Fecha Licitacion.
  - Plazo.
  - Total Neto.
  - IVA.
  - Total C/IVA.
  - Creada por.
  - Estado.
  - Cliente/RUT.
  - Razon Social.
- Detalle de productos:
  - `nombre X cant / Adjudicados cant_adjudicados`.
- Totales:
  - Neto = suma de `cant * precio`.
  - IVA = `round(neto * 0.19)`.
  - Total C/IVA = neto + IVA.
- Exportaciones:
  - PDF resumen.
  - Excel resumen.
  - Excel detalle.
  - Impresion.
- Acciones por fila:
  - Ver Cotizacion.
  - Ficha Tec. y Eco. Licit.
  - Ver Venta Licitacion.
  - Eliminar Licitacion con confirmacion.
- Ficha Tec. y Eco. legacy:
  - Documento imprimible dedicado desde `cotizar_licitacion/imprimir_licitacion.php`.
  - Muestra datos de organismo/cliente, RUT, referencia, plazo, ejecutivo, productos, foto referencial, neto, IVA, total y observaciones.

## Como queda hoy en la plataforma nueva

- Pantalla: `frontend/src/pages/reportes-licitaciones/ReportesLicitacionesPage.jsx`.
- Ficha imprimible: `frontend/src/pages/licitaciones/LicitacionFichaPage.jsx`.
- API: `backend/src/routes/cotizaciones/index.js`.
- Exportaciones: `/api/cotizaciones/reportes/export?formato=resumen|detalle`.

## Matriz de equivalencia

| Legacy | Plataforma nueva | Estado |
|---|---|---|
| Default pendientes por sucursal | Reporte sin filtros usa `Pendiente`; otros listados pueden pedir `todosEstados=true` | Resuelto |
| Filtro por fechas | `fechaDesde` + `fechaHasta` sobre `fechaCreacion` | Resuelto |
| Filtro por estado + fechas | `estado` combinable con fechas | Resuelto |
| Filtro por ID Licitacion | `idLicitacion` con busqueda parcial | Resuelto |
| Filtro por RUT cliente | `rutCliente` con busqueda parcial | Resuelto |
| RUT sin puntos/guion | Backend normaliza RUT almacenado y filtro de entrada | Resuelto |
| Columnas operacionales legacy | Tabla nueva muestra Operaciones, ID, OC, Detalle, fechas, plazo, neto, IVA, total, usuario, estado, RUT y razon social | Resuelto |
| Totales neto/IVA/total | Helper backend calcula neto, IVA 19% y total C/IVA con formula legacy | Resuelto |
| Excel resumen | Export CSV compatible con Excel | Resuelto |
| Excel detalle | Export CSV compatible con Excel, una fila por item | Resuelto |
| PDF resumen | Boton `PDF/Imprimir` carga todas las filas filtradas y usa impresion del navegador | Reemplazo operativo |
| Ver Cotizacion | Boton por fila hacia detalle de licitacion | Resuelto |
| Ficha Tec. y Eco. | Boton por fila hacia `/licitaciones/:id/ficha`, vista imprimible dedicada con datos de organismo, productos, fotos y totales | Resuelto |
| Ver Venta Licitacion | Boton si existe venta moderna o legacy vinculada; abre `/ventas/:id` en modo lectura con panel de venta | Resuelto |
| Eliminar Licitacion | Boton solo con permiso `licitaciones:delete`; bloquea si hay venta vinculada y revalida dentro de transaccion | Resuelto |
| Venta legacy por `orden.licitacion` | Se detecta aunque `cotizacion.ordenId` este vacio | Resuelto |

## Extras que mejora la plataforma nueva

- Permisos por modulo/accion (`licitaciones:read/write/delete`, `ventas:read`).
- Scope por sucursal aplicado en backend.
- Paginacion con `total` real.
- Exportaciones server-side con filtros completos.
- Ficha tecnica/economica accesible tambien desde el detalle de la licitacion.
- Bloqueo de eliminacion cuando existe venta vinculada moderna o migrada.
- Borrado protegido con lock transaccional para evitar carrera contra creacion de venta.
- Tests de integracion para filtros, totales, exportacion, permisos y venta legacy.

## Pendientes o fuera de alcance

- PDF backend nativo identico a mPDF legacy: no se implementa en SPR-35. El reemplazo operativo es `PDF/Imprimir`, coherente con otros modulos actuales y sin agregar dependencia nueva.
- Soft-delete/auditoria de eliminacion: recomendado como mejora transversal futura. El sprint mantiene paridad legacy con hard delete, pero endurece bloqueo por venta vinculada.

## Validacion

- `test/cotizaciones-reportes.test.js`: filtros, totales, exportaciones, permisos y venta legacy.
- `test/ventas.test.js`: regresion de conversion y venta vinculada.
- `npm.cmd run lint`: OK.
- `npm.cmd run build`: OK.

## Decision tecnica

SPR-35 queda funcionalmente cerrado a nivel de implementacion y pruebas automatizadas. Falta solo aprobacion final multiagente/lead antes de pasar al siguiente sprint.
