# Auditoría de Taller para despliegue VPS

**Corte auditado:** `origin/main` en `3024f38` (1 de septiembre de 2026).  
**Método:** revisión de rutas, esquema, migraciones, pantallas y pruebas sobre un worktree aislado. No se modificó producción ni se desplegó código.

## Veredicto

**No apto para despliegue directo como flujo integral de Taller.** Hay una base útil para producción de artículos (OT, ítems por taller, Corte, consumos y bitácora), pero faltan garantías que impiden operar de forma segura bajo concurrencia y no existen los submódulos de Servicio Técnico/Mantenimiento solicitados.

Los bloqueos previos al VPS son: reconciliar la base de pruebas/migraciones, corregir el descuento concurrente por lote, hacer atómico el avance de Corte y endurecer la máquina de estados/cierre de OT.

## Qué existe realmente

| Área | Estado | Evidencia verificable | Límite actual |
|---|---|---|---|
| Entrada venta → OT de producción | Parcial | `backend/src/routes/pasar-taller/service.js`, `autoNotifyTaller()`; creación/actualización de venta invoca el servicio | Sólo productos `estadoInventario=transitorio`; si un producto no tiene taller configurado, el fallback lo asigna a Espumas o al primer taller activo. |
| OT interna | Implementado | `backend/src/routes/odts/create.js`; exige orden o centro de costo | Es una OT genérica, no una recepción de vehículo/equipo con diagnóstico. |
| Taller por ítem | Implementado | `backend/src/routes/odts/item-workflow.js`; estados de relación ODT–ítem–taller | Acepta saltos de estado en la API; no obliga secuencia ni control de calidad. |
| Corte | Parcial | `/taller-corte`, `backend/src/routes/taller-corte/index.js`, `OdtAvance`, evidencia fotográfica | Tiene avance por cantidad y foto, pero su tope no es atómico bajo concurrencia. |
| Espumas, Confecciones y Madera/Externo | Parcial | `frontend/src/pages/taller/TallerOperarioPage.jsx` | El operario sólo cambia estado y sobreescribe una observación; no registra cantidad, consumo, tiempo ni evidencia por operación. |
| Consumos | Parcial | `backend/src/routes/odts/consumos.js` y `TallerFormPage.jsx` | Descuenta stock real, pero no reserva, no devuelve material y tiene carrera por lote. |
| Lote, calidad y merma de espuma | Parcial | `BodegaTallerLote`, `parseConsumoRequest`, `consumirMaterialTaller()` | Sólo se aplica al consumo; no vincula lote/calidad al producto fabricado ni controla calidad de la OT. |
| Servicio técnico / mantenimiento | Pendiente | Búsqueda en `backend/src/routes`, `frontend/src/pages` y esquema: no hay entidad, ruta ni pantalla de activo/vehículo, diagnóstico, pauta ni mantenimiento | El valor `MANTENIMIENTO` de configuración no constituye un módulo operativo. |

## Matriz de flujo por rol

| Rol | Pantallas que opera | Trigger real | Permisos CRUD efectivos | Datos enviados a otros módulos |
|---|---|---|---|---|
| Asesor/ventas | Venta y `Pasar a Taller` | Venta activa con producto transitorio; también `POST /ventas/:id/forzar-taller` | `ventas.write` o `taller.write` para notificar | Crea/reutiliza OT e ítems de taller. No crea diagnóstico, activo ni presupuesto técnico. |
| Jefe de Taller | `/taller`, `/taller/:id`, Kanban, formulario OT | OT creada o selección manual | `taller.gestion.write`; `taller.cerrar.write/delete` para cierre/anulación | Bitácora, responsable, fechas y estado. No hay emisión transaccional de costo real a Contabilidad. |
| Operario de Corte | `/taller-corte` | Asignación a relación ODT–ítem–Corte | `taller.write`/`taller.avance.write` | `OdtAvance`, evidencia y bitácora. El avance no descuenta insumos automáticamente. |
| Operario de Espuma/Confección/Madera | `/taller-operario` | Ítem asignado a su taller | `taller.avance.write` | Sólo estado y campo `obs` mutable; no hay evento de cantidad, tiempo ni consumo. |
| Bodega | Materiales de OT y paneles de despacho | Consumo declarado por Taller; estaciones listas | `taller.avance.write` para consumo; lectura de Bodega/Despacho | `MovimientoBodega`/`BodegaTallerMovimiento` y notificación calculada al vuelo. No hay reserva previa ni devolución. |
| Control de calidad | No hay una vista ni rol operativo dedicado | Cambio manual a `Control calidad`/`Terminada` | Puede hacerse desde gestión Taller | No hay checklist, firma, resultado, evidencia obligatoria ni bloqueo de entrega. |

## Puntos críticos transaccionales y de trazabilidad

