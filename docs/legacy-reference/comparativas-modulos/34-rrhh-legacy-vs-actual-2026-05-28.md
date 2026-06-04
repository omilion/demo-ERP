# 34 - RRHH: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Extra nuevo, fuera de paridad legacy salvo solicitud del cliente**.

## Fuentes revisadas

- Baseline: no aparece como modulo fuerte legacy revisado.
- Captura actual: [30-rrhh-trabajadores.png](../current-screenshots/30-rrhh-trabajadores.png)
- Frontend actual: `frontend/src/pages/rrhh/RrhhPage.jsx`, `frontend/src/api/rrhh.js`
- Backend actual: `backend/src/routes/rrhh/index.js`, `backend/prisma/schema.prisma`

## Resumen ejecutivo

RRHH no es deuda de migracion legacy en el baseline. El ERP actual agrega trabajadores, contratos, liquidaciones, anticipos, licencias, vacaciones, EPP, hojas de vida, horas extra, reglamentos, asistencias, jornadas, libros y registros por empresa.

Debe tratarse como modulo nuevo del ERP, no como comparacion pantalla a pantalla.

## Mejoras nuevas que no se deben perder

- Trabajadores y contratos.
- Liquidaciones, anticipos y registros.
- Licencias, vacaciones y EPP.
- Asistencias y jornadas.
- Libros de remuneracion.
- Permisos por rol RRHH.

## Brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Alcance legal | RRHH puede requerir cumplimiento normativo. | Validar con administracion antes de prometer cobertura legal. |
| Documentos historicos | Puede requerir importacion de archivos. | Definir alcance de migracion documental. |
| Auditoria por subrecurso | Cambios RRHH son sensibles. | Revisar trazabilidad antes de produccion. |

## Detalles legacy que ya no tienen sentido conservar

- No aplica: no hay modulo legacy fuerte revisado.

## Decision del modulo

Modulo **extra nuevo**. Documentarlo como valor agregado y no como deuda legacy.

