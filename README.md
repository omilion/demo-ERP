# Plastimar ERP

ERP a medida para **Plastimar** (fabricante y comercializadora de material didáctico, psicomotricidad y mobiliario escolar, Chile). Reemplaza los sistemas legacy PHP `sisgestion` / `sisventa` con una plataforma única: catálogo, ventas por canal, taller de producción, bodega, caja, cobranza, CRM, RRHH y reportería.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node 22 · Fastify · Prisma 7 (`@prisma/adapter-pg`) · Zod · JWT (access/refresh) |
| Base de datos | PostgreSQL 16, multi-schema: `auth`, `clientes`, `catalogo`, `ventas`, `caja`, `taller`, `bodega`, `config`, `rrhh`, `ai` |
| Frontend | React + Vite · React Query · React Router (SPA) |
| Tests | Vitest contra Postgres real (sin mocks de BD) |
| IA | Asistente de documentación/consulta integrado (Claude API, módulo `ai`) |
| Infra | VPS Ubuntu 24.04 · nginx (SPA + reverse proxy) · pm2 · deploy por GitHub Actions |

## Estructura

```
backend/
  src/app.js              # bootstrap Fastify
  src/routes/<módulo>/    # un directorio por módulo (auth, productos, ventas, odts, ...)
  src/middleware/rbac.js  # roles + permisos extra por usuario
  prisma/schema.prisma    # modelo multi-schema
  prisma/migrations/      # migraciones (fuente de verdad del schema)
  prisma/seed.js          # seed mínimo (usuarios/roles) para tests y CI
  test/                   # suites vitest de integración
  scripts/                # auditorías y limpiezas de datos (data:*)
frontend/
  src/pages/<módulo>/     # una carpeta por página/módulo
  src/api/                # hooks React Query por recurso
  src/components/         # shared UI (Table, Badge, KpiCard, forms, ...)
  src/router.jsx          # rutas + protección por módulo/permiso
docs/                     # bitácora completa: sprints, auditorías, runbooks, fixes de datos
.github/workflows/        # ci.yml + deploy.yml
```

## Módulos

- **Catálogo / Bodega** — productos (34k+), categorías, ubicaciones, fotos, import masivo CSV/XLSX, movimientos de stock trazables (merma, pérdida, egresos), stock crítico con job de alertas.
- **Proveedores** — ficha con % de margen por canal (sala / convenio marco / licitación), productos asociados, pagos a proveedores con aplicación de stock y anulación trazable. Página de detalle `/proveedores/:id`.
- **Ventas** — órdenes multi-canal (Venta sala, Venta Web, Convenio Marco, Licitación), matriz de ventas, descuentos con reglas y solicitudes de aprobación, comisiones de vendedores por tramos.
- **Licitaciones / Cotizaciones** — cotizaciones, ficha de licitación, precios por licitación.
- **Clientes / CRM** — clientes canónicos por RUT + sucursales/contactos (empresas institucionales con N contactos), conversión lead→cliente, visibilidad por vendedor.
- **Taller (producción)** — ODTs, subprocesos con operario responsable, materiales/telas, bitácora, costeo, tiempos teóricos, pasar-a-taller.
- **Caja** — movimientos con alcance por sucursal, cierre/arqueo, trazabilidad.
- **Cobranza** — histórico por cliente/factura, gestión de ejecutivas, multas.
- **Despachos** — guías, tracking de eventos, envíos parciales, incidencias.
- **RRHH** — trabajadores, subcontratos, certificados, vacunas, pagos.
- **Reportes** — gerenciales, comisiones, licitaciones, exportaciones CSV con columnas legacy.
- **Web pública** — endpoints `publicWeb` para la tienda (catálogo visible, precio web, órdenes de compra online).
- **Asistente IA** — chat con herramientas de consulta sobre los datos y generación de documentos, disponible por rol (datos sensibles solo admin).

## Reglas de negocio clave (precios)

