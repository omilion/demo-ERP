# Plan de desarrollo — CRM comercial Plastimar

**Fecha:** 18 de agosto de 2026  
**Estado:** Propuesta para validación funcional  
**Objetivo:** evolucionar el CRM vigente desde un pipeline genérico de prospectos hacia un flujo comercial trazable, con cotización, seguimiento, aprobación, cierre ganado/perdido e integración con ventas, pagos, facturación y despacho.

## 1. Diagnóstico de partida

El CRM actual ya dispone de:

- Kanban y vista tabular.
- Estados `Pendiente`, `En Gestión`, `En Espera` y `Cerrado`.
- Asignación round-robin, propietario por vendedor e historial de asignaciones.
- Prioridad, próxima fecha de contacto, acción, resultado y comentarios.
- Bandeja de pendientes de hoy y atrasados.
- Métricas generales y conversión manual de lead a cliente.
- Búsqueda de una orden mediante el número de cotización.

Las principales brechas respecto del diagrama enviado por el cliente son:

- `Cerrado` no distingue ganado de perdido.
- La tasa de cierre actual cuenta todos los cierres como ganados.
- No hay canal ni tipo de venta estructurados.
- No existe motivo de pérdida estructurado.
- No hay historial formal de gestiones ni una fecha confiable de última gestión.
- No existen las reglas automáticas de 3, 5 y 10 días.
- No existe una etapa explícita `Venta aprobada`.
- El CRM no reacciona automáticamente a OC, pago o Webpay.
- El enlace con ventas/ERP es una búsqueda por número, no una integración transaccional.

## 2. Definiciones funcionales obligatorias

Estas decisiones deben quedar aprobadas antes de cerrar alcance, precio y fechas. No deben resolverse mediante supuestos técnicos.

| Decisión | Pregunta que debe responder el cliente | Propuesta inicial |
|---|---|---|
| Inicio del flujo | ¿Todo registro del CRM ya tiene una cotización enviada? | Mantener una bandeja transitoria para leads todavía no cotizados. |
| Venta web | ¿Pago Webpay lleva directo a `Venta aprobada`? | Sí, si el pago está confirmado e identificado sin ambigüedad. |
| Venta aprobada | ¿Se aprueba con OC, pago o cualquiera de ambos? | Configurar reglas por tipo/canal de venta. |
| Compra ágil | ¿No recibe seguimiento nunca o solo hasta cierto evento? | Excluirla del movimiento automático hasta confirmación. |
| En espera | ¿Se conserva como etapa o como condición del seguimiento? | Usarla como subestado/motivo de espera, no como resultado. |
| Última gestión | ¿Qué reinicia el contador: llamada, correo, visita, nota o cambio de estado? | Solo una gestión comercial registrada explícitamente. |
| Días | ¿Son días corridos o hábiles? ¿Cuál es la zona horaria? | Días hábiles, zona `America/Santiago`, sujeto a aprobación. |
| Semáforo | ¿5 días amarillo, 10 rojo y desde 11 vencido? | Aplicar esos límites literalmente. |
| Pérdida | ¿Qué motivos son obligatorios y quién puede reabrir? | Catálogo cerrado más opción `Otro` con detalle obligatorio. |
| Integración | ¿El “ERP” es esta misma plataforma o un sistema externo? | Integración interna si ventas, caja y despacho son los módulos actuales. |
| Falla posterior | Si facturación/despacho falla, ¿la venta se pierde o queda con incidencia? | Mantenerla ganada/aprobada y registrar incidencia operacional. |
| Cardinalidad | ¿Una oportunidad puede originar más de una orden? | Confirmar antes de crear la relación CRM–orden. |

**Hito de salida:** minuta de reglas aprobada por ventas, administración y responsable técnico.

## 3. Modelo funcional objetivo

### 3.1 Etapas principales

1. `COTIZACION_ENVIADA`
2. `SEGUIMIENTO`
3. `VENTA_APROBADA`
4. `CERRADO`

`CERRADO` debe exigir un resultado:

- `GANADO`
- `PERDIDO`

Durante la migración se permitirá temporalmente `SIN_CLASIFICAR` para registros históricos. Estos registros no contarán como ganados ni perdidos en los KPI.

### 3.2 Transiciones propuestas

| Desde | Hacia | Condición |
|---|---|---|
| Cotización enviada | Seguimiento | Acción manual o regla de 3 días sin gestión, según tipo de venta. |
| Cotización enviada | Venta aprobada | OC, pago o Webpay confirmado según regla aprobada. |
| Seguimiento | Venta aprobada | Confirmación comercial válida. |
| Seguimiento | Cerrado/perdido | Motivo de pérdida obligatorio. |
| Venta aprobada | Cerrado/ganado | Se cumple el hito de cierre que defina el cliente. |
| Venta aprobada | Cerrado/perdido | Solo si el negocio realmente cae; no por una incidencia operacional. |
| Cerrado | Etapa activa | Reapertura autorizada y auditada. |

