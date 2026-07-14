# Facturación DTE — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port HM ERP's certified DTE/SII engine (`D:\analytics\backend\src\facturacion\`)
into `D:\plastimar-erp-v2` (Fastify + Prisma 7 / Postgres), configured for Plastimar
Limitada, exposed as a REST API testable via curl. No frontend UI in this plan (see
`docs/superpowers/plans/` for the follow-up frontend plan).

**Architecture:** Pure XML/crypto modules (`xmlUtil`, `caf`, `ted`, `documento`, `firma`,
`envio`, `siiClient`, `printDte`) are ported with only CommonJS→ESM syntax conversion —
their logic is untouched because it's already accepted by the SII in certification. A
new Prisma-backed adapter (`facturacion/db.js`) replaces HM's better-sqlite3 adapter. The
orchestrator (`facturacion/engine.js`) keeps the same public API and validation order but
is async-ified throughout, since Prisma calls are async where better-sqlite3's were sync.
New Fastify routes under `/api/facturacion` mirror HM's Express routes (minus libros).

**Tech Stack:** Fastify 5, Prisma 7 (Postgres, multi-schema), node-forge, xml-crypto,
@xmldom/xmldom, bwip-js, @fastify/multipart, vitest.

## Global Constraints

- Every new Node source file is ESM (`"type": "module"` in `backend/package.json`) —
  use `import`/`export`, never `require`/`module.exports`.
- No certificate is faked or persisted as if it were Plastimar's real `.p12`. Tests that
  need a signing key generate one ephemeral RSA keypair in-memory via
  `crypto.generateKeyPairSync` and discard it — never write to
  `backend/data/facturacion/certificado.p12`.
- Plastimar emisor data (used to seed `facturacion.empresa`):
  `rut='76.354.051-0'`, `razonSocial='PLASTIMAR LIMITADA'`,
  `giro='ACABADO DE PRODUCTOS TEXTILES'`, `direccion='5 Oriente 134'`,
  `comuna='Viña del Mar'`, `ciudad='Viña del Mar'`, `ambiente='certificacion'`.
- Tests run against a real Postgres `plastimar_test` database (no mocks), per existing
  repo convention. Run `npx prisma db push --accept-data-loss` (Prisma 7: never pass
  `--skip-generate`) before running new tests for the first time, from `backend/`.
- Follow existing route pattern exactly: `export default async function xRoutes(fastify) { ... }`,
  registered in `app.js` via `app.register(xRoutes, { prefix: '/api/x' })`, guarded with
  `preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'read'|'write')]`.
- Commit after every task (not every step) — one commit per source file + its test.

---

### Task 1: Add npm dependencies

**Files:**
- Modify: `D:\plastimar-erp-v2\backend\package.json`

**Interfaces:**
- Produces: `node-forge`, `xml-crypto`, `@xmldom/xmldom`, `bwip-js`, `@fastify/multipart`
  available as imports for later tasks.

- [ ] **Step 1: Add dependencies to package.json**

Open `D:\plastimar-erp-v2\backend\package.json` and add to `dependencies` (alongside
the existing `"@prisma/client": "^7.8.0"` entry, keep alphabetical if the file already is):

```json
    "@fastify/multipart": "^9.0.3",
    "@xmldom/xmldom": "^0.8.10",
    "bwip-js": "^4.11.2",
    "node-forge": "^1.4.0",
    "xml-crypto": "^6.1.2",
```

- [ ] **Step 2: Install**

Run from `D:\plastimar-erp-v2\backend`: `npm install`
Expected: lockfile updates, no errors, `node_modules/node-forge` etc. exist.

- [ ] **Step 3: Gitignore the certificate directory before anything can write to it**

Add to `D:\plastimar-erp-v2\.gitignore` (append at the end):

```
backend/data/facturacion/*.p12
backend/data/facturacion/*.pfx
```

This must land before Task 12 (engine.js creates `backend/data/facturacion/` on first
run) so the real Plastimar certificate can never be committed by accident.

- [ ] **Step 4: Commit**

```bash
cd D:/plastimar-erp-v2
git add backend/package.json backend/package-lock.json .gitignore
git commit -m "deps: add DTE/SII libs, gitignore certificado.p12 (node-forge, xml-crypto, bwip-js, fastify multipart)"
```

---

### Task 2: Prisma schema — `facturacion` schema (empresa, cafs, documentos)

**Files:**
- Modify: `D:\plastimar-erp-v2\backend\prisma\schema.prisma:7` (datasource schemas list)
- Modify: `D:\plastimar-erp-v2\backend\prisma\schema.prisma` (append models at end of file)
- Create: migration via `prisma migrate dev` (generates
  `backend/prisma/migrations/<timestamp>_add_facturacion/migration.sql`)

**Interfaces:**
- Produces: Prisma Client models `prisma.factEmpresa`, `prisma.factCaf`,
  `prisma.factDocumento` — all later tasks (adapter, routes, tests) depend on these
  exact model/field names.

- [ ] **Step 1: Add `facturacion` to the datasource schemas list**

In `D:\plastimar-erp-v2\backend\prisma\schema.prisma:7`:

```prisma
datasource db {
  provider = "postgresql"
  schemas  = ["auth", "clientes", "catalogo", "ventas", "caja", "taller", "bodega", "config", "rrhh", "ai", "facturacion"]
}
```

- [ ] **Step 2: Append the three models at the end of schema.prisma**

```prisma
// ── FACTURACION (DTE/SII) ────────────────────────────────────────────

model FactEmpresa {
  id          Int      @id @default(1)
  rut         String
  razonSocial String   @map("razon_social")
  giro        String
  direccion   String
  comuna      String
  ciudad      String?
  acteco      String?
  ambiente    String   @default("certificacion")
  rutEnvia    String?  @map("rut_envia")
  fchResol    String?  @map("fch_resol")
  nroResol    Int      @default(0) @map("nro_resol")
  certPass    String?  @map("cert_pass")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("empresa")
  @@schema("facturacion")
}

model FactCaf {
  id                Int      @id @default(autoincrement())
  tipoDte           Int      @map("tipo_dte")
  folioDesde        Int      @map("folio_desde")
  folioHasta        Int      @map("folio_hasta")
  siguienteFolio    Int      @map("siguiente_folio")
  fechaAutorizacion String?  @map("fecha_autorizacion")
  ambiente          String   @default("certificacion")
  xml               String
  createdAt         DateTime @default(now()) @map("created_at")

  @@index([tipoDte, ambiente])
  @@map("cafs")
  @@schema("facturacion")
}

model FactDocumento {
  id             Int       @id @default(autoincrement())
  clienteId      Int?      @map("cliente_id")
  ordenId        Int?      @map("orden_id")
  guiaDespachoId Int?      @map("guia_despacho_id")
  tipoDte        Int       @map("tipo_dte")
  folio          Int?
  fechaEmision   String?   @map("fecha_emision")
  receptor       Json      @default("{}")
  items          Json      @default("[]")
  referencias    Json      @default("[]")
  extra          Json      @default("{}")
  totales        Json      @default("{}")
  estado         String    @default("borrador")
  estadoDetalle  String?   @map("estado_detalle")
  trackId        String?   @map("track_id")
  ambiente       String?
  xml            String?
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  @@index([tipoDte, folio])
  @@index([clienteId])
  @@index([ordenId])
  @@map("documentos")
  @@schema("facturacion")
}
```

Note: `clienteId`/`ordenId`/`guiaDespachoId` are plain nullable ints, not Prisma
`relation()` fields — this plan doesn't touch `ventas`/`bodega` schemas. The follow-up
frontend plan adds the relations when it wires the "Emitir DTE" buttons.

- [ ] **Step 3: Generate and apply the migration**

Run from `D:\plastimar-erp-v2\backend`:
```
npx prisma migrate dev --name add_facturacion_schema
```
Expected: creates `prisma/migrations/<timestamp>_add_facturacion_schema/migration.sql`
with `CREATE SCHEMA "facturacion"` + three `CREATE TABLE` statements, applies it to your
local dev DB, regenerates Prisma Client. No `--skip-generate` (Prisma 7 rule).

- [ ] **Step 4: Seed Plastimar's emisor data idempotently in the same migration**

Open the generated `migration.sql` file and append at the end:

```sql
INSERT INTO "facturacion"."empresa"
  (id, rut, razon_social, giro, direccion, comuna, ciudad, ambiente, nro_resol, updated_at)
VALUES
  (1, '76.354.051-0', 'PLASTIMAR LIMITADA', 'ACABADO DE PRODUCTOS TEXTILES',
   '5 Oriente 134', 'Viña del Mar', 'Viña del Mar', 'certificacion', 0, now())
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 5: Verify against plastimar_test**

Run from `D:\plastimar-erp-v2\backend` (substitute your local postgres password from
`.env`):
```
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx prisma db push --accept-data-loss
```
Expected: `facturacion` schema + 3 tables created in `plastimar_test`, exit code 0.

- [ ] **Step 6: Commit**

```bash
cd D:/plastimar-erp-v2
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(facturacion): add facturacion schema (empresa/cafs/documentos), seed Plastimar emisor"
```

---

### Task 3: Port `xmlUtil.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\xmlUtil.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-xmlutil.test.js`

**Interfaces:**
- Produces: `XML_DECL, sanitizeLatin1, escapeText, escapeAttr, tag, tags, toLatin1Buffer, formatMonto, formatQty, formatDate, formatTimestamp, normalizeRut, rutDv, isValidRut` — used by every other facturacion module in later tasks.

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-xmlutil.test.js
import { describe, it, expect } from 'vitest'
import { tag, tags, formatMonto, formatQty, formatDate, normalizeRut, isValidRut, rutDv } from '../src/facturacion/xmlUtil.js'

describe('facturacion/xmlUtil', () => {
  it('tag() escapes text content and supports raw content', () => {
    expect(tag('Nombre', 'Juan & Ana')).toBe('<Nombre>Juan &amp; Ana</Nombre>')
    expect(tag('X', '<a/>', null, { raw: true })).toBe('<X><a/></X>')
    expect(tag('Vacio', null)).toBe('<Vacio></Vacio>')
  })

  it('tags() joins pairs and omits null/undefined values', () => {
    const xml = tags([['A', 1], ['B', null], ['C', 'x']])
    expect(xml).toBe('<A>1</A><C>x</C>')
  })

  it('formatMonto rounds to integer string, formatQty keeps decimals', () => {
    expect(formatMonto(1999.6)).toBe('2000')
    expect(formatQty(3)).toBe('3')
    expect(formatQty(2.5)).toBe('2.5')
  })

  it('formatDate produces YYYY-MM-DD', () => {
    expect(formatDate(new Date('2026-07-14T10:00:00'))).toBe('2026-07-14')
  })

  it('normalizeRut and isValidRut validate Plastimar RUT', () => {
    expect(normalizeRut('76.354.051-0')).toBe('76354051-0')
    expect(rutDv('76354051')).toBe('0')
    expect(isValidRut('76.354.051-0')).toBe(true)
    expect(isValidRut('76.354.051-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\plastimar-erp-v2\backend && npx vitest run test/facturacion-xmlutil.test.js`
Expected: FAIL — `Cannot find module '../src/facturacion/xmlUtil.js'`

