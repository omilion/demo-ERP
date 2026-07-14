# Facturación Electrónica (DTE/SII) — Diseño

Fecha: 2026-07-14
Estado: aprobado, pendiente de plan de implementación

## Contexto

Plastimar ERP v2 (`D:\plastimar-erp-v2`, Fastify + Prisma 7 / Postgres multi-schema) no
tiene módulo de facturación electrónica. HM ERP (`D:\analytics`) ya tiene un motor DTE
propio en `backend/src/facturacion/` con certificación SII avanzada (sets de emisión
aceptados: factura exenta, guías, boletas — ver memoria `project_hmerp_facturacion`).
Se porta ese motor a Plastimar, adaptado a Postgres/Prisma/Fastify, con los datos
tributarios reales de Plastimar Limitada.

**Empresa emisora (datos de prueba/reales para certificación SII):**
- Razón social: PLASTIMAR LIMITADA
- RUT: 76.354.051-0
- Giro: ACABADO DE PRODUCTOS TEXTILES
- Dirección: 5 Oriente 134
- Comuna: Viña del Mar
- Ciudad: Viña del Mar

**Certificado digital (.p12):** aún no disponible. Se deja el flujo de carga listo mas
la emisión real queda bloqueada hasta subir el certificado legítimo de Plastimar. No se
genera certificado dummy/autofirmado.

## Alcance

Tipos de documento a soportar (todos ya cubiertos por el XML de HM, sin reescribir XSD):
- 33 — Factura electrónica afecta
- 39 — Boleta electrónica
- 52 — Guía de despacho electrónica
- 56 — Nota de débito electrónica
- 61 — Nota de crédito electrónica

Ambiente: **certificación (maullin)** únicamente en esta ronda. Producción (palena)
queda cableado pero no habilitado.

**Fuera de alcance esta ronda:**
- Libros IECV / RCOF (`libros.js` no se porta todavía)
- Intercambio de acuses de recibo automático
- Ambiente producción

## Qué se porta tal cual (sin modificar lógica)

De `D:\analytics\backend\src\facturacion\` a `D:\plastimar-erp-v2\backend\src\facturacion\`:
`documento.js`, `firma.js`, `siiClient.js`, `caf.js`, `ted.js`, `xmlUtil.js`, `printDte.js`.

Esta lógica ya está aceptada por el SII (canonicalización XML, XMLDSIG vía xml-crypto,
límites de campo como `UnmdItem` maxLength=4). No se reescribe: solo se copia y se le
inyecta un adapter de datos distinto.

`engine.js` se copia con cambios mínimos: en vez de recibir `{ db: <sqlite>, dataDir }`
recibe `{ db: <adapter Prisma>, dataDir }`, misma interfaz de métodos
(`getEmpresa`, `getCaf`, `saveDocumento`, etc.) implementada contra Postgres.

## Modelo de datos (Prisma)

Nuevo schema `facturacion` agregado a `datasource.schemas`:

```prisma
model FactCaf {
  id          Int      @id @default(autoincrement())
  tipoDte     Int      @map("tipo_dte")
  folioDesde  Int      @map("folio_desde")
  folioHasta  Int      @map("folio_hasta")
  folioActual Int      @map("folio_actual")
  xml         String
  ambiente    String   @default("certificacion")
  activo      Boolean  @default(true)
  createdAt   DateTime @default(now()) @map("created_at")

  @@map("caf")
  @@schema("facturacion")
}