Las transiciones deben validarse en backend. El drag-and-drop no puede eludir campos obligatorios ni reglas de permisos.

## 4. Diseño de datos

### 4.1 Ampliación de `CrmRegistro`

Agregar, como mínimo:

- `canalVenta`: web, sala, licitación, otro.
- `tipoVenta`: compra ágil, pública, privada u otra clasificación aprobada.
- `resultadoCierre`: ganado, perdido o nulo/sin clasificar.
- `motivoPerdida`: catálogo aprobado.
- `motivoPerdidaDetalle`: obligatorio cuando corresponda.
- `ultimaGestionAt`: fecha de la última gestión que reinicia el semáforo.
- `estadoCambiadoAt`: inicio de permanencia en la etapa actual.
- `ventaAprobadaAt`.
- `cerradoAt`.
- `confirmacionTipo`: OC, pago, Webpay u otro.
- `confirmacionReferencia`: identificador visible del respaldo.
- Relación con cliente cuando ya esté convertido.
- Relación CRM–orden definida según la cardinalidad aprobada.

Para esta primera evolución se recomienda conservar los valores como códigos validados por backend, en vez de usar enums PostgreSQL difíciles de ampliar. Deben existir constantes únicas compartidas o contratos equivalentes para evitar divergencias entre frontend y backend.

### 4.2 Tabla `CrmGestion`

Crear una entidad de historial inmutable con:

- CRM relacionado.
- Tipo de gestión: llamada, correo, reunión, visita, cotización, nota u otro.
- Fecha efectiva de la gestión.
- Resultado.
- Siguiente acción y fecha comprometida.
- Usuario responsable y usuario creador.
- Origen manual o automático.
- Fechas de creación y actualización cuando corresponda.

`ultimaGestionAt` se actualizará desde esta tabla dentro de la misma transacción. No se utilizará `updatedAt` como sustituto, porque cualquier edición administrativa lo modifica.

### 4.3 Tabla `CrmEstadoHistorial`

Registrar cada transición con:

- Estado anterior y nuevo.
- Resultado de cierre cuando aplique.
- Motivo y detalle.
- Usuario o job que produjo el cambio.
- Fecha y origen del cambio.

Esta tabla permitirá medir tiempo real por etapa, auditar reaperturas y explicar movimientos automáticos.

### 4.4 Migración histórica

- No sobrescribir ni eliminar datos existentes.
- Mantener `accion`, `resultado` y `comentarios` como información legacy.
- `En Gestión` puede proponerse para `SEGUIMIENTO`, pero debe validarse mediante reporte previo.
- `En Espera` se conserva hasta definir si será etapa o subestado.
- Los registros `Cerrado` quedan con `resultadoCierre = SIN_CLASIFICAR`.
- Los registros `Pendiente` no se asumirán como cotizaciones enviadas si no hay evidencia suficiente.
- Generar un reporte de previsualización antes del backfill y otro de resultados después de aplicarlo.
- Crear migraciones idempotentes y probarlas primero en una copia de la base.

## 5. Backend y API

### 5.1 Servicios de dominio

Extraer la lógica CRM desde las rutas hacia servicios probables como:

- `crmTransitionService`: valida y ejecuta cambios de etapa.
- `crmGestionService`: registra gestiones y actualiza fechas derivadas.
- `crmAutomationService`: evalúa reglas temporales de forma idempotente.
- `crmIntegrationService`: crea o enlaza cliente, orden y confirmaciones.
- `crmMetricsService`: calcula métricas comerciales correctas.

Toda transición debe ejecutarse de manera transaccional y generar historial.

### 5.2 Endpoints propuestos

- `GET /api/crm`: incorporar filtros por etapa, canal, tipo, resultado, semáforo y responsable.
- `GET /api/crm/:id`: detalle con relaciones e historial.
- `POST /api/crm`: creación con origen/canal y asignación vigente.
- `PATCH /api/crm/:id`: edición de datos no transicionales.
- `POST /api/crm/:id/transiciones`: transición validada de etapa.
- `GET /api/crm/:id/gestiones`: historial paginado.
- `POST /api/crm/:id/gestiones`: nueva gestión.
- `GET /api/crm/catalogos`: códigos permitidos para frontend.
- `GET /api/crm/metricas`: métricas corregidas.
- Endpoint administrativo para previsualizar y ejecutar la clasificación histórica, protegido y auditable.

Se mantendrán temporalmente los contratos actuales para evitar romper el frontend durante el despliegue gradual.

### 5.3 Reglas de permisos

