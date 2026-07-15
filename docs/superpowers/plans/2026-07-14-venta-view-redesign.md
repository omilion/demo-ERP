# Vista de Venta — Rediseño Layout 2 Columnas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el layout de tabs (Detalle/Taller/Pagos/Documentos) de `ViewVentaPanel` en `variant="page"` por un layout de 2 columnas inspirado en el ERP legacy (sisgestion PHP), con acciones que hoy existen en el backend pero no están conectadas desde esta pantalla (Anular Venta, Notificar Taller relabeleado, Nota de Venta) y un widget nuevo para agregar productos por código de barra/interno sin salir a Editar.

**Architecture:** Todo el trabajo es frontend, un solo archivo (`frontend/src/components/forms/ViewVentaPanel.jsx`). Se agregan componentes locales nuevos (widget de agregar producto, badge de total, barra de operaciones, lista de documentos+pagos) y se reescribe solo la rama `variant === 'page'` del render principal. La rama `variant === 'drawer'` (sin uso actual — ninguna página la invoca) y los componentes `TabDetalle`/`TabTaller`/`TabPagos`/`TabDocumentos` que la sirven quedan **intactos, sin tocar** — el layout nuevo no los reutiliza (evita el riesgo de refactorizar código compartido que además está huérfano), acepta algo de duplicación de JSX entre la rama vieja (drawer) y la nueva (page), consistente con cómo ya conviven `fmt`/`discountAmount`/`discountLabel` duplicados entre `ViewVentaPanel.jsx` y `VentaPrintPage.jsx` en este mismo proyecto.

**Tech Stack:** React 19, TanStack Query (hooks ya existentes en `api/ventas.js` y `api/productos.js`), sin Prisma/backend nuevo, sin infraestructura de testing nueva (proyecto sin convención de tests de componentes — ver Global Constraints).

## Global Constraints

- **Cero cambios de backend.** Todos los endpoints usados ya existen: `PUT /api/ventas/:id` (hook `useUpdateVenta`), `POST /api/ventas/:id/anular` (`useAnularVenta`), `POST /api/ventas/:id/activar` (`useActivarVenta`), `POST /api/ventas/:id/forzar-taller` (`useForzarTaller`), `GET /api/productos?codigoBarra=`/`?codigoInterno=` (`useProductos`). No crear ni modificar rutas backend, no correr migraciones.
- **Sin tests de componentes nuevos.** El proyecto no tiene convención de testing de componentes React (`frontend/src/__tests__` solo tiene `md-render.test.jsx`; `Table.test.jsx` es la única excepción, testea un componente compartido de bajo nivel, no páginas). Cada tarea termina en verificación manual + `npm run build` + `npm run lint` limpios, no en un test automatizado nuevo. Documentado y aprobado en el spec (`docs/superpowers/specs/2026-07-14-venta-view-redesign-design.md`, sección Testing).
- **Solo `variant === 'page'`.** No modificar la rama `variant === 'drawer'` ni los componentes `TabDetalle`, `TabTaller`, `TabPagos`, `TabDocumentos`, `TabBtn` — quedan como están, íntegros.
- **Duplicación de datos, no de red.** Todos los datos que usan los componentes nuevos (`v`, `pagos`, `dtes`, `odts`, `canWriteFacturacion`, etc.) ya están calculados una sola vez en `ViewVentaPanel` (líneas 479-493 del archivo actual) — los componentes nuevos los reciben como props, no hacen fetch propio (excepto `AgregarProductoWidget`, que sí necesita su propio `useProductos` para la búsqueda en vivo).
- **Paleta de colores:** usar las variables CSS ya existentes en el archivo (`var(--green-900)`, `var(--blue)`, `var(--amber)`, `var(--red)`, `var(--text-1)`, `var(--text-2)`, `var(--text-3)`, `var(--border)`, `var(--bg)`) — no introducir colores hardcodeados nuevos salvo que no exista variable equivalente.

---

