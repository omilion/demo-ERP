# Auditoría E2E: Cotización a Despacho

**Fecha:** 2026-09-02
**Revisión auditada:** `c990759` (`remediacion-auditoria-2026-09-01`)
**Ambiente:** aplicación local `http://127.0.0.1:5173` y base `plastimar_test`. No se modificó producción ni se emitieron documentos reales.

## Método y alcance

Se revisaron rutas, backend, RBAC, migraciones y UI local autenticada como administrador. Las pruebas se ejecutaron contra `plastimar_test`, de forma individual para evitar que el pool paralelo de Vitest agotara memoria. Los estados significan:

- **Funciona:** comportamiento cubierto por prueba y/o observado en UI.
- **Parcial:** existe el flujo, pero requiere operación manual, no cumple todo el trigger esperado o no posee prueba del efecto pedido.
- **No evidenciado:** no se encontró ni se ejecutó una implementación que permita afirmarlo.

## Resumen ejecutivo

El hilo operativo interno está implementado desde una cotización CRM aprobada hasta Picking, Packing, Despacho, guía DTE 52 y trazabilidad documental. Distingue inventario, fabricación y ventas mixtas; además, las nuevas reglas de Taller validan transiciones, recepción entre etapas y cierre con control de calidad.

Las brechas principales son de automatización y comunicación: el stock de venta directa se descuenta al crear la venta, no se reserva; Taller se genera automáticamente sólo para ítems transitorios, mientras Compras entrega sugerencias y no OCs automáticas; Picking no genera guía por sí mismo; no hay WhatsApp/SMS ni correo automático de cotización o despacho; y la factura se emite mediante una acción explícita de un usuario con permiso granular. La alerta interna de stock disponible tiene una prueba roja reproducible.

| Etapa | Resultado |
|---|---|
| 1. CRM / Cotización | Parcial |
| 2. Venta / Matriz | Parcial |
| 3. Aprovisionamiento | Parcial |
| 4. Picking / Packing | Parcial |
| 5. Despacho / Entrega | Parcial |
| 6. Facturación / Cierre | Parcial |

## 1. CRM / Cotizaciones

**Paso:** creación y aprobación de cotización comercial.

| Verificación | Resultado | Evidencia |
|---|---|---|
| CRM visible y operando con cartera, prioridades, origen y acción `Nueva Cotización` | Funciona | UI `/crm`: título `SISVENTA CRM — Pipeline de Ventas` y KPIs operativos. |
| Al llevar una cotización CRM a `VENTA_APROBADA`, se crea la orden vinculada | Funciona | `backend/src/domain/crm/service.js`: `createOrdenFromCrmCotizacion()` y transición en línea 287; `crm-cotizaciones-flujo.test.js` 8/8. |
| Totales y control de descuento | Parcial | Pruebas CRM validan el flujo y ventas cubre restricciones de descuento; no se ejecutó un caso de margen/IVA desde la UI. |
| Validación de crédito, sobregiro y congelamiento | No evidenciado | No forma parte de las pruebas ejecutadas ni apareció un gate inequívoco en el recorrido auditado. |
| Correo con PDF de cotización y cambio automático a “Enviada” | No evidenciado | No se encontró un mailer de cotizaciones; el mailer existente es para DTE. |
| WhatsApp/SMS | No implementado en este flujo | Búsqueda en backend/frontend no encontró proveedor o envío; sólo aparece WhatsApp como canal de registro de cobranza. |

**RBAC:** `vendedor` tiene `ventas` y `licitaciones` en lectura/escritura, pero sólo lectura en Taller y Despacho (`backend/src/middleware/rbac.js`). La aprobación de descuentos no se considera abierta para cualquier vendedor según las pruebas de ventas. Falta evidencia de un portal externo donde el cliente acepte/rechace una cotización.

## 2. Conversión a Venta Ganada / Matriz

