# 28 - Pasar a Taller: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, sin captura legacy directa de menu**.

## Fuentes revisadas

- Evidencia legacy: carpeta legacy `pasar_taller`; no hay captura directa de menu en el set principal.
- Captura actual: [20-taller-pasar-a-taller.png](../current-screenshots/20-taller-pasar-a-taller.png)
- Frontend actual: `frontend/src/pages/pasar-taller/PasarTallerPage.jsx`, `frontend/src/api/pasarTaller.js`
- Backend actual: `backend/src/routes/pasar-taller/index.js`, `backend/src/routes/odts/item-workflow.js`

## Resumen ejecutivo

El baseline identifica Pasar a Taller como flujo legacy sin captura directa. En el ERP actual existe `/pasar-taller`, enfocado en enviar items desde venta/operacion hacia talleres, relacionarlos con ODT y controlar eliminacion/notificacion.

La funcion actual es mas fuerte que una pantalla aislada porque conecta venta, items y ODT.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Envio a taller | Carpeta legacy identificada. | `/pasar-taller`. | Cubierto/mejorado. |
| Relacion con ODT | No documentada visualmente. | Relaciona items con ODT/taller. | Mejorado. |
| Control de eliminacion | No visible. | Eliminacion controlada. | Mejorado. |
| Notificacion/estado | No visible. | Flujo actual soporta aviso/seguimiento. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Venta -> ODT -> items/talleres.
- Evita quitar talleres ya iniciados.
- Asignacion concurrente controlada.
- Registro/bitacora relacionada.
- Permisos cruzados taller/ventas.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Sin captura legacy directa | No se puede comparar visualmente. | Documentar flujo actual con usuario operativo. |
| Criterios de envio | Pueden existir reglas informales legacy. | Validar caso real venta a taller. |

## Detalles legacy que ya no tienen sentido conservar

- Flujo desconectado de ODT.
- Eliminaciones sin trazabilidad.

## Decision del modulo

Modulo **mejorado**. Requiere validacion de flujo completo con usuario clave.

