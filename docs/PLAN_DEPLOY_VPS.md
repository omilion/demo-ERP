# Plan de Deploy al VPS — Plastimar (estado a 2026-06-26)

> **Para el agente constructor / deployer.** Este deploy lleva a producción todo el código pendiente. Parte del backend YA se subió a mano en sesiones previas (hotfixes); el FRONTEND nuevo NO está desplegado. Seguir los pasos en orden. **No improvisar.**

---

## 0. Contexto y estado actual (leer antes de empezar)

**Repositorio:** local y `origin/main` sincronizados en `10b7ce9`. Hay **1 cambio sin commitear**: `frontend/src/pages/crm/CrmPage.jsx` (kanban a ancho completo) → hay que commitearlo primero (paso 1).

**El deploy automático (GitHub Actions) está TRABADO** desde hace tiempo. Se hace **deploy manual por SSH** replicando el pipeline. NO confiar en que Actions despliegue.

**Acceso VPS:**
- `ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl`
- App con **pm2** (`plastimar-api`, escucha en `:3001`).
- Frontend servido por **nginx** desde `/var/www/plastimar-erp/` (root).
- Backend en `/var/www/plastimar-erp/backend/`.

**Estado en el VPS (verificado):**
| Componente | Estado en VPS |
|---|---|
| Backend: hotfix notificaciones (`nInterno`) | ✅ Ya subido a mano |
| Backend: RAG (docs + tool consultar_documentacion + prompt) | ✅ Ya subido a mano |
| Backend: CRM seguridad (filtro vendedorId) | ✅ Ya subido a mano |
| `.env` con `ANTHROPIC_API_KEY` + `RAG_LLM_*` | ✅ Ya configurado (con backup) |
| Columnas/tablas BD: `crm_registros.vendedor_id`, `rrhh.subcontratos/certificados_antecedentes/vacunas`, `ai.conversaciones/mensajes` | ✅ Ya aplicadas a mano (SQL directo) |
| **Migraciones registradas en `_prisma_migrations`** | ⚠️ **POR CONFIRMAR** — las tablas existen pero las migraciones pueden NO estar registradas (se aplicaron con SQL directo, no con `migrate deploy`) |
| **FRONTEND nuevo** (CRM features, RRHH tabs, kanban ancho, label Reservado, etc.) | ❌ **NO desplegado** — VPS sirve bundle viejo `index-Bkg7VQ4O.js` |

**Conclusión:** el grueso del backend ya está; lo que falta es **(a) registrar las migraciones limpiamente, (b) desplegar el código backend completo desde el repo (para que coincida con lo commiteado), y (c) desplegar el frontend nuevo.**

---

## ⚠️ Reglas obligatorias

1. **Backup de la base ANTES de tocar nada.** Innegociable.
2. **NO subir** `backend/.env` (el VPS tiene el suyo con la key) ni `backend/uploads/` (archivos generados).
3. Las migraciones son **idempotentes** (`IF NOT EXISTS`). Si `migrate deploy` dice que una ya está aplicada o la registra sin recrear, es lo esperado (las tablas ya existen).
4. Si una migración aparece como "failed" o genera conflicto (porque la tabla ya existe), usar `npx prisma migrate resolve --applied <nombre>` para registrarla sin re-ejecutar. **Verificar SIEMPRE con `prisma migrate status` que quede limpio.**
5. Tras el deploy, correr el smoke test (paso 7). Si algo da 500, revisar `pm2 logs plastimar-api` y NO dejar producción rota.

---

## Pasos del deploy

### 1. Commit del cambio pendiente + push
```bash
# En local:
git add frontend/src/pages/crm/CrmPage.jsx
git commit -m "feat(crm): kanban a ancho completo aprovechando el espacio horizontal"
git push origin main
```

