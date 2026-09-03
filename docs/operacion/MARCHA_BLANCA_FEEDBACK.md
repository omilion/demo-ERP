# Feedback de marcha blanca

El ERP incluye un capturador de observaciones para acelerar la estabilización
durante marcha blanca. No sustituye la auditoría de transacciones ni debe usarse
para registrar datos productivos manualmente.

## Activación segura

La función queda apagada en producción hasta configurar explícitamente:

```env
PILOT_FEEDBACK_ENABLED=true
PILOT_FEEDBACK_RETENTION_DAYS=90
FEEDBACK_STORAGE_DIR=/ruta/privada/plastimar-feedback
```

`FEEDBACK_STORAGE_DIR` debe estar fuera de `UPLOADS_DIR`: las capturas no se
sirven mediante `/uploads` ni tienen URL pública. En desarrollo y certificación
la función queda disponible por defecto; para un entorno que declare
`NODE_ENV=production`, incluso local, se debe activar la bandera.

## Uso operativo

- Cualquier usuario autenticado puede pulsar **Reportar observación** o usar
  `Alt + Shift + F`.
- El reporte guarda ruta, rol, módulo, entidad identificable, categoría,
  impacto, navegador y una captura de la superficie operativa.
- Las entradas de formulario y los elementos marcados con
  `data-feedback-redact` se enmascaran antes de capturar.
- El usuario debe describir qué ocurrió y, si corresponde, qué esperaba que
  ocurriera. No debe escribir claves, tokens ni información sensible.
- Sólo el rol `admin` puede entrar a `/admin/feedback`, ver capturas, priorizar
  y cambiar estados. Las evidencias se entregan por una ruta autenticada con
  `Cache-Control: private, no-store`.

## Triage

Estados: `nuevo → clasificado → en_progreso → validacion_usuario → resuelto`.
Los casos no aplicables se cierran como `descartado`. Antes de resolver, dejar
un commit, prueba, ticket o decisión gerencial en **Referencia de solución**.

El sistema limita a 12 reportes por usuario por hora. Las capturas expiran
operativamente según la política de retención y no se deben exportar fuera del
equipo autorizado.
