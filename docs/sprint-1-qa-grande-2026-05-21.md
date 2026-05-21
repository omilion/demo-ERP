# Sprint 1 - QA grande y matriz de riesgos - 2026-05-21

## Estado

Aprobado para avanzar a Sprint 2 con riesgos residuales documentados.

## Validaciones ejecutadas

- Produccion `https://vps.plastimar.cl/api/health`: OK.
- Smoke API produccion contra `https://vps.plastimar.cl`: 24/24 OK.
- Build frontend: OK.
- `npm.cmd exec prisma validate`: OK.
- Tests focalizados backend: 7 archivos, 34 tests OK.
- Revision UI navegador produccion: login admin y rutas criticas cargan sin errores de consola.
- Revision UI mobile local tras correccion: dashboard, ventas, bodega y clientes sin overflow horizontal global a 390px.

## Smoke API produccion

Checks aprobados:

- Health.
- Login admin.
- RBAC solo lectura: lectura permitida y escritura bloqueada.
- Dashboard, productos, clientes, ventas, ODTs, cobranza, despachos, guias, matriz ventas, RRHH.
- Detalle de producto, cliente, venta y ODT.
- Integridad observada: `ordenItemsHuerfanos=0`, `odtItemsHuerfanos=0`, `productosStockNegativo=167`.

## Correccion UI aplicada

Archivos:

- `frontend/src/styles/globals.css`
- `frontend/src/components/TopBar.jsx`
- `frontend/src/components/shared/index.jsx`

Cambios:

- Navegacion superior responsive con wrap y scroll interno en mobile.
- `.table-wrap` con scroll horizontal contenido.
- `--bg-2` definido para vistas que ya lo usaban.
- Icono `upload` agregado para botones de importacion.

## Matriz QA consolidada

### Venta manual

Validar:

- Crear venta con cliente, sucursal, producto, cantidad, precio y total.
- Editar estados de pago/entrega.
- Ver detalle 360 con pagos, documentos, taller y despacho.

Riesgos a cubrir en Sprint 2:

- Pago generico de caja no debe simular pago de venta si no actualiza abono/estado.
- Items editables deben persistir o quedar claramente como no editables.
- Entrega parcial debe validar cantidades.

### Licitacion a venta

Validar:

- Crear licitacion adjudicada.
- Convertir una sola vez a venta.
- Ver vinculo desde licitacion y venta.

Riesgos:

- Conversion parcial si faltan productos.
- Carrera por doble conversion concurrente.

### Stock mixto

Validar:

- Factura con producto, material y tela.
- Aplicar una vez y verificar movimientos trazables.
- Reaplicar no duplica stock.

Riesgos:

- Egreso manual puede ocultar sobre-egreso si clampa stock a cero.
- Falta smoke write completo con rollback.

### Cliente/sucursal

Validar:

- Cliente canonico.
- Sucursales por cliente.
- Venta usando sucursal valida.

Riesgos:

- RUT duplicado debe responder controladamente.
- Sucursal principal en concurrencia.

### Caja

Validar:

- Abrir turno.
- Pago de venta por ruta de cobranza.
- Sobrepago rechazado.
- Cierre de turno excluye movimientos eliminados.

Riesgos:

- Ingresos manuales sin orden deben tener regla clara.
- Turno cerrado no debe aceptar movimientos.

### Despachos/guias

Validar:

- Despacho ligado a orden y ODT.
- Guia con orden/ODT coherente.
- Filtros por orden y ODT.

Riesgos:

- Despacho parcial por item.
- Descuento de stock por despacho aun no definido.

## Backlog que bloqueaba avance

Resuelto en este sprint:

- Overflow horizontal global en mobile por topbar/tablas.
- Icono faltante `upload`.
- Variable CSS `--bg-2` no definida.

Pasa a Sprint 2:

- Smokes write controlados para stock/caja/despacho.
- Reglas de pago de venta versus movimiento manual.
- Reglas de despacho parcial y descuento de stock.
- Tests de negativos operacionales.

Pasa a Sprint 3:

- Matriz RBAC completa por rol.
- Auditoria ampliada para acciones sensibles.
