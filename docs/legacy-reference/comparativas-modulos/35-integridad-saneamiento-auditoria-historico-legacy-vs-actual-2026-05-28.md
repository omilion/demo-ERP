# 35 - Integridad, saneamiento, auditoria e historico: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Extra nuevo, soporte critico de migracion y seguridad**.

## Fuentes revisadas

- Baseline: no existia como control formal legacy.
- Capturas actuales: [34-admin-integridad.png](../current-screenshots/34-admin-integridad.png), [35-admin-saneamiento-legacy.png](../current-screenshots/35-admin-saneamiento-legacy.png), [36-admin-auditoria.png](../current-screenshots/36-admin-auditoria.png), [37-admin-historico.png](../current-screenshots/37-admin-historico.png)
- Frontend actual: `frontend/src/pages/admin/IntegridadPage.jsx`, `SaneamientoLegacyPage.jsx`, `AuditoriaPage.jsx`, `HistoricoPage.jsx`, `frontend/src/api/admin.js`
- Backend actual: `backend/src/routes/admin/index.js`, `backend/src/routes/historico/index.js`, `backend/src/plugins/audit.js`

## Resumen ejecutivo

El ERP legacy no tenia un modulo formal equivalente para integridad, saneamiento, auditoria e historico. El ERP actual agrega controles de datos huerfanos, stock negativo, productos sin precio, mojibake, duplicados, mismatches, historico y auditoria con payload redactado.

Estas vistas no son reemplazos cosmeticos; sostienen seguridad, migracion y operacion confiable. No deben ocultarse ni eliminarse sin decision explicita.

## Mejoras nuevas que no se deben perder

- Deteccion de datos huerfanos.
- Control de stock negativo.
- Productos sin precio.
- Duplicados RUT/codigo.
- Mojibake y saneamiento legacy.
- Auditoria de actor/ruta/entidad/payload redactado.
- Historico separado por corte.
- Acciones admin controladas.

## Brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Politicas de apply masivo | Corregir masivamente puede afectar datos. | Definir backup, rollback y permisos antes de activar acciones. |
| Retencion de auditoria | Puede crecer o no cumplir necesidad legal. | Definir politica de retencion. |
| Que queda solo lectura | Algunas correcciones deben ser manuales. | Clasificar hallazgos accionables vs informativos. |

## Detalles legacy que ya no tienen sentido conservar

- Operar sin auditoria formal.
- Resolver saneamiento solo con scripts manuales no trazables.
- Ocultar problemas de datos migrados.

## Decision del modulo

Modulo **extra nuevo y critico**. Preservar.

