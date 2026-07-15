# SisGestión 3.0 — ERP Plastimar
### Hazlo Mejor &middot; Software y Soluciones a Medida

Repositorio central del **SisGestión 3.0**, el ERP desarrollado a medida para **Plastimar** (fabricante y comercializadora de material didáctico, psicomotricidad y mobiliario escolar, Chile).

Reemplaza los sistemas legacy PHP `sisgestion` / `sisventa` con una plataforma única que unifica el ciclo operativo completo: desde el ingreso de ventas e ítems de licitación hasta el control diario de producción en taller, consumos de materiales, packing, despacho, cobros a clientes, facturación electrónica y gestión operativa de RRHH.

---

## 1. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · Fastify · Prisma 7 (`@prisma/adapter-pg`) · Zod · JWT (access/refresh) |
| Base de datos | PostgreSQL 16, multi-schema: `auth`, `clientes`, `catalogo`, `ventas`, `caja`, `taller`, `bodega`, `config`, `rrhh`, `ai`, `facturacion` |
| Frontend | React 19 · Vite · TanStack React Query v5 · Zustand · Axios · React Router (SPA) · `@dnd-kit` (kanban de taller) |
| Tests | Vitest de integración contra Postgres real (sin mocks de BD), vía `app.inject` |
| IA | Asistente de documentación/consulta integrado (Claude API, módulo `ai`) |
| Facturación | DTE electrónico ante el SII (firma digital, CAF, TED, PDF417) |
| Infra | VPS Ubuntu 24.04 · nginx (SPA + reverse proxy) · pm2 |

---

## 2. Estructura

```text
├── backend/
│   ├── src/
│   │   ├── app.js              # bootstrap Fastify
│   │   ├── routes/<módulo>/    # un directorio por módulo (auth, productos, ventas, odts, ...)
│   │   ├── facturacion/        # motor DTE: firma, CAF, TED, cliente SII, XML
│   │   ├── middleware/rbac.js  # roles + permisos extra por usuario
│   │   └── jobs/               # tareas en segundo plano (ej: stock crítico)
│   ├── prisma/
│   │   ├── schema.prisma       # modelo multi-schema
│   │   ├── migrations/         # fuente de verdad del schema
│   │   └── seed.js             # seed mínimo (usuarios/roles) para tests y CI
│   ├── test/                   # suites vitest de integración
│   └── scripts/                # auditorías y limpiezas de datos (data:*)
├── frontend/
│   ├── src/
│   │   ├── api/                # hooks React Query por recurso
│   │   ├── components/         # shared UI (Table, Badge, KpiCard, forms, ...)
│   │   ├── pages/<módulo>/     # una carpeta por página/área de negocio
│   │   ├── store/              # estados globales (Zustand)
│   │   └── router.jsx          # rutas + protección por módulo/permiso
│   └── dist/                   # bundle de producción (generado)
├── docs/                       # bitácora: sprints, auditorías, runbooks, fixes de datos
└── TRAZABILIDAD_PLASTIMAR.md   # solicitudes del cliente vs implementación concreta
```

---

## 3. Módulos

- **Catálogo / Bodega** — productos (34k+), categorías, ubicaciones, fotos, import masivo CSV/XLSX, movimientos de stock trazables (merma, pérdida, egresos), stock crítico con job de alertas.
- **Proveedores** — ficha con % de margen por canal (sala / convenio marco / licitación), productos asociados, pagos con aplicación de stock y anulación trazable.
- **Ventas** — órdenes multi-canal (Venta sala, Venta Web, Convenio Marco, Licitación), matriz de ventas con contadores operacionales, descuentos con reglas y aprobación, comisiones por tramos.
- **Licitaciones / Cotizaciones** — cotizaciones, ficha de licitación, precios por licitación.
- **Clientes / CRM** — clientes canónicos por RUT + sucursales/contactos, conversión lead→cliente, visibilidad por vendedor.
- **Taller (producción)** — ODTs, subprocesos con operario responsable, materiales/telas, bitácora, costeo, tiempos teóricos, pasar-a-taller.
- **Caja** — movimientos con alcance por sucursal, cierre/arqueo, trazabilidad.
- **Cobranza** — histórico por cliente/factura, gestión de ejecutivas, multas.
- **Despachos** — guías, tracking de eventos, envíos parciales, incidencias.
- **Facturación electrónica** — emisión de DTE al SII (factura 33/34, boleta 39/41, guía de despacho 52, NC 61, ND 56), CAFs, certificado digital, consulta de estado.
- **RRHH** — trabajadores, subcontratos, certificados, vacunas, pagos.
- **Reportes** — gerenciales, comisiones, licitaciones, exportaciones CSV con columnas legacy.
- **Web pública** — endpoints `publicWeb` para la tienda (catálogo visible, precio web, órdenes online).
- **Asistente IA** — chat con herramientas de consulta y generación de documentos, disponible por rol (datos sensibles solo admin).

