# Venta persistente de trazabilidad E2E

Entorno: `plastimar_test` únicamente.
Marca: `E2E-TRAZA-20260902144346`
Fecha de ejecución: 2026-09-02.

Esta venta fue creada para revisar conexiones reales entre módulos. No es una
venta productiva, no consume un folio fiscal y no llamó al SII.

## Expediente principal

| Registro | Identificador | Estado comprobado |
| --- | ---: | --- |
| Venta | ID `20348` · interno `970095601` | Pagada · Entregada · `CERRADA` |
| Cliente | `27888` | Cliente de prueba con marca E2E |
| Producto inventariado | `44707` | Venta de 2 unidades y kardex de egreso `2169` |
| Producto transitorio | `44708` | Producción asociada a ODT |
| ODT | `6635` | Una etapa terminada, con cuatro entradas de bitácora |
| Etapa de taller | `28758` | `listo`, responsable operario `192` |
| Despacho | `377` | Cadena completa de seguimiento |
| Guía de despacho | `13371` | Preparada como expediente interno |
| DTE 52 | Documento `178` | `borrador`, sin folio ni `trackId`; no emitido al SII |
| Turno de caja | `126` | Cerrado, con snapshot de cierre |
| Pago efectivo | Movimiento caja `37883` | $3.000, vinculado a la venta y al turno |
| Documento referencial | Movimiento caja `37882` | Boleta de prueba, sin pago directo |
| Auditoría | `5530` | Entidad `e2e_trace`, contiene el mapa completo de IDs y usuarios |

## Usuarios que participaron

| Rol operativo | Usuario de prueba | ID |
| --- | --- | ---: |
| Vendedora | `E2E-TRAZA-20260902144346 · Vendedora` | 189 |
| Coordinador comercial | `E2E-TRAZA-20260902144346 · Coordinador Comercial` | 190 |
| Jefe de taller | `E2E-TRAZA-20260902144346 · Jefe de Taller` | 191 |
| Operario | `E2E-TRAZA-20260902144346 · Operario Taller` | 192 |
| Bodega | `E2E-TRAZA-20260902144346 · Bodeguero` | 193 |
| Caja | `E2E-TRAZA-20260902144346 · Cajero` | 194 |
| Facturación | `E2E-TRAZA-20260902144346 · Facturación` | 195 |
| Gerencia | `E2E-TRAZA-20260902144346 · Gerencia` | 196 |

## Hilo comprobado

1. Vendedora creó la venta mixta: dos unidades inventariadas y una transitoria.
2. La venta generó el movimiento de bodega `2169`, tipo `egreso`, cantidad `-2`,
   con origen `venta_directa` y usuario vendedor `189`.
3. El producto transitorio creó automáticamente la ODT `6635`; el jefe asignó
   al operario y éste dejó la etapa `28758` en `listo`.
4. Bodega creó despacho `377`, confirmó picking de ambos ítems, creó un bulto y
   cuatro eventos de packing.
5. El seguimiento persistido es: `Preparado → Patio → Didáctico → Reparto → Entregado`.
6. Caja registró el documento referencial y después el pago efectivo de $3.000;
   el estado formal avanzó a `CERRADA`.
7. Facturación revisó el expediente con su permiso granular. La guía generó el
   DTE 52 interno `178` en estado `borrador`, sin folio ni envío SII.
8. Gerencia consultó el tracking final. El resumen reproducible quedó en
   `auth.audit_log`, fila `5530`.

## Revisión rápida

Con la aplicación local conectada a `plastimar_test`, abrir:

- `/ventas/20348`
- `/taller?odtId=6635`
- `/despachos/377`
- `/caja/turno/126`

La consulta de verificación debe devolver: venta `Pagada/Entregada/CERRADA`,
ODT `listo`, un despacho con cinco eventos de tracking, un bulto, cuatro
eventos de packing, un kardex de egreso y el pago en caja.
