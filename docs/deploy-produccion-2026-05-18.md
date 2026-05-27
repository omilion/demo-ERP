# Deploy produccion - 2026-05-18

## Estado

Deploy cerrado como nueva linea base de trabajo.

- Rama desplegada: `main`
- Merge base: `062c1dd7282c3dedd804650fc4b4250221e10547`
- Hotfix deploy/smoke: `3becf036f74e5689fde5c8fcc3c1c4e681207605`
- PR mergeado: `https://github.com/sreich69/plastimar/pull/1`
- Workflow exitoso: `https://github.com/sreich69/plastimar/actions/runs/26066476196`
- VPS: `38.7.216.244`
- Host publico validado: `https://vps.plastimar.cl/`

## Respaldo previo

Antes de tocar produccion se genero y verifico respaldo de base:

- Archivo: `/var/backups/plastimar/db/plastimar_erp_20260518_232302_pre_merge_deploy.dump`
- SHA256: `064b69a476a053e0bc5aa4aad0029de84a666139c25c360df0a92bf4c0c8d0a3`
- Verificacion: `pg_restore --list` OK

## Reconciliacion Prisma en produccion

Se reconcilio la tabla `_prisma_migrations` de produccion despues del respaldo.

- Se creo respaldo de la tabla de migraciones:
  `_prisma_migrations_backup_prod_sprint6_20260518_232442`
- Se eliminaron 2 filas fantasma de migracion:
  `20260514082851_add_legacy_completeness`
- `prisma migrate deploy`: OK
- Estado final: `Database schema is up to date!`

Validaciones de esquema:

| Check | Resultado |
| --- | --- |
| `stock_aplicado_at` | OK |
| `audit_log` | OK |
| `_prisma_migrations` | OK |
| backup tabla migraciones | OK |

## Deploy

El deploy automatico inicial del merge `062c1dd` fallo en GitHub Actions. Se aplico hotfix `3becf03` para:

- Hacer que `backend/server.js`, que es el entrypoint real de PM2, respete `HOST`.
- Permitir que `backend/scripts/staging-smoke.mjs` use expectativas de integridad por entorno.

Luego el workflow de GitHub Actions finalizo correctamente y actualizo el VPS.

Estado PM2 posterior:

- Proceso: `plastimar-api`
- Estado: `online`
- Entrypoint: `/var/www/plastimar-erp/backend/server.js`

## Smoke produccion

Smoke ejecutado en el VPS contra la API local de produccion:

```bash
node scripts/staging-smoke.mjs \
  --base-url=http://127.0.0.1:${PORT:-3001} \
  --expect-orden-items-huerfanos=8676 \
  --expect-odt-items-huerfanos=262 \
  --expect-productos-stock-negativo=167
```

Resultado:

- `API smoke OK: 24/24`
- Login admin: OK
- RBAC `solo_lectura`: lee OK, escritura bloqueada con 403 OK
- Dashboard, productos, clientes, ventas, ODT, cobranza, despachos, matriz, reportes, RRHH, integridad y auditoria: OK
- Detalles de producto, cliente, venta y ODT/bitacora: OK

Validacion nginx/HTTPS:

- `https://vps.plastimar.cl/`: `200 OK`
- `https://vps.plastimar.cl/api/health`: `{"status":"ok"}`

## Ruta de uploads

La plataforma nueva acepta fotos de producto con rutas `/uploads/fotos_chicas/...` y `/uploads/fotos_grandes/...`.

Requisito de despliegue:

- Backend: definir `UPLOADS_DIR` apuntando al directorio persistente que contiene las fotos migradas.
- Frontend dev: Vite proxya `/uploads` hacia `http://localhost:3001`.
- Produccion: nginx debe enrutar `/uploads/` al backend o servir el mismo `UPLOADS_DIR` como alias estatico.

Ejemplo proxy nginx si los archivos los sirve Fastify:

```nginx
location /uploads/ {
  proxy_pass http://127.0.0.1:3001/uploads/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

Smoke minimo posterior a migracion de fotos:

```bash
curl -I https://vps.plastimar.cl/uploads/fotos_chicas/<archivo-existente>
```

## Pendiente deliberado

No se ejecuto limpieza de datos legacy en produccion durante este deploy.

La produccion queda como baseline corregida de codigo/esquema, pero aun mantiene deuda de datos detectada:

- `orden_items_huerfanos`: `8676`
- `odt_items_huerfanos`: `262`
- `productos_stock_negativo`: `167`
- Auditoria produccion post-reconcile: `52/52` checks OK, `9520` hallazgos criticos legacy

Siguiente paso recomendado: ejecutar un sprint separado de limpieza controlada en produccion, con respaldo nuevo, dry-run, apply y auditoria posterior.