**Paso:** oportunidad aprobada → Orden de Venta.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Matriz de Ventas visible con filtros de pago, entrega, guías y detalle | Funciona | UI `/ventas`: `Matriz de Ventas`, KPIs y filtros activos. |
| Conversión de cotización adjudicada crea una sola venta y evita duplicado | Funciona | `cotizaciones-flow.test.js` 5/5; endpoint de conversión protegido en `backend/src/routes/cotizaciones/index.js`. |
| Venta creada desde CRM conserva ítems y dispara flujo operacional | Funciona | `createOrdenFromCrmCotizacion()` crea ítems, llama `autoNotifyTaller()` y aplica deltas de stock. |
| Reserva de stock al ganar | No cumple el modelo pedido | `applyVentaStockDeltas()` decrementa `catalogo.productos.stock` para venta directa; no incrementa `stock_reservado`. Es rebaja anticipada, no reserva liberable. |
| Compromiso financiero / CxC proyectada y gate financiero | No evidenciado | Las pruebas sí bloquean estados de facturación directos fuera de Caja/Cobranza, pero no verifican la creación automática de una CxC proyectada ni una liberación por Finanzas. |
| Aviso “Venta Ganada” al vendedor, Finanzas y cliente | No evidenciado | La campana calcula alertas al abrirse; no se verificó un evento específico de venta ganada ni un canal externo. |

**Brecha operativa:** al descontar el físico al crear la venta, una venta que aún está en Taller o espera despacho puede afectar disponibilidad y stock crítico antes de la salida real. Debe decidirse si el modelo buscado es reserva, rebaja al packing/despacho, o ambos con movimientos separados.

## 3. Aprovisionamiento: Stock, Taller y Compras

**Paso:** enrutamiento de ítems según inventario, fabricación o compra.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Ítems transitorios generan/reutilizan ODT | Funciona | `autoNotifyTaller()` (`backend/src/routes/pasar-taller/service.js`) toma lock de orden y crea/upserta ODT e ítems; `pasar-taller.test.js` 10/10. |
| Ventas mixtas y separación inventario/taller | Funciona | `despachos-flujo-integral.test.js` 10/10 y panel Picking con filtros `Solo Inventario`, `Taller listos`, `Ventas Mixtas`. |
| Operario sólo registra avances; supervisor/jefe gestiona y cierra | Funciona | `taller_operario` sólo tiene `taller.avance:write`; rutas y nuevas pruebas de transiciones/recepción pasaron dentro de la validación focal 117/117. |
| OC sugerida por disponibilidad | Parcial | `GET /api/ordenes-compra-proveedores/sugerencias` calcula sugerencias; no crea ni envía una OC automáticamente desde una venta. Crear OC requiere acción con `bodega:write`; aprobar/rechazar es gerencial. |
| Alerta automática a Jefe de Taller / Compras | Parcial | El flujo genera la ODT y registra advertencia en log si falla un ítem; no se comprobó correo, push o tarea persistida dirigida. |
| Taller o Compras modifica precios/cliente de la venta | Restringido | Roles Taller y Bodega no tienen `ventas:write`; Bodega tiene `ventas:read`. |

## 4. Bodega: Picking y Packing

**Paso:** confirmación de preparación y empaquetado.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Paneles dedicados y datos operativos | Funciona | UI `/bodega/picking` con 166 filas y filtros por origen; `/bodega/packing` con bultos, progreso y escáner. |
| Picking confirma línea, observación, usuario y fecha | Funciona | `PUT /api/despachos/ordenes/:ordenId/picking`; crea eventos de packing. |
| Packing exige picking previo, actualiza entregados y controla concurrencia | Funciona | `PUT /api/despachos/ordenes/:ordenId/packing`; update condicionado y 409 si otra persona cambió el packing. |
| Estado único visible entre Matriz, Bodega y Despachos | Funciona | `GET /api/despachos/cola-operativa` deriva estado logístico; comentario y pruebas de despacho lo confirman. |
| Rebaja al confirmar Picking/Packing | No cumple el modelo esperado | Picking explícitamente no toca guía/factura ni `nEntregados`; Packing actualiza entregados. La rebaja de stock inventariable ya se hizo en la venta directa. |
| Borrador automático de guía al completar preparación | Parcial | La UI ofrece `+ Preparar Guía DTE 52`; se inicia como acción explícita. Las pruebas validan borrador DTE 52, no generación automática desde Picking/Packing. |
| Bodeguero acotado a logística | Parcial | Puede escribir Bodega, Catálogo, Despacho y Proveedores; no tiene Facturación. Tiene lectura de ventas y no `ventas:write`, pero el permiso de Catálogo permite ciertos cambios de producto. |