### Task 1: Helpers de precio + widget "Agregar producto"

**Files:**
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx` (agregar cerca del final del archivo, después de `dteLink` en la línea 468, antes de la sección `// ── Main panel ──`)

**Interfaces:**
- Consumes: `useProductos` de `../../api/productos` (ya existe, firma `useProductos(params)` → `{ data }` donde `data.items` es el array de productos, soporta `{ codigoBarra }` match exacto y `{ codigoInterno }` contains — confirmado en `backend/src/routes/productos/list.js:136-137`), `useUpdateVenta` de `../../api/ventas` (firma `mutate({ id, data })`), `toast` de `../../store/notif`.
- Produces: componente `AgregarProductoWidget({ venta, items, canWrite })` — no expone hooks propios, se usa solo dentro de este archivo.

- [ ] **Step 1: Agregar los helpers de precio y el componente `AgregarProductoWidget`**

Insertar este bloque completo en `frontend/src/components/forms/ViewVentaPanel.jsx`, inmediatamente después de la línea `const dteLink = color => ({ ... })` (línea 468 actual):

```jsx
// ── Widget: Agregar producto por código ─────────────────────────────────────────
function isConvenioMarco(tipo) {
  return normalizeText(tipo) === 'convenio marco'
}

function defaultPrecioUnitario(producto, tipoVenta) {
  if (!isConvenioMarco(tipoVenta)) return Number(producto.consultaPrecios?.precioNormalSalaVentaIva ?? producto.precioLista ?? 0)
  const precioMarco = Number(producto.consultaPrecios?.precioConvMarco ?? producto.precioMarco ?? producto.precioLista ?? 0)
  return precioMarco > 0 ? Math.round(precioMarco * 1.19) : 0
}

function AgregarProductoWidget({ venta, items, canWrite }) {
  const [codigoBarra, setCodigoBarra] = useState('')
  const [codigoInterno, setCodigoInterno] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const updateVenta = useUpdateVenta()
  const barraRef = useRef(null)

  const puedeAgregar = canWrite && venta.estadoPago === 'No pagada' && venta.estado === 'Activa'

  const { data: porBarra } = useProductos(codigoBarra.length >= 3 ? { codigoBarra } : {})
  const { data: porInterno } = useProductos(codigoInterno.length >= 2 ? { codigoInterno } : {})

  if (!puedeAgregar) return null

  const agregarProducto = (producto) => {
    if (!producto) return
    const cant = Math.max(1, Number(cantidad) || 1)
    const existente = items.find(i => i.productoId === producto.id)
    const nuevosItems = existente
      ? items.map(i => i.productoId === producto.id ? { ...i, cantidad: i.cantidad + cant } : i)
      : [...items, {
          productoId: producto.id,
          cantidad: cant,
          precioUnitario: defaultPrecioUnitario(producto, venta.tipo),
          nombre: producto.nombre,
          codigoInterno: producto.codigoInterno || '',
        }]
    updateVenta.mutate(
      { id: venta.id, data: { items: nuevosItems.map(({ productoId, cantidad, precioUnitario, nombre, descripcion, codigoInterno }) => ({ productoId, cantidad, precioUnitario, nombre, descripcion, codigoInterno })) } },
      {
        onSuccess: () => {
          toast.success(`${producto.nombre} agregado (x${cant}).`)
          setCodigoBarra('')
          setCodigoInterno('')
          setCantidad(1)
          barraRef.current?.focus()
        },
        onError: err => toast.error(err?.response?.data?.error || 'No se pudo agregar el producto.'),
      }
    )
  }

  const matchBarra = codigoBarra.length >= 3 ? (porBarra?.items || [])[0] : null
  const matchInterno = codigoInterno.length >= 2 ? (porInterno?.items || []) : []

  return (
    <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
      <FormDivider label="Agregar producto" />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input
          type="number" min="1" value={cantidad}
          onChange={e => setCantidad(e.target.value)}
          style={{ width: 60, padding: '7px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
        <input
          ref={barraRef}
          type="text" value={codigoBarra}
          onChange={e => setCodigoBarra(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && matchBarra) agregarProducto(matchBarra) }}
          placeholder="Código de barra..."
          autoFocus
          style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13 }}
        />
      </div>
      {codigoBarra.length >= 3 && !matchBarra && (
        <div style={{ fontSize: 11, color: 'var(--red)', marginBottom: 8 }}>Código de barra no encontrado.</div>
      )}
      <input
        type="text" value={codigoInterno}
        onChange={e => setCodigoInterno(e.target.value)}
        placeholder="...o código interno / nombre"
        style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, marginBottom: 8 }}
      />
      {matchInterno.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', maxHeight: 160, overflowY: 'auto' }}>
          {matchInterno.slice(0, 6).map(p => (
            <button
              key={p.id}
              onClick={() => agregarProducto(p)}
              disabled={updateVenta.isPending}
              style={{ display: 'flex', justifyContent: 'space-between', width: '100%', padding: '7px 10px', background: '#fff', border: 'none', borderTop: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, textAlign: 'left' }}
            >
              <span>{p.nombre} <span style={{ color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>({p.codigoInterno})</span></span>
              <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(defaultPrecioUnitario(p, venta.tipo))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Agregar los imports que este bloque necesita**

En el bloque de imports del archivo (arriba del todo), agregar `useRef` al import existente de React y agregar los 2 imports nuevos:

Cambiar la línea 2 de:
```jsx
import { useState } from 'react'
```
a:
```jsx
import { useRef, useState } from 'react'
```

Agregar después de la línea `import { useVenta, useDeleteVenta, useForzarTaller } from '../../api/ventas'` (línea 6):
```jsx
import { useUpdateVenta } from '../../api/ventas'
import { useProductos } from '../../api/productos'
```

- [ ] **Step 3: Verificar que compila**

Run: `cd D:\plastimar-erp-v2\frontend && npm run build`
Expected: build exitoso, sin errores de módulo no encontrado ni de sintaxis (el componente aún no se usa en ningún render, así que no debe cambiar nada visualmente todavía — solo confirma que el código nuevo parsea y los imports existen).

- [ ] **Step 4: Commit**

```bash
cd D:\plastimar-erp-v2 && git add frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat(ventas): widget agregar producto por codigo barra/interno en ViewVentaPanel"
```

---

### Task 2: Badge de total prominente

**Files:**
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx` (agregar justo después del bloque de `AgregarProductoWidget` del Task 1)

