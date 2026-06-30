# Instrucción: Revisión ordenada → Commit → Deploy al VPS

> **Para el agente constructor / deployer.** Ejecutar en este orden EXACTO: (1) revisión y verificación local, (2) commits temáticos, (3) deploy manual al VPS. No saltar pasos. Si algo falla en revisión, NO continuar al deploy.

---

## CONTEXTO (leer primero)

**Qué hay sin commitear ahora** (working tree):
- `backend/src/routes/ai/tools/index.js`, `backend/src/routes/ai/llm.js`, `backend/test/ai-assistant.test.js`, `frontend/src/components/AiChat.jsx`, `frontend/src/pages/asistente/AsistentePage.jsx` → **feature ficha_producto + ranking por margen** (ya verificada, 12/12 tests verde).
- `frontend/src/pages/crm/CrmPage.jsx` → **kanban del CRM a ancho completo** (cambio visual).
- `docs/PLAN_DEPLOY_VPS.md`, `docs/PLAN_RAG_TRAZABILIDAD_PRODUCTO.md`, `docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md` → documentos de plan.

**Estado del repo:** `main` local = `origin/main` (commit `10b7ce9`). El deploy automático (GitHub Actions) está TRABADO → se hace **deploy manual por SSH**.

**Estado del VPS (verificado):** el backend YA tiene desplegados a mano (de sesiones previas) los hotfixes de notificaciones, RAG documentación, seguridad CRM, y la API key en el `.env`. Las tablas/columnas de BD (RRHH, crm.vendedor_id, ai.conversaciones) YA existen. **El FRONTEND nuevo NO está desplegado** (VPS sirve un bundle viejo). Este deploy deja todo consistente con el repo + agrega la nueva feature.

**Acceso VPS:** `ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl` · app con pm2 (`plastimar-api`, :3001) · frontend en `/var/www/plastimar-erp/` (nginx) · backend en `/var/www/plastimar-erp/backend/`.

---

## FASE 1 — REVISIÓN Y VERIFICACIÓN LOCAL (obligatoria antes de commitear)

Requiere la base de test local levantada (Docker): contenedor `plastimar-postgres-local` en `localhost:55432`, base `plastimar_test`.

```bash
# 1.1 Levantar base de test (si no está)
docker start plastimar-postgres-local   # o: docker compose up -d
sleep 6

# 1.2 Aplicar migraciones a la base de test (puede estar atrasada)
cd backend
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npx prisma generate

# 1.3 Tests del asistente (DEBEN ser 12/12 verde)
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npx vitest run ai-assistant

# 1.4 Tests de regresión de lo demás tocado recientemente (deben pasar)
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" npx vitest run crm rrhh

# 1.5 Backend arranca sin errores
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public" node --input-type=module -e "import('./src/app.js').then(async ({ buildApp }) => { const a = buildApp({ logger: false }); await a.ready(); await a.close(); console.log('API OK') }).catch(e => { console.error('FAIL:', e.message); process.exit(1) })"

# 1.6 Frontend compila
cd ../frontend && npm run build
```

**Criterio para avanzar:** TODO verde. Si algo falla, diagnosticar y arreglar ANTES de commitear. NO continuar con tests rojos.

---

## FASE 2 — COMMITS TEMÁTICOS

Commits separados por tema (no un commit gigante). Desde la raíz del repo:

```bash
# 2.1 Feature ficha_producto + ranking por margen
git add backend/src/routes/ai/tools/index.js backend/src/routes/ai/llm.js backend/test/ai-assistant.test.js frontend/src/components/AiChat.jsx frontend/src/pages/asistente/AsistentePage.jsx
git commit -m "feat(ai): ficha_producto (rentabilidad + tiempos taller) y ranking por margen

Nueva tool ficha_producto: margen (precio venta vs costo promedio de compra) y
tiempos de produccion por taller. ranking_ventas admite ordenar_por=margen.
Prompt: reglas de honestidad (costo sin fecha, baja cobertura de tiempos).
Tests 12/12 verde.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 2.2 Kanban CRM ancho completo
git add frontend/src/pages/crm/CrmPage.jsx
git commit -m "feat(crm): kanban a ancho completo aprovechando el espacio horizontal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 2.3 Documentos de plan
git add docs/PLAN_DEPLOY_VPS.md docs/PLAN_RAG_TRAZABILIDAD_PRODUCTO.md docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md
git commit -m "docs: planes de deploy, trazabilidad por producto e instruccion de revision

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"

# 2.4 Push
git push origin main
```

> NO commitear `backend/.env` ni `backend/uploads/`.

