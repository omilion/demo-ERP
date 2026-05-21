# Sprint 6 - Operacion productiva repetible

Fecha: 2026-05-21
Proyecto: Plastimar ERP
Frente: runbook/release
Alcance: deploy, backup, smoke funcional, monitoreo basico, rollback y aprobacion productiva.

## Objetivo

Convertir el despliegue productivo en una rutina repetible, con evidencia verificable por release y criterios claros para aprobar, bloquear o revertir.

Este runbook parte de la linea base documentada en `docs/deploy-produccion-2026-05-18.md`:

- Produccion publica: `https://vps.plastimar.cl/`
- VPS: `38.7.216.244`
- API PM2: `plastimar-api`
- Backend productivo: `/var/www/plastimar-erp/backend`
- Frontend productivo: `/var/www/plastimar-erp/`
- Backup DB: `/var/backups/plastimar/db`
- Evidencia smoke: `/var/backups/plastimar/smoke`
- Smoke funcional: `backend/scripts/staging-smoke.mjs`
- Workflow actual: `.github/workflows/deploy.yml`

## Criterio de entrada

No iniciar release si falta alguno de estos puntos:

- [ ] PR o commit a desplegar identificado.
- [ ] CI verde en la rama candidata:
  - [ ] `frontend`: `npm run build`.
  - [ ] `backend`: `npx prisma validate`.
  - [ ] `backend`: `npx prisma generate`.
  - [ ] `backend`: `npm test`.
- [ ] Cambios de schema Prisma revisados.
- [ ] Cambios de datos productivos separados del deploy de codigo, salvo aprobacion explicita.
- [ ] Ventana de baja actividad acordada si hay migraciones o reinicio de API.
- [ ] Responsable de aprobacion disponible.
- [ ] Responsable tecnico con acceso a GitHub Actions y VPS disponible.
- [ ] Criterio de rollback acordado antes de desplegar.

Evidencia esperada:

- Link al PR o commit.
- Link al workflow CI exitoso.
- Resumen de cambios y riesgos residuales.
- Confirmacion escrita de ventana o autorizacion de despliegue.

## Checklist pre-deploy

Ejecutar desde el repo antes de mergear o despachar a `main`:

```bash
cd frontend
npm ci
npm run build

cd ../backend
npm ci
npx prisma validate
npx prisma generate
npm test
```

Si el release toca integridad, permisos, stock, caja, despachos o datos legacy, agregar pruebas focalizadas:

```bash
cd backend
npm run data:audit
npm run smoke:staging -- --base-url=http://127.0.0.1:3001
```

Checklist:

- [ ] Build frontend OK.
- [ ] Prisma validate OK.
- [ ] Prisma generate OK.
- [ ] Tests backend OK.
- [ ] Auditoria focal o test focal ejecutado si aplica.
- [ ] No se mezclan cambios de limpieza legacy con deploy rutinario sin plan propio.
- [ ] Conteos legacy esperados definidos si el smoke valida integridad.

Evidencia esperada:

- Salida de comandos o link a CI.
- Si hubo auditoria: archivo JSON/CSV o extracto con checks OK.
- Lista de conteos esperados para integridad si corresponden.

## Deploy automatico

El deploy productivo se activa por push a `main` y ejecuta `.github/workflows/deploy.yml`.

El workflow debe cumplir estas etapas:

- [ ] Checkout.
- [ ] Node.js 22.
- [ ] `backend`: `npm ci`.
- [ ] `backend`: `npx prisma validate`.
- [ ] `backend`: `npx prisma generate`.
- [ ] `frontend`: `npm ci`.
- [ ] `frontend`: `npm run build`.
- [ ] SSH al VPS.
- [ ] Backup productivo con `pg_dump -Fc`.
- [ ] Restore-check del backup con `pg_restore --list`.
- [ ] Rsync backend sin `.env`, `node_modules` ni `ecosystem.config.cjs`.
- [ ] `backend`: `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`.
- [ ] `npm prune --omit=dev`.
- [ ] `pm2 reload ecosystem.config.cjs --update-env`.
- [ ] Health local API con reintentos.
- [ ] Smoke funcional API con `node scripts/staging-smoke.mjs --json`.
- [ ] Smoke guardado en `/var/backups/plastimar/smoke`.
- [ ] Rsync frontend `dist/` a `/var/www/plastimar-erp/`.

Gate Sprint 6: el workflow ya falla si el script de smoke funcional falla. El smoke valida que el resumen de integridad exponga todas las llaves actuales como enteros no negativos. Para que tambien falle ante drift exacto de integridad legacy, produccion debe definir en `.env` las variables `SMOKE_EXPECT_ORDEN_ITEMS_HUERFANOS`, `SMOKE_EXPECT_ODT_ITEMS_HUERFANOS` y `SMOKE_EXPECT_PRODUCTOS_STOCK_NEGATIVO`, o el workflow debe pasar los flags `--expect-*` explicitamente.

