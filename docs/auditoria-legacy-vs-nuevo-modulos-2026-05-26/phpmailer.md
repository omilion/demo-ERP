# Auditoria legacy vs nuevo - phpmailer

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\phpmailer`

Estado final SPR-32: **Aprobado localmente**
Deploy: **No deployado**

## Funcion real del componente legacy

`phpmailer` no era un modulo visual del ERP. Era una dependencia PHP vendorizada para envio de correos. El unico uso encontrado fuera de su propia carpeta fue:

- `cron_job\acuse_stock_critico.php`

Ese cron enviaba el correo HTML de stock critico.

## Comparacion punto por punto

| Punto | Legacy | Plataforma nueva | Estado |
|---|---|---|---|
| Pantalla | No tenia pantalla. | No se crea pantalla. | No aplica |
| Dependencia | PHPMailer 1.73 + SMTP 1.02 en PHP. | Implementacion Node en `stockCritico.mjs`. | Reemplazado |
| Uso real | Solo cron de stock critico. | `npm run job:stock-critico`. | Resuelto |
| Destinatarios | Hardcodeados en PHP. | Variables de entorno. | Mejorado |
| Remitente | `info@plastimar.cl` / `Plastimar.cl`. | Mismos defaults, configurables por entorno. | Resuelto |
| Cuerpo HTML | Tabla de productos y bodega taller criticos. | HTML equivalente, con escape de contenido. | Resuelto |
| Seguridad SMTP | Sin control moderno por entorno. | TLS directo, STARTTLS y bloqueo de AUTH inseguro. | Mejorado |
| Programacion | Cron CPanel. | Cron externo debe ejecutar `npm run job:stock-critico`. | Pendiente despliegue |

## Decision de scope

- **No se migra PHPMailer**: no corresponde copiar una libreria PHP antigua al stack nuevo.
- **No se crea UI**: no existia pantalla legacy asociada a `phpmailer`.
- **Si se mantiene el flujo funcional**: el envio de stock critico queda cubierto por el job nuevo.
- **Si se corrige seguridad**: el envio SMTP no permite credenciales en claro salvo opt-in explicito.

## Evidencia nueva

- `backend/src/jobs/stockCritico.mjs`
- `backend/test/stock-critico-job.test.js`
- `backend/package.json` mantiene `job:stock-critico`

## Validacion

| Prueba | Resultado |
|---|---|
| `npm.cmd exec vitest run stock-critico-job.test.js --reporter=dot` | OK, 8/8 tests. |
| `npm.cmd exec vitest run --reporter=verbose --maxWorkers=1` | OK, 44/44 archivos, 392/392 tests. |
| `npm.cmd run test:full -- --reporter=dot` | OK en repeticion, 44/44 archivos, 392/392 tests. |

## Pendiente real

Solo operativo de produccion:

- Configurar `DATABASE_URL`.
- Configurar destinatarios reales en `STOCK_CRITICO_EMAIL_TO`.
- Configurar SMTP real.
- Programar cron diario en el servidor.

## Conclusion

SPR-32 queda **aprobado localmente**. La funcionalidad legacy asociada a `phpmailer` ya esta reemplazada por el job moderno de stock critico, con una mejora de seguridad respecto al sistema anterior.