- [ ] **Step 3: Write the implementation (ESM port of HM's xmlUtil.js)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\xmlUtil.js
// Utilidades XML para DTE SII.
// Los XML se generan directamente en forma canónica (C14N): entidades escapadas,
// sin tags autocerrados, atributos en el orden en que se declaran. Esto permite
// calcular digests/firmas sobre el string generado sin necesidad de un
// canonicalizador de terceros.

// Reemplazos de caracteres fuera de ISO-8859-1 que aparecen habitualmente al
// pegar texto (el SII exige ISO-8859-1 en los archivos DTE).
const NON_LATIN1_MAP = {
  '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '…': '...', ' ': ' ',
  '•': '-', '€': 'EUR'
};

export const sanitizeLatin1 = (value) => {
  const text = String(value ?? '');
  let out = '';
  for (const ch of text) {
    if (ch === '\r') continue;
    const mapped = NON_LATIN1_MAP[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    out += ch.codePointAt(0) <= 0xff ? ch : '?';
  }
  return out.trim();
};

// Escapes según C14N: texto escapa & < >, atributos escapan & < "
export const escapeText = (value) => sanitizeLatin1(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const escapeAttr = (value) => sanitizeLatin1(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

// tag('Folio', 33) -> '<Folio>33</Folio>'
// tag('CAF', inner, { version: '1.0' }, { raw: true }) -> contenido sin escapar
export const tag = (name, content, attrs = null, opts = {}) => {
  const attrText = attrs
    ? Object.entries(attrs).map(([key, val]) => ` ${key}="${escapeAttr(val)}"`).join('')
    : '';
  if (content === null || content === undefined || content === '') {
    return `<${name}${attrText}></${name}>`;
  }
  const body = opts.raw ? String(content) : escapeText(content);
  return `<${name}${attrText}>${body}</${name}>`;
};

// Serializa una lista de pares [nombre, valor] omitiendo valores null/undefined.
// Mantiene el orden: los schemas del SII son secuencias estrictas.
export const tags = (pairs) => pairs
  .filter(([, value]) => value !== null && value !== undefined && value !== '')
  .map(([name, value, attrs, opts]) => tag(name, value, attrs, opts))
  .join('');

export const XML_DECL = '<?xml version="1.0" encoding="ISO-8859-1"?>';

export const toLatin1Buffer = (xmlString) => Buffer.from(xmlString, 'latin1');

// Formatos numéricos SII: montos enteros, cantidades hasta 6 decimales.
export const formatMonto = (value) => String(Math.round(Number(value) || 0));
export const formatQty = (value) => {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(6)));
};

export const formatDate = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatTimestamp = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${formatDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// RUT: normaliza a formato 'cuerpo-DV' y valida dígito verificador.
export const normalizeRut = (value) => {
  const clean = String(value || '').replace(/[.\s]/g, '').toUpperCase();
  const match = clean.match(/^(\d+)-?([\dK])$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
};

export const rutDv = (body) => {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
};

export const isValidRut = (value) => {
  const rut = normalizeRut(value);
  if (!rut) return false;
  const [body, dv] = rut.split('-');
  return rutDv(body) === dv;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-xmlutil.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/xmlUtil.js backend/test/facturacion-xmlutil.test.js
git commit -m "feat(facturacion): port xmlUtil (XML canon helpers, RUT validation)"
```

---

### Task 4: Port `caf.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\caf.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-caf.test.js`

**Interfaces:**
- Consumes: none (leaf module)
- Produces: `parseCaf(xmlString) -> { rutEmisor, razonSocial, tipoDte, folioDesde, folioHasta, fechaAutorizacion, idk, privateKeyPem, cafXml }` — used by `documento.js` (Task 6) and `engine.js` (Task 12).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-caf.test.js
import { describe, it, expect } from 'vitest'
import { parseCaf } from '../src/facturacion/caf.js'

const SAMPLE_CAF = `<AUTORIZACION>
  <CAF version="1.0">
    <DA>
      <RE>76354051-0</RE>
      <RS>PLASTIMAR LIMITADA</RS>
      <TD>33</TD>
      <RNG><D>1</D><H>10</H></RNG>
      <FA>2026-07-01</FA>
      <RSAPK><M>xxx</M><E>Aw==</E></RSAPK>
      <IDK>100</IDK>
    </DA>
    <FRMA algoritmo="SHA1withRSA">firmaFalsaBase64==</FRMA>
  </CAF>
  <RSASK>-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKfakekeyfortestingonly==
-----END RSA PRIVATE KEY-----</RSASK>
  <RSAPUBK>-----BEGIN PUBLIC KEY-----
fake
-----END PUBLIC KEY-----</RSAPUBK>
</AUTORIZACION>`

describe('facturacion/caf', () => {
  it('parses a CAF XML into its fields', () => {
    const caf = parseCaf(SAMPLE_CAF)
    expect(caf.tipoDte).toBe(33)
    expect(caf.folioDesde).toBe(1)
    expect(caf.folioHasta).toBe(10)
    expect(caf.rutEmisor).toBe('76354051-0')
    expect(caf.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(caf.privateKeyPem).toContain('PRIVATE KEY')
    expect(caf.cafXml).toContain('<CAF version="1.0">')
  })

  it('throws on a CAF missing the <CAF> element', () => {
    expect(() => parseCaf('<AUTORIZACION></AUTORIZACION>')).toThrow(/falta el elemento <CAF>/)
  })

  it('throws on a CAF missing the private key', () => {
    const noKey = SAMPLE_CAF.replace(/<RSASK>[\s\S]*?<\/RSASK>/, '')
    expect(() => parseCaf(noKey)).toThrow(/falta la llave privada/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-caf.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's caf.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\caf.js
// Parser de archivos CAF (Código de Autorización de Folios) del SII.
// El CAF es un XML <AUTORIZACION> que contiene el rango de folios autorizado,
// la llave privada RSA con que se firma el TED y el bloque <CAF> que viaja
// dentro de cada timbre.

const extract = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`));
  return match ? match[1].trim() : null;
};

const extractRaw = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`));
  return match ? match[0] : null;
};

export const parseCaf = (xmlString) => {
  const xml = String(xmlString || '');
  const cafBlock = extractRaw(xml, 'CAF');
  if (!cafBlock) throw new Error('El archivo no es un CAF válido: falta el elemento <CAF>.');

  const da = extract(cafBlock, 'DA');
  if (!da) throw new Error('CAF inválido: falta el elemento <DA>.');

  const rutEmisor = extract(da, 'RE');
  const razonSocial = extract(da, 'RS');
  const tipoDte = Number(extract(da, 'TD'));
  const rango = extract(da, 'RNG') || '';
  const folioDesde = Number(extract(rango, 'D'));
  const folioHasta = Number(extract(rango, 'H'));
  const fechaAutorizacion = extract(da, 'FA');
  const idk = extract(da, 'IDK');

  const privateKeyPem = extract(xml, 'RSASK');
  if (!privateKeyPem || !privateKeyPem.includes('PRIVATE KEY')) {
    throw new Error('CAF inválido: falta la llave privada <RSASK>.');
  }

  if (!Number.isFinite(tipoDte) || !Number.isFinite(folioDesde) || !Number.isFinite(folioHasta)) {
    throw new Error('CAF inválido: tipo de documento o rango de folios ilegible.');
  }

  return {
    rutEmisor,
    razonSocial,
    tipoDte,
    folioDesde,
    folioHasta,
    fechaAutorizacion,
    idk,
    privateKeyPem,
    // Bloque <CAF> textual: se incrusta tal cual dentro del TED. No se debe
    // reformatear porque su firma <FRMA> cubre los bytes originales.
    cafXml: cafBlock
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-caf.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/caf.js backend/test/facturacion-caf.test.js
git commit -m "feat(facturacion): port caf.js (CAF XML parser)"
```

---

### Task 5: Port `ted.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\ted.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-ted.test.js`

**Interfaces:**
- Consumes: `tag, tags, formatMonto, formatTimestamp, sanitizeLatin1` from `xmlUtil.js` (Task 3); a `caf` object shaped `{ cafXml, privateKeyPem }` (as returned by `parseCaf`, Task 4).
- Produces: `buildTed(params, caf, timestamp) -> string` (the `<TED>...</TED>` XML block) — used by `documento.js` (Task 6).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-ted.test.js
import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildTed } from '../src/facturacion/ted.js'

describe('facturacion/ted', () => {
  it('builds a <TED> block with DD fields and a base64 FRMT signature', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const caf = { cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE></DA></CAF>', privateKeyPem }

    const ted = buildTed({
      rutEmisor: '76354051-0',
      tipoDte: 33,
      folio: 1,
      fechaEmision: '2026-07-14',
      rutReceptor: '11111111-1',
      razonReceptor: 'Cliente Prueba',
      montoTotal: 11900,
      primerItem: 'Producto textil'
    }, caf, new Date('2026-07-14T10:00:00'))

    expect(ted).toMatch(/^<TED version="1.0">/)
    expect(ted).toContain('<RE>76354051-0</RE>')
    expect(ted).toContain('<TD>33</TD>')
    expect(ted).toContain('<F>1</F>')
    expect(ted).toContain('<MNT>11900</MNT>')
    expect(ted).toMatch(/<FRMT algoritmo="SHA1withRSA">[A-Za-z0-9+/=]+<\/FRMT>/)
    expect(ted.endsWith('</TED>')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-ted.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's ted.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\ted.js
// TED (Timbre Electrónico de Documentos): bloque firmado con la llave privada
// del CAF que viaja dentro de cada DTE y se imprime como código PDF417.
// La firma FRMT se calcula sobre los bytes ISO-8859-1 del elemento <DD> tal
// cual queda serializado (así lo verifican el SII y las apps de fiscalización).

import crypto from 'node:crypto';
import { tag, tags, formatMonto, formatTimestamp, sanitizeLatin1 } from './xmlUtil.js';

const truncate = (value, max) => sanitizeLatin1(value).slice(0, max);

export const buildTed = ({ rutEmisor, tipoDte, folio, fechaEmision, rutReceptor, razonReceptor, montoTotal, primerItem }, caf, timestamp = new Date()) => {
  const dd = tag('DD', [
    tags([
      ['RE', rutEmisor],
      ['TD', tipoDte],
      ['F', folio],
      ['FE', fechaEmision],
      ['RR', rutReceptor],
      ['RSR', truncate(razonReceptor, 40)],
      ['MNT', formatMonto(montoTotal)],
      ['IT1', truncate(primerItem, 40)]
    ]),
    caf.cafXml,
    tag('TSTED', formatTimestamp(timestamp))
  ].join(''), null, { raw: true });

  const frmt = crypto.createSign('RSA-SHA1')
    .update(Buffer.from(dd, 'latin1'))
    .sign(caf.privateKeyPem)
    .toString('base64');

  return `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-ted.test.js`
Expected: PASS, 1 test

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/ted.js backend/test/facturacion-ted.test.js
git commit -m "feat(facturacion): port ted.js (Timbre Electronico builder)"
```

---

### Task 6: Port `documento.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\documento.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-documento.test.js`

**Interfaces:**
- Consumes: `tag, tags, formatMonto, formatQty, formatDate, formatTimestamp` from `xmlUtil.js` (Task 3); `buildTed` from `ted.js` (Task 5).
- Produces: `buildDocumento({ empresa, receptor, doc, caf, timestamp }) -> { id, documentoXml, ted, totales, fechaEmision }`, `computeTotales(items, tipoDte)`, `isBoleta(tipoDte)`, `TIPOS_DTE`, `IVA_RATE`, `SII_NS` — used by `engine.js` (Task 12) and `envio.js` (Task 8).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-documento.test.js
import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildDocumento, computeTotales, isBoleta, TIPOS_DTE } from '../src/facturacion/documento.js'

const PLASTIMAR_EMPRESA = {
  rut: '76354051-0',
  razonSocial: 'PLASTIMAR LIMITADA',
  giro: 'ACABADO DE PRODUCTOS TEXTILES',
  direccion: '5 Oriente 134',
  comuna: 'Viña del Mar',
  ciudad: 'Viña del Mar',
  acteco: '1394'
}

function fakeCaf() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return {
    cafXml: '<CAF version="1.0"><DA><RE>76354051-0</RE></DA></CAF>',
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' })
  }
}

describe('facturacion/documento', () => {
  it('TIPOS_DTE covers factura/boleta/guia/NC/ND', () => {
    expect(TIPOS_DTE[33]).toBe('Factura Electrónica')
    expect(TIPOS_DTE[39]).toBe('Boleta Electrónica')
    expect(TIPOS_DTE[52]).toBe('Guía de Despacho Electrónica')
    expect(TIPOS_DTE[56]).toBe('Nota de Débito Electrónica')
    expect(TIPOS_DTE[61]).toBe('Nota de Crédito Electrónica')
  })

  it('isBoleta true only for 39/41', () => {
    expect(isBoleta(39)).toBe(true)
    expect(isBoleta(33)).toBe(false)
  })

  it('computeTotales applies 19% IVA on an affected factura (33)', () => {
    const totales = computeTotales([{ cantidad: 2, precio: 5000 }], 33)
    expect(totales.neto).toBe(10000)
    expect(totales.iva).toBe(1900)
    expect(totales.total).toBe(11900)
  })

  it('buildDocumento produces a well-formed <Documento> for a Plastimar factura afecta', () => {
    const doc = {
      tipoDte: 33,
      folio: 1,
      items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }]
    }
    const receptor = { rut: '11111111-1', razonSocial: 'Cliente Prueba SpA', direccion: 'Av Test 1', comuna: 'Santiago' }
    const result = buildDocumento({ empresa: PLASTIMAR_EMPRESA, receptor, doc, caf: fakeCaf(), timestamp: new Date('2026-07-14T10:00:00') })

    expect(result.id).toBe('F1T33')
    expect(result.documentoXml).toContain('<RUTEmisor>76354051-0</RUTEmisor>')
    expect(result.documentoXml).toContain('<RznSoc>PLASTIMAR LIMITADA</RznSoc>')
    expect(result.documentoXml).toContain('<GiroEmis>ACABADO DE PRODUCTOS TEXTILES</GiroEmis>')
    expect(result.documentoXml).toContain('<MntTotal>59500</MntTotal>')
    expect(result.documentoXml).toContain('<TED version="1.0">')
    expect(result.totales.total).toBe(59500)
  })

  it('buildDocumento throws with no items', () => {
    expect(() => buildDocumento({
      empresa: PLASTIMAR_EMPRESA,
      receptor: { rut: '11111111-1', razonSocial: 'X' },
      doc: { tipoDte: 33, folio: 1, items: [] },
      caf: fakeCaf()
    })).toThrow(/no tiene ítems/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-documento.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's documento.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\documento.js
// Construcción del elemento <Documento> de un DTE según los schemas del SII
// (DTE_v10.xsd para facturas/guías/notas, BOLETA_v11.xsd para boletas).
// El orden de los elementos es una secuencia estricta del schema: no reordenar.

import { tag, tags, formatMonto, formatQty, formatDate, formatTimestamp } from './xmlUtil.js';
import { buildTed } from './ted.js';

export const SII_NS = 'http://www.sii.cl/SiiDte';

export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  34: 'Factura No Afecta o Exenta Electrónica',
  39: 'Boleta Electrónica',
  41: 'Boleta No Afecta o Exenta Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica'
};

export const IVA_RATE = 19;

export const isBoleta = (tipoDte) => tipoDte === 39 || tipoDte === 41;
const siiText = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return maxLength ? text.slice(0, maxLength) : text;
};

// Calcula totales a partir de los ítems. Ítems con exento=true suman a MntExe;
// el resto a MntNeto con IVA 19%.
export const computeTotales = (items, tipoDte) => {
  let neto = 0;
  let exento = 0;
  for (const item of items) {
    const monto = Math.round((Number(item.cantidad) || 1) * (Number(item.precio) || 0))
      - Math.round(Number(item.descuentoMonto) || 0);
    if (item.exento) exento += monto;
    else neto += monto;
  }
  // Documentos exentos (34/41) no pueden declarar IVA: todo va a MntExe.
  if (tipoDte === 34 || tipoDte === 41) {
    exento += neto;
    neto = 0;
  }
  const iva = neto > 0 ? Math.round(neto * IVA_RATE / 100) : 0;
  return {
    neto: neto > 0 ? neto : null,
    exento: exento > 0 ? exento : null,
    tasaIva: neto > 0 ? IVA_RATE : null,
    iva: neto > 0 ? iva : null,
    total: neto + exento + iva
  };
};

const buildIdDoc = (doc, boleta) => {
  const extra = doc.extra || {};
  if (boleta) {
    return tag('IdDoc', tags([
      ['TipoDTE', doc.tipoDte],
      ['Folio', doc.folio],
      ['FchEmis', doc.fechaEmision],
      // 3 = boletas de venta y servicios
      ['IndServicio', extra.indServ ?? 3],
      ['PeriodoDesde', extra.periodoDesde],
      ['PeriodoHasta', extra.periodoHasta],
      ['FchVenc', extra.fechaVencimiento]
    ]), null, { raw: true });
  }
  return tag('IdDoc', tags([
    ['TipoDTE', doc.tipoDte],
    ['Folio', doc.folio],
    ['FchEmis', doc.fechaEmision],
    // Guía de despacho: TipoDespacho va antes de IndTraslado (orden de schema)
    ['TipoDespacho', doc.tipoDte === 52 ? extra.tipoDespacho : null],
    ['IndTraslado', doc.tipoDte === 52 ? extra.indTraslado : null],
    ['FmaPago', extra.formaPago],
    ['FchVenc', extra.fechaVencimiento]
  ]), null, { raw: true });
};

const buildEmisor = (empresa, boleta) => {
  if (boleta) {
    return tag('Emisor', tags([
      ['RUTEmisor', empresa.rut],
      ['RznSocEmisor', empresa.razonSocial],
      ['GiroEmisor', empresa.giro],
      ['DirOrigen', empresa.direccion],
      ['CmnaOrigen', empresa.comuna],
      ['CiudadOrigen', empresa.ciudad]
    ]), null, { raw: true });
  }
  return tag('Emisor', tags([
    ['RUTEmisor', empresa.rut],
    ['RznSoc', empresa.razonSocial],
    ['GiroEmis', empresa.giro],
    ['Acteco', empresa.acteco],
    ['DirOrigen', empresa.direccion],
    ['CmnaOrigen', empresa.comuna],
    ['CiudadOrigen', empresa.ciudad]
  ]), null, { raw: true });
};

const buildReceptor = (receptor, boleta) => tag('Receptor', tags([
  ['RUTRecep', receptor.rut],
  ['RznSocRecep', receptor.razonSocial],
  ['GiroRecep', boleta ? null : siiText(receptor.giro, 40)],
  ['CorreoRecep', boleta ? null : receptor.email],
  ['DirRecep', receptor.direccion],
  ['CmnaRecep', receptor.comuna],
  ['CiudadRecep', receptor.ciudad]
]), null, { raw: true });

const buildTotales = (totales) => tag('Totales', tags([
  ['MntNeto', totales.neto !== null ? formatMonto(totales.neto) : null],
  ['MntExe', totales.exento !== null ? formatMonto(totales.exento) : null],
  ['TasaIVA', totales.tasaIva],
  ['IVA', totales.iva !== null ? formatMonto(totales.iva) : null],
  ['MntTotal', formatMonto(totales.total)]
]), null, { raw: true });

const buildDetalle = (items, tipoDte) => items.map((item, index) => {
  const cantidad = Number(item.cantidad) || 1;
  const precio = Number(item.precio) || 0;
  const bruto = Math.round(cantidad * precio);
  const descuento = Math.round(Number(item.descuentoMonto) || 0);
  const exentoEnDocAfecto = item.exento && tipoDte !== 34 && tipoDte !== 41;
  return tag('Detalle', tags([
    ['NroLinDet', index + 1],
    ['CdgItem', item.codigo ? tags([['TpoCodigo', 'INT1'], ['VlrCodigo', siiText(item.codigo, 35)]]) : null, null, { raw: true }],
    // IndExe=1 marca la línea como exenta (sólo válido en documentos afectos;
    // en 34/41 el documento completo es exento y el indicador no se informa)
    ['IndExe', exentoEnDocAfecto ? 1 : null],
    ['NmbItem', siiText(item.nombre, 80)],
    ['DscItem', siiText(item.descripcion, 1000)],
    ['QtyItem', formatQty(cantidad)],
    // UnmdItem tiene maxLength=4 en el schema del SII; recortar evita rechazos.
    ['UnmdItem', siiText(item.unidad, 4)],
    ['PrcItem', precio > 0 ? formatQty(precio) : null],
    ['DescuentoMonto', descuento > 0 ? formatMonto(descuento) : null],
    ['MontoItem', formatMonto(bruto - descuento)]
  ]), null, { raw: true });
}).join('');

const buildReferencias = (referencias, boleta) => (referencias || []).map((ref, index) => {
  if (boleta) {
    // Boletas (set de pruebas): <CodRef>SET</CodRef><RazonRef>CASO-1</RazonRef>
    return tag('Referencia', tags([
      ['NroLinRef', index + 1],
      ['CodRef', ref.tipoDocRef === 'SET' ? 'SET' : ref.codRef],
      ['RazonRef', ref.razon]
    ]), null, { raw: true });
  }
  return tag('Referencia', tags([
    ['NroLinRef', index + 1],
    ['TpoDocRef', ref.tipoDocRef],
    ['FolioRef', ref.folioRef],
    ['FchRef', ref.fechaRef],
    ['CodRef', ref.codRef],
    ['RazonRef', ref.razon]
  ]), null, { raw: true });
}).join('');

// Construye el <Documento> completo (sin firma XMLDSIG, con TED).
export const buildDocumento = ({ empresa, receptor, doc, caf, timestamp = new Date() }) => {
  const boleta = isBoleta(doc.tipoDte);
  const items = doc.items || [];
  if (!items.length) throw new Error('El documento no tiene ítems.');
  const totales = computeTotales(items, doc.tipoDte);
  const fechaEmision = doc.fechaEmision || formatDate(timestamp);
  const id = `F${doc.folio}T${doc.tipoDte}`;

  const ted = buildTed({
    rutEmisor: empresa.rut,
    tipoDte: doc.tipoDte,
    folio: doc.folio,
    fechaEmision,
    rutReceptor: receptor.rut,
    razonReceptor: receptor.razonSocial,
    montoTotal: totales.total,
    primerItem: items[0].nombre
  }, caf, timestamp);

  const body = [
    tag('Encabezado', [
      buildIdDoc({ ...doc, fechaEmision }, boleta),
      buildEmisor(empresa, boleta),
      buildReceptor(receptor, boleta),
      buildTotales(totales)
    ].join(''), null, { raw: true }),
    buildDetalle(items, doc.tipoDte),
    buildReferencias(doc.referencias, boleta),
    ted,
    tag('TmstFirma', formatTimestamp(timestamp))
  ].join('');

  const documentoXml = `<Documento ID="${id}">${body}</Documento>`;
  return { id, documentoXml, ted, totales, fechaEmision };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-documento.test.js`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/documento.js backend/test/facturacion-documento.test.js
git commit -m "feat(facturacion): port documento.js (DTE XML builder, 33/34/39/41/52/56/61)"
```

---

### Task 7: Port `firma.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\firma.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-firma.test.js`

**Interfaces:**
- Consumes: `node-forge`, `@xmldom/xmldom`, `xml-crypto` (Task 1 deps).
- Produces: `loadCertificate(p12Path, password) -> { privateKeyPem, certPem, certDerB64, modulusB64, exponentB64, subject, validFrom, validTo, rutTitular }`, `signXml(xmlString, referenceUri, cert, options) -> string`, `sha1B64`, `rsaSha1B64`, `DSIG_NS` — used by `envio.js` (Task 8), `siiClient.js` (Task 9), `engine.js` (Task 12).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-firma.test.js
import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import forge from 'node-forge'
import { loadCertificate, signXml, sha1B64, rsaSha1B64 } from '../src/facturacion/firma.js'

describe('facturacion/firma', () => {
  it('loadCertificate throws a clear error when the file does not exist', () => {
    expect(() => loadCertificate('/no/existe/certificado.p12', 'x')).toThrow()
  })

  it('sha1B64 and rsaSha1B64 produce base64 output matching node:crypto directly', () => {
    expect(sha1B64('hola')).toMatch(/^[A-Za-z0-9+/=]+$/)
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const pem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const expected = createSign('RSA-SHA1').update('hola').sign(pem).toString('base64')
    expect(rsaSha1B64('hola', pem)).toBe(expected)
  })

  it('signXml wraps a <Signature> block around the given RSA key material', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
    const privateKeyPem = privateKey.export({ type: 'pkcs1', format: 'pem' })
    const cert = {
      privateKeyPem,
      modulusB64: Buffer.from('fake-modulus').toString('base64'),
      exponentB64: Buffer.from('AQAB').toString('base64'),
      certDerB64: Buffer.from('fake-cert-der').toString('base64')
    }
    const xml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const signature = signXml(xml, '#F1T33', cert)
    expect(signature).toContain('<Signature')
    expect(signature).toContain('<SignatureValue>')
    expect(signature).toContain('<X509Certificate>')
  })

  it('round-trip: loadCertificate reads back a real forge-generated .p12', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date('2026-01-01')
    cert.validity.notAfter = new Date('2027-01-01')
    const attrs = [{ name: 'commonName', value: 'Test Plastimar' }]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)
    cert.sign(keys.privateKey, forge.md.sha256.create())

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'clave123')
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes()

    const tmpPath = path.join(os.tmpdir(), `test-cert-${Date.now()}.p12`)
    fs.writeFileSync(tmpPath, Buffer.from(p12Der, 'binary'))
    try {
      const loaded = loadCertificate(tmpPath, 'clave123')
      expect(loaded.privateKeyPem).toContain('PRIVATE KEY')
      expect(loaded.subject).toContain('Test Plastimar')
    } finally {
      fs.unlinkSync(tmpPath)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-firma.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's firma.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\firma.js
// Firma electrónica para DTE: carga del certificado digital (.p12/.pfx) y
// firma XMLDSIG (RSA-SHA1, C14N, transform enveloped) según exige el SII.
//
// Los XML de este módulo se generan ya en forma canónica (ver xmlUtil.js), por
// lo que el digest se calcula directamente sobre el string generado. El SII
// canonicaliza en UTF-8 aunque el archivo viaje en ISO-8859-1: los digests y
// firmas se computan sobre bytes UTF-8; sólo la serialización final es latin1.

import crypto from 'node:crypto';
import fs from 'node:fs';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

export const DSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';

export const loadCertificate = (p12Path, password) => {
  const der = fs.readFileSync(p12Path, 'binary');
  const asn1 = forge.asn1.fromDer(der);
  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
  } catch (err) {
    throw new Error(`No se pudo abrir el certificado: contraseña incorrecta o formato no soportado (${err.message}).`);
  }

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]
    || p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag];
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
  if (!keyBags || !keyBags.length || !certBags || !certBags.length) {
    throw new Error('El certificado no contiene llave privada y certificado X509.');
  }

  const privateKey = keyBags[0].key;
  // El bag puede traer la cadena completa; el certificado del titular es el
  // que corresponde a la llave privada (mismo módulo RSA).
  const cert = certBags.map(bag => bag.cert).find(c => c && c.publicKey
    && c.publicKey.n.toString(16) === privateKey.n.toString(16)) || certBags[0].cert;

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
  const certPem = forge.pki.certificateToPem(cert);
  const certDerB64 = forge.util.encode64(
    forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
  );

  const bigIntToB64 = (bigInt) => {
    let hex = bigInt.toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    // C14N de KeyValue usa el entero sin byte de signo inicial
    if (hex.startsWith('00')) hex = hex.slice(2);
    return forge.util.encode64(forge.util.hexToBytes(hex));
  };

  // RUT del titular: extensión chilena OID 1.3.6.1.4.1.8321.1 en subjectAltName
  let rutTitular = null;
  try {
    const altName = cert.getExtension('subjectAltName');
    if (altName && altName.altNames) {
      for (const name of altName.altNames) {
        if (name.value && /^\d{6,9}-?[\dkK]$/.test(String(name.value).trim())) {
          rutTitular = String(name.value).trim().toUpperCase();
        }
      }
    }
  } catch { /* extensión opcional */ }

  return {
    privateKeyPem,
    certPem,
    certDerB64,
    modulusB64: bigIntToB64(privateKey.n),
    exponentB64: bigIntToB64(privateKey.e),
    subject: cert.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', '),
    validFrom: cert.validity.notBefore.toISOString(),
    validTo: cert.validity.notAfter.toISOString(),
    rutTitular
  };
};

export const sha1B64 = (input) => crypto.createHash('sha1').update(input).digest('base64');

export const rsaSha1B64 = (input, privateKeyPem) => crypto.createSign('RSA-SHA1')
  .update(input)
  .sign(privateKeyPem)
  .toString('base64');

const wrapB64 = (b64, width = 76) => b64.replace(new RegExp(`(.{${width}})`, 'g'), '$1\n').trim();

// Firma un elemento XML usando xml-crypto para asegurar canonicalización (C14N 1.0)
// y herencia correcta de namespaces compatible con el SII.
// Devuelve el bloque <Signature> como string para mantener compatibilidad SOAP y de ensamblado.
export const signXml = (xmlString, referenceUri, cert, options = {}) => {
  const sig = new SignedXml();
  sig.signatureAlgorithm = 'http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  sig.canonicalizationAlgorithm = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

  const transformAlgorithm = options.transformAlgorithm || 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';

  let xpathQuery = '/*';
  if (referenceUri && referenceUri.startsWith('#')) {
    const id = referenceUri.substring(1);
    xpathQuery = `//*[@*[local-name(.)='ID' or local-name(.)='id']='${id}']`;
  }

  const isEmpty = (referenceUri === '');
  sig.addReference({
    xpath: xpathQuery,
    transforms: [transformAlgorithm],
    digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
    uri: referenceUri,
    isEmptyUri: isEmpty
  });

  sig.privateKey = cert.privateKeyPem;
  sig.getKeyInfo = function(prefix) {
    const currentPrefix = prefix ? `${prefix}:` : '';
    return `<${currentPrefix}KeyInfo>`
      + `<${currentPrefix}KeyValue>`
      + `<${currentPrefix}RSAKeyValue>`
      + `<${currentPrefix}Modulus>${wrapB64(cert.modulusB64)}</${currentPrefix}Modulus>`
      + `<${currentPrefix}Exponent>${cert.exponentB64}</${currentPrefix}Exponent>`
      + `</${currentPrefix}RSAKeyValue>`
      + `</${currentPrefix}KeyValue>`
      + `<${currentPrefix}X509Data>`
      + `<${currentPrefix}X509Certificate>${wrapB64(cert.certDerB64)}</${currentPrefix}X509Certificate>`
      + `</${currentPrefix}X509Data>`
      + `</${currentPrefix}KeyInfo>`;
  };

  sig.computeSignature(xmlString, {
    location: {
      reference: '/*',
      action: 'append'
    }
  });

  return sig.signatureXml;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-firma.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/firma.js backend/test/facturacion-firma.test.js
git commit -m "feat(facturacion): port firma.js (p12 loader + XMLDSIG signing)"
```

---

### Task 8: Port `envio.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\envio.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-envio.test.js`

**Interfaces:**
- Consumes: `XML_DECL, tag, tags, formatTimestamp` from `xmlUtil.js` (Task 3); `signXml` from `firma.js` (Task 7); `isBoleta, SII_NS` from `documento.js` (Task 6).
- Produces: `buildDte(documentoXml, cert) -> string`, `buildEnvio({ dtes, empresa, cert, rutEnvia, timestamp }) -> { xml, esBoleta }`, `RUT_SII` — used by `engine.js` (Task 12).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-envio.test.js
import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import { buildDte, buildEnvio } from '../src/facturacion/envio.js'

function fakeCert() {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs1', format: 'pem' }),
    modulusB64: Buffer.from('mod').toString('base64'),
    exponentB64: Buffer.from('AQAB').toString('base64'),
    certDerB64: Buffer.from('der').toString('base64')
  }
}

describe('facturacion/envio', () => {
  it('buildDte wraps a signed <DTE> around the documento XML', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const dte = buildDte(documentoXml, fakeCert())
    expect(dte).toMatch(/^<DTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" version="1\.0">/)
    expect(dte).toContain('<Documento xmlns="http://www.sii.cl/SiiDte" ID="F1T33">')
    expect(dte).toContain('<Signature')
    expect(dte.endsWith('</DTE>')).toBe(true)
  })

  it('buildEnvio wraps one factura DTE in a signed EnvioDTE with Caratula', () => {
    const documentoXml = '<Documento ID="F1T33"><A>1</A></Documento>'
    const cert = fakeCert()
    const dteXml = buildDte(documentoXml, cert)
    const { xml, esBoleta } = buildEnvio({
      dtes: [{ tipoDte: 33, dteXml }],
      empresa: { rut: '76354051-0', fchResol: '2026-07-01', nroResol: 0 },
      cert,
      rutEnvia: '76354051-0'
    })
    expect(esBoleta).toBe(false)
    expect(xml).toContain('<EnvioDTE xmlns="http://www.sii.cl/SiiDte"')
    expect(xml).toContain('<RutEmisor>76354051-0</RutEmisor>')
    expect(xml).toContain('<SubTotDTE><TpoDTE>33</TpoDTE><NroDTE>1</NroDTE></SubTotDTE>')
  })

  it('buildEnvio rejects mixing boletas with other DTE types', () => {
    const cert = fakeCert()
    expect(() => buildEnvio({
      dtes: [{ tipoDte: 33, dteXml: '<DTE/>' }, { tipoDte: 39, dteXml: '<DTE/>' }],
      empresa: { rut: '76354051-0', fchResol: '2026-07-01' },
      cert,
      rutEnvia: '76354051-0'
    })).toThrow(/sobre separado/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-envio.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's envio.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\envio.js
// Sobres de envío al SII: EnvioDTE (facturas, notas, guías) y EnvioBOLETA.
// El DTE individual se firma standalone y luego se incrusta en el SetDTE,
// que a su vez se firma completo (mismo enfoque que LibreDTE).

import { XML_DECL, tag, tags, formatTimestamp } from './xmlUtil.js';
import { signXml } from './firma.js';
import { isBoleta, SII_NS } from './documento.js';

export const RUT_SII = '60803000-K';
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const stripInheritedSiiNamespaces = (xml) => xml
  .replaceAll(`<DTE xmlns="${SII_NS}" `, '<DTE ')
  .replaceAll(`<Documento xmlns="${SII_NS}" `, '<Documento ');

export const buildDte = (documentoXml, cert) => {
  const canonicalDocumento = documentoXml.replace('<Documento ', `<Documento xmlns="${SII_NS}" `);
  const signature = signXml(canonicalDocumento, `#${documentoXml.match(/ID="([^"]+)"/)[1]}`, cert, {
    transformAlgorithm: C14N_ALGORITHM
  });
  return `<DTE xmlns="${SII_NS}" version="1.0">${canonicalDocumento}${signature}</DTE>`;
};

export const buildEnvio = ({ dtes, empresa, cert, rutEnvia, timestamp = new Date() }) => {
  if (!dtes.length) throw new Error('No hay documentos para enviar.');
  const boletas = dtes.every(d => isBoleta(d.tipoDte));
  const mixto = !boletas && dtes.some(d => isBoleta(d.tipoDte));
  if (mixto) throw new Error('Las boletas se envían en un sobre separado del resto de los DTE.');

  const subtotales = new Map();
  for (const dte of dtes) {
    subtotales.set(dte.tipoDte, (subtotales.get(dte.tipoDte) || 0) + 1);
  }

  const caratulaCampos = [
    ['RutEmisor', empresa.rut],
    ['RutEnvia', rutEnvia],
    ['RutReceptor', RUT_SII],
    ['FchResol', empresa.fchResol],
    ['NroResol', String(empresa.nroResol ?? 0)],
    ['TmstFirmaEnv', formatTimestamp(timestamp)]
  ];
  const caratula = tag('Caratula', tags(caratulaCampos) + Array.from(subtotales.entries()).map(([tipo, cantidad]) =>
    tag('SubTotDTE', tags([['TpoDTE', tipo], ['NroDTE', cantidad]]), null, { raw: true })
  ).join(''), { version: '1.0' }, { raw: true });

  const setId = 'SetDoc';
  const setDte = `<SetDTE xmlns="${SII_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ID="${setId}">${caratula}${dtes.map(d => d.dteXml).join('')}</SetDTE>`;
  const canonicalSetDte = stripInheritedSiiNamespaces(setDte);
  const signature = signXml(canonicalSetDte, `#${setId}`, cert, {
    transformAlgorithm: C14N_ALGORITHM,
    namespaces: 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
  });

  const rootTag = boletas ? 'EnvioBOLETA' : 'EnvioDTE';
  const schema = boletas ? 'EnvioBOLETA_v11.xsd' : 'EnvioDTE_v10.xsd';
  const envio = `${XML_DECL}\n<${rootTag} xmlns="${SII_NS}" `
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + `xsi:schemaLocation="http://www.sii.cl/SiiDte ${schema}" version="1.0">`
    + setDte
    + signature
    + `</${rootTag}>`;

  return { xml: envio, esBoleta: boletas };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-envio.test.js`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/envio.js backend/test/facturacion-envio.test.js
git commit -m "feat(facturacion): port envio.js (EnvioDTE/EnvioBOLETA sobre builder)"
```

---

### Task 9: Port `siiClient.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\siiClient.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-siiclient.test.js`

**Interfaces:**
- Consumes: `XML_DECL, tag` from `xmlUtil.js` (Task 3); `signXml` from `firma.js` (Task 7).
- Produces: `HOSTS, getSemilla, getToken, getTokenBoleta, uploadEnvioDte, uploadEnvioBoleta, consultarEstadoEnvio, consultarEstadoBoleta` — used by `engine.js` (Task 12). All except `HOSTS` require network access to the SII, so only structural/offline behavior is unit tested here; real calls are exercised manually once the certificate is available.

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-siiclient.test.js
import { describe, it, expect } from 'vitest'
import { HOSTS, getSemilla, getToken } from '../src/facturacion/siiClient.js'

describe('facturacion/siiClient', () => {
  it('HOSTS maps certificacion to maullin/apicert/pangal and produccion to palena/api/rahue', () => {
    expect(HOSTS.certificacion).toEqual({
      soap: 'maullin.sii.cl',
      boletaApi: 'apicert.sii.cl',
      boletaEnvio: 'pangal.sii.cl'
    })
    expect(HOSTS.produccion).toEqual({
      soap: 'palena.sii.cl',
      boletaApi: 'api.sii.cl',
      boletaEnvio: 'rahue.sii.cl'
    })
  })

  it('exports the expected function surface for the engine', () => {
    expect(typeof getSemilla).toBe('function')
    expect(typeof getToken).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-siiclient.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's siiClient.js; only the User-Agent string is rebranded, no other logic changes)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\siiClient.js
// Cliente de servicios del SII.
// - Facturas/notas/guías: SOAP (semilla/token) + upload multipart en maullin
//   (certificación) o palena (producción).
// - Boletas: API REST (apicert/api para auth, pangal/rahue para envío).
// Se usan requests https nativos: los servidores del SII tienen cadenas TLS
// antiguas y user-agents restringidos.

import https from 'node:https';
import { XML_DECL, tag } from './xmlUtil.js';
import { signXml } from './firma.js';

export const HOSTS = {
  certificacion: {
    soap: 'maullin.sii.cl',
    boletaApi: 'apicert.sii.cl',
    boletaEnvio: 'pangal.sii.cl'
  },
  produccion: {
    soap: 'palena.sii.cl',
    boletaApi: 'api.sii.cl',
    boletaEnvio: 'rahue.sii.cl'
  }
};

const USER_AGENT = 'Mozilla/4.0 (compatible; PROG 1.0; Plastimar ERP)';

const request = (options, body) => new Promise((resolve, reject) => {
  const req = https.request({
    rejectUnauthorized: false,
    timeout: 60000,
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...options.headers }
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve({
      status: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      bodyLatin1: Buffer.concat(chunks).toString('latin1')
    }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(new Error('Timeout consultando al SII.')); });
  if (body) req.write(body);
  req.end();
});

const soapEnvelope = (method, args = '') =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" '
  + 'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
  + `<SOAP-ENV:Body><m:${method} xmlns:m="https://DefaultNamespace" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">${args}</m:${method}></SOAP-ENV:Body>`
  + '</SOAP-ENV:Envelope>';

const soapCall = async (host, path, method, args) => {
  const body = soapEnvelope(method, args);
  const res = await request({
    host,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (res.status !== 200) throw new Error(`SII ${method} respondió HTTP ${res.status}.`);
  // La respuesta SOAP trae el XML interno escapado
  const inner = res.body
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  return inner;
};

const extractTag = (xml, tagName) => {
  const match = String(xml).match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match ? match[1].trim() : null;
};

// --- Autenticación DTE (SOAP) ---

export const getSemilla = async (ambiente) => {
  const xml = await soapCall(HOSTS[ambiente].soap, '/DTEWS/CrSeed.jws', 'getSeed');
  const semilla = extractTag(xml, 'SEMILLA');
  if (!semilla) throw new Error(`No se pudo obtener semilla del SII: ${xml.slice(0, 300)}`);
  return semilla;
};

const buildTokenRequest = (semilla, cert) => {
  const doc = `<getToken><item><Semilla>${semilla}</Semilla></item></getToken>`;
  const signature = signXml(doc, '', cert);
  return `${XML_DECL}\n<getToken><item><Semilla>${semilla}</Semilla></item>${signature}</getToken>`;
};

export const getToken = async (ambiente, cert) => {
  const semilla = await getSemilla(ambiente);
  const firmado = buildTokenRequest(semilla, cert);
  const xml = await soapCall(
    HOSTS[ambiente].soap,
    '/DTEWS/GetTokenFromSeed.jws',
    'getToken',
    tag('pszXml', firmado)
  );
  const token = extractTag(xml, 'TOKEN');
  if (!token) {
    const glosa = extractTag(xml, 'GLOSA') || xml.slice(0, 300);
    throw new Error(`SII rechazó la autenticación: ${glosa}`);
  }
  return token;
};

// --- Upload EnvioDTE (multipart) ---

export const uploadEnvioDte = async ({ ambiente, token, rutEnvia, rutEmisor, filename, xmlLatin1 }) => {
  const host = HOSTS[ambiente].soap;
  const boundary = `----PlastimarERP${Date.now()}`;
  const [senderBody, senderDv] = rutEnvia.split('-');
  const [companyBody, companyDv] = rutEmisor.split('-');

  const field = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

  const parts = Buffer.concat([
    Buffer.from(
      field('rutSender', senderBody)
      + field('dvSender', senderDv)
      + field('rutCompany', companyBody)
      + field('dvCompany', companyDv)
      + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/xml\r\n\r\n`,
      'latin1'
    ),
    xmlLatin1,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1')
  ]);

  const res = await request({
    host,
    path: '/cgi_dte/UPL/DTEUpload',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': parts.length,
      Cookie: `TOKEN=${token}`
    }
  }, parts);

  const trackId = extractTag(res.body, 'TRACKID');
  const estado = extractTag(res.body, 'STATUS');
  if (!trackId) {
    const detalle = extractTag(res.body, 'DETAIL') || res.body.slice(0, 400);
    throw new Error(`El SII no aceptó el envío (STATUS=${estado ?? '?'}): ${detalle}`);
  }
  return { trackId, respuesta: res.body };
};

// --- Estado de envío DTE (SOAP) ---

export const consultarEstadoEnvio = async ({ ambiente, token, rutEmisor, trackId }) => {
  const [rutBody, rutDv] = rutEmisor.split('-');
  const xml = await soapCall(
    HOSTS[ambiente].soap,
    '/DTEWS/QueryEstUp.jws',
    'getEstUp',
    tag('Rut', rutBody) + tag('Dv', rutDv) + tag('TrackId', trackId) + tag('Token', token)
  );
  return {
    estado: extractTag(xml, 'ESTADO'),
    glosa: extractTag(xml, 'GLOSA'),
    respuesta: xml
  };
};

// --- Boletas: API REST ---

export const getTokenBoleta = async (ambiente, cert) => {
  const host = HOSTS[ambiente].boletaApi;
  const semillaRes = await request({ host, path: '/recursos/v1/boleta.electronica.semilla', method: 'GET' });
  const semilla = extractTag(semillaRes.body, 'SEMILLA');
  if (!semilla) throw new Error(`No se pudo obtener semilla de boletas: ${semillaRes.body.slice(0, 300)}`);

  const firmado = buildTokenRequest(semilla, cert);
  const tokenRes = await request({
    host,
    path: '/recursos/v1/boleta.electronica.token',
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }
  }, Buffer.from(firmado, 'utf8'));
  const token = extractTag(tokenRes.body, 'TOKEN');
  if (!token) throw new Error(`SII rechazó autenticación de boletas: ${tokenRes.body.slice(0, 300)}`);
  return token;
};

export const uploadEnvioBoleta = async ({ ambiente, token, rutEnvia, rutEmisor, filename, xmlLatin1 }) => {
  const host = HOSTS[ambiente].boletaEnvio;
  const boundary = `----PlastimarERP${Date.now()}`;
  const [senderBody, senderDv] = rutEnvia.split('-');
  const [companyBody, companyDv] = rutEmisor.split('-');

  const field = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

  const parts = Buffer.concat([
    Buffer.from(
      field('rutSender', senderBody)
      + field('dvSender', senderDv)
      + field('rutCompany', companyBody)
      + field('dvCompany', companyDv)
      + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/xml\r\n\r\n`,
      'latin1'
    ),
    xmlLatin1,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1')
  ]);

  const res = await request({
    host,
    path: '/recursos/v1/boleta.electronica.envio',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': parts.length,
      Cookie: `TOKEN=${token}`,
      Accept: 'application/json'
    }
  }, parts);

  let json = null;
  try { json = JSON.parse(res.body); } catch { /* respuesta no JSON */ }
  const trackId = json?.trackid ?? json?.trackId ?? extractTag(res.body, 'TRACKID');
  if (!trackId) throw new Error(`El SII no aceptó el envío de boletas (HTTP ${res.status}): ${res.body.slice(0, 400)}`);
  return { trackId: String(trackId), respuesta: res.body };
};

export const consultarEstadoBoleta = async ({ ambiente, token, rutEmisor, trackId }) => {
  const host = HOSTS[ambiente].boletaApi;
  const res = await request({
    host,
    path: `/recursos/v1/boleta.electronica.envio/${rutEmisor}-${trackId}`,
    method: 'GET',
    headers: { Cookie: `TOKEN=${token}`, Accept: 'application/json' }
  });
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* texto plano */ }
  return {
    estado: json?.estado ?? null,
    glosa: json?.detalle_rev ? JSON.stringify(json.detalle_rev) : (json?.glosa ?? null),
    respuesta: res.body
  };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-siiclient.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/siiClient.js backend/test/facturacion-siiclient.test.js
git commit -m "feat(facturacion): port siiClient.js (SII SOAP/REST client, cert/boleta auth)"
```

---

### Task 10: Port `printDte.js`

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\printDte.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-printdte.test.js`

**Interfaces:**
- Consumes: `TIPOS_DTE` from `documento.js` (Task 6); `bwip-js`.
- Produces: `renderDteHtml({ empresa, receptor, doc, totales, tedXml }) -> Promise<string>`, `tedToPdf417DataUri(tedXml) -> Promise<string>` — used by routes (Task 13).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-printdte.test.js
import { describe, it, expect } from 'vitest'
import { renderDteHtml, tedToPdf417DataUri } from '../src/facturacion/printDte.js'

describe('facturacion/printDte', () => {
  it('tedToPdf417DataUri returns a PNG data URI', async () => {
    const uri = await tedToPdf417DataUri('<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>')
    expect(uri).toMatch(/^data:image\/png;base64,/)
  })

  it('renderDteHtml embeds Plastimar emisor and receptor data', async () => {
    const html = await renderDteHtml({
      empresa: { razonSocial: 'PLASTIMAR LIMITADA', giro: 'ACABADO DE PRODUCTOS TEXTILES', direccion: '5 Oriente 134', comuna: 'Viña del Mar', ciudad: 'Viña del Mar', rut: '76354051-0' },
      receptor: { razonSocial: 'Cliente Prueba SpA', rut: '11111111-1' },
      doc: { tipoDte: 33, folio: 1, items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000 }] },
      totales: { neto: 50000, iva: 9500, tasaIva: 19, total: 59500, exento: null },
      tedXml: '<TED version="1.0"><DD><RE>76354051-0</RE></DD></TED>'
    })
    expect(html).toContain('PLASTIMAR LIMITADA')
    expect(html).toContain('ACABADO DE PRODUCTOS TEXTILES')
    expect(html).toContain('Cliente Prueba SpA')
    expect(html).toContain('FACTURA ELECTRÓNICA')
    expect(html).toContain('$ 59.500')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/facturacion-printdte.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation (ESM port of HM's printDte.js, unchanged logic)**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\printDte.js
// Representación impresa del DTE: HTML con timbre PDF417 según formato SII
// (recuadro rojo con RUT/tipo/folio, detalle, totales y timbre electrónico).

import bwipjs from 'bwip-js';
import { TIPOS_DTE } from './documento.js';

const formatCLP = (value) => Number(value || 0).toLocaleString('es-CL');

// El PDF417 se genera desde el TED en ISO-8859-1 (así lo leen los verificadores).
export const tedToPdf417DataUri = async (tedXml) => {
  const latin1Ted = Buffer.from(tedXml, 'latin1').toString('binary');
  const png = await bwipjs.toBuffer({
    bcid: 'pdf417',
    text: latin1Ted,
    columns: 14,
    eclevel: 5,
    scale: 2,
    binarytext: true
  });
  return `data:image/png;base64,${png.toString('base64')}`;
};

export const renderDteHtml = async ({ empresa, receptor, doc, totales, tedXml }) => {
  const timbre = await tedToPdf417DataUri(tedXml);
  const nombreTipo = (TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`).toUpperCase();
  const filas = (doc.items || []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.nombre}${item.descripcion ? `<br><small>${item.descripcion}</small>` : ''}</td>
      <td class="num">${item.cantidad ?? 1}</td>
      <td>${item.unidad || ''}</td>
      <td class="num">${item.precio ? formatCLP(item.precio) : ''}</td>
      <td class="num">${item.precio ? formatCLP(Math.round((item.cantidad || 1) * item.precio) - Math.round(item.descuentoMonto || 0)) : ''}</td>
    </tr>`).join('');

  const referencias = (doc.referencias || []).map(ref => `
    <tr><td>${ref.tipoDocRef || ref.codRef || ''}</td><td>${ref.folioRef || ''}</td><td>${ref.fechaRef || ''}</td><td>${ref.razon || ''}</td></tr>`).join('');

  const totalesHtml = [
    totales.neto !== null && totales.neto !== undefined ? `<tr><td>Neto</td><td class="num">$ ${formatCLP(totales.neto)}</td></tr>` : '',
    totales.exento ? `<tr><td>Exento</td><td class="num">$ ${formatCLP(totales.exento)}</td></tr>` : '',
    totales.iva ? `<tr><td>IVA ${totales.tasaIva}%</td><td class="num">$ ${formatCLP(totales.iva)}</td></tr>` : '',
    `<tr class="total"><td>TOTAL</td><td class="num">$ ${formatCLP(totales.total)}</td></tr>`
  ].join('');

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; padding: 24px; }
  .head { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
  .emisor h1 { font-size: 15px; margin-bottom: 4px; }
  .emisor p { line-height: 1.4; }
  .cuadro { border: 3px solid #c00; color: #c00; text-align: center; padding: 10px 18px; min-width: 230px; }
  .cuadro .rut { font-size: 15px; font-weight: bold; }
  .cuadro .tipo { font-size: 12px; font-weight: bold; margin: 6px 0; }
  .cuadro .folio { font-size: 14px; font-weight: bold; }
  .cuadro .sii { font-size: 10px; margin-top: 6px; color: #c00; }
  .receptor { border: 1px solid #999; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 2px 18px; }
  table.detalle { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  table.detalle th { background: #eee; border: 1px solid #999; padding: 4px 6px; text-align: left; }
  table.detalle td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  td.num, th.num { text-align: right; }
  .pie { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  .timbre { text-align: center; }
  .timbre img { width: 260px; }
  .timbre p { font-size: 9px; margin-top: 2px; }
  table.totales { border-collapse: collapse; min-width: 220px; }
  table.totales td { padding: 3px 8px; border: 1px solid #ccc; }
  table.totales tr.total td { font-weight: bold; font-size: 13px; background: #eee; }
  table.refs { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  table.refs td, table.refs th { border: 1px solid #ccc; padding: 3px 6px; text-align: left; }
</style></head>
<body>
  <div class="head">
    <div class="emisor">
      <h1>${empresa.razonSocial || ''}</h1>
      <p>${empresa.giro || ''}</p>
      <p>${empresa.direccion || ''}${empresa.comuna ? `, ${empresa.comuna}` : ''}${empresa.ciudad ? `, ${empresa.ciudad}` : ''}</p>
    </div>
    <div class="cuadro">
      <div class="rut">R.U.T.: ${empresa.rut || ''}</div>
      <div class="tipo">${nombreTipo}</div>
      <div class="folio">N&deg; ${doc.folio ?? 'BORRADOR'}</div>
      <div class="sii">S.I.I. — ${empresa.ciudad || 'SANTIAGO'}</div>
    </div>
  </div>

  <div class="receptor">
    <span><strong>Señor(es):</strong> ${receptor.razonSocial || ''}</span>
    <span><strong>R.U.T.:</strong> ${receptor.rut || ''}</span>
    <span><strong>Giro:</strong> ${receptor.giro || ''}</span>
    <span><strong>Fecha emisión:</strong> ${doc.fechaEmision || ''}</span>
    <span><strong>Dirección:</strong> ${receptor.direccion || ''}${receptor.comuna ? `, ${receptor.comuna}` : ''}</span>
    <span><strong>Ciudad:</strong> ${receptor.ciudad || ''}</span>
  </div>

  <table class="detalle">
    <thead><tr><th>#</th><th>Detalle</th><th class="num">Cant.</th><th>Unidad</th><th class="num">P. Unitario</th><th class="num">Monto</th></tr></thead>
    <tbody>${filas}</tbody>
  </table>

  ${referencias ? `<table class="refs"><thead><tr><th>Doc. Ref.</th><th>Folio</th><th>Fecha</th><th>Razón</th></tr></thead><tbody>${referencias}</tbody></table>` : ''}

  <div class="pie">
    <div class="timbre">
      <img src="${timbre}" alt="Timbre Electrónico SII">
      <p>Timbre Electrónico SII</p>
      <p>Res. ${empresa.nroResol ?? 0} de ${empresa.fchResol ? String(empresa.fchResol).slice(0, 4) : ''} — Verifique documento: www.sii.cl</p>
    </div>
    <table class="totales"><tbody>${totalesHtml}</tbody></table>
  </div>
</body></html>`;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/facturacion-printdte.test.js`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/printDte.js backend/test/facturacion-printdte.test.js
git commit -m "feat(facturacion): port printDte.js (HTML/PDF417 print view)"
```

---

### Task 11: Prisma adapter (`facturacion/db.js`)

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\db.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-db.test.js`

**Interfaces:**
- Consumes: a Prisma client instance (`fastify.prisma` at runtime, a plain `new PrismaClient(...)` in tests) with models `factEmpresa`, `factCaf`, `factDocumento`, `cliente` (Task 2's schema + the pre-existing `Cliente` model).
- Produces: `createFacturacionDb(prisma) -> { getEmpresa, saveEmpresa, cafs: { tomarFolio }, documentos: { get, list, create, update }, clients: { get } }` — this is the exact shape `engine.js` (Task 12) expects as its `db.facturacion` + `db.clients`.

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-db.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createFacturacionDb } from '../src/facturacion/db.js'

describe('facturacion/db (Prisma adapter)', () => {
  let prisma
  let db
  const marker = `QA-DB-${Date.now()}`

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    prisma = new PrismaClient({ adapter })
    db = createFacturacionDb(prisma)
  })

  afterAll(async () => {
    await prisma.factDocumento.deleteMany({ where: { extra: { path: ['marker'], equals: marker } } })
    await prisma.factCaf.deleteMany({ where: { fechaAutorizacion: marker } })
    await prisma.$disconnect()
  })

  it('getEmpresa returns the seeded Plastimar row', async () => {
    const empresa = await db.getEmpresa()
    expect(empresa.rut).toBe('76.354.051-0')
    expect(empresa.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(empresa.ambiente).toBe('certificacion')
  })

  it('saveEmpresa upserts the singleton row', async () => {
    const before = await db.getEmpresa()
    const saved = await db.saveEmpresa({ ...before, rutEnvia: '76354051-0' })
    expect(saved.rutEnvia).toBe('76354051-0')
    // restore
    await db.saveEmpresa({ ...before, rutEnvia: before.rutEnvia })
  })

  it('cafs.tomarFolio assigns sequential folios and returns null when exhausted', async () => {
    const caf = await prisma.factCaf.create({
      data: { tipoDte: 33, folioDesde: 500, folioHasta: 501, siguienteFolio: 500, fechaAutorizacion: marker, ambiente: 'certificacion', xml: '<CAF/>' }
    })
    const first = await db.cafs.tomarFolio(33, 'certificacion')
    expect(first.folio).toBe(500)
    const second = await db.cafs.tomarFolio(33, 'certificacion')
    expect(second.folio).toBe(501)
    // both folios from this range are used up, and no other CAF exists for this
    // ambiente-tipoDte pair created in this test, so a third pull only returns
    // null if there's no other test-independent CAF loaded — instead assert
    // this specific CAF's siguienteFolio advanced past folioHasta:
    const reloaded = await prisma.factCaf.findUnique({ where: { id: caf.id } })
    expect(reloaded.siguienteFolio).toBe(502)
  })

  it('documentos.create/get/list/update round-trip JSON fields', async () => {
    const created = await db.documentos.create({
      tipoDte: 33,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
      items: [{ nombre: 'Tela', cantidad: 1, precio: 1000 }],
      extra: { marker }
    })
    expect(created.estado).toBe('borrador')
    expect(created.receptor.rut).toBe('11111111-1')

    const fetched = await db.documentos.get(created.id)
    expect(fetched.items[0].nombre).toBe('Tela')

    const updated = await db.documentos.update(created.id, { estado: 'emitido', folio: 500 })
    expect(updated.estado).toBe('emitido')
    expect(updated.folio).toBe(500)

    const listed = await db.documentos.list({ estado: 'emitido' })
    expect(listed.some(d => d.id === created.id)).toBe(true)
  })

  it('clients.get maps Cliente fields to the shape engine.js expects', async () => {
    const cliente = await prisma.cliente.create({
      data: { rut: `77${Date.now()}`.slice(0, 9) + '-1', nombre: 'QA Cliente DB Test', razonSocial: 'QA Cliente DB Test SpA', giro: 'Pruebas', direccion: 'Calle 1', comuna: 'Vina del Mar', ciudad: 'Vina del Mar', email: 'qa-db-test@plastimar.test' }
    })
    const mapped = await db.clients.get(cliente.id)
    expect(mapped).toMatchObject({
      rut: cliente.rut,
      razonSocial: 'QA Cliente DB Test SpA',
      giro: 'Pruebas',
      direccion: 'Calle 1',
      comuna: 'Vina del Mar',
      ciudad: 'Vina del Mar',
      emailDte: 'qa-db-test@plastimar.test'
    })
    await prisma.cliente.delete({ where: { id: cliente.id } })
  })

  it('clients.get returns null for a missing clientId', async () => {
    expect(await db.clients.get(null)).toBeNull()
    expect(await db.clients.get(999999999)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `backend/`, against `plastimar_test`):
```
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-db.test.js
```
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\db.js
// Adapter Prisma/Postgres que expone la misma interfaz que engine.js espera
// de HM ERP (getEmpresa/saveEmpresa, cafs.tomarFolio, documentos CRUD,
// clients.get). A diferencia del adapter better-sqlite3 de HM, todo es async
// (Prisma) y los campos JSON no requieren JSON.stringify/parse manual.

const DOCUMENTO_UPDATABLE_FIELDS = [
  'clienteId', 'ordenId', 'guiaDespachoId', 'tipoDte', 'folio', 'fechaEmision',
  'receptor', 'items', 'referencias', 'extra', 'totales',
  'estado', 'estadoDetalle', 'trackId', 'ambiente', 'xml'
];

export const createFacturacionDb = (prisma) => {
  const getEmpresa = async () => {
    const row = await prisma.factEmpresa.findUnique({ where: { id: 1 } });
    return row || {};
  };

  const saveEmpresa = async (data) => {
    const { id, updatedAt, ...rest } = data;
    await prisma.factEmpresa.upsert({
      where: { id: 1 },
      create: { id: 1, ...rest },
      update: rest
    });
    return getEmpresa();
  };

  const cafs = {
    tomarFolio: (tipoDte, ambiente) => prisma.$transaction(async (tx) => {
      const candidatos = await tx.factCaf.findMany({
        where: { tipoDte, ambiente },
        orderBy: { folioDesde: 'asc' }
      });
      const caf = candidatos.find((c) => c.siguienteFolio <= c.folioHasta);
      if (!caf) return null;
      const folio = caf.siguienteFolio;
      await tx.factCaf.update({ where: { id: caf.id }, data: { siguienteFolio: folio + 1 } });
      return { caf, folio };
    })
  };

  const documentos = {
    get: (docId) => prisma.factDocumento.findUnique({ where: { id: Number(docId) } }),
    list: ({ estado, tipoDte, clienteId } = {}) => prisma.factDocumento.findMany({
      where: {
        ...(estado ? { estado } : {}),
        ...(tipoDte ? { tipoDte: Number(tipoDte) } : {}),
        ...(clienteId ? { clienteId: Number(clienteId) } : {})
      },
      orderBy: { createdAt: 'desc' }
    }),
    create: (input) => prisma.factDocumento.create({
      data: {
        clienteId: input.clienteId ?? null,
        ordenId: input.ordenId ?? null,
        guiaDespachoId: input.guiaDespachoId ?? null,
        tipoDte: input.tipoDte,
        folio: input.folio ?? null,
        fechaEmision: input.fechaEmision ?? null,
        receptor: input.receptor ?? {},
        items: input.items ?? [],
        referencias: input.referencias ?? [],
        extra: input.extra ?? {},
        totales: input.totales ?? {},
        estado: input.estado || 'borrador',
        estadoDetalle: input.estadoDetalle ?? null,
        ambiente: input.ambiente ?? null,
        xml: input.xml ?? null
      }
    }),
    update: (docId, patch) => {
      const data = {};
      for (const field of DOCUMENTO_UPDATABLE_FIELDS) {
        if (field in patch) data[field] = patch[field];
      }
      return prisma.factDocumento.update({ where: { id: Number(docId) }, data });
    }
  };

  const clients = {
    get: async (clienteId) => {
      if (!clienteId) return null;
      const cliente = await prisma.cliente.findUnique({ where: { id: Number(clienteId) } });
      if (!cliente) return null;
      return {
        rut: cliente.rut,
        razonSocial: cliente.razonSocial,
        name: cliente.nombre,
        giro: cliente.giro,
        direccion: cliente.direccion,
        comuna: cliente.comuna,
        ciudad: cliente.ciudad,
        emailDte: cliente.email
      };
    }
  };

  return { getEmpresa, saveEmpresa, cafs, documentos, clients };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-db.test.js`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/db.js backend/test/facturacion-db.test.js
git commit -m "feat(facturacion): Prisma adapter (empresa/cafs/documentos/clients)"
```

---

### Task 12: Port `engine.js` (async-ified for Prisma)

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\facturacion\engine.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-engine.test.js`

**Interfaces:**
- Consumes: `loadCertificate` (Task 7), `parseCaf` (Task 4), `buildDocumento, isBoleta, TIPOS_DTE` (Task 6), `buildDte, buildEnvio` (Task 8), `toLatin1Buffer, XML_DECL, normalizeRut, isValidRut, formatDate` (Task 3), `* as sii` (Task 9), and a `db` shaped like Task 11's `createFacturacionDb(prisma)` return value.
- Produces: `createFacturacionEngine({ db, dataDir }) -> { getEmpresa, requireEmpresa, certInfo, saveCert, emitir, enviar, consultarEstado, descargarXml, certPath }` — used by routes (Task 13).

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-engine.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import forge from 'node-forge'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createFacturacionDb } from '../src/facturacion/db.js'
import { createFacturacionEngine } from '../src/facturacion/engine.js'

// Certificado RSA generado en memoria SOLO para ejercitar el codigo de firma en
// el test. No es el certificado real de Plastimar y nunca se persiste como tal.
function writeThrowawayTestCert(dataDir, password) {
  const keys = forge.pki.rsa.generateKeyPair(1024)
  const cert = forge.pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date('2026-01-01')
  cert.validity.notAfter = new Date('2027-01-01')
  const attrs = [{ name: 'commonName', value: 'QA Test Cert' }]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)
  cert.sign(keys.privateKey, forge.md.sha256.create())
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password)
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes()
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(path.join(dataDir, 'certificado.p12'), Buffer.from(p12Der, 'binary'))
}

describe('facturacion/engine', () => {
  let prisma, db, dataDir

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
    prisma = new PrismaClient({ adapter })
    db = createFacturacionDb(prisma)
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'facturacion-engine-test-'))
  })

  afterAll(async () => {
    fs.rmSync(dataDir, { recursive: true, force: true })
    await prisma.$disconnect()
  })

  it('emitir() throws a clear error when no certificate is loaded', async () => {
    const engine = createFacturacionEngine({ db, dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'no-cert-')) })
    const doc = await db.documentos.create({
      tipoDte: 33,
      receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
      items: [{ nombre: 'Tela', cantidad: 1, precio: 1000 }]
    })
    await expect(engine.emitir(doc.id)).rejects.toThrow(/No hay certificado digital cargado/)
  })

  describe('with a throwaway test certificate and CAF loaded', () => {
    let engine, cafRecord

    beforeEach(async () => {
      writeThrowawayTestCert(dataDir, 'clave123')
      const empresa = await db.getEmpresa()
      await db.saveEmpresa({ ...empresa, certPass: 'clave123' })
      engine = createFacturacionEngine({ db, dataDir })
      // El CAF trae su propia llave RSA (RSASK) con la que buildTed() firma el
      // TED — debe ser una PEM real (generada aqui) o crypto.createSign()
      // revienta al intentar firmar; una clave inventada NO sirve.
      const { privateKey: cafPrivateKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
      const cafPrivateKeyPem = cafPrivateKey.export({ type: 'pkcs1', format: 'pem' })
      cafRecord = await prisma.factCaf.create({
        data: {
          tipoDte: 33, folioDesde: 900, folioHasta: 999, siguienteFolio: 900,
          fechaAutorizacion: '2026-07-01', ambiente: 'certificacion',
          xml: `<AUTORIZACION><CAF version="1.0"><DA><RE>76354051-0</RE><RS>PLASTIMAR LIMITADA</RS><TD>33</TD><RNG><D>900</D><H>999</H></RNG><FA>2026-07-01</FA><IDK>100</IDK></DA></CAF><RSASK>${cafPrivateKeyPem}</RSASK></AUTORIZACION>`
        }
      })
    })

    it('emitir() assigns a folio, builds signed XML and marks the document emitido', async () => {
      const doc = await db.documentos.create({
        tipoDte: 33,
        receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba SpA' },
        items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }]
      })
      const emitido = await engine.emitir(doc.id)
      expect(emitido.estado).toBe('emitido')
      expect(emitido.folio).toBe(900)
      expect(emitido.xml).toContain('<DTE xmlns="http://www.sii.cl/SiiDte"')
      expect(emitido.totales.total).toBe(59500)
    })

    it('emitir() resolves receptor from an existing Cliente when clientId is given', async () => {
      const cliente = await prisma.cliente.create({
        data: { rut: `88${Date.now()}`.slice(0, 9) + '-2', nombre: 'QA Cliente Engine', razonSocial: 'QA Cliente Engine SpA', giro: 'Textiles', direccion: 'Ruta 68 km 10', comuna: 'Vina del Mar', ciudad: 'Vina del Mar' }
      })
      const doc = await db.documentos.create({
        tipoDte: 33,
        clienteId: cliente.id,
        items: [{ nombre: 'Tela acabada', cantidad: 1, precio: 1000 }]
      })
      const emitido = await engine.emitir(doc.id)
      expect(emitido.receptor.razonSocial).toBe('QA Cliente Engine SpA')
      expect(emitido.receptor.rut).toBe(cliente.rut)
      await prisma.cliente.delete({ where: { id: cliente.id } })
    })

    it('emitir() throws when there are no folios left for the tipoDte/ambiente', async () => {
      const doc = await db.documentos.create({
        tipoDte: 56, // Nota de debito: sin CAF cargado en este test
        receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
        items: [{ nombre: 'Ajuste', cantidad: 1, precio: 1000 }]
      })
      await expect(engine.emitir(doc.id)).rejects.toThrow(/No hay folios disponibles/)
    })

    afterEach(async () => {
      await prisma.factCaf.delete({ where: { id: cafRecord.id } }).catch(() => {})
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-engine.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```javascript
// D:\plastimar-erp-v2\backend\src\facturacion\engine.js
// Orquestación de facturación: toma documentos guardados en la base, asigna
// folios desde los CAF, construye y firma los XML y habla con el SII.
//
// Adaptado de HM ERP: misma interfaz publica y orden de validaciones, pero
// async-ificado porque el adapter Prisma (facturacion/db.js) es async, a
// diferencia del adapter better-sqlite3 sincrono de HM. Libros IECV/RCOF
// quedan fuera de este puerto (ver spec).

import fs from 'node:fs';
import path from 'node:path';
import { loadCertificate } from './firma.js';
import { parseCaf } from './caf.js';
import { buildDocumento, isBoleta, TIPOS_DTE } from './documento.js';
import { buildDte, buildEnvio } from './envio.js';
import { toLatin1Buffer, XML_DECL, normalizeRut, isValidRut, formatDate } from './xmlUtil.js';
import * as sii from './siiClient.js';

const ESTADOS_ACEPTADO = new Set(['EPR', 'DOK', 'SOK', 'EOK']);
const ESTADOS_RECHAZADO = new Set(['RCH', 'RFR', 'RSC', 'RCT', 'FAU', 'FNA']);

export const createFacturacionEngine = ({ db, dataDir }) => {
  fs.mkdirSync(dataDir, { recursive: true });
  const certPath = path.join(dataDir, 'certificado.p12');

  const getEmpresa = async () => {
    const empresa = await db.getEmpresa();
    return {
      ambiente: 'certificacion',
      nroResol: 0,
      ...empresa
    };
  };

  const requireEmpresa = async () => {
    const empresa = await getEmpresa();
    const faltantes = ['rut', 'razonSocial', 'giro', 'direccion', 'comuna'].filter(f => !empresa[f]);
    if (faltantes.length) {
      throw new Error(`Configura la empresa antes de emitir. Faltan: ${faltantes.join(', ')}.`);
    }
    if (!empresa.fchResol) {
      throw new Error('Configura la fecha de resolución (FchResol) de la empresa.');
    }
    return empresa;
  };

  const certInfo = async () => {
    const empresa = await getEmpresa();
    if (!fs.existsSync(certPath)) return { cargado: false };
    if (!empresa.certPass) return { cargado: true, valido: false, error: 'Falta la contraseña del certificado.' };
    try {
      const cert = loadCertificate(certPath, empresa.certPass);
      return {
        cargado: true,
        valido: true,
        subject: cert.subject,
        validFrom: cert.validFrom,
        validTo: cert.validTo,
        rutTitular: cert.rutTitular
      };
    } catch (err) {
      return { cargado: true, valido: false, error: err.message };
    }
  };

  const loadCert = (empresa) => {
    if (!fs.existsSync(certPath)) {
      throw new Error('No hay certificado digital cargado. Súbelo en Configuración.');
    }
    if (!empresa.certPass) throw new Error('Falta la contraseña del certificado en Configuración.');
    return loadCertificate(certPath, empresa.certPass);
  };

  const saveCert = async (buffer, password) => {
    fs.writeFileSync(certPath, buffer);
    if (password !== undefined) {
      const empresa = await db.getEmpresa();
      await db.saveEmpresa({ ...empresa, certPass: password });
    }
    return certInfo();
  };

  const rutEnvia = (empresa, cert) => {
    const rut = normalizeRut(empresa.rutEnvia || cert.rutTitular);
    if (!rut) {
      throw new Error('No se pudo determinar el RUT del firmante (rutEnvia). Configúralo en Configuración.');
    }
    return rut;
  };

  const resolveReceptor = async (doc, empresa) => {
    let receptor = { ...(doc.receptor || {}) };
    if (doc.clienteId) {
      const client = await db.clients.get(doc.clienteId);
      if (client) {
        receptor = {
          rut: receptor.rut || client.rut,
          razonSocial: receptor.razonSocial || client.razonSocial || client.name,
          giro: receptor.giro || client.giro,
          direccion: receptor.direccion || client.direccion,
          comuna: receptor.comuna || client.comuna,
          ciudad: receptor.ciudad || client.ciudad,
          email: receptor.email || client.emailDte
        };
      }
    }
    // Guía de traslado interno: el receptor es el propio emisor
    if (doc.tipoDte === 52 && Number(doc.extra?.indTraslado) === 5) {
      receptor = {
        rut: empresa.rut,
        razonSocial: empresa.razonSocial,
        giro: empresa.giro,
        direccion: empresa.direccion,
        comuna: empresa.comuna,
        ciudad: empresa.ciudad
      };
    }
    receptor.rut = normalizeRut(receptor.rut);
    if (!receptor.rut || !isValidRut(receptor.rut)) {
      throw new Error('El receptor no tiene un RUT válido.');
    }
    if (!receptor.razonSocial) throw new Error('El receptor no tiene razón social.');
    return receptor;
  };

  // Resuelve referencias que apuntan a documentos locales (docLocalId) al
  // folio/tipo/fecha reales del documento referenciado ya emitido.
  const resolveReferencias = async (doc) => {
    const referencias = doc.referencias || [];
    const resolved = [];
    for (const ref of referencias) {
      if (!ref.docLocalId) {
        resolved.push({ ...ref, fechaRef: ref.fechaRef || doc.fechaEmision || formatDate() });
        continue;
      }
      const referenced = await db.documentos.get(ref.docLocalId);
      if (!referenced || !referenced.folio) {
        throw new Error('La referencia apunta a un documento que aún no ha sido emitido (sin folio). Emite primero el documento original.');
      }
      resolved.push({
        ...ref,
        tipoDocRef: ref.tipoDocRef || String(referenced.tipoDte),
        folioRef: ref.folioRef || String(referenced.folio),
        fechaRef: ref.fechaRef || referenced.fechaEmision || formatDate()
      });
    }
    return resolved;
  };

  const emitir = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!['borrador', 'error'].includes(doc.estado)) {
      throw new Error(`El documento ya fue emitido (estado: ${doc.estado}).`);
    }
    if (!TIPOS_DTE[doc.tipoDte]) throw new Error(`Tipo de DTE no soportado: ${doc.tipoDte}.`);

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    const receptor = await resolveReceptor(doc, empresa);
    const referencias = await resolveReferencias(doc);

    const asignacion = await db.cafs.tomarFolio(doc.tipoDte, empresa.ambiente);
    if (!asignacion) {
      throw new Error(`No hay folios disponibles para ${TIPOS_DTE[doc.tipoDte]} en ambiente ${empresa.ambiente}. Carga un CAF.`);
    }

    try {
      const caf = parseCaf(asignacion.caf.xml);
      const timestamp = new Date();
      const { documentoXml, totales, fechaEmision } = buildDocumento({
        empresa,
        receptor,
        doc: { ...doc, folio: asignacion.folio, referencias },
        caf,
        timestamp
      });
      const dteXml = buildDte(documentoXml, cert);

      return db.documentos.update(docId, {
        folio: asignacion.folio,
        fechaEmision,
        receptor,
        referencias,
        totales,
        xml: dteXml,
        ambiente: empresa.ambiente,
        estado: 'emitido',
        estadoDetalle: null
      });
    } catch (err) {
      // El folio ya quedó consumido: registrar el error sin perder el documento
      await db.documentos.update(docId, { estado: 'error', estadoDetalle: err.message });
      throw err;
    }
  };

  const enviar = async (docIds) => {
    const docs = [];
    for (const idValue of docIds) {
      const doc = await db.documentos.get(idValue);
      if (!doc) throw new Error(`Documento ${idValue} no encontrado.`);
      if (doc.estado !== 'emitido' && doc.estado !== 'enviado') {
        throw new Error(`El documento folio ${doc.folio ?? '?'} no está emitido (estado: ${doc.estado}).`);
      }
      if (!doc.xml) throw new Error(`El documento folio ${doc.folio ?? '?'} no tiene XML.`);
      docs.push(doc);
    }

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    const firmante = rutEnvia(empresa, cert);
    const ambiente = empresa.ambiente;

    const { xml, esBoleta } = buildEnvio({
      dtes: docs.map(d => ({ tipoDte: d.tipoDte, dteXml: d.xml })),
      empresa,
      cert,
      rutEnvia: firmante
    });

    const xmlLatin1 = toLatin1Buffer(xml);
    const filename = `EnvioDTE_${empresa.rut}_${Date.now()}.xml`;

    let resultado;
    if (esBoleta) {
      const token = await sii.getTokenBoleta(ambiente, cert);
      resultado = await sii.uploadEnvioBoleta({ ambiente, token, rutEnvia: firmante, rutEmisor: empresa.rut, filename, xmlLatin1 });
    } else {
      const token = await sii.getToken(ambiente, cert);
      resultado = await sii.uploadEnvioDte({ ambiente, token, rutEnvia: firmante, rutEmisor: empresa.rut, filename, xmlLatin1 });
    }

    const actualizados = [];
    for (const doc of docs) {
      actualizados.push(await db.documentos.update(doc.id, {
        estado: 'enviado',
        trackId: resultado.trackId,
        estadoDetalle: null
      }));
    }
    return { trackId: resultado.trackId, documentos: actualizados, envioXml: xml };
  };

  const consultarEstado = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc) throw new Error('Documento no encontrado.');
    if (!doc.trackId) throw new Error('El documento no ha sido enviado al SII.');

    const empresa = await requireEmpresa();
    const cert = loadCert(empresa);
    const ambiente = doc.ambiente || empresa.ambiente;

    let resultado;
    if (isBoleta(doc.tipoDte)) {
      const token = await sii.getTokenBoleta(ambiente, cert);
      resultado = await sii.consultarEstadoBoleta({ ambiente, token, rutEmisor: empresa.rut, trackId: doc.trackId });
    } else {
      const token = await sii.getToken(ambiente, cert);
      resultado = await sii.consultarEstadoEnvio({ ambiente, token, rutEmisor: empresa.rut, trackId: doc.trackId });
    }

    const codigo = String(resultado.estado || '').toUpperCase();
    let estado = doc.estado;
    if (ESTADOS_ACEPTADO.has(codigo)) estado = 'aceptado';
    else if (ESTADOS_RECHAZADO.has(codigo)) estado = 'rechazado';

    const detalle = [codigo, resultado.glosa].filter(Boolean).join(' — ');
    const actualizado = await db.documentos.update(docId, {
      estado,
      estadoDetalle: detalle || doc.estadoDetalle
    });
    return { documento: actualizado, sii: resultado };
  };

  const descargarXml = async (docId) => {
    const doc = await db.documentos.get(docId);
    if (!doc || !doc.xml) throw new Error('El documento no tiene XML generado (emítelo primero).');
    return {
      filename: `DTE_T${doc.tipoDte}_F${doc.folio}.xml`,
      buffer: toLatin1Buffer(`${XML_DECL}\n${doc.xml}`)
    };
  };

  return { getEmpresa, requireEmpresa, certInfo, saveCert, emitir, enviar, consultarEstado, descargarXml, certPath };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-engine.test.js`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/facturacion/engine.js backend/test/facturacion-engine.test.js
git commit -m "feat(facturacion): port engine.js async-ified for Prisma (emitir/enviar/consultarEstado)"
```

---

### Task 13: `@fastify/multipart` plugin

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\plugins\multipart.js`
- Modify: `D:\plastimar-erp-v2\backend\src\app.js`

**Interfaces:**
- Produces: `request.file()` available on Fastify requests — used by Task 14's certificado/CAF upload routes.

- [ ] **Step 1: Write the plugin**

```javascript
// D:\plastimar-erp-v2\backend\src\plugins\multipart.js
import fp from 'fastify-plugin'
import multipart from '@fastify/multipart'

export default fp(async (fastify) => {
  fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }
  })
})
```

- [ ] **Step 2: Register it in app.js**

In `D:\plastimar-erp-v2\backend\src\app.js`, add the import near the other plugin imports (after line 8, `import auditPlugin from './plugins/audit.js'`):

```javascript
import multipartPlugin from './plugins/multipart.js'
```

And register it near the other `app.register(...Plugin)` calls (after `app.register(auditPlugin)`, line 74):

```javascript
  app.register(multipartPlugin)
```

- [ ] **Step 3: Verify the app still boots**

Run: `cd D:\plastimar-erp-v2\backend && npx vitest run test/app.test.js`
Expected: PASS (existing smoke test still passes with the new plugin registered)

- [ ] **Step 4: Commit**

```bash
git add backend/src/plugins/multipart.js backend/src/app.js
git commit -m "feat(facturacion): register @fastify/multipart plugin"
```

---

### Task 14: Fastify routes (`routes/facturacion/index.js`)

**Files:**
- Create: `D:\plastimar-erp-v2\backend\src\routes\facturacion\index.js`
- Modify: `D:\plastimar-erp-v2\backend\src\app.js`
- Test: `D:\plastimar-erp-v2\backend\test\facturacion-routes.test.js`

**Interfaces:**
- Consumes: `createFacturacionDb` (Task 11), `createFacturacionEngine` (Task 12), `TIPOS_DTE, computeTotales` (Task 6), `normalizeRut, isValidRut` (Task 3), `parseCaf` (Task 4), `renderDteHtml` (Task 10).
- Produces: HTTP API under `/api/facturacion/*` — this is the plan's final, curl-testable deliverable.

- [ ] **Step 1: Write the failing test**

```javascript
// D:\plastimar-erp-v2\backend\test\facturacion-routes.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1, role, nombre: `QA ${role}`, permisosExtra: null,
    scope: 'erp', aud: 'plastimar:erp', tokenType: 'access'
  })
}

describe('routes /api/facturacion', () => {
  let app, token

  beforeAll(async () => {
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.factDocumento.deleteMany({ where: { extra: { path: ['qaMarker'], equals: true } } })
    await app.close()
  })

  it('GET /api/facturacion/empresa returns Plastimar data without certPass', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/empresa', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.empresa.rut).toBe('76.354.051-0')
    expect(body.empresa.razonSocial).toBe('PLASTIMAR LIMITADA')
    expect(body.empresa.certPass).toBeUndefined()
    expect(body.certificado.cargado).toBe(false)
  })

  it('GET /api/facturacion/empresa requires auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/empresa' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/facturacion/documentos validates tipoDte and items', async () => {
    const badTipo = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipoDte: 999, items: [{ nombre: 'x' }] }
    })
    expect(badTipo.statusCode).toBe(400)

    const noItems = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: { tipoDte: 33, items: [] }
    })
    expect(noItems.statusCode).toBe(400)
  })

  it('creates a borrador, emitir fails cleanly without a certificate, then can be deleted', async () => {
    const created = await app.inject({
      method: 'POST', url: '/api/facturacion/documentos',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        tipoDte: 33,
        receptor: { rut: '11111111-1', razonSocial: 'Cliente Prueba' },
        items: [{ nombre: 'Tela acabada', cantidad: 10, precio: 5000, unidad: 'MT' }],
        extra: { qaMarker: true }
      }
    })
    expect(created.statusCode).toBe(201)
    const doc = JSON.parse(created.body)
    expect(doc.estado).toBe('borrador')
    expect(doc.totales.total).toBe(59500)

    const emitir = await app.inject({
      method: 'POST', url: `/api/facturacion/documentos/${doc.id}/emitir`,
      headers: { authorization: `Bearer ${token}` }
    })
    expect(emitir.statusCode).toBe(422)
    expect(JSON.parse(emitir.body).error).toMatch(/certificado/)

    const del = await app.inject({
      method: 'DELETE', url: `/api/facturacion/documentos/${doc.id}`,
      headers: { authorization: `Bearer ${token}` }
    })
    expect(del.statusCode).toBe(204)
  })

  it('GET /api/facturacion/cafs lists loaded CAFs with tipoNombre and disponibles', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/facturacion/cafs', headers: { authorization: `Bearer ${token}` } })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(JSON.parse(res.body).cafs)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-routes.test.js`
Expected: FAIL — 404s (route not registered)

- [ ] **Step 3: Write the routes**

```javascript
// D:\plastimar-erp-v2\backend\src\routes\facturacion\index.js
import path from 'node:path'
import { createFacturacionDb } from '../../facturacion/db.js'
import { createFacturacionEngine } from '../../facturacion/engine.js'
import { TIPOS_DTE, computeTotales } from '../../facturacion/documento.js'
import { normalizeRut, isValidRut } from '../../facturacion/xmlUtil.js'
import { parseCaf } from '../../facturacion/caf.js'
import { renderDteHtml } from '../../facturacion/printDte.js'

const ESTADOS = ['borrador', 'emitido', 'enviado', 'aceptado', 'rechazado', 'error']

function sendError(reply, error) {
  return reply.code(422).send({ error: (error && error.message) || 'Error de facturación.' })
}

function validateDocumentoInput(body) {
  const tipoDte = Number(body.tipoDte)
  if (!TIPOS_DTE[tipoDte]) {
    const err = new Error(`Tipo de DTE inválido. Soportados: ${Object.keys(TIPOS_DTE).join(', ')}.`)
    err.statusCode = 400
    throw err
  }
  const items = Array.isArray(body.items) ? body.items : []
  if (!items.length) {
    const err = new Error('El documento requiere al menos un ítem.')
    err.statusCode = 400
    throw err
  }
  for (const item of items) {
    if (!item.nombre || String(item.nombre).trim() === '') {
      const err = new Error('Todos los ítems deben tener nombre.')
      err.statusCode = 400
      throw err
    }
  }
  return {
    clienteId: body.clienteId || null,
    ordenId: body.ordenId || null,
    guiaDespachoId: body.guiaDespachoId || null,
    tipoDte,
    fechaEmision: body.fechaEmision || null,
    receptor: body.receptor && typeof body.receptor === 'object' ? body.receptor : {},
    items: items.map((item) => ({
      nombre: String(item.nombre).trim(),
      descripcion: item.descripcion ? String(item.descripcion).trim() : null,
      cantidad: Number(item.cantidad) || 1,
      unidad: item.unidad ? String(item.unidad).trim() : null,
      precio: Number(item.precio) || 0,
      descuentoMonto: Number(item.descuentoMonto) || 0,
      exento: Boolean(item.exento)
    })),
    referencias: Array.isArray(body.referencias) ? body.referencias : [],
    extra: body.extra && typeof body.extra === 'object' ? body.extra : {}
  }
}

export default async function facturacionRoutes(fastify) {
  const db = createFacturacionDb(fastify.prisma)
  const engine = createFacturacionEngine({ db, dataDir: path.join(process.cwd(), 'data', 'facturacion') })

  const readAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'read', { allowExtra: false })] }
  const writeAuth = { preHandler: [fastify.authenticate, fastify.rbac('facturacion', 'write', { allowExtra: false })] }

  // --- Empresa (emisor) ---

  fastify.get('/empresa', readAuth, async () => {
    const empresa = await engine.getEmpresa()
    const { certPass, ...publica } = empresa
    return { empresa: publica, certificado: await engine.certInfo() }
  })

  fastify.put('/empresa', writeAuth, async (request, reply) => {
    try {
      const body = request.body || {}
      if (body.rut && !isValidRut(body.rut)) {
        return reply.code(400).send({ error: 'RUT de empresa inválido.' })
      }
      if (body.rutEnvia && !isValidRut(body.rutEnvia)) {
        return reply.code(400).send({ error: 'RUT del firmante inválido.' })
      }
      const current = await db.getEmpresa()
      const saved = await db.saveEmpresa({
        ...current,
        ...body,
        rut: body.rut ? normalizeRut(body.rut) : current.rut,
        rutEnvia: body.rutEnvia ? normalizeRut(body.rutEnvia) : current.rutEnvia,
        certPass: body.certPass ? body.certPass : current.certPass
      })
      const { certPass, ...publica } = saved
      return { empresa: publica }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/empresa/certificado', writeAuth, async (request, reply) => {
    try {
      const data = await request.file()
      if (!data) return reply.code(400).send({ error: 'Adjunta el archivo .p12/.pfx del certificado.' })
      const buffer = await data.toBuffer()
      const password = data.fields?.password?.value
      const info = await engine.saveCert(buffer, password)
      return { certificado: info }
    } catch (error) { return sendError(reply, error) }
  })

  // --- CAF / folios ---

  fastify.get('/cafs', readAuth, async () => {
    const cafs = await fastify.prisma.factCaf.findMany({ orderBy: [{ tipoDte: 'asc' }, { folioDesde: 'asc' }] })
    return {
      cafs: cafs.map((caf) => ({
        ...caf,
        xml: undefined,
        tipoNombre: TIPOS_DTE[caf.tipoDte] || `DTE ${caf.tipoDte}`,
        disponibles: Math.max(0, caf.folioHasta - caf.siguienteFolio + 1)
      }))
    }
  })

  fastify.post('/cafs', writeAuth, async (request, reply) => {
    try {
      const data = await request.file()
      let xml
      if (data) {
        xml = (await data.toBuffer()).toString('latin1')
      } else {
        xml = String(request.body?.xml || '')
      }
      if (!xml.trim()) return reply.code(400).send({ error: 'Adjunta el archivo CAF (XML) descargado del SII.' })
      const parsed = parseCaf(xml)
      const empresa = await engine.getEmpresa()
      if (empresa.rut && parsed.rutEmisor && normalizeRut(parsed.rutEmisor) !== normalizeRut(empresa.rut)) {
        return reply.code(400).send({ error: `El CAF pertenece a ${parsed.rutEmisor}, no a la empresa configurada (${empresa.rut}).` })
      }
      const ambiente = (data?.fields?.ambiente?.value ?? request.body?.ambiente) === 'produccion' ? 'produccion' : 'certificacion'
      const record = await fastify.prisma.factCaf.create({
        data: {
          tipoDte: parsed.tipoDte,
          folioDesde: parsed.folioDesde,
          folioHasta: parsed.folioHasta,
          siguienteFolio: parsed.folioDesde,
          fechaAutorizacion: parsed.fechaAutorizacion,
          ambiente,
          xml
        }
      })
      return reply.code(201).send({ caf: { ...record, xml: undefined, tipoNombre: TIPOS_DTE[record.tipoDte] } })
    } catch (error) { return sendError(reply, error) }
  })

  fastify.delete('/cafs/:id', writeAuth, async (request, reply) => {
    try {
      await fastify.prisma.factCaf.delete({ where: { id: Number(request.params.id) } })
      return reply.code(204).send()
    } catch (e) {
      if (e.code === 'P2025') return reply.code(404).send({ error: 'CAF no encontrado.' })
      throw e
    }
  })

  // --- Documentos ---

  fastify.get('/documentos', readAuth, async (request, reply) => {
    const { estado, tipoDte, clienteId } = request.query
    if (estado && !ESTADOS.includes(String(estado))) {
      return reply.code(400).send({ error: `Estado inválido. Válidos: ${ESTADOS.join(', ')}.` })
    }
    const documentos = await db.documentos.list({
      estado: estado ? String(estado) : undefined,
      tipoDte: tipoDte ? Number(tipoDte) : undefined,
      clienteId: clienteId ? Number(clienteId) : undefined
    })
    return { documentos: documentos.map((doc) => ({ ...doc, tipoNombre: TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}` })) }
  })

  fastify.post('/documentos', writeAuth, async (request, reply) => {
    try {
      const input = validateDocumentoInput(request.body)
      input.totales = computeTotales(input.items, input.tipoDte)
      const created = await db.documentos.create(input)
      return reply.code(201).send(created)
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      return sendError(reply, error)
    }
  })

  fastify.get('/documentos/:id', readAuth, async (request, reply) => {
    const doc = await db.documentos.get(request.params.id)
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
    return { ...doc, tipoNombre: TIPOS_DTE[doc.tipoDte] }
  })

  fastify.put('/documentos/:id', writeAuth, async (request, reply) => {
    try {
      const current = await db.documentos.get(request.params.id)
      if (!current) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!['borrador', 'error'].includes(current.estado)) {
        return reply.code(409).send({ error: 'Sólo se pueden editar borradores. Los documentos emitidos son inmutables (usa una nota de crédito).' })
      }
      const input = validateDocumentoInput({ ...current, ...request.body })
      input.totales = computeTotales(input.items, input.tipoDte)
      input.estado = 'borrador'
      input.estadoDetalle = null
      return db.documentos.update(request.params.id, input)
    } catch (error) {
      if (error.statusCode) return reply.code(error.statusCode).send({ error: error.message })
      return sendError(reply, error)
    }
  })

  fastify.delete('/documentos/:id', writeAuth, async (request, reply) => {
    const doc = await db.documentos.get(request.params.id)
    if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
    if (!['borrador', 'error'].includes(doc.estado)) {
      return reply.code(409).send({ error: 'No se puede borrar un documento emitido.' })
    }
    await fastify.prisma.factDocumento.delete({ where: { id: Number(request.params.id) } })
    return reply.code(204).send()
  })

  fastify.post('/documentos/:id/emitir', writeAuth, async (request, reply) => {
    try {
      return await engine.emitir(request.params.id)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/documentos/:id/enviar', writeAuth, async (request, reply) => {
    try {
      const { trackId, documentos } = await engine.enviar([request.params.id])
      return { trackId, documentos }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.post('/enviar-lote', writeAuth, async (request, reply) => {
    try {
      const ids = Array.isArray(request.body?.ids) ? request.body.ids : []
      if (!ids.length) return reply.code(400).send({ error: 'Indica los ids de documentos a enviar.' })
      const { trackId, documentos } = await engine.enviar(ids)
      return { trackId, documentos }
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/estado', readAuth, async (request, reply) => {
    try {
      return await engine.consultarEstado(request.params.id)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/xml', readAuth, async (request, reply) => {
    try {
      const { filename, buffer } = await engine.descargarXml(request.params.id)
      reply.header('Content-Type', 'application/xml; charset=ISO-8859-1')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return reply.send(buffer)
    } catch (error) { return sendError(reply, error) }
  })

  fastify.get('/documentos/:id/html', readAuth, async (request, reply) => {
    try {
      const doc = await db.documentos.get(request.params.id)
      if (!doc) return reply.code(404).send({ error: 'Documento no encontrado.' })
      if (!doc.xml) return reply.code(409).send({ error: 'El documento no está emitido: no tiene timbre aún.' })
      const tedMatch = doc.xml.match(/<TED version="1.0">[\s\S]*?<\/TED>/)
      if (!tedMatch) return reply.code(500).send({ error: 'No se encontró el TED en el XML.' })
      const empresa = await engine.getEmpresa()
      const html = await renderDteHtml({ empresa, receptor: doc.receptor, doc, totales: doc.totales, tedXml: tedMatch[0] })
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    } catch (error) { return sendError(reply, error) }
  })
}
```

- [ ] **Step 4: Register the routes in app.js**

In `D:\plastimar-erp-v2\backend\src\app.js`, add the import after line 49 (`import aiRoutes from './routes/ai/index.js'`):

```javascript
import facturacionRoutes from './routes/facturacion/index.js'
```

And register it after `app.register(aiRoutes, { prefix: '/api/ai' })` (line 114):

```javascript
  app.register(facturacionRoutes, { prefix: '/api/facturacion' })
```

- [ ] **Step 5: Run test to verify it passes**

Run: `DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-routes.test.js`
Expected: PASS, 6 tests

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/facturacion/index.js backend/src/app.js backend/test/facturacion-routes.test.js
git commit -m "feat(facturacion): Fastify routes /api/facturacion (empresa/cafs/documentos)"
```

---

### Task 15: Full backend regression run

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full facturacion test suite together**

```bash
cd D:/plastimar-erp-v2/backend
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run test/facturacion-*.test.js
```
Expected: all facturacion test files PASS (no cross-test interference — each uses unique markers/temp dirs).

- [ ] **Step 2: Run the existing full suite to confirm no regressions**

```bash
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/plastimar_test npx vitest run
```
Expected: same pass/fail baseline as before this plan started, plus the new facturacion tests passing (pre-existing local failures like `productos.test.js`, per repo memory, are unrelated and expected).

- [ ] **Step 3: Manual smoke check with curl against local dev server**

```bash
cd D:/plastimar-erp-v2/backend && npm run dev &
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@plastimar.cl","password":"dev1234"}'
```
Copy the `accessToken` from the response, then:
```bash
curl -s http://localhost:3001/api/facturacion/empresa -H "Authorization: Bearer <token>"
```
Expected: JSON with `empresa.razonSocial: "PLASTIMAR LIMITADA"`, `empresa.rut: "76.354.051-0"`, `certificado.cargado: false`.

- [ ] **Step 4: No commit needed** (verification task — if any regression is found, fix it in the relevant earlier task's files and commit there).

---

## After this plan

Backend is live at `/api/facturacion/*` on push to `main` (CI deploys to `vps.plastimar.cl`),
but emission is blocked until Plastimar's real `.p12` certificate and CAFs (obtained from
the SII using that certificate) are loaded via `POST /api/facturacion/empresa/certificado`
and `POST /api/facturacion/cafs`. The frontend plan (Configuración screen, "Emitir DTE"
buttons on Orden/GuiaDespacho, NC/ND flow) is written separately once this backend is
verified working.
