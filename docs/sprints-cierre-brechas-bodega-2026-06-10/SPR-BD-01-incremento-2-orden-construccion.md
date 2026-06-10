# Orden de construcción — S1 Incremento 2 (ingreso/egreso con costo ponderado)

Branch de trabajo: `codex/spr-bodega-01-multiproveedor` (ya contiene el incremento 1).
Depende de: incremento 1 (modelo `ProductoProveedor` + `computeCosteoPonderado`), commit `8a4605d`.
Objetivo: reemplazar el costo **last-price-wins** del legacy por **costo ponderado real** multi-proveedor, sin romper el comportamiento de productos aún no migrados.

---

## Contexto imprescindible (leer antes de tocar nada)

- El modelo `ProductoProveedor (productoId, proveedorId, costo, cantidad, ultimaCompra, activo)` ya existe, único por `(productoId, proveedorId)`.
- Helper puro ya disponible: `computeCosteoPonderado(rows) -> { stockTotal, costoPonderado }` en `backend/src/routes/productos/costeo.js`. **Reusarlo, no reimplementar.**
- Fórmula confirmada por cliente: `costoPonderado = Σ(costo×cantidad)/Σcantidad`. Precio de **venta es único** (no se toca); el ponderado solo alimenta `precioLista` (costo).

### Regla de convivencia con datos legacy (CRÍTICA — no romper)

`producto.stock` **sigue gestionándose como hoy** (increment en ingreso, decrement en egreso). NO convertirlo en derivado de `ProductoProveedor`. Motivo: los productos legacy tienen stock sin filas de proveedor; si hiciéramos `stock = Σ cantidad` perderíamos ese stock.

`ProductoProveedor` rastrea cantidad+costo **por proveedor** solo para el costo ponderado. Reglas:
- Si un producto **tiene** filas de proveedor (Σ cantidad > 0) → `precioLista = costoPonderado`.
- Si **no tiene** filas (legacy sin migrar) → se mantiene el comportamiento actual (last-price-wins en ingreso). **No** escribir `precioLista = 0`.
- La inconsistencia transitoria (stock total > Σ cantidad por stock legacy no atribuido) se resuelve con el **script de saneamiento** (incremento aparte), que siembra filas baseline. Documentarla, no intentar resolverla aquí.

---

## Cambio 1 — Helper de recálculo (nuevo, en `costeo.js`)

Agregar una función que, dado un `tx` (transacción Prisma) y un `productoId`, lee las filas de proveedor y sincroniza `precioLista`:

```js
// En backend/src/routes/productos/costeo.js
export async function recomputeProductoCosteo(tx, productoId) {
  const rows = await tx.productoProveedor.findMany({
    where: { productoId, activo: true },
    select: { costo: true, cantidad: true },
  })
  const { stockTotal, costoPonderado } = computeCosteoPonderado(rows)
  if (stockTotal > 0) {
    await tx.producto.update({ where: { id: productoId }, data: { precioLista: costoPonderado } })
  }
  return { stockTotal, costoPonderado }
}
```

- **Guarda obligatoria:** solo actualiza `precioLista` si `stockTotal > 0` (hay filas). Nunca lo pone en 0.
- Debe ejecutarse **dentro de la misma transacción** que el movimiento de stock.

## Cambio 2 — Upsert de proveedor en ingreso (`stock-ingresos/apply.js`)

En `applyStockMovements`, rama `d.destino === 'producto'` (hoy líneas ~222-243):

1. Resolver el proveedor de la línea: `const provId = d.proveedorId ?? parseOptionalInt(pago?.proveedorId)`.
2. **Solo si `provId` existe**, upsert de la fila:
   - Ingreso (`direction > 0`, no reverse): `cantidad += signedQty`, `costo = d.precio` (si `d.precio > 0`), `ultimaCompra = new Date()`. Si no existe la fila, crearla con esos valores.
   - Nota de crédito / reversa (`direction < 0` o `reverse`): `cantidad = max(0, cantidad - |signedQty|)`. No cambiar `costo`.
   - Usar `tx.productoProveedor.upsert({ where: { productoId_proveedorId: { productoId: prod.id, proveedorId: provId } }, ... })`.
3. **Reemplazar** la línea actual `if (!reverse && direction > 0 && d.precio > 0) updateData.precioLista = d.precio` por:
   - Si `provId` existe → NO setear `precioLista` aquí; en su lugar, tras el upsert, llamar `recomputeProductoCosteo(tx, prod.id)`.
   - Si `provId` **no** existe → mantener el comportamiento actual (last-price-wins) + el `precioHistorial` como hoy.
4. El `tx.producto.update` del `stock: { increment: signedQty }` se mantiene igual (stock sigue siendo increment-based).
5. Mantener la creación de `movimientoBodega` y de `precioHistorial` tal cual (el historial de precio sigue registrando el cambio de costo).

**Nota sobre productos recién creados** (`createMissingTargets`): si la factura crea el producto y trae `provId`, sembrar también su fila `ProductoProveedor` inicial (cantidad 0; el upsert del paso 2 la llenará) o hacer el upsert directamente en el flujo normal. Verificar que no quede doble conteo.