model FactDocumento {
  id              Int       @id @default(autoincrement())
  tipoDte         Int       @map("tipo_dte")
  folio           Int?
  estado          String    @default("borrador")
  xml             String?
  receptor        Json
  items           Json
  referencias     Json?
  totales         Json
  ambiente        String    @default("certificacion")
  trackId         String?   @map("track_id")
  ordenId         Int?      @map("orden_id")
  guiaDespachoId  Int?      @map("guia_despacho_id")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@index([tipoDte, folio])
  @@index([ordenId])
  @@map("documentos")
  @@schema("facturacion")
}
```

`config.EmpresaConfig` (existente) se extiende con:
`ambiente` (default "certificacion"), `rutEnvia`, `fchResol`, `nroResol`, `certPass`,
`certPath`, `acteco`. Se precarga con los datos de Plastimar Limitada de arriba.

## Certificado digital

Pantalla "Facturación → Configuración": upload `.p12` + contraseña, igual patrón que
HM ERP (`node-forge` para extraer llave/cert, mostrar `subject`/`validFrom`/`validTo`/
`rutTitular`). Archivo físico en `backend/data/facturacion/certificado.p12`
(gitignored). Sin certificado cargado, cualquier intento de emitir/firmar responde
error explícito "Falta certificado digital" — no falla silencioso.

## Flujo de emisión por tipo de documento

- **Factura (33) / Boleta (39):** botón "Emitir DTE" en el detalle de `Orden`
  (`routes/ventas`). Precarga receptor desde `Cliente` (rut/razonSocial/giro/dirección/
  comuna) e items desde `OrdenItem` (cantidad, precioUnitario, split neto/IVA desde
  `precioConIva`). Factura si el cliente tiene RUT válido, boleta si no.
- **Guía de despacho electrónica (52):** botón en pantalla `GuiaDespacho` existente.
  Mismos ítems de la orden asociada; `guiaDespachoId` queda como referencia (la guía
  interna de Plastimar y el DTE 52 son conceptos distintos, uno no reemplaza al otro).
- **Nota de crédito (61) / Nota de débito (56):** se generan desde un `FactDocumento`
  ya emitido ("Anular con NC" / "Corregir con ND"), con folio+tipo+razón del documento
  original como referencia obligatoria (campo `referencias` en JSON).

## Rutas Fastify

Nueva carpeta `backend/src/routes/facturacion/index.js`, registrada en `app.js` con el
mismo patrón que el resto de módulos (`fastify.register(facturacionRoutes, ...)`).
Espejo de los endpoints de HM ERP, sin las rutas de libros:

```
GET    /api/facturacion/empresa
PUT    /api/facturacion/empresa
POST   /api/facturacion/empresa/certificado

GET    /api/facturacion/cafs
POST   /api/facturacion/cafs/upload
DELETE /api/facturacion/cafs/:cafId

GET    /api/facturacion/documentos
POST   /api/facturacion/documentos
PATCH  /api/facturacion/documentos/:docId
DELETE /api/facturacion/documentos/:docId
POST   /api/facturacion/documentos/:docId/emitir
POST   /api/facturacion/documentos/enviar
POST   /api/facturacion/documentos/:docId/estado
GET    /api/facturacion/documentos/:docId/descargar
GET    /api/facturacion/documentos/:docId/imprimir
```

## Deploy

Flujo normal del proyecto: cambios en `D:\plastimar-erp-v2` local → push a `main` →
GitHub Actions despliega al VPS (`vps.plastimar.cl`, ver memoria `project_plastimar_vps`).
Sin cambios manuales en el VPS. Ojo con el patrón de migraciones Prisma: usar migración
base idempotente para el schema nuevo `facturacion` (ya hubo un quiebre de CI por
objetos creados a mano en prod para el schema `rrhh` — no repetir).

## Testing

Seguir el patrón existente del repo (`node --test` / vitest contra `plastimar_test`,
Postgres real, no mocks). Casos mínimos:
- Construcción de XML de cada tipo de documento con datos de Plastimar (sin firmar,
  sin enviar — valida estructura).
- Adapter Prisma cumple la interfaz que `engine.js` espera (CRUD de CAF/documento).
- Rutas Fastify responden error claro sin certificado cargado.
- Emisión real contra SII certificación queda **bloqueada por falta de certificado**
  hasta que se suba el `.p12` legítimo — no se prueba end-to-end en esta ronda.