| Severidad | Hallazgo | Evidencia | Impacto VPS | Acción requerida antes de desplegar |
|---|---|---|---|---|
| Bloqueante | La base de pruebas no representa un estado migratorio desplegable | `prisma migrate status` contra `plastimar_test`: último ancestro común `20260828150000_CX_add_role_taller_operario`; 3 migraciones de main faltan en test y test contiene 2 migraciones no presentes en main | No se puede certificar el deploy ni interpretar los tests como evidencia de producción | Definir una sola línea de migraciones, recrear/sincronizar `plastimar_test` desde un respaldo controlado y ejecutar `migrate deploy` antes de repetir pruebas. |
| Bloqueante | Consumo de lote de espuma puede quedar negativo con dos consumos simultáneos | `backend/src/routes/odts/consumos.js:179-190`: comprueba `cantidadDisponible` y luego hace `update(... decrement ...)` sin condición `gte` ni lock de lote | El stock general puede quedar correcto y el lote específico negativo; se pierde trazabilidad física | Usar `updateMany` condicionado por `cantidadDisponible >= totalEgreso`, comprobar `count=1`, o `SELECT ... FOR UPDATE` del lote dentro de la transacción. Cubrir con prueba concurrente. |
| Alta | Avances simultáneos de Corte pueden superar la cantidad objetivo | `backend/src/routes/taller-corte/index.js`: agrega `OdtAvance` antes de la transacción y luego inserta dentro; no vuelve a calcular/bloquear dentro de la transacción | Dos tablets pueden aprobar cada una el mismo saldo y producir sobreavance | Calcular y validar dentro de una transacción serializada o aplicar lock por `odt_item_taller_id`; prueba con dos solicitudes simultáneas. |
| Alta | Máquina de estados de OT no se aplica en el backend | `backend/src/routes/odts/update.js` acepta cualquier `ODT_ESTADOS`; `/:id/cerrar` no comprueba ítems, QA, consumo ni entrega | Se puede cerrar desde Pendiente o saltar QA; el Kanban sólo sugiere el flujo visualmente | Definir transiciones permitidas en backend y precondiciones: todas las estaciones resueltas, QA aprobado, materiales/costos conciliados y motivo de excepción. |
| Alta | Anulación/cancelación no revierte ni propone destino para consumos | `update.js` sólo marca `Anulada/eliminado`; `DELETE /:id/materiales/:materialId` sólo borra `TallerMaterial` | Stock, movimientos y consumo físico quedan desacoplados de la OT anulada | Implementar reversa trazable/nota de devolución o bloquear anulación hasta decisión explícita por cada consumo. Nunca borrar el resumen como sustituto de revertir stock. |
| Alta | Espuma/Confección/Madera no tienen trazabilidad de mano de obra | `TallerOperarioPage.jsx` guarda `obs` mediante `useOdtItemTallerEstado`; `item-workflow.js` no crea bitácora cuando sólo cambia `obs` | El texto puede sobrescribirse sin hora, operador real, cantidad ni tiempo; no hay costo real por trabajador | Crear eventos append-only de inicio/pausa/reanudación/fin y avance por cantidad para todos los talleres, no sólo Corte. |
| Alta | No hay módulo de Servicio Técnico/Mantenimiento | Sin modelos ni rutas de equipo/vehículo, síntomas, diagnóstico, pauta, firma o historial de mantenimiento | El flujo de recepción, diagnóstico, presupuesto y entrega del prompt no se puede ejecutar ni auditar | Diseñar el dominio antes de crear pantallas: activo/vehículo, OT de servicio, diagnóstico, presupuesto, repuestos, checklist y aceptación. |
| Media | Notificación de término no está verificada | `backend/test/notificaciones-taller-termino.test.js`: 2 fallas; expectativa de aviso `odt_lista_despacho` no se cumple en el entorno probado | Bodega puede no enterarse de producción lista | Corregir la prueba/rol/datos hasta que el flujo quede reproducible; no aceptar sólo la consulta calculada como garantía operacional. |
| Media | Bitácora diaria independiente está bloqueada por constraint residual | 5 fallas de `bitacora-taller.test.js`; DB rechaza `odt_id NULL` pese a que `20260526224500_allow_standalone_bitacora_taller` hace `DROP CONSTRAINT` | Las actividades de taller no ligadas a una OT retornan 500; se pierde la vía de trazabilidad diaria | Reconciliar migración/constraint en `plastimar_test` y confirmar el mismo estado en staging antes de VPS. |
| Media | Asignación automática de taller tiene fallback de negocio inseguro | `autoNotifyTaller()` en `pasar-taller/service.js:318-335`: asigna Espumas o el primer taller activo sin proceso explícito | Un producto puede entrar a la cola equivocada | Hacer obligatoria la asignación de proceso/taller de receta/producto; dejar excepción manual visible. |

## Auditoría UX/UI operativa

