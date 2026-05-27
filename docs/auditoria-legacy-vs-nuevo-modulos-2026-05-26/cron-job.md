# Auditoria legacy vs nuevo - cron_job

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cron_job`

Estado final SPR-16: **Aprobado con observacion de despliegue**

## Funcion real del modulo legacy

`cron_job` no era una pantalla de usuario. Era una tarea programada del servidor para enviar un correo cuando hubiera productos o materiales bajo stock critico.

## Evidencia legacy revisada

- `cron_job\acuse_stock_critico.php`
- `cron_job\CONFIGURACION CRON EN CPANEL.txt`

## Comparacion punto por punto

| Punto legacy | Legacy | Nuevo despues de SPR-16 | Estado |
|---|---|---|---|
| Programacion | CPanel: minuto `0`, hora `08`, todos los dias. | El repo expone `npm run job:stock-critico`; debe programarse en cron externo del servidor. | Pendiente despliegue |
| Productos incluidos | `stock <= stock_critico` y `estado_inventario='Inventariado'`. | `Producto.activo=true`, `estadoInventario=Inventariado`, `stock <= stockCritico`. | Corregido |
| Taller incluido | `bodega_taller` con `stock <= stock_critico`. | `BodegaTaller.activo=true`, `stock <= stockCritico`. | Corregido |
| Orden | `order by nombre`. | Orden por `nombre`. | Corregido |
| Columnas productos | Cod Interno, Cod Barra, Nombre, stock. | Mismas columnas en HTML. | Corregido |
| Columnas taller | Cod Interno, Cod Barra, Nombre, stock, Medida. | Mismas columnas en HTML. | Corregido |
| Fecha | `America/Santiago`, `d-m-Y H:i:s`. | `America/Santiago`, formato compatible en asunto y cuerpo. | Corregido |
| Envio | PHPMailer a host local, solo si total > 0. | SMTP configurable, solo si total > 0 y hay destinatarios. | Corregido |
| Destinatarios | Hardcodeados en PHP. | Variables de entorno, no hardcodeado. | Mejorado |
| Logs | Sin auditoria persistente. | Log resumido; detalle solo con `STOCK_CRITICO_LOG_DETALLE=true`. | Mejorado |

## Estado actual en la plataforma

- `backend/src/jobs/stockCritico.mjs` contiene la implementacion operativa.
- `backend/package.json` mantiene el script `job:stock-critico`.
- `backend/test/stock-critico-job.test.js` cubre filtros, HTML, no-envio sin criticos y envio con destinatarios configurados.
- Los reportes gerenciales siguen mostrando stock critico en UI/API; el sprint cerro especificamente la equivalencia del cron legacy.

## Variables requeridas para produccion

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexion a la base de datos productiva. |
| `STOCK_CRITICO_EMAIL_TO` | Destinatarios separados por coma o punto y coma. |
| `STOCK_CRITICO_EMAIL_ENABLED` | `true` para enviar correos. |
| `STOCK_CRITICO_SMTP_HOST` | Host SMTP; por defecto `localhost`. |
| `STOCK_CRITICO_SMTP_PORT` | Puerto SMTP; por defecto `25`. |
| `STOCK_CRITICO_SMTP_SECURE` | `true` si el SMTP usa TLS directo. |
| `STOCK_CRITICO_SMTP_USER` / `STOCK_CRITICO_SMTP_PASS` | Credenciales si el SMTP las requiere. |

## Comando sugerido de despliegue

Programar en el servidor a las 08:00 hora Chile:

```bash
0 8 * * * cd /ruta/backend && npm run job:stock-critico >> /var/log/plastimar-stock-critico.log 2>&1
```

La ruta, usuario del proceso, `DATABASE_URL`, SMTP y zona horaria deben configurarse en el ambiente real.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm.cmd test -- stock-critico-job.test.js --reporter=dot` | OK, 5/5 tests. |
| `DATABASE_URL=... STOCK_CRITICO_EMAIL_ENABLED=false npm.cmd run job:stock-critico` | OK, comando real ejecutado sin envio. |
| `DATABASE_URL=... npm.cmd run test:ci -- --reporter=dot` | OK, 13 archivos, 100 tests. |

## Decision

SPR-16 queda **aprobado**. La unica observacion es operativa: antes de produccion se debe configurar el cron externo y SMTP real. No se requiere cambio adicional de codigo para paridad con el legacy revisado.