---

## FASE 3 — DEPLOY MANUAL AL VPS

### 3.1 Backup de la base (INNEGOCIABLE)
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend && set -a && . ./.env && set +a
backup="/var/backups/plastimar/db/plastimar_erp_$(date +%Y%m%d_%H%M%S)_predeploy.dump"
pg_dump -Fc "$DATABASE_URL" -f "$backup" && test -s "$backup" && echo "Backup OK: $backup"
pg_restore --list "$backup" >/dev/null && echo "Backup VERIFICADO"'
```

### 3.2 Sincronizar backend (desde el repo, git archive — excluye .env/node_modules)
```bash
git archive --format=tar HEAD:backend -o /tmp/be-deploy.tar
scp -i ~/.ssh/plastimar_vps_ed25519 /tmp/be-deploy.tar root@vps.plastimar.cl:/tmp/be-deploy.tar
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl 'cd /var/www/plastimar-erp/backend && tar -xf /tmp/be-deploy.tar && echo "backend extraido"'
```

### 3.3 Deps + Prisma + migraciones
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend && set -a && . ./.env && set +a
npm ci
npx prisma generate
npx prisma migrate status 2>&1 | tail -10
npx prisma migrate deploy 2>&1 | tail -12
npx prisma migrate status 2>&1 | tail -5'
```
> **Si `migrate deploy` falla porque una tabla/columna ya existe** (creadas a mano antes): registrar esa migración con `npx prisma migrate resolve --applied <nombre>` y repetir `migrate deploy` hasta que `migrate status` diga "up to date". Migraciones a vigilar: `20260618150000_ai_conversaciones`, `20260625141200_add_rrhh_subresources`, `20260625160000_crm_vendedor_id`. **NO forzar nada destructivo.**

### 3.4 Build + deploy frontend
```bash
cd frontend && npm run build && cd dist && tar -cf /tmp/fe-deploy.tar . && cd ../..
scp -i ~/.ssh/plastimar_vps_ed25519 /tmp/fe-deploy.tar root@vps.plastimar.cl:/tmp/fe-deploy.tar
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp && rm -rf assets && tar -xf /tmp/fe-deploy.tar
echo "frontend: $(ls assets/ | grep -E "index-.*\.js" | head -1)"'
```

### 3.5 Reinicio backend (con smoke import previo)
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend
node --input-type=module -e "import(\"./src/app.js\").then(async ({ buildApp }) => { const a = buildApp({ logger: false }); await a.ready(); await a.close(); console.log(\"API OK\") }).catch(e => { console.error(\"FAIL:\", e.message); process.exit(1) })"
npm prune --omit=dev
pm2 reload ecosystem.config.cjs --update-env'
```

### 3.6 Smoke test (verificación obligatoria)
```bash
curl -s https://vps.plastimar.cl/api/health                                              # {"status":"ok"}
for ep in notificaciones crm ai/status; do
  echo -n "$ep -> "; curl -s -o /dev/null -w "%{http_code}\n" https://vps.plastimar.cl/api/$ep   # 401 cada uno (NO 500)
done
curl -s https://vps.plastimar.cl/index.html | grep -oE "index-[A-Za-z0-9_-]+\.js" | head -1    # bundle NUEVO (distinto al anterior)
```
**Todos 401 (no 500). Bundle nuevo.** Si algo da 500 → revisar `pm2 logs plastimar-api` y NO dejar producción rota.

### 3.7 Pruebas funcionales en producción (con login admin)
- **Asistente:** preguntar "¿qué margen deja [un producto real]?" → responde con margen + nota de que el costo es promedio. Preguntar "¿cuál es el producto más rentable?" → ranking por margen. Confirmar que NO inventa "cuándo" fue rentable.
- **CRM:** el kanban usa el ancho completo de la pantalla.
- **Notificaciones:** la campana carga sin 500.

---

## ROLLBACK (si algo sale mal)
- **Frontend:** re-desplegar el `assets/` anterior o un build previo.
- **BD:** `pg_restore -d "$DATABASE_URL" --clean <backup del paso 3.1>`.
- **Backend:** volver al commit anterior y re-desplegar (las migraciones son aditivas, no borran datos).

---

## RESUMEN de lo que este deploy pone en producción
- **Nuevo:** asistente con análisis de rentabilidad por producto (ficha_producto) y ranking por margen; kanban CRM a ancho completo.
- **Consolida:** todo el frontend pendiente (CRM features, RRHH tabs, label Reservado, dashboard con pendientes CRM, IA Balance) que aún no estaba desplegado, y deja las migraciones registradas limpiamente.