| Vista | Lo útil | Crítica de piso | Corrección necesaria |
|---|---|---|---|
| Tablero jefe (`/taller`) | Lista, filtros, KPIs de atraso y Kanban | Kanban permite arrastrar/cambiar estado, pero no muestra capacidad real, carga por estación, disponibilidad de repuestos, cola de QA ni dependencias entre procesos. No hay Gantt ni detección de cuello de botella. | Separar tablero de coordinación: capacidad por operario/estación, OT vencidas, bloqueos por material y cola QA; cambios masivos con motivo. |
| OT (`/taller/:id`) | Tiene fechas, bitácora, costos estimados y consumo manual | El botón “Marcar lista” permite saltar desde Pendiente a Terminada; QA no tiene formulario. El consumo no está cerca de la tarea/operario que lo usó. | Panel de cierre con checklist obligatorio, diferencias de consumo, costo estimado vs. real y responsable de QA. |
| Operario móvil | Tarjetas grandes, “Mis tareas” y acciones de inicio/finalización | No existe pausa real, cronómetro, cantidad producida, consumo rápido, escaneo ni manejo de reconexión. “Registrar avance” es texto editable, no un registro. | Flujo de una mano: iniciar/pausar/terminar, cantidad, merma, lote y foto; cola offline con confirmación de sincronización. |
| Taller de Corte | Cantidad, foto, responsable y progreso visibles | Buen punto de partida, pero se permite “Marcar listo” sin completar objetivo ni QA. Modal denso para tablet y no informa conflicto de concurrencia. | Bloquear finalización con saldo; hacer QA explícito y notificar conflictos/stock insuficiente antes de guardar. |
| Control de calidad | Sólo existe como estado | No hay rol, checklist, firma, tolerancia, rechazo/reproceso ni evidencia requerida. | Construir pantalla y modelo de inspección antes de usar `Control calidad` como gate operativo. |

## Evidencia de pruebas

- Sintaxis de las rutas de `odts`, `pasar-taller` y `taller-corte`: correcta mediante `node --check`.
- `test/odt-consumos.test.js`: **15/15** verdes. Cubre stock general, merma y lote, pero no dos transacciones concurrentes sobre el mismo lote.
- Suite seleccionada adicional (`odts`, operaciones, workflow, pasar-taller, Corte, bitácora y notificaciones): **55 verdes / 17 rojas**.
  - 10 rojas de `pasar-taller`: el cliente Prisma exige `orden_items.picking_confirmado`, columna ausente en `plastimar_test`.
  - 5 rojas de bitácora: la constraint `bitacora_taller_odt_id_required_new` sigue activa en la base, contradiciendo la migración que la elimina.
  - 2 rojas de notificación de producción terminada: el aviso esperado no fue devuelto.
- Linter frontend: se ejecutó contra `origin/main` sin diagnósticos reportados por ESLint.

## Integraciones

- **Bodega:** el consumo sí genera movimiento y referencia a ODT. No hay reserva, devolución ni conciliación al anular.
- **Ventas:** la venta transitoria puede generar OT. El progreso de OT no avanza el flujo formal de venta; el commit `2800e24` conecta preparación/entrega/caja, no el trabajo de Taller.
- **Despacho:** las notificaciones se calculan al leer `/api/notificaciones`; no es una cola/evento durable ni un bloqueo de despacho por QA.
- **Facturación/Caja/Contabilidad:** no se encontró transferencia de costo real de mano de obra, consumo real o margen de OT a Contabilidad. Facturación/Caja se gobiernan por los eventos de venta/entrega/cobro, no por cierre validado de OT.
- **CRM:** no se encontró notificación o evento de estado de Taller hacia CRM.

## Decisiones de diseño pendientes

1. Definir si la OT será sólo para producción de productos o también para servicio/mantenimiento. No mezclar ambos sin el modelo de activo/diagnóstico.
2. Definir política de reserva de materiales: reservar al asignar, consumir al usar y devolver/reclasificar al cancelar.
3. Definir quién aprueba QA, qué checklist aplica por taller y qué excepciones permiten cerrar/despachar.
4. Definir fuente oficial del tiempo real: fichaje por operario, máquina, pausa y retrabajo; el cálculo actual por fechas de OT no equivale a horas-hombre.
5. El commit `204d20a` **ya está contenido en `origin/main`** al corte auditado; por lo tanto no debe seguir describiéndose como evidencia fuera de main. Corrige la asignación de recetas según procesos, pero no elimina el fallback de `autoNotifyTaller()` para productos sin taller explícito.

## Orden recomendado de salida

1. Reconciliar migraciones y restaurar una `plastimar_test` reproducible.
2. Corregir carreras de lote y de avance; agregar pruebas concurrentes.
3. Blindar máquina de estados, QA y cierre/anulación con reversa de material.
4. Reemplazar notas mutables de operario por eventos de tiempo/cantidad/consumo.
5. Diseñar e implementar por separado Servicio Técnico/Mantenimiento antes de prometer ese flujo.