- Vendedor: solo sus oportunidades y gestiones.
- Administrador/jefatura: vista consolidada, reasignación y reapertura.
- Cierre perdido: motivo obligatorio.
- Reapertura: permiso específico y motivo obligatorio.
- Automatizaciones: actor técnico identificable en el historial.
- Integraciones: idempotencia para impedir órdenes, pagos o cierres duplicados.

## 6. Automatizaciones y semáforo

### 6.1 Cálculo del semáforo

El color se calculará al consultar el CRM usando `ultimaGestionAt` o la fecha base definida:

- Menos de 5 días: normal.
- Desde 5 y hasta 9 días: amarillo.
- Exactamente 10 días: rojo.
- Más de 10 días: vencido.

Esto no necesita persistirse ni requiere un cron para cambiar de color. Sí requiere definir días hábiles/corridos y una fecha de última gestión confiable.

### 6.2 Job de automatización

Crear un job ejecutable, testeable e idempotente siguiendo el patrón del job de stock crítico existente. El cron del sistema operativo o la infraestructura de despliegue lo ejecutará con la frecuencia aprobada.

Responsabilidades:

- Mover cotizaciones elegibles a seguimiento después de 3 días.
- Respetar exclusiones por tipo de venta.
- No repetir transiciones ya realizadas.
- Registrar cada movimiento en el historial.
- Generar notificaciones o pendientes cuando corresponda.
- Emitir resumen de ejecución y errores.

El job no debe crear ventas ni marcar cierres por inferencias ambiguas.

## 7. Integración con módulos del ERP

### 7.1 Cliente y orden

- Reutilizar la conversión lead→cliente existente, pero integrarla en el flujo aprobado.
- Reemplazar gradualmente el enlace por número de cotización por una relación de base de datos.
- Crear o enlazar la orden mediante un servicio compartido; no duplicar la lógica de las rutas de ventas.
- Guardar el identificador CRM como origen trazable de la orden.

### 7.2 OC, pago y Webpay

- Definir eventos verificables de OC recibida y pago confirmado.
- Vincular movimientos de Caja/Webpay con la orden y oportunidad correctas.
- Recalcular la aprobación de forma idempotente.
- No confiar solamente en texto, monto o nombre del cliente para correlacionar registros.
- Si un evento no puede asociarse con certeza, enviarlo a una bandeja de conciliación.

### 7.3 Facturación y despacho

- Una venta aprobada debe enlazarse con los procesos existentes de facturación y despacho.
- Una falla técnica u operacional genera una incidencia/reintento, no una pérdida comercial automática.
- Mostrar en CRM el estado resumido de orden, pago, facturación y entrega, manteniendo cada módulo como fuente oficial de su estado.

Si existe un ERP externo, sustituir esta integración interna por un adaptador con autenticación, reintentos, idempotencia, registro de solicitudes y bandeja de errores.

## 8. Frontend

### 8.1 Kanban

- Presentar las etapas aprobadas.
- Conservar drag-and-drop optimista.
- Abrir un formulario antes de completar transiciones que exijan datos.
- Mostrar canal, tipo, responsable, cotización, monto si está disponible, próximo contacto y semáforo.
- Distinguir visualmente ganado, perdido y cierre histórico sin clasificar.
- Mantener `En espera` como etapa o subestado según la definición funcional.

### 8.2 Detalle de oportunidad

Organizar el detalle en secciones:

- Datos del cliente/contacto.
- Datos comerciales.
- Cotización y orden vinculadas.
- Nueva gestión y próximo contacto.
- Línea de tiempo de gestiones y cambios de etapa.
- Confirmaciones de OC/pago/Webpay.
- Estado operacional de facturación y despacho.
- Acciones de aprobar, perder, ganar y reabrir según permisos.

### 8.3 Filtros y vistas de trabajo

- Mis oportunidades.
- Pendientes de hoy y atrasados.
- Semáforo amarillo, rojo y vencido.
- Sin gestión inicial.
- Venta aprobada pendiente de integración.
- Errores de conciliación/integración para administración.
- Cierres ganados y perdidos por período, canal, tipo y vendedor.

## 9. Métricas

Corregir la tasa actual y agregar:

- Tasa de conversión = ganadas / (ganadas + perdidas).
- Registros históricos sin clasificar, mostrados por separado.
- Embudo por etapa.
- Tiempo promedio y mediana por etapa.
- Tiempo desde cotización hasta aprobación y cierre.
- Ganadas/perdidas por vendedor, canal y tipo de venta.
- Motivos de pérdida.
- Oportunidades por color del semáforo.
- Cumplimiento de próximas gestiones.

No denominar “ganados” a todos los registros cerrados. Las métricas deben indicar claramente el período y la población utilizada.

## 10. Estrategia de entrega por fases

