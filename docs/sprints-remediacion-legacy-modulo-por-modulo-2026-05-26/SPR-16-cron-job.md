# SPR-16-cron-job - cron_job

Prioridad: **P2 - completar equivalencia**
Dominio: **Administracion / Finanzas / Seguridad**
Subagentes revisores: **Administracion-Finanzas-Seguridad + revision tecnica**
Estado: **Aprobado con observacion de despliegue**

## Objetivo

Revisar y reparar el modulo legacy `cron_job` comparando su funcion real contra la plataforma nueva. En legacy no era una pantalla: era un cron automatico que enviaba un correo HTML con productos e insumos bajo stock critico.

## Evidencia legacy revisada

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cron_job\acuse_stock_critico.php`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\cron_job\CONFIGURACION CRON EN CPANEL.txt`

## Comportamiento legacy exacto

| Punto legacy | Detalle |
|---|---|
| Programacion | CPanel ejecutaba `php /home/plastima/public_html/sisgestion/cron_job/acuse_stock_critico.pHP` todos los dias a las `08:00`. |
| Fecha | Timezone `America/Santiago`, formato `d-m-Y H:i:s`. |
| Productos bodega | `catalogo2 where stock <= stock_critico and estado_inventario='Inventariado' order by nombre`. |
| Bodega taller | `bodega_taller where stock <= stock_critico order by nombre`. |
| Envio | Solo enviaba email si el total de registros criticos era mayor que cero. |
| Remitente | `info@plastimar.cl`, nombre `Plastimar.cl`. |
| Asunto | `Acuse stock critico {fecha}`. |
| Cuerpo productos | Seccion `ACUSE STOCK CRITICO BODEGA PRODUCTOS` con columnas `Cod Interno`, `Cod Barra`, `Nombre`, `stock`. |
| Cuerpo taller | Seccion `ACUSE STOCK CRITICO BODEGA TALLER` con columnas `Cod Interno`, `Cod Barra`, `Nombre`, `stock`, `Medida`. |
| Permisos/auditoria | No tenia sesion, permisos finos ni auditoria persistente; era una tarea de servidor. |

## Estado en la plataforma nueva

| Funcion | Estado | Como queda |
|---|---|---|
| Job ejecutable | **Corregido** | `backend/src/jobs/stockCritico.mjs` sigue disponible por `npm run job:stock-critico`. |
| Productos inventariados | **Corregido** | Ahora filtra productos activos con `estadoInventario = Inventariado` y `stock <= stockCritico`, ordenados por nombre. |
| Bodega taller | **Corregido** | Ahora incluye materiales activos con `stock <= stockCritico`, ordenados por nombre. |
| Columnas legacy | **Corregido** | El HTML incluye codigo interno, codigo barra, nombre, stock y unidad de medida para taller. |
| Fecha Chile | **Corregido** | El asunto y cuerpo usan `America/Santiago` con formato compatible con legacy. |
| Email HTML | **Corregido** | Se agrego envio SMTP configurable por ambiente, sin destinatarios hardcodeados. |
| No enviar si no hay criticos | **Corregido** | Si no hay registros, el job termina OK y no envia email. |
| Seguridad de datos | **Mejorado** | El detalle ya no se escribe a stdout por defecto; solo se activa con `STOCK_CRITICO_LOG_DETALLE=true`. |
| Programacion 08:00 | **Pendiente de despliegue** | El codigo esta listo, pero la programacion diaria debe configurarse en el servidor/hosting con cron externo. |

## Implementacion realizada

- Se reescribio `backend/src/jobs/stockCritico.mjs` para separar recoleccion, HTML, notificacion y CLI.
- Se agrego envio SMTP sin nueva dependencia externa.
- Se agregaron variables de entorno:
  - `STOCK_CRITICO_EMAIL_TO`
  - `STOCK_CRITICO_EMAIL_ENABLED`
  - `STOCK_CRITICO_EMAIL_FROM`
  - `STOCK_CRITICO_EMAIL_FROM_NAME`
  - `STOCK_CRITICO_SMTP_HOST`
  - `STOCK_CRITICO_SMTP_PORT`
  - `STOCK_CRITICO_SMTP_SECURE`
  - `STOCK_CRITICO_SMTP_USER`
  - `STOCK_CRITICO_SMTP_PASS`
  - `STOCK_CRITICO_LOG_DETALLE`
- Se agrego `backend/test/stock-critico-job.test.js`.
- Se incluyo el test del job en `backend/package.json` dentro de `test:ci`.

## Diferencias aceptadas frente a legacy

| Diferencia | Decision |
|---|---|
| Destinatarios hardcodeados del PHP | No se replica. En la nueva plataforma deben ir por variables de entorno para no exponer correos personales ni obligar cambios de codigo. |
| Filtro `activo=true` | Se mantiene como mejora del modelo nuevo para no alertar productos/materiales desactivados. Legacy no tenia ese control. |
| Cron CPanel directo | Se reemplaza por `npm run job:stock-critico`; el servidor debe programar ese comando a las 08:00. |
| Auditoria persistente de envios | No existia en legacy. Queda como mejora futura si el cliente quiere historial de envios, reintentos o ultima ejecucion visible en UI. |

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm.cmd test -- stock-critico-job.test.js --reporter=dot` | OK, 5/5 tests. |
| `DATABASE_URL=... STOCK_CRITICO_EMAIL_ENABLED=false npm.cmd run job:stock-critico` | OK, ejecuta contra DB test y no envia correo si no hay criticos. |
| `DATABASE_URL=... npm.cmd run test:ci -- --reporter=dot` | OK, 13 archivos, 100 tests. |

## Riesgos residuales

- La ejecucion diaria a las 08:00 no queda dentro del codigo fuente; debe configurarse en el ambiente real de despliegue.
- Falta configurar SMTP y destinatarios reales antes de darlo por operativo en produccion.
- No se implemento pantalla de historial de envios porque legacy tampoco la tenia. Es mejora futura, no bloqueo de paridad.

## Checklist de validacion final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar configuracion legacy de cron.
- [x] Revisar implementacion nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar pruebas unitarias del job.
- [x] Probar comando real del job sin envio de correo.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead.

## Resultado de ejecucion

- Implementacion realizada: **Si**.
- Archivos modificados:
  - `backend/src/jobs/stockCritico.mjs`
  - `backend/test/stock-critico-job.test.js`
  - `backend/package.json`
  - `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-16-cron-job.md`
  - `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/cron-job.md`
- Pruebas ejecutadas: **OK**.
- Riesgos residuales: **Solo configuracion de despliegue SMTP/cron externo**.
- Validacion del lead: **Aprobado con observacion de despliegue**.
- Decision final: **SPR-16 aprobado. Continuar con SPR-17 cuando corresponda.**