## 5. Despacho y Entrega

**Paso:** programar salida, preparar/emitir guía y seguir entrega.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Salidas desde venta, despachos aislados y vista administrativa | Funciona | UI `/despachos` muestra tabs `Salidas Listas`, `Despachos Aislados`, guías DTE 52, histórico y panel administrador. |
| Soporta stock, Taller y ventas mixtas / parciales | Funciona | `despachos-flujo-integral.test.js` 10/10; la cola filtra por preparación, packing y envíos parciales. |
| Trazabilidad de packing, guía y tracking | Funciona | `despachos-traceability.test.js` 37/37; tablas de `packing_eventos` y `despacho_tracking_eventos`. |
| Guía DTE 52 se prepara como borrador y valida campos antes de SII | Funciona | `/api/despachos/guias`; rechazo cuando faltan campos para emitir; una guía ya emitida no se vuelve a emitir. |
| Emisión/timbrado automático al despachar | Parcial | Existe emisión SII bajo acción explícita y validación; no se observó disparo automático al programar o confirmar salida. |
| Hoja de ruta/manifiesto y rol Chofer | No evidenciado | No existe `chofer`/`transportista` en los roles estándar. El tracking requiere `despacho:write`, por lo que hoy depende de permisos de logística. |
| Aviso al cliente “en camino”, guía PDF, POD digital | No evidenciado | No se encontró SMS/WhatsApp ni envío automático de guía; tampoco se validó captura de firma/POD en el recorrido. |

## 6. Facturación y cierre

**Paso:** emitir DTE, enviar a SII, vincular venta/guía y cobrar.

| Verificación | Resultado | Evidencia |
|---|---|---|
| Vista documental y trazabilidad de excepciones | Funciona | UI `/facturacion/documentos`: 200 ventas revisadas, con excepciones de guía, DTE e interno. |
| Emisión de documentos, envío SII y estados | Funciona | `POST /api/facturacion/documentos/:id/emitir` y `/enviar`, protegidos por `facturacion.emitir:write`. |
| Vinculación venta → guía → DTE | Parcial | La vista calcula y expone trazabilidad; hay 200 excepciones visibles en la base local, por lo que no puede afirmarse cierre automático y completo. |
| Correo automático PDF/XML de factura | Parcial | Hay `sendDteEmail()` para reenvío de DTE. La ruta de emisión envía al SII; el correo al cliente se ejecuta mediante acción de reenvío, no quedó probado como automático tras emitir. |
| Cierre financiero, asiento y alerta por saldo | No evidenciado | No fue demostrado en la batería E2E ejecutada. |
| Separación de permisos de Facturación | Funciona con dependencia de configuración | Facturación usa `facturacion.emitir`, `facturacion.folios` y `facturacion.anular`. Ningún rol estándar no-admin lo trae por defecto; debe otorgarse como permiso extra al encargado. Bodega, Ventas y Taller no pueden emitir por su matriz base. |

## Notificaciones

La campana (`GET /api/notificaciones`) calcula resultados al vuelo cuando se consulta; no persiste una cola de notificaciones. Incluye condiciones de stock, ODT, atraso, entregas/facturación, según permisos. Esto es una alerta interna, no una confirmación de entrega de correo, SMS, WhatsApp o push.

**Regresión verificable:** `notificaciones-bodega-facturacion.test.js` falla 1/4. Un producto creado con stock físico 10, reservado 8, dañado 0 y crítico 5 no aparece al bodeguero como `stock_critico`, aunque el disponible es 2. La ruta contiene la fórmula correcta `(stock - stock_reservado - stock_danado)`, por lo que el contrato de prueba y el resultado real están desalineados; debe investigarse antes de confiar en esa alerta.