| Fase | Alcance | Entregable | Estimación inicial |
|---|---|---|---:|
| 0 | Descubrimiento y reglas | Minuta aprobada, catálogo y diagrama final | 2–3 días |
| 1 | Datos e historial | Migración, modelos, reporte/backfill seguro | 4–6 días |
| 2 | Dominio y API | Transiciones, gestiones, permisos y contratos | 5–7 días |
| 3 | CRM usable | Kanban, detalle, cierre y filtros | 5–7 días |
| 4 | Alertas y reglas | Semáforo, job de 3 días, notificaciones | 3–5 días |
| 5 | Integración ERP | Cliente, orden, OC/pago/Webpay, estados operacionales | 6–10 días |
| 6 | Métricas | KPI corregidos y reportes comerciales | 2–4 días |
| 7 | Migración, QA y salida | UAT, capacitación, despliegue y monitoreo | 4–6 días |

**Rango preliminar:** 31–48 días-persona. No constituye una cotización cerrada; la fase 5 puede variar considerablemente según las respuestas funcionales y si el ERP es interno o externo.

**Límite de alcance aprobado:** la estimación de 6–10 días de la fase 5 cubre únicamente la integración con los módulos internos de esta plataforma. Una integración con un ERP externo requiere levantamiento, credenciales, documentación de API y una cotización independiente.

Con un desarrollador full-stack, el rango orientativo es de 7–10 semanas incluyendo validaciones. Con dos personas y trabajo paralelo después de aprobar el modelo, puede reducirse a aproximadamente 5–7 semanas, sin comprimir UAT ni migración.

## 11. Pruebas obligatorias

### Backend

- Transiciones válidas e inválidas.
- Motivo obligatorio al perder y al reabrir.
- Aislamiento de cartera por vendedor.
- Historial consistente y transaccional.
- Cálculo de días y semáforo en límites 4/5/9/10/11.
- Job idempotente y exclusiones por tipo.
- Detección repetida de la misma OC/pago sin duplicar efectos.
- Cálculo correcto de tasa ganado/perdido excluyendo sin clasificar.
- Backfill repetible y sin pérdida de datos.

### Frontend

- Drag-and-drop con formularios obligatorios.
- Reversión visual si falla una transición.
- Filtros, permisos y vistas por responsable.
- Registro y visualización de gestiones.
- Accesibilidad básica del Kanban y alternativa mediante selector de etapa.
- Visualización responsive y tabla exportable.

### Integración y UAT

- Venta web pagada.
- Venta de sala.
- Licitación/venta pública.
- Compra ágil con la regla aprobada.
- Pérdida por cada motivo.
- OC sin pago y pago sin OC, según reglas.
- Error de conciliación y reintento.
- Venta aprobada que continúa a facturación y despacho.
- Registro histórico cerrado sin clasificación.

## 12. Criterios de aceptación globales

El desarrollo se considerará terminado cuando:

1. Ningún cierre pueda contarse como ganado sin un resultado explícito.
2. Toda pérdida tenga motivo y trazabilidad.
3. Toda gestión relevante actualice la fecha base del semáforo.
4. Las reglas temporales sean reproducibles, auditables e idempotentes.
5. El vendedor solo acceda a su cartera y la jefatura al consolidado autorizado.
6. OC, pago y Webpay no produzcan ventas u órdenes duplicadas.
7. CRM muestre el estado operativo sin reemplazar las fuentes oficiales de ventas, caja, facturación y despacho.
8. Los registros históricos permanezcan íntegros y los cierres ambiguos queden identificados.
9. Migraciones, pruebas automatizadas, build y UAT estén aprobados.
10. Existan instrucciones de operación, ejecución del job, monitoreo y reversa.

## 13. Despliegue y control de riesgo

- Implementar bajo una bandera de funcionalidad o activación por rol.
- Respaldar la base y generar reporte previo a toda migración productiva.
- Desplegar primero cambios compatibles de base y backend; después el frontend.
- Ejecutar el backfill en modo previsualización y requerir aprobación antes de aplicarlo.
- Activar el job inicialmente en modo simulación, registrando qué movería.
- Habilitar automatizaciones reales después de UAT.
- Monitorear transiciones, errores de integración, registros sin dueño y cierres sin clasificar.
- Preparar reversa que desactive reglas y UI nueva sin eliminar columnas ni historial.

## 14. Orden recomendado de aprobación

1. Validar las preguntas de la sección 2 con el cliente.
2. Aprobar etapas, transiciones, catálogos y criterios de cierre.
3. Confirmar si el ERP es interno o externo y la cardinalidad CRM–orden.
4. Aprobar modelo de datos y estrategia de migración histórica.
5. Reestimar las fases 4 y 5 con las respuestas definitivas.
6. Ejecutar fases 1–3 como primer incremento utilizable.
7. Incorporar automatizaciones e integración después de estabilizar el flujo manual.
8. Corregir y validar métricas antes de usarlas para decisiones comerciales.