Evidencia esperada:

- Link al run exitoso de GitHub Actions.
- Linea `Backup verified: /var/backups/plastimar/db/plastimar_erp_YYYYMMDD_HHMMSS.dump`.
- Linea `Smoke verified: /var/backups/plastimar/smoke/staging_smoke_YYYYMMDD_HHMMSS.json`.
- Estado final del job en verde.

## Backup y restore-check

Antes de migrar o reiniciar API, el workflow debe generar backup productivo:

```bash
cd /var/www/plastimar-erp/backend
set -a
. ./.env
set +a
mkdir -p /var/backups/plastimar/db
backup="/var/backups/plastimar/db/plastimar_erp_$(date +%Y%m%d_%H%M%S).dump"
pg_dump -Fc "$DATABASE_URL" -f "$backup"
test -s "$backup"
pg_restore --list "$backup" >/dev/null
echo "Backup verified: $backup"
```

Checklist:

- [ ] Archivo `.dump` existe.
- [ ] Archivo no esta vacio.
- [ ] `pg_restore --list` termina OK.
- [ ] Ruta del backup queda registrada en el workflow.
- [ ] Backup se conserva fuera del directorio de deploy.

Evidencia esperada:

- Ruta absoluta del dump.
- Salida `Backup verified`.
- SHA256 opcional para releases de alto riesgo:

```bash
sha256sum /var/backups/plastimar/db/plastimar_erp_YYYYMMDD_HHMMSS.dump
```

## Smoke funcional productivo

El smoke minimo no debe limitarse a `/api/health`. Debe ejecutar el script funcional:

```bash
cd /var/www/plastimar-erp/backend
set -a
. ./.env
set +a
node scripts/staging-smoke.mjs \
  --base-url="http://127.0.0.1:${PORT:-3001}" \
  --json > /var/backups/plastimar/smoke/staging_smoke_$(date +%Y%m%d_%H%M%S).json
```

Para la linea base productiva observada el 2026-05-21 despues del Sprint 5, los conteos legacy principales son:

```bash
node scripts/staging-smoke.mjs \
  --base-url="http://127.0.0.1:${PORT:-3001}" \
  --expect-orden-items-huerfanos=0 \
  --expect-odt-items-huerfanos=0 \
  --expect-productos-stock-negativo=167
```

Equivalente por `.env` productivo:

```env
SMOKE_EXPECT_ORDEN_ITEMS_HUERFANOS=0
SMOKE_EXPECT_ODT_ITEMS_HUERFANOS=0
SMOKE_EXPECT_PRODUCTOS_STOCK_NEGATIVO=167
```

Si Sprint 5 o una limpieza productiva cambia esos conteos, el release debe registrar los nuevos valores aprobados. Si no se configuran expectativas exactas, el smoke sigue validando que todas las llaves de integridad existan y sean numericas.

Checklist smoke:

- [ ] Health API local OK.
- [ ] Login admin OK.
- [ ] Usuario `solo_lectura` puede leer.
- [ ] Usuario `solo_lectura` recibe 403 al escribir.
- [ ] Dashboard OK.
- [ ] Productos lista y detalle OK.
- [ ] Clientes lista y detalle OK.
- [ ] Ventas lista y detalle OK.
- [ ] ODT lista, detalle y bitacora OK.
- [ ] Cobranza OK.
- [ ] Despachos y guias OK.
- [ ] Matriz ventas y totales OK.
- [ ] Reporte stock critico OK.
- [ ] RRHH resumen y trabajadores OK.
- [ ] Admin auditoria OK.
- [ ] Integridad coincide con conteos esperados.

Evidencia esperada:

- JSON en `/var/backups/plastimar/smoke`.
- Resumen `API smoke OK: 29/29` cuando se ejecuta sin `--json`.
- En workflow: `Smoke verified: ...`.

## Smoke HTTPS publico

Despues del deploy y smoke local, validar el host publico:

```bash
curl -fsS https://vps.plastimar.cl/ >/dev/null
curl -fsS https://vps.plastimar.cl/api/health
```

Checklist:

- [ ] Home o frontend responde 200.
- [ ] `/api/health` responde `{"status":"ok"}`.
- [ ] Navegador carga login sin errores visibles.
- [ ] Una ruta critica autenticada carga datos reales.

Evidencia esperada:

- Salida de `curl`.
- Captura o nota de revision UI si el release toca frontend.

## Monitoreo basico post-deploy

Durante los primeros 15 minutos despues del deploy:

```bash
pm2 status
pm2 logs plastimar-api --nostream --lines 120
curl -fsS "http://127.0.0.1:${PORT:-3001}/api/health"
```