---

## 4. Reglas de negocio clave

### Precios

- `precio_lista` = **costo neto**. **No se edita a mano** en inventario: se define asignando proveedores (sección Proveedores y Costos del producto).
- Los **precios de venta se derivan de los % del proveedor**: sala = costo + `%porc_venta_sala` (+ IVA 19%), licitación = costo + `%porc_licitacion` (editable solo como excepción manual), convenio marco usa `precio_marco`.
- El inventario muestra **solo el precio costo**; los precios por canal se gestionan desde Proveedores.
- Un RUT puede tener varios nombres de proveedor: la identidad comercial es el **nombre/código**, no el RUT.
- Ventas sin cliente identificable se registran bajo **CONSUMIDOR FINAL** (rut `66666666-6`).
- El stock solo cambia por **movimientos de bodega** (nunca por edición directa del producto).

> **Estado real de los precios:** el motor costo+% existe (`computeConsultaPrecios` en `backend/src/routes/productos/pricing.js`) pero hoy corre parcialmente en vacío: la tabla `catalogo.producto_proveedores` está vacía y 502 de 778 proveedores tienen `porc_venta_sala` en 0. Esto **no es una pérdida de migración** — el SISGES original tenía el costo digitado a mano y no calculaba venta desde el costo. Ver `docs/CAMBIOS_2026-07-15.md`.

### Permisos (RBAC)

- Roles definidos en `backend/src/middleware/rbac.js` y espejados en `frontend/src/utils/permissions.js`. **Mantener ambos alineados.**
- `admin` tiene bypass total (`'*'`).
- Además del rol, cada usuario puede recibir **permisos extra** por módulo (`permisosExtra`), asignables desde la pantalla de Usuarios. Viajan en el access token.
- La opción `allowExtra: false` en `fastify.rbac(...)` **desactiva los permisos extra** y se reserva para el módulo `admin`. No usarla en módulos de negocio: haría el permiso imposible de delegar.
- Al agregar un módulo nuevo, sumarlo también a la lista `MODULOS` de `frontend/src/pages/usuarios/UsuariosPage.jsx`, o no se podrá asignar a nadie.

---

## 5. Desarrollo local

Requisitos: **Node 22**, **npm 10+**, **Docker Desktop** (para la base de datos local).

### 5.1 Base de datos

```bash
docker compose up -d      # Postgres en el puerto 55432
```

### 5.2 Backend

```bash
cd backend
npm install
```

Crear `backend/.env`:

```env
PORT=3001
DATABASE_URL="postgresql://plastimar:plastimar@localhost:55432/plastimar_dev?schema=public"
JWT_ACCESS_SECRET="clave_para_el_access_token"
JWT_REFRESH_SECRET="clave_para_el_refresh_token"
UPLOADS_DIR="./uploads"
# ANTHROPIC_API_KEY=...   # solo si vas a usar el asistente IA
```

```bash
npm run db:generate       # cliente Prisma desde schema.prisma
npm run db:migrate        # aplica migraciones
npm run db:seed           # usuarios/roles, comunas, regiones, talleres de muestra
npm run dev               # API en http://localhost:3001
```

### 5.3 Frontend

```bash
cd frontend
npm install
echo 'VITE_API_URL="http://localhost:3001"' > .env
npm run dev               # http://localhost:5173
```

> **Al bajar cambios (`git pull`), corré siempre `npm install` y `npm run db:generate`.** Si aparecen dependencias o modelos nuevos y no lo hacés, fallan módulos enteros con `ERR_MODULE_NOT_FOUND` o `Cannot read properties of undefined`.

---

## 6. Tests

Los tests son de integración **contra Postgres real**, con limpieza propia por suite. Usar una base dedicada para no borrar datos de desarrollo:

```bash
cd backend
TEST_DB="postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public"

DATABASE_URL=$TEST_DB npx prisma migrate deploy
DATABASE_URL=$TEST_DB npm run db:seed     # sin seed → 401 masivo en las suites
DATABASE_URL=$TEST_DB npm test            # suite completa
npm run test:ci                           # subset focal
```

> Si tu `.env` apunta al túnel SSH de producción, los tests fallan con `SASL: client password must be a string`. Es entorno, no código.

---

## 7. Despliegue

En **Hazlo Mejor** no se despliega a producción sin verificación previa. Detalle completo en [docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md](docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md).

### 7.1 Antes de commitear

1. Tests en verde (`npm run test:ci` en backend) y frontend compilando (`npm run build`).
2. Commits temáticos. **Nunca** commitear `.env` ni contenido de `uploads/`.

### 7.2 Deploy al VPS — hoy es **manual**

> ⚠️ **GitHub Actions (CI y Deploy) está en rojo desde el 16-jun-2026**: `test:ci` falla con `column "conflictivo" does not exist` porque las migraciones no aplican del todo en la BD limpia de CI. **Hasta resolverlo, el deploy es manual.** Push a `main` NO despliega.

```bash
# 1. Backup preventivo de la base
pg_dump -Fc "$DATABASE_URL" -f "/var/backups/plastimar/db/plastimar_erp_$(date +%Y%m%d_%H%M%S)_predeploy.dump"

# 2. Subir backend (git archive para omitir node_modules y locales), luego en el VPS:
npm ci && npx prisma generate && npx prisma migrate deploy
pm2 reload plastimar-api --update-env

# 3. Frontend: npm run build y desplegar el contenido de dist/ en /var/www/plastimar-erp/
```

### 7.3 Datos de infraestructura

- Acceso: `ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl`
- **La API corre en el puerto 3001** (bloqueado externamente; nginx hace proxy de `/api`).
- nginx sirve la SPA **directamente desde `/var/www/plastimar-erp/`** (sin subcarpeta `dist/`).
- Las fotos se sirven desde `/var/lib/plastimar-uploads` (`/uploads/...`), fuera del despliegue.
- Existe un ambiente candidate (`plastimar-api-candidate`) para previews.

> Toda tabla/schema debe nacer por **migración**. Objetos creados a mano en producción rompen el CI en base fresca (ver incidente `rrhh` en `docs/fix-datos-prod-2026-07-09/`).

---

## 8. Datos y legacy

El sistema convive con la historia del legacy PHP (`sisgestion`/`sisventa`, MySQL):

- La tabla viva del legacy era `catalogo2` (no `catalogo`); los productos se cruzan por `codigo_interno`, los proveedores por `codigo_proveedor` (no por id), las fotos por id legacy.
- Migraciones e importaciones documentadas en `docs/` (la más reciente: `docs/fix-datos-prod-2026-07-09/`).
- Scripts de auditoría/limpieza en `backend/scripts/` (`npm run data:audit`, etc.).
- **Antes de cualquier fix masivo de datos en producción**: `pg_dump` de las tablas afectadas + tabla backup en el schema `staging_fix`.
- Copia del código legacy en `tmp/legacy_extract/sisgestion/` (útil para verificar cómo operaba el sistema viejo). No hay dump SQL de su base.

---

## 9. Documentación

`docs/` es la bitácora del proyecto. Para entender **el porqué** de una regla, buscar ahí primero.

- **Cambios recientes:** [docs/CAMBIOS_2026-07-15.md](docs/CAMBIOS_2026-07-15.md) — qué hacer al hacer pull, hallazgos y pendientes abiertos.
- **Trazabilidad:** [TRAZABILIDAD_PLASTIMAR.md](TRAZABILIDAD_PLASTIMAR.md) — las 29 observaciones de Plastimar vs el código entregado.
- **Despliegue:** [docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md](docs/INSTRUCCION_REVISION_COMMIT_DEPLOY.md) y [docs/PLAN_DEPLOY_VPS.md](docs/PLAN_DEPLOY_VPS.md).
- **Auditorías e integridad:** [docs/auditoria-legacy-v2.md](docs/auditoria-legacy-v2.md), `docs/legacy-reference/comparativas-modulos/`.
- **Entrega Fase 3 (operaciones):** `docs/presentacion-entrega-fase-3-operaciones-2026-06-03.html` y su guía.
