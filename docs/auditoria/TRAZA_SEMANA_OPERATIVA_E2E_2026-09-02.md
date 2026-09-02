# Traza E2E — semana operativa simulada (2026-09-02)

## Alcance y seguridad

La simulación fue ejecutada exclusivamente contra `plastimar_test` con el script [`backend/scripts/create-weekly-e2e-operation.mjs`](../../backend/scripts/create-weekly-e2e-operation.mjs). No se consultó ni modificó producción. Los eventos se ejecutaron el 2026-09-02 y se etiquetan como Día 1 a Día 5 para representar el orden de una semana; las fechas contables y operativas no fueron retrofechadas.

La traza final es `E2E-SEMANA-20260902184719`, registrada también en `audit_log` con ID `5968`.

## Resultado principal

| Expediente | Identificador | Resultado comprobado |
| --- | ---: | --- |
| Venta CRM | Orden `20440`, interno `970095635` | `Pagada`, `Entregada`, flujo formal `CERRADA` |
| Oportunidad CRM | `34275` | `CERRADO` / `GANADO` y vinculada a la orden |
| Pendiente comercial intencional | CRM `34276` | Permanece en seguimiento para la próxima semana |
| Orden de taller | ODT `6646` | `Terminada`, tras control de calidad supervisado |
| Material de taller | Historial `8` | 1,5 planchas de espuma, merma 0,25, lote aprobado trazable |
| Despacho de venta | `400` | Seguimiento `Preparado → Patio → Didáctico → Reparto → Entregado`; código `E2E-SEMANA-20260902184719-TRACK-01` |
| Guía de venta | `13392` / DTE `206` | Folio DTE 52 `73`, enviado con Track ID `0257` y **Aceptado** por SII Maullín |
| Despacho aislado | `401` / guía `13393` | Expediente manual separado, sin inventar una venta |
| Caja | Turno `137`, movimientos `37954` y `37955`, cierre `11` | Documento referencial, pago por transferencia y cierre cuadrado |
| Nota de crédito interna | `8` | Activa, reintegro de stock y ajuste financiero sin DTE |
| Nota de crédito SII | DTE `208`, referencia DTE `204` | Emitida como folio DTE 61 `62`; envío rechazado por SII por RUT receptor inválido, sin reintento |

## Flujo semanal ejecutado

| Día | Rol que actuó | Acción ejercida | Evidencia persistente |
| --- | --- | --- | --- |
| 1 | Vendedor | Crea cotización CRM mixta, registra llamada, pasa a seguimiento y registra aceptación por correo. | CRM `34275`, gestión y versión/aceptación de cotización. |
| 2 | Vendedor y coordinador comercial | Aprueba la oportunidad con OC; se crea la venta ERP y el coordinador la revisa. | Orden `20440`, ODT automática `6646`. |
| 3 | Jefe de Taller y operario | Asigna, inicia, consume espuma por lote con merma, marca etapa lista, pasa a Control de Calidad y cierra supervisadamente. | Historial material `8`, lote `E2E-SEMANA-20260902184719-L1` con saldo 8,25, ODT `Terminada`. |
| 4 | Bodeguero | Crea despacho desde venta, confirma picking, registra packing, prepara DTE 52 y completa la cadena de tracking. También crea despacho aislado y su guía en borrador. | Despachos `400` y `401`; guías `13392` y `13393`; eventos de packing y tracking. |
| 5 | Cajero, facturador, vendedor y gerencia | Registra documento y pago, cierra caja, cierra CRM como ganado, genera NC interna y borrador NC SII; gerencia revisa métricas y matriz. | Turno `137`, cierre `11`, NC interna `8`, borrador DTE 61 `208`, audit log `5968`. |

## Roles utilizados

| Usuario de prueba | Rol | Acciones realmente usadas |
| --- | --- | --- |
| `273` | vendedor | Cotización, gestiones, aceptación, aprobación y cierre CRM. |
| `274` | coordinador_comercial | Revisión de la orden creada desde CRM. |
| `275` | taller | Planificación de ODT, asignación, control de calidad y cierre. |
| `276` | taller_operario | Consumo con lote/merma y término de etapa. |
| `277` | bodeguero | Despacho, picking, packing, guía y tracking; además despacho aislado. |
| `278` | cajero | Apertura/cierre de turno, documento de cobro y pago. |
| `279` | bodeguero con permisos funcionales de facturación | NC interna, borrador NC SII y verificación de documentos. |
| `280` | admin | Gestión del pendiente CRM y revisiones gerenciales. |