## Evidencia de pruebas

| Prueba individual | Resultado |
|---|---|
| `crm-cotizaciones-flujo.test.js` | 8/8 OK |
| `cotizaciones-flow.test.js` | 5/5 OK |
| `ventas.test.js` | 67/67 OK |
| `pasar-taller.test.js` | 10/10 OK |
| `despachos-flujo-integral.test.js` | 10/10 OK |
| `despachos-traceability.test.js` | 37/37 OK |
| `notificaciones-bodega-facturacion.test.js` | 3/4 OK; alerta de stock crítico falla |
| Validación de integración Taller/Bodega/RRHH/Gerencia | 117/117 OK (ejecutada antes de esta auditoría, misma revisión) |

La misma batería, lanzada como ocho archivos paralelos, agotó memoria de Node/Vitest (`Fatal process out of memory: Zone`). La ejecución individual evita el fallo; configurar pool/hilos/límite de memoria es un pendiente de CI.

## Matriz mínima por rol

| Rol | Puede ejecutar | Restricción relevante |
|---|---|---|
| Vendedor | CRM, ventas, licitaciones y clientes | Sólo lectura en Taller y Despacho; no emite DTE. |
| Coordinador comercial | Igual que vendedor, con visibilidad CRM ampliada | No tiene Bodega, Taller de escritura ni Facturación base. |
| Bodeguero | Bodega, Despacho, Catálogo y Proveedores | No puede escribir ventas ni emitir Facturación. |
| Jefe de Taller (`taller`) | Gestión de OT, calidad y cierre, sujeto a taller responsable | No modifica ventas ni emite documentos. |
| Operario de Taller | Avances/evidencias propias | No reasigna, cierra ni anula OT. |
| Encargado de Facturación | Debe recibir permisos extra `facturacion.emitir` y, si aplica, folios/anulación | No existe como rol estándar separado; depende de configuración administrativa. |

## Pendientes priorizados

1. Corregir o explicar la alerta de stock disponible: prueba roja reproducible para `bodeguero`.
2. Definir y aplicar el modelo de inventario: reserva al ganar versus rebaja física al despacho; hoy se descuenta al crear venta directa.
3. Añadir un flujo explícito de aprobación/bloqueo crediticio antes de liberar a Taller/Bodega, si es requisito del negocio.
4. Convertir la sugerencia de OC en un flujo rastreable por venta (no sólo cálculo general), sin crear OC automática sin decisión de Compras.
5. Definir disparadores de correo/PDF para cotización, confirmación de pedido, en tránsito y factura; probar entrega y reintentos.
6. Definir si se requieren WhatsApp/SMS, proveedor, consentimiento y trazabilidad de envío.
7. Automatizar o hacer visible la decisión de crear borrador DTE 52 después de Packing, con resguardo de datos fiscales.
8. Implementar rol/interfaz de chofer y POD digital si el transportista debe actualizar entrega desde terreno.
9. Definir el cierre contable/CxC automático y sus eventos auditables, actualmente no demostrado por esta auditoría.
10. Configurar Vitest/CI para correr la suite por lotes o con límite de workers/memoria.

## Cómo reproducir

```powershell
Set-Location D:\plastimar-erp-v2\backend
npm.cmd run test:docker -- crm-cotizaciones-flujo.test.js
npm.cmd run test:docker -- cotizaciones-flow.test.js
npm.cmd run test:docker -- ventas.test.js
npm.cmd run test:docker -- pasar-taller.test.js
npm.cmd run test:docker -- despachos-flujo-integral.test.js
npm.cmd run test:docker -- despachos-traceability.test.js
npm.cmd run test:docker -- notificaciones-bodega-facturacion.test.js
```

Las pantallas observadas fueron `/crm`, `/ventas`, `/pasar-taller`, `/bodega/picking`, `/bodega/packing`, `/despachos` y `/facturacion/documentos`.