**Interfaces:**
- Consumes: nada nuevo (usa `fmt`, ya definido en el archivo línea 13).
- Produces: componente `TotalBadge({ total })`.

- [ ] **Step 1: Agregar el componente**

```jsx
// ── Total grande ──────────────────────────────────────────────────────────────
function TotalBadge({ total }) {
  return (
    <div style={{
      background: 'var(--green-900)', color: '#fff', borderRadius: 10,
      padding: '10px 20px', fontSize: 26, fontWeight: 800,
      fontFamily: "'DM Mono',monospace", letterSpacing: -0.5,
      boxShadow: '0 4px 14px oklch(0 0 0 / .18)',
    }}>
      TOTAL {fmt(total)}
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd D:\plastimar-erp-v2\frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
cd D:\plastimar-erp-v2 && git add frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat(ventas): componente TotalBadge para vista de venta"
```

---

### Task 3: Barra de "Operaciones Disponibles"

**Files:**
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx` (agregar después de `TotalBadge` del Task 2)

**Interfaces:**
- Consumes: `useAnularVenta`, `useActivarVenta` de `../../api/ventas` (ya existen, firma `mutate(id)`); `confirmDialog` de `../../store/notif` (ya se usa en otros archivos del proyecto con firma `await confirmDialog({ title, detail, tone })` → `Promise<boolean>`, agregar el import).
- Produces: componente `OperacionesDisponibles({ v, odtsCount, guiasCount, handleForzarTaller, forzarTallerMut, canEmitirDte, onEmitirDte, canDelete })`.

- [ ] **Step 1: Agregar el import de `confirmDialog`**

Cambiar la línea 1 de:
```jsx
import { toast } from '../../store/notif'
```
a:
```jsx
import { toast, confirmDialog } from '../../store/notif'
```

- [ ] **Step 2: Agregar el componente**

```jsx
// ── Operaciones disponibles ──────────────────────────────────────────────────
function opBtnStyle(color) {
  return {
    width: '100%', padding: '11px 14px', fontSize: 13, fontWeight: 600,
    color: '#fff', background: color, border: 'none', borderRadius: 8,
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 8, transition: 'opacity 0.1s',
  }
}

