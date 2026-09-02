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
| Guía de venta | `13392` / DTE borrador `206` | DTE 52 preparado, sin folio ni envío SII |
| Despacho aislado | `401` / guía `13393` | Expediente manual separado, sin inventar una venta |
| Caja | Turno `137`, movimientos `37954` y `37955`, cierre `11` | Documento referencial, pago por transferencia y cierre cuadrado |
| Nota de crédito interna | `8` | Activa, reintegro de stock y ajuste financiero sin DTE |
| Nota de crédito SII | Borrador `208`, referencia DTE `204` | Borrador DTE 61 correctamente separado de la NC interna |

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

La configuración comprobada en `plastimar_test` declara ambiente `certificacion` y contiene CAF vigentes para DTE 33, 39, 52 y 61. Sin embargo, falta el archivo de certificado digital local (`backend/data/facturacion/certificado.p12`).

Se intentó emitir el DTE 61 borrador y la guía DTE 52 por las rutas reales. Ambas devolvieron el bloqueo esperado: `No hay certificado digital cargado. Súbelo en Configuración.` No se creó folio, no se generó `trackId`, no hubo envío al SII y no se consumió CAF.

Para una emisión real de certificación falta cargar un certificado de **certificación** autorizado en el entorno local y ejecutar nuevamente el caso. No se debe copiar ni usar un certificado productivo para esta prueba.

## Verificación de interfaz

En `http://127.0.0.1:5173/ventas/20440`, la vista mostró los controles operativos de la venta: `Órdenes de Trabajo (1)`, `Guías Despachos (1)`, `Crear Despacho (1)`, `Nota de Crédito Interna`, `Notificar a Taller`, `Emitir DTE` y `Anular Venta`. La comprobación visual respalda que el expediente creado queda accesible desde la UI local, además de la verificación de API realizada por el script.

## Hallazgos y pendientes reales

1. **Bloqueo SII local — pendiente de configuración.** Hay CAF y ambiente de certificación, pero sin certificado P12/PFX no es posible probar emisión ni envío/consulta del track ID. Es correcto que el sistema bloquee antes de tomar folio.
2. **No hubo mensajería externa de transportista ni correo real.** El número de seguimiento y todos los hitos quedaron persistidos; no se configuró ni llamó un proveedor externo de tracking o SMTP para no enviar comunicaciones fuera de la prueba.
3. **Emisión de guía corrigió un error encontrado durante la prueba.** La ruta de emisión DTE 52 creaba el motor SII sin `dataDir`, por lo que devolvía 500. Ahora usa `backend/data/facturacion` y devuelve un 422 con mensaje operable si falta certificado, sin consumir folios.
4. **La guía debe recibir líneas válidas.** La guía no infiere automáticamente el detalle si el despacho se creó sin `items`; el flujo probado entrega explícitamente las líneas de la venta al preparar la guía. Esta es la responsabilidad actual de la UI/API de preparación.

## Reproducción

Desde `D:\plastimar-erp-v2\backend`:

```powershell
node --env-file=.env.test.docker scripts\create-weekly-e2e-operation.mjs
npx.cmd vitest run test\despachos-flujo-integral.test.js test\facturacion-engine.test.js test\flujo-roles-e2e.test.js
```

La ejecución final de regresión pasó: 3 archivos y 16 pruebas.