### 2. Backup de la base de producción
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend && set -a && . ./.env && set +a
backup="/var/backups/plastimar/db/plastimar_erp_$(date +%Y%m%d_%H%M%S)_predeploy.dump"
pg_dump -Fc "$DATABASE_URL" -f "$backup" && test -s "$backup" && echo "Backup OK: $backup"
pg_restore --list "$backup" >/dev/null && echo "Backup VERIFICADO"'
```

### 3. Sincronizar el backend completo (desde el repo, no a mano)
Desde local, empaquetar el backend trackeado y subirlo (excluye `.env`, `node_modules` por usar `git archive`):
```bash
git archive --format=tar HEAD:backend -o /tmp/be-deploy.tar
scp -i ~/.ssh/plastimar_vps_ed25519 /tmp/be-deploy.tar root@vps.plastimar.cl:/tmp/be-deploy.tar
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend && tar -xf /tmp/be-deploy.tar
echo "backend extraido"'
```
> Esto sobrescribe el código con el del repo (que incluye los hotfixes ya commiteados). El `.env` del VPS NO se toca (git archive no lo incluye).

### 4. Dependencias + Prisma + migraciones
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend && set -a && . ./.env && set +a
npm ci
npx prisma generate
echo "=== estado migraciones ANTES ==="
npx prisma migrate status 2>&1 | tail -15
npx prisma migrate deploy 2>&1 | tail -15
echo "=== estado migraciones DESPUES ==="
npx prisma migrate status 2>&1 | tail -8'
```
> **Si `migrate deploy` falla** porque una tabla ya existe (las creé a mano): registrar esa migración con `npx prisma migrate resolve --applied <nombre_migracion>` y volver a correr `migrate deploy`. Repetir hasta que `migrate status` diga "up to date". Las migraciones a vigilar: `20260618150000_ai_conversaciones`, `20260625141200_add_rrhh_subresources`, `20260625160000_crm_vendedor_id`.

### 5. Build y deploy del frontend
```bash
# En local:
cd frontend && npm run build
cd dist && tar -cf /tmp/fe-deploy.tar . && cd ../..
scp -i ~/.ssh/plastimar_vps_ed25519 /tmp/fe-deploy.tar root@vps.plastimar.cl:/tmp/fe-deploy.tar
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp
rm -rf assets && tar -xf /tmp/fe-deploy.tar
echo "frontend desplegado, bundle: $(ls assets/ | grep -E "index-.*\.js" | head -1)"'
```

### 6. Reinicio del backend
```bash
ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl '
cd /var/www/plastimar-erp/backend
# smoke import: confirma que el codigo arranca antes de reiniciar
node --input-type=module -e "import(\"./src/app.js\").then(async ({ buildApp }) => { const a = buildApp({ logger: false }); await a.ready(); await a.close(); console.log(\"API OK\") }).catch(e => { console.error(\"FAIL:\", e.message); process.exit(1) })"
npm prune --omit=dev
pm2 reload ecosystem.config.cjs --update-env'
```

### 7. Smoke test (verificación obligatoria)
```bash
# Publico:
curl -s https://vps.plastimar.cl/api/health          # -> {"status":"ok"}
curl -s -o /dev/null -w "%{http_code}\n" https://vps.plastimar.cl/api/notificaciones   # -> 401 (NO 500)
curl -s -o /dev/null -w "%{http_code}\n" https://vps.plastimar.cl/api/crm              # -> 401
curl -s -o /dev/null -w "%{http_code}\n" https://vps.plastimar.cl/api/ai/status        # -> 401
# Bundle nuevo servido (debe ser DISTINTO de index-Bkg7VQ4O.js):
curl -s https://vps.plastimar.cl/index.html | grep -oE "index-[A-Za-z0-9_-]+\.js" | head -1
```
**Todos los endpoints deben dar 401 (existen, piden auth), NINGUNO 500.** El bundle debe ser el nuevo.

### 8. Pruebas funcionales en producción (con login real)
- **CRM:** loguear como **vendedor** → ve SOLO sus leads (no los de otros). Loguear como **admin** → ve todos. Probar drag&drop (no se congela), bandeja de pendientes, métricas, convertir lead a cliente. Confirmar que el kanban usa el ancho completo.
- **RRHH:** en una ficha de trabajador, crear/ver un subcontrato, un certificado de antecedentes y una vacuna.
- **Asistente IA:** preguntar "¿cómo hago una nueva venta?" → responde desde la documentación. Confirmar que ya NO dice "no configurado".
- **Notificaciones:** abrir la campana → carga sin error 500.
- **Productos:** un producto en estado "Reserva" se muestra como "Reservado".

---

## Rollback (si algo sale muy mal)
- **Frontend:** el bundle anterior se puede restaurar desde un backup del directorio, o re-desplegando un build previo.
- **Base de datos:** restaurar el dump del paso 2: `pg_restore -d "$DATABASE_URL" --clean <backup>`.
- **Backend:** las migraciones son aditivas (no borran datos); revertir el código es volver al commit anterior y re-desplegar.

---

## Resumen de lo que este deploy pone en producción
- Frontend: CRM (kanban ancho, conversión, métricas, pendientes, drag&drop fix, asignación de vendedor), RRHH (subcontratos/certificados/vacunas), label "Reservado", dashboard con pendientes CRM, IA Balance con KPI documentos.
- Backend: ya estaba mayormente; este deploy lo deja **consistente con el repo** y registra las migraciones limpiamente.