- `precio_lista` = **costo neto**. No se edita a mano: es el promedio ponderado de los costos por proveedor asignado (sección Proveedores y Costos del producto).
- Los **precios de venta se derivan de los % del proveedor**: sala = costo + `%porc_venta_sala` (+ IVA 19%), licitación = costo + `%porc_licitacion` (editable solo como excepción manual), convenio marco usa `precio_marco`.
- `precio_web` = **precio sala con IVA**, derivado y no editable (`computePrecioWeb` en `backend/src/routes/productos/pricing.js`). Se recalcula al tocar el producto, en imports y al cambiar el % del proveedor.
- El inventario muestra **solo el precio costo**; los precios por canal se gestionan desde Proveedores.
- Un RUT puede tener varios nombres de proveedor: la identidad comercial es el **nombre/código**, no el RUT.
- Ventas sin cliente identificable se registran bajo **CONSUMIDOR FINAL** (rut `66666666-6`).
- El stock solo cambia por **movimientos de bodega** (nunca por edición directa del producto).

## Desarrollo local

Requisitos: Node 22, PostgreSQL local.

```bash
# Backend
cd backend
npm install
# .env con DATABASE_URL y JWT_ACCESS_SECRET / JWT_REFRESH_SECRET
npx prisma migrate deploy
npm run db:seed
npm run dev            # API en :3001

# Frontend
cd frontend
npm install
npm run dev            # Vite en :5173, proxy a la API
```

### Tests

```bash
cd backend
# base de pruebas dedicada (no usar la de desarrollo)
DATABASE_URL=postgresql://...:5432/plastimar_test npx prisma migrate deploy
DATABASE_URL=...plastimar_test npm run db:seed     # sin seed → 401 masivo en las suites
DATABASE_URL=...plastimar_test npm test            # suite completa
npm run test:ci                                    # subset focal que corre el CI
```

Los tests son de integración contra Postgres real (via `app.inject`), con limpieza propia por suite.

## Deploy

**Push a `main` = deploy automático a producción** (`.github/workflows/deploy.yml`):

1. Levanta Postgres 16 efímero, `prisma migrate deploy` + `db:seed` (valida que las migraciones funcionen en base fresca).
2. Corre la suite focal de backend (`npm run test:ci`) y build del frontend.
3. `rsync` de backend + `frontend/dist` al VPS (excluye `node_modules`, `.env`, `ecosystem.config.cjs`).
4. En el VPS: `prisma migrate deploy` contra producción y reinicio pm2 (`plastimar-api`).

nginx sirve la SPA desde `/var/www/plastimar-erp`, hace proxy de `/api` al puerto 3001 (bloqueado externamente) y sirve las fotos desde `/var/lib/plastimar-uploads` (`/uploads/...`, fuera del rsync). Existe además un ambiente candidate (`plastimar-api-candidate` + `plastimar-erp-candidate`) para previews.

> Toda tabla/schema debe nacer por migración. Objetos creados a mano en producción rompen el CI en base fresca (ver incidente `rrhh` en `docs/fix-datos-prod-2026-07-09/` y las migraciones-parche `add_rrhh_base` / `add_rag_ai_schema`).

## Datos y legacy

El sistema convive con la historia del legacy PHP (`sisgestion`/`sisventa`, MySQL):

- Tabla viva del legacy era `catalogo2` (no `catalogo`); productos se cruzan por `codigo_interno`, proveedores por `codigo_proveedor` (no por id), fotos por id legacy.
- Migraciones e importaciones de datos documentadas en `docs/` (la más reciente: `docs/fix-datos-prod-2026-07-09/` — remap de proveedores, delta de órdenes sisventa, contactos→sucursales, import de catálogo completo, precio web derivado).
- Scripts de auditoría/limpieza de datos en `backend/scripts/` (`npm run data:audit`, etc.).
- Antes de cualquier fix masivo de datos en producción: `pg_dump` de las tablas afectadas + tabla backup en el schema `staging_fix`.

## Documentación

`docs/` es la bitácora del proyecto: plan y cierre de sprints, auditorías legacy vs v2, runbooks de operación/producción, decisiones de modelo (cliente canónico, trazabilidad de stock/caja/despachos) e informes al cliente. Para entender el porqué de una regla, buscar ahí primero.