Checklist:

- [ ] `plastimar-api` esta `online`.
- [ ] No hay restart loop.
- [ ] Logs sin errores repetidos 5xx, Prisma, conexion DB o JWT.
- [ ] Health local OK.
- [ ] Health HTTPS OK.
- [ ] Nginx no devuelve 502/504.

Evidencia esperada:

- Extracto de `pm2 status`.
- Extracto de logs sin errores bloqueantes.
- Salida health local y HTTPS.

Alertas manuales minimas:

- API caida o health falla 2 veces seguidas: bloquear aprobacion y evaluar rollback.
- `pm2` con reinicios repetidos: bloquear aprobacion.
- Errores Prisma por migracion/schema: bloquear aprobacion.
- Smoke funcional fallido: bloquear aprobacion.
- Frontend inaccesible o 502/504: bloquear aprobacion.

## Rollback

Rollback de codigo:

1. Identificar ultimo commit productivo bueno.
2. Revertir el commit o merge defectuoso en `main`, o despachar hotfix correctivo.
3. Dejar que GitHub Actions ejecute deploy completo.
4. Confirmar backup nuevo, migraciones, PM2, smoke funcional y HTTPS.

Rollback de base de datos:

Solo ejecutar si el incidente requiere revertir datos o schema y el responsable lo aprueba. Usar el backup verificado inmediatamente anterior al deploy.

Checklist antes de restore:

- [ ] Incidente no se resuelve con rollback de codigo.
- [ ] Backup correcto identificado por timestamp.
- [ ] Se entiende la perdida de datos posterior al backup.
- [ ] Ventana de indisponibilidad aprobada.
- [ ] Hay responsable tecnico y aprobador presentes.

Comandos de referencia, ajustar nombre de DB/usuario segun `.env` productivo:

```bash
cd /var/www/plastimar-erp/backend
set -a
. ./.env
set +a
pg_restore --list /var/backups/plastimar/db/plastimar_erp_YYYYMMDD_HHMMSS.dump >/dev/null
```

No ejecutar restore destructivo sin plan explicito del incidente. La evidencia minima debe incluir backup usado, razon del restore, hora de inicio, hora de termino y smoke posterior.

## Criterios de aprobacion

Un release queda aprobado solo si:

- [ ] GitHub Actions deploy termina verde.
- [ ] Backup verificado antes de migraciones/restart.
- [ ] `prisma migrate deploy` termina OK.
- [ ] PM2 queda `online`.
- [ ] Smoke funcional termina OK.
- [ ] Smoke JSON queda guardado.
- [ ] HTTPS publico responde.
- [ ] Revision UI ejecutada si hubo cambios frontend.
- [ ] Logs post-deploy sin errores bloqueantes.
- [ ] Riesgos residuales quedan registrados.

Bloquear aprobacion si:

- [ ] No hay backup o falla `pg_restore --list`.
- [ ] Falla `npx prisma migrate deploy`.
- [ ] Falla health local o HTTPS.
- [ ] Falla cualquier check del smoke funcional.
- [ ] Conteos de integridad cambian sin aprobacion.
- [ ] PM2 queda en restart loop.
- [ ] Aparecen errores DB/schema/auth repetidos en logs.
- [ ] El frontend queda inaccesible o con ruta critica rota.

## Registro de release

Cada deploy productivo debe quedar registrado con este formato:

```md
## Release YYYY-MM-DD HH:mm

- Commit/PR:
- GitHub Actions:
- Responsable tecnico:
- Aprobador:
- Backup:
- SHA256 backup, si aplica:
- Smoke JSON:
- Resultado smoke:
- PM2:
- HTTPS:
- Revision UI:
- Riesgos residuales:
- Decision: aprobado / bloqueado / rollback
```

## Revision de coherencia Sprint 6

Checklist de coherencia de este runbook:

- [x] Usa el plan Sprint 6 del 2026-05-21 como criterio principal.
- [x] Usa el deploy real documentado del 2026-05-18 como linea base.
- [x] Referencia el workflow actual `.github/workflows/deploy.yml`.
- [x] Exige backup y restore-check antes de tocar produccion.
- [x] Exige smoke funcional, no solo health.
- [x] Define evidencia esperada por deploy.
- [x] Define monitoreo basico con PM2, logs y health.
- [x] Define criterios de aprobacion, bloqueo y rollback.
- [x] Mantiene cambios documentales dentro de `docs/`.

## Pendientes recomendados

- Agregar retencion formal de backups: cantidad minima, antiguedad maxima y limpieza segura.
- Agregar alerta automatica externa para `https://vps.plastimar.cl/api/health`.
- Agregar smoke visual E2E no destructivo para rutas criticas frontend.
- Guardar artefactos de smoke como artifact de GitHub Actions ademas del VPS.