## Cambio 3 — Egreso/ajuste manual proporcional (`productos/movimientos.js`)

En el `POST /:id/movimientos`, cuando el movimiento **reduce** stock (`egreso`, o `ajuste` con `delta < 0`):

1. Cargar filas `productoProveedor` activas del producto con `cantidad > 0`.
2. Si **hay** filas, reducir `|delta|` unidades **proporcionalmente** por cantidad:
   - `reduccion_i = floor(|delta| × cantidad_i / Σcantidad)`.
   - Repartir el remanente (por redondeo) restando 1 a las filas con mayor cantidad hasta cubrir `|delta|`.
   - Nunca dejar `cantidad_i < 0`.
3. Si **no** hay filas (legacy) → comportamiento actual sin cambios.
4. Para `ingreso` manual con un `proveedorId` en el body (si se decide soportarlo): upsert como en el Cambio 2. Si el endpoint hoy no recibe proveedor, **dejarlo fuera de este incremento** y anotarlo (el ingreso real de costo entra por facturas).
5. Todo dentro de la `$transaction` existente; tras ajustar filas, llamar `recomputeProductoCosteo(tx, id)`.
6. Mantener `producto.stock = newStock` (increment-based) como hoy.

> Importante: la transacción actual usa `$transaction([...])` (array). Para intercalar lectura+lógica+update de filas de proveedor, convertir a `$transaction(async (tx) => { ... })` (callback). Mantener el mismo resultado de respuesta (`{ movimiento, stockFinal }`).

---

## Tests a agregar/actualizar (`backend/test/`)

Nuevos (integración, estilo `productos.test.js` con `buildApp`):
1. **Ingreso 2 proveedores** → crea 2 filas, `precioLista` = ponderado. Reproducir el ejemplo: A(10×$100) luego B(30×$120) → `precioLista` 115, `stock` 40.
2. **Ingreso al mismo proveedor 2 veces** → acumula cantidad, costo = última compra, ponderado correcto.
3. **Nota de crédito / reversa** → reduce `cantidad` del proveedor, recalcula ponderado.
4. **Egreso proporcional** → reduce filas a prorrata, Σ cantidad coherente, ponderado estable.
5. **Producto legacy sin filas** → ingreso sin `proveedorId` mantiene last-price-wins; egreso no falla.
6. **Guarda precioLista**: producto con filas que llegan a Σ 0 → no pone `precioLista` en 0.

Revisar y, si aplica, **actualizar** los tests existentes de `stock-ingresos` que asuman last-price-wins cuando ahora haya proveedor.

---

## Verificación (Definition of Done del incremento)

- [ ] `npm.cmd run db:generate` OK (sin cambios de schema nuevos en este incremento; el modelo ya existe).
- [ ] `npm.cmd run test -- productos.test.js productos-costeo.test.js stock-ingresos*.test.js --reporter=dot` OK.
- [ ] `npm.cmd run test:full -- --reporter=dot` OK (sin regresiones; ajustar tests legacy si cambió el costo esperado).
- [ ] `npm.cmd run lint` OK.
- [ ] `git diff --check` OK.

## Smoke test (manual o script)

1. Producto `P-001` sin filas. 2. Factura Proveedor A: 10 un a $100 → fila A, stock 10, `precioLista` 100. 3. Factura Proveedor B: 30 un a $120 → fila B, stock 40, **`precioLista` 115**. 4. Egreso manual 4 un → stock 36, `precioLista` ≈115. 5. Nota de crédito de 10 a Proveedor B → fila B baja a 20, ponderado recalculado.

## Matriz QA

| Caso | Esperado |
|---|---|
| Ingreso 2 proveedores | Stock 40, precioLista 115 |
| Mismo proveedor 2 ingresos | Acumula cantidad, costo última compra |
| NC / reversa | Baja cantidad del proveedor, ponderado recalculado |
| Egreso proporcional | Reparte a prorrata, Σ coherente, ponderado estable |
| Producto legacy sin filas | Last-price-wins intacto, sin error |
| Σ cantidad llega a 0 | precioLista NO se pone en 0 |
| Permisos | egreso/ajuste respetan `bodega:write` / `bodega:delete` como hoy |

## Fuera de alcance (no hacer en este incremento)

- Endpoints `GET /productos/:id/proveedores` y CRUD manual → **incremento 3**.
- Sección frontend "Proveedores y costos" → **incremento 4**.
- Script de saneamiento que siembra filas baseline para stock legacy → **tarea de datos aparte**.

## Riesgos / cuidado

- No convertir `producto.stock` en derivado: rompe productos legacy.
- No sobrescribir `precioLista` con 0 cuando no hay filas o Σ=0.
- Mantener todo dentro de la transacción para no dejar stock y costo inconsistentes.
- Revisar el flujo de `reverseStockIngreso` (anulación de factura) para que también revierta las filas de proveedor.