function OperacionesDisponibles({ v, odtsCount, guiasCount, handleForzarTaller, forzarTallerMut, canEmitirDte, onEmitirDte, canDelete }) {
  const navigate = useNavigate()
  const anularVenta = useAnularVenta()
  const activarVenta = useActivarVenta()

  const abrirNotaVenta = () => {
    const w = window.open(`${window.location.origin}/ventas/${v.id}/imprimir`, '_blank')
    if (!w) toast.warning('Habilita popups para imprimir')
  }

  const anular = async () => {
    if (!await confirmDialog({ title: 'Anular venta', detail: `¿Anular la venta #${v.id}? Esta acción revierte el stock y bloquea nuevas acciones sobre la venta. No se puede deshacer directo (hay que Revertir a Activa).`, tone: 'danger' })) return
    anularVenta.mutate(v.id, {
      onSuccess: () => toast.success('Venta anulada.'),
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo anular la venta.'),
    })
  }

  const revertir = () => {
    activarVenta.mutate(v.id, {
      onSuccess: () => toast.success('Venta reactivada.'),
      onError: err => toast.error(err?.response?.data?.error || 'No se pudo reactivar la venta.'),
    })
  }

  return (
    <div style={{ marginBottom: 14 }}>
      <FormDivider label="Operaciones disponibles" />
      <button onClick={() => navigate(`/taller?search=${v.nInterno || v.id}`)} style={opBtnStyle('var(--blue)')}>
        <Icon name="tool" size={14} /> ODTs ({odtsCount})
      </button>
      <button onClick={() => navigate(`/despachos?ordenId=${v.id}`)} style={opBtnStyle('var(--green-600)')}>
        <Icon name="truck" size={14} /> Guías Despachos ({guiasCount})
      </button>
      <button onClick={abrirNotaVenta} style={opBtnStyle('var(--blue)')}>
        <Icon name="printer" size={14} /> Nota de Venta
      </button>
      <button onClick={handleForzarTaller} disabled={forzarTallerMut.isPending} style={{ ...opBtnStyle('var(--amber)'), opacity: forzarTallerMut.isPending ? 0.7 : 1 }}>
        <Icon name="tool" size={14} /> {forzarTallerMut.isPending ? 'Enviando...' : 'Notificar a Taller'}
      </button>
      {canEmitirDte && (
        <button onClick={onEmitirDte} style={opBtnStyle('var(--blue)')}>
          <Icon name="fileText" size={14} /> Emitir DTE
        </button>
      )}
      {!v.eliminada && canDelete && (
        <button onClick={anular} disabled={anularVenta.isPending} style={{ ...opBtnStyle('var(--red)'), opacity: anularVenta.isPending ? 0.7 : 1 }}>
          <Icon name="xCircle" size={14} /> {anularVenta.isPending ? 'Anulando...' : 'Anular Venta'}
        </button>
      )}
      {v.eliminada && canDelete && (
        <button onClick={revertir} disabled={activarVenta.isPending} style={{ ...opBtnStyle('var(--green-600)'), opacity: activarVenta.isPending ? 0.7 : 1 }}>
          <Icon name="refreshCw" size={14} /> {activarVenta.isPending ? 'Reactivando...' : 'Revertir a Activa'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Agregar el import de `useAnularVenta`/`useActivarVenta`**

Cambiar la línea (post-Task-1) de:
```jsx
import { useVenta, useDeleteVenta, useForzarTaller, useUpdateVenta } from '../../api/ventas'
```
a:
```jsx
import { useVenta, useDeleteVenta, useForzarTaller, useUpdateVenta, useAnularVenta, useActivarVenta } from '../../api/ventas'
```

(Nota: si el Task 1 dejó los imports en 2 líneas separadas, consolidarlos en una sola línea `import { ... } from '../../api/ventas'` con los 6 hooks.)

- [ ] **Step 4: Verificar que compila**

Run: `cd D:\plastimar-erp-v2\frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 5: Commit**

```bash
cd D:\plastimar-erp-v2 && git add frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat(ventas): barra Operaciones Disponibles (ODT, guias, nota venta, notificar taller, anular/revertir)"
```

---

### Task 4: Lista combinada Documentos + Pagos (columna izquierda)

**Files:**
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx` (agregar después de `OperacionesDisponibles` del Task 3)

**Interfaces:**
- Consumes: mismas variables que ya recibe `TabPagos`/`TabDocumentos` hoy (`pagos`, `dtes`) — no hooks nuevos.
- Produces: componente `DocumentosPagosList({ pagos, dtes })`.

- [ ] **Step 1: Agregar el componente**

Este componente resume (no reemplaza) el contenido de `TabPagos`/`TabDocumentos` existentes, en versión compacta para la columna izquierda:

```jsx
// ── Documentos + Pagos (columna izquierda) ───────────────────────────────────
function DocumentosPagosList({ pagos, dtes }) {
  const pagosReales = (pagos || []).filter(p => !isReferencialPago(p))
  const totalPagado = pagosReales
    .filter(p => p.tipo === 'Ingreso')
    .reduce((s, p) => s + Math.abs(p.monto), 0)

  if (pagosReales.length === 0 && (dtes || []).length === 0) return null

  return (
    <div>
      <FormDivider label="Documentos emitidos" />
      {totalPagado > 0 && (
        <div style={{ background: 'var(--green-50)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Total recibido</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 700, color: 'var(--green-700)' }}>{fmt(totalPagado)}</span>
        </div>
      )}
      {dtes.map(doc => (
        <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span>{TIPOS_DTE[doc.tipoDte] || `DTE ${doc.tipoDte}`} {doc.folio ? `#${doc.folio}` : ''}</span>
          <Badge tone={DTE_TONE[doc.estado] || 'gray'}>{doc.estado}</Badge>
        </div>
      ))}
      {pagosReales.map(p => (
        <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
          <span>{p.medioPago}</span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontWeight: 600, color: p.tipo === 'Ingreso' ? 'var(--green-600)' : 'var(--red)' }}>
            {p.tipo === 'Ingreso' ? '+' : '−'}{fmt(Math.abs(p.monto))}
          </span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd D:\plastimar-erp-v2\frontend && npm run build`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
cd D:\plastimar-erp-v2 && git add frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat(ventas): lista compacta Documentos+Pagos para columna izquierda"
```

---

### Task 5: Ensamblar el layout 2 columnas en `variant === 'page'`

**Files:**
- Modify: `frontend/src/components/forms/ViewVentaPanel.jsx:524-597` (el bloque completo del `if (variant === 'page') { ... }`)

**Interfaces:**
- Consumes: `AgregarProductoWidget`, `TotalBadge`, `OperacionesDisponibles`, `DocumentosPagosList` (Tasks 1-4).
- Produces: nada nuevo — es la tarea de ensamblaje final.

- [ ] **Step 1: Reemplazar el bloque `if (variant === 'page') { ... }` completo**

Localizar el bloque que empieza en `if (variant === 'page') {` (línea 524 del archivo actual) y termina en el `}` que cierra ese bloque justo antes de `const title = <span>Venta ...` (línea 598 actual). Reemplazar TODO ese bloque por:

```jsx
  if (variant === 'page') {
    const pageTitle = <span>Venta <span style={{ fontFamily: "'DM Mono',monospace", color: 'var(--green-700)' }}>#{v.id}</span></span>
    const items = v.items || []
    const total = v.total || 0
    const abono = v.abono || 0
    const saldo = total - abono
    const descuento = Number(v.descuentoSnapshot?.porcentaje ?? v.descuentoPct ?? 0)
    const subtotal = items.reduce((s, i) => s + (i.precioUnitario * i.cantidad), 0)
    const cargosTotal = (v.cargos || []).reduce((s, c) => s + Number(c.valor || 0), 0)
    const totalBase = subtotal + cargosTotal
    const descuentoMonto = resolvedDiscountAmount(totalBase, descuento, v.descuentoMonto)

    return (
      <section style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--text-1)', letterSpacing: -0.3 }}>{pageTitle}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{v.tipo || 'Venta'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <TotalBadge total={total} />
            {canWrite && onEdit && <Btn variant="primary" icon="edit" onClick={onEdit}>Editar</Btn>}
            {canDelete && <Btn variant="ghost" icon="trash" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--red)' }}>Eliminar</Btn>}
          </div>
        </div>

        {isLoading && !full && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Cargando detalles...</div>
        )}

        {(!isLoading || full) && (
          <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 0 }}>
            {/* Columna izquierda */}
            <div style={{ padding: '18px 16px', borderRight: '1px solid var(--border)' }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 14, fontSize: 13 }}>
                <div><strong>Ejecutivo(a):</strong> {v.creadorNombre || 'Sin vendedor'}</div>
                <div style={{ marginTop: 4 }}><strong>Fecha:</strong> {fecha}</div>
              </div>
              <AgregarProductoWidget venta={v} items={items} canWrite={canWrite} />
              <OperacionesDisponibles
                v={v}
                odtsCount={odts.length}
                guiasCount={(v.guias ? 1 : 0)}
                handleForzarTaller={handleForzarTaller}
                forzarTallerMut={forzarTallerMut}
                canEmitirDte={canWriteFacturacion && !ventaYaEmitida}
                onEmitirDte={() => setEmitirDte(true)}
                canDelete={canDelete}
              />
              <DocumentosPagosList pagos={pagos} dtes={dtes} />
            </div>

            {/* Columna derecha */}
            <div style={{ padding: 22 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-3)', marginBottom: 8 }}>Cliente</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{v.cliente?.nombre || '—'}</div>
                {v.cliente?.razonSocial && v.cliente.razonSocial !== v.cliente?.nombre && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 2 }}>{v.cliente.razonSocial}</div>
                )}
                {v.cliente?.rut && <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace", marginBottom: 6 }}>{v.cliente.rut}</div>}
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 4 }}>
                  {v.cliente?.email && <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="mail" size={11} color="var(--text-3)" /> {v.cliente.email}</span>}
                  {v.cliente?.telefono && <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="phone" size={11} color="var(--text-3)" /> {v.cliente.telefono}</span>}
                  {v.cliente?.ciudad && <span style={{ fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="mapPin" size={11} color="var(--text-3)" /> {v.cliente.ciudad}</span>}
                </div>
              </div>

              {items.length > 0 && (
                <>
                  <FormDivider label={`Productos (${items.length})`} />
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: 'var(--bg)' }}>
                          {['Producto', 'Cant.', 'P. Unit.', 'Subtotal'].map((h, i) => (
                            <th key={i} style={{ padding: '7px ' + (i === 0 ? '12px' : '8px'), textAlign: i === 0 ? 'left' : 'right', fontWeight: 600, color: 'var(--text-3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '8px 12px' }}>
                              <div style={{ fontWeight: 500 }}>{item.producto?.nombre || item.nombre || `Producto #${item.productoId}`}</div>
                              {(item.producto?.codigoInterno || item.codigoInterno) && (
                                <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: "'DM Mono',monospace" }}>{item.producto?.codigoInterno || item.codigoInterno}</div>
                              )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{item.cantidad}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontFamily: "'DM Mono',monospace", color: 'var(--text-2)' }}>{fmt(item.precioUnitario)}</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: "'DM Mono',monospace", fontWeight: 600 }}>{fmt(item.precioUnitario * item.cantidad)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <FormDivider label="Resumen financiero" />
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 14 }}>
                {items.length > 0 && subtotal !== total && descuentoMonto > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>Subtotal</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(subtotal)}</span>
                  </div>
                )}
                {cargosTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-2)' }}>Cargos transporte</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(cargosTotal)}</span>
                  </div>
                )}
                {descuentoMonto > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
                    <span>{discountLabel(v, descuento)}</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>-{fmt(descuentoMonto)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, borderBottom: abono > 0 ? '1px solid var(--border)' : 'none' }}>
                  <span>Total Venta</span>
                  <span style={{ fontFamily: "'DM Mono',monospace" }}>{fmt(total)}</span>
                </div>
                {abono > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', fontSize: 13, borderBottom: '1px solid var(--border)', color: 'var(--green-600)' }}>
                    <span>Abono recibido</span>
                    <span style={{ fontFamily: "'DM Mono',monospace" }}>−{fmt(abono)}</span>
                  </div>
                )}
                {(abono > 0 || saldo > 0) && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 16px', fontSize: 14, fontWeight: 700, background: saldo > 0 ? '#fef2f2' : 'var(--green-50)' }}>
                    <span style={{ color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>Saldo Pendiente</span>
                    <span style={{ fontFamily: "'DM Mono',monospace", color: saldo > 0 ? 'var(--red)' : 'var(--green-700)' }}>{fmt(saldo)}</span>
                  </div>
                )}
              </div>

              {v.observaciones && (
                <>
                  <FormDivider label="Observaciones" />
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                    {v.observaciones}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {confirmDelete && canDelete && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'oklch(0 0 0/0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 14, padding: '24px 28px', maxWidth: 360, width: '90%', boxShadow: '0 16px 48px oklch(0 0 0/0.2)' }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text-1)' }}>Eliminar Venta #{v.id}?</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
                Esta accion eliminara la venta y todos sus items asociados. No se puede deshacer.
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setConfirmDelete(false)} style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontWeight: 500 }}>
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteVenta.isPending}
                  style={{ padding: '8px 16px', fontSize: 13, borderRadius: 8, border: 'none', background: 'var(--red)', color: '#fff', cursor: 'pointer', fontWeight: 700, opacity: deleteVenta.isPending ? 0.6 : 1 }}
                >
                  {deleteVenta.isPending ? 'Eliminando...' : 'Eliminar definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
        {emitirDte && <EmitirDteModal venta={v} onClose={() => setEmitirDte(false)} onSuccess={({ emitido, documento }) => { setEmitirDte(false); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
        {notaDte && <NotaDteModal documento={notaDte.documento} tipoDte={notaDte.tipoDte} onClose={() => setNotaDte(null)} onSuccess={({ emitido, documento }) => { setNotaDte(null); toast.success(`DTE emitido${emitido?.folio || documento?.folio ? `: folio ${emitido?.folio || documento?.folio}` : ''}`) }} />}
      </section>
    )
  }
```

Notar: este bloque nuevo **ya NO usa** `tab`/`setTab`/`TabBtn`/`TabDetalle`/`TabTaller`/`TabPagos`/`TabDocumentos`/`documentosCount` — esas variables/componentes siguen definidos en el archivo (los sigue usando la rama `drawer` más abajo), simplemente esta rama ya no los invoca. No borrar sus definiciones.

- [ ] **Step 2: Verificar que compila**

Run: `cd D:\plastimar-erp-v2\frontend && npm run build`
Expected: build exitoso, sin warnings de variables no usadas nuevas más allá de las ya toleradas hoy (`tab`/`setTab` seguirán usándose en la rama drawer, no deberían marcarse como no usados).

- [ ] **Step 3: Lint**

Run: `cd D:\plastimar-erp-v2\frontend && npm run lint`
Expected: 0 errores nuevos en `ViewVentaPanel.jsx` (puede haber errores preexistentes en OTROS archivos del proyecto — no son parte de este cambio, ignorarlos).

- [ ] **Step 4: Commit**

```bash
cd D:\plastimar-erp-v2 && git add frontend/src/components/forms/ViewVentaPanel.jsx && git commit -m "feat(ventas): layout 2 columnas en vista de venta (variant=page), reemplaza tabs"
```

---

### Task 6: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar backend y frontend en local**

```bash
cd D:\plastimar-erp-v2\backend && node src/app.js
```
(en otra terminal)
```bash
cd D:\plastimar-erp-v2\frontend && npm run dev
```

- [ ] **Step 2: Verificar el layout en el navegador**

Abrir `http://localhost:5173/ventas` (o el puerto que reporte Vite), entrar a una venta tipo "Venta Sala" o "Venta Web" activa y no pagada. Confirmar:
- Layout 2 columnas visible (izquierda angosta con operaciones, derecha ancha con cliente/productos/totales).
- `TotalBadge` visible arriba a la derecha del header con el monto correcto.
- Widget "Agregar producto" visible (venta no pagada + activa).
- Botones ODTs/Guías/Nota de Venta/Notificar a Taller/Emitir DTE/Anular Venta visibles y correctamente habilitados según permisos.

- [ ] **Step 3: Probar agregar producto por código**

Escribir un código interno válido en el campo correspondiente, click en el resultado sugerido, confirmar `toast.success` y que el producto aparece en la tabla de la derecha con el total actualizado.

- [ ] **Step 4: Probar Anular Venta**

En una venta de prueba (no una real), click "Anular Venta", confirmar el diálogo, verificar que cambia de estado y que aparece el botón "Revertir a Activa" en su lugar.

- [ ] **Step 5: Probar Notificar a Taller y Nota de Venta**

Click "Notificar a Taller", confirmar `toast` de éxito. Click "Nota de Venta", confirmar que abre un popup con `/ventas/:id/imprimir` y dispara impresión.

- [ ] **Step 6: Confirmar que una venta tipo Licitación sigue renderizando sin romperse**

Abrir una venta tipo "Licitación" — con este plan, verá el layout nuevo genérico (sin las acciones específicas de licitación, que son el sub-proyecto B, pendiente). Confirmar que no hay errores de consola ni pantalla en blanco — debe verse el layout estándar funcionando igual, solo sin las acciones especiales de licitación todavía.

- [ ] **Step 7: Confirmar que no hay regresión de backend**

```bash
cd D:\plastimar-erp-v2\backend && DATABASE_URL="postgresql://postgres:1q2w3e4rlala@localhost:5432/plastimar_test" npx vitest run
```
Expected: 573/573 (backend no se tocó en este plan, debe seguir igual).

- [ ] **Step 8: Detener los servidores de desarrollo**

Cerrar los procesos `node src/app.js` y `npm run dev` iniciados en el Step 1.

---

## Nota sobre el sub-proyecto B (licitación)

Este plan cubre solo ventas tipo Sala/Web/Convenio Marco. Cuando `v.tipo === 'Licitación'`,
`OperacionesDisponibles` debería mostrar en su lugar: Ver Cotización, Ficha Técnica y
Económica, Ingresar Multa (en vez de/además de Emitir DTE) — eso es un spec y plan
separado que reutiliza `AgregarProductoWidget`, `TotalBadge` y el layout de 2 columnas de
este plan, agregando una rama condicional dentro de `OperacionesDisponibles` o un
componente hermano `OperacionesDisponiblesLicitacion`.
