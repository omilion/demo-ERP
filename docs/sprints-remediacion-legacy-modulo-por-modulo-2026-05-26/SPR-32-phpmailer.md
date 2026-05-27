# SPR-32-phpmailer - phpmailer

Prioridad: **P3 - soporte tecnico**
Dominio: **Soporte / correo / job stock critico**
Subagentes revisores: **Sagan + Peirce**
Estado: **Aprobado localmente**
Deploy: **No deployado**

## Objetivo

Revisar `phpmailer` contra legacy sin tratarlo como pantalla de usuario. En el ERP anterior era una dependencia tecnica usada para enviar el correo automatico de stock critico.

## Evidencia legacy revisada

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\phpmailer\class.phpmailer.php`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\phpmailer\class.smtp.php`
- Uso real encontrado: `C:\Users\flipe\Downloads\sisgestion\sisgestion\cron_job\acuse_stock_critico.php`

## Como se mostraba / funcionaba en legacy

| Punto legacy | Detalle |
|---|---|
| Pantalla de usuario | No tenia pantalla propia. |
| Tipo de componente | Libreria vendorizada PHPMailer 1.73 + SMTP 1.02. |
| Uso encontrado | Solo se encontro uso en el cron `acuse_stock_critico.php`. |
| Funcion operativa | Enviar correo HTML cuando habia productos o materiales con stock bajo o igual al critico. |
| Remitente legacy | `info@plastimar.cl`, nombre `Plastimar.cl`. |
| Destinatarios legacy | Correos hardcodeados en el PHP. |
| Seguridad legacy | Sin variables de entorno, sin control de credenciales por ambiente, sin auditoria persistente. |

## Como se muestra hoy en la plataforma

No existe pantalla nueva porque legacy tampoco la tenia. La equivalencia funcional esta en el backend:

- `backend/src/jobs/stockCritico.mjs`
- Script ejecutable: `npm run job:stock-critico`
- Pruebas: `backend/test/stock-critico-job.test.js`

La comparacion funcional principal quedo cerrada en SPR-16 `cron_job`. Este sprint valida y endurece especificamente el reemplazo de la dependencia `phpmailer`.

## Estado punto por punto

| Funcion / riesgo | Estado | Decision |
|---|---|---|
| Migrar PHPMailer PHP antiguo | **No entra al scope** | No se migra una libreria PHP legacy a Node. Se reemplaza por implementacion backend mantenida en el proyecto. |
| Pantalla equivalente | **No aplica** | `phpmailer` no era modulo visible. |
| Envio correo stock critico | **Resuelto** | Se hace desde `stockCritico.mjs`, con SMTP configurable. |
| Destinatarios hardcodeados | **Mejorado** | Ahora se configuran por `STOCK_CRITICO_EMAIL_TO`. No se exponen correos en codigo. |
| Remitente/asunto/cuerpo HTML | **Resuelto** | Mantiene remitente por defecto Plastimar, asunto de acuse y HTML compatible con columnas legacy. |
| AUTH SMTP en texto plano | **Corregido en SPR-32** | Se agrego STARTTLS y bloqueo de autenticacion insegura por defecto. |
| Programacion diaria | **Pendiente de despliegue** | El codigo esta listo; debe configurarse cron externo en el servidor real. |

## Implementacion realizada en SPR-32

- Se reviso que `phpmailer` solo aporta clases de correo y no UI.
- Se confirmo que su uso real era el cron de stock critico.
- Se mantuvo el reemplazo moderno `stockCritico.mjs`.
- Se endurecio SMTP:
  - `STARTTLS` soportado antes de `AUTH LOGIN`.
  - Repite `EHLO` despues de subir la conexion a TLS.
  - Activa STARTTLS por defecto si hay credenciales SMTP o puerto `587`.
  - Bloquea `AUTH LOGIN` sin TLS, salvo opt-in explicito con `STOCK_CRITICO_SMTP_ALLOW_INSECURE_AUTH=true`.
- Se agregaron pruebas para evitar regresion de seguridad.

## Variables de entorno relevantes

| Variable | Uso |
|---|---|
| `STOCK_CRITICO_EMAIL_TO` | Destinatarios separados por coma o punto y coma. |
| `STOCK_CRITICO_EMAIL_ENABLED` | Habilita/deshabilita envio real. |
| `STOCK_CRITICO_EMAIL_FROM` | Remitente. |
| `STOCK_CRITICO_EMAIL_FROM_NAME` | Nombre del remitente. |
| `STOCK_CRITICO_SMTP_HOST` | Servidor SMTP. |
| `STOCK_CRITICO_SMTP_PORT` | Puerto SMTP. |
| `STOCK_CRITICO_SMTP_SECURE` | TLS directo, normalmente puerto `465`. |
| `STOCK_CRITICO_SMTP_STARTTLS` | Fuerza o desactiva STARTTLS. Por defecto se activa con credenciales o puerto `587`. |
| `STOCK_CRITICO_SMTP_USER` / `STOCK_CRITICO_SMTP_PASS` | Credenciales SMTP. |
| `STOCK_CRITICO_SMTP_ALLOW_INSECURE_AUTH` | Opt-in excepcional para AUTH sin TLS. No recomendado. |

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm.cmd exec vitest run stock-critico-job.test.js --reporter=dot` | OK, 8/8 tests. |
| `npm.cmd exec vitest run --reporter=verbose --maxWorkers=1` | OK, 44/44 archivos, 392/392 tests. |
| `npm.cmd run test:full -- --reporter=dot` | OK en repeticion, 44/44 archivos, 392/392 tests. Primer intento tuvo caida de worker Vitest sin test fallido. |

## Riesgos residuales

- Falta configurar SMTP, destinatarios reales y cron externo en produccion.
- No se implementa historial visual de envios porque legacy no lo tenia; queda como mejora futura si el cliente lo solicita.
- No se importa PHPMailer 1.73 porque es una libreria antigua de PHP y no corresponde al stack nuevo.

## Checklist de validacion final

- [x] Revisar archivos legacy `phpmailer`.
- [x] Confirmar uso real dentro del ERP legacy.
- [x] Revisar reemplazo nuevo equivalente.
- [x] Corregir brecha de seguridad SMTP.
- [x] Agregar pruebas unitarias/seguridad.
- [x] Registrar evidencia, comandos y resultado.
- [x] Recibir aprobacion final de subagentes despues del fix.
- [x] Validacion final del lead local.

## Resultado de ejecucion

- Implementacion realizada: **Si**.
- Archivos modificados:
  - `backend/src/jobs/stockCritico.mjs`
  - `backend/test/stock-critico-job.test.js`
  - `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-32-phpmailer.md`
  - `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/phpmailer.md`
- Pruebas ejecutadas: **OK, enfocadas del job y backend completo**.
- Riesgos residuales: **Solo configuracion de despliegue SMTP/cron externo**.
- Validacion del lead: **Aprobado localmente**.
- Decision final: **SPR-32 aprobado localmente. Continuar con SPR-33.**