## SII, CAF y documentos tributarios

La configuración comprobada en `plastimar_test` declara ambiente **Certificación (Maullín)**. El 2026-09-02 se cargó mediante la interfaz de Configuración un certificado P12 de certificación; la pantalla confirmó que es válido, corresponde al firmante `8833435-3` y vence el `22-07-2029`. No se usó ni modificó producción.

| Caso ejecutado desde UI | Resultado | Evidencia visible / SII |
| --- | --- | --- |
| NC SII, documento `208` | Se asignó folio DTE 61 `62` y se intentó enviar una sola vez. | SII devolvió `STATUS=7`: `RUTRecep 881788374-6` excede el máximo permitido por el XSD. No se reintentó ni se consumió otro folio. |
| Guía DTE 52 de venta `20440` | Se asignó folio `73`, se envió y se consultó desde el panel de Bodega. | Track ID `0257`; estado final visual **Aceptado (Folio 73)**. |

El rechazo de la NC descubrió un defecto: el algoritmo de dígito verificador aceptaba cuerpos de nueve dígitos aunque el XSD tributario sólo admite hasta ocho. La corrección `58a3593` bloquea ese RUT antes de reservar folio, y `0ce2ba7` expone en Bodega los estados pendiente de envío, Track ID y aceptación/rechazo. La corrección posterior de motor persiste los próximos rechazos de upload como `error` y bloquea reemisiones con folio.

El documento `208` fue emitido antes de esa última persistencia de error; por trazabilidad histórica permanece como `emitido` en el listado local aunque su rechazo SII está registrado en esta traza. No debe reenviarse ni reemitirse: requiere conciliación manual de la prueba.

## Verificación de interfaz

En `http://127.0.0.1:5173/ventas/20440`, la vista mostró los controles operativos de la venta: `Órdenes de Trabajo (1)`, `Guías Despachos (1)`, `Crear Despacho (1)`, `Nota de Crédito Interna`, `Notificar a Taller`, `Emitir DTE` y `Anular Venta`.

En `http://127.0.0.1:5173/despachos`, pestaña `Guías de Despacho (DTE 52)`, se comprobó visualmente la guía de la venta `#970095635`: **Folio 73**, destinatario de la traza E2E y estado SII **Aceptado (Folio 73)**. Antes de la corrección, esa pantalla sólo mostraba “Emitido”; ahora distingue borrador, emitido pendiente, enviado con Track ID y aceptado/rechazado, con las acciones correspondientes.

## Hallazgos y pendientes reales

1. **NC SII de prueba rechazada — conciliación pendiente.** El folio 62 contiene un RUT históricamente inválido (`881788374-6`). No se debe reintentar. Para repetir el caso se necesita un nuevo CAF DTE 61 y un cliente de prueba con RUT de hasta ocho dígitos y DV válido.
2. **No hubo mensajería externa de transportista ni correo real.** El número de seguimiento y todos los hitos quedaron persistidos; no se configuró ni llamó un proveedor externo de tracking o SMTP para no enviar comunicaciones fuera de la prueba.
3. **Emisión de guía corrigió un error encontrado durante la prueba.** La ruta de emisión DTE 52 creaba el motor SII sin `dataDir`, por lo que devolvía 500. Ahora usa `backend/data/facturacion` y devuelve un 422 con mensaje operable si falta certificado, sin consumir folios.
4. **La guía debe recibir líneas válidas.** La guía no infiere automáticamente el detalle si el despacho se creó sin `items`; el flujo probado entrega explícitamente las líneas de la venta al preparar la guía. Esta es la responsabilidad actual de la UI/API de preparación.
5. **Borradores tributarios ya no quedan atrapados en la lista.** El commit `ab8a7dd` agrega `Emitir DTE` para borradores y separa la emisión del envío SII, evitando doble submit y permitiendo revisar cada transición.

## Reproducción

Desde `D:\plastimar-erp-v2\backend`:

```powershell
node --env-file=.env.test.docker scripts\create-weekly-e2e-operation.mjs
npx.cmd vitest run test\despachos-flujo-integral.test.js test\facturacion-engine.test.js test\flujo-roles-e2e.test.js
```

La regresión posterior a las correcciones pasó: `facturacion-engine` + `facturacion-xmlutil` (10 pruebas) y `despachos-flujo-integral` + `facturacion-engine` (14 pruebas). El build de frontend también finalizó correctamente.
