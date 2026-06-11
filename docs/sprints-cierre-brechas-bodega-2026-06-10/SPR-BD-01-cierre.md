# Cierre S1 — Multi-proveedor con costo ponderado

Fecha: 10-06-2026
Branch: `codex/spr-bodega-01-multiproveedor` (sale de `codex/spr-bodega-cierre-brechas`).
Reemplaza el "código maestro" del legacy (que no existía; era un parche por el costo last-price-wins y el campo único de proveedor del ERP viejo).

## Modelo entregado (confirmado por el cliente)

```
1 código de producto (el real)
   ├── Proveedor A → costo $100, cantidad 10
   └── Proveedor B → costo $120, cantidad 30
   Stock total      = 40
   Costo ponderado  = (100×10 + 120×30) / 40 = $115
   Precio de venta  = 1 solo (no varía por proveedor)
```

El costo varía por proveedor; el precio de venta es único. El costo ponderado alimenta `precioLista`, así el motor de precios (venta sala, licitación, web) sigue intacto.

## Incrementos y commits

| Inc | Contenido | Commit |
|---|---|---|
| 1 | Modelo `ProductoProveedor` + migración + helper puro `computeCosteoPonderado` + test unitario | `8a4605d` |
| 2 | Ingreso/reversa de facturas con upsert por proveedor; egreso/ajuste proporcional; `recomputeProductoCosteo`; reemplaza last-price-wins | `11d1196` |
| 3 | Endpoints `GET/POST/PUT/DELETE /api/productos/:id/proveedores` | `58e53bf` |
| 4 | Sección frontend "Proveedores y costos" en la ficha del producto | `58e53bf` |

## Regla de convivencia con datos legacy (clave)

- `producto.stock` sigue gestionándose como antes (increment-based). NO es derivado de las filas de proveedor, para no perder el stock de productos legacy sin atribución.
- `precioLista` pasa a costo ponderado **solo si el producto tiene filas de proveedor** (Σ cantidad > 0). Sin filas → se mantiene last-price-wins. Nunca se escribe `precioLista = 0`.
- La inconsistencia transitoria (stock total > Σ cantidad por stock legacy sin atribuir) se resuelve con el **script de saneamiento** (pendiente, tarea de datos), que siembra filas baseline por proveedor.

## Verificación

- `npm.cmd run db:generate` — OK.
- `npx.cmd prisma migrate deploy` — OK (`20260610130000_producto_proveedores`).
- Backend focalizado (costeo, stock-ingresos, proveedores) — OK.
- `npm.cmd run test:full -- --reporter=dot` — OK, 69 archivos, **586 tests**.
- Frontend `npm.cmd run lint` — OK. `npm.cmd run build` — OK (solo warning de chunk grande).
- `git diff --check` — OK.

## Cobertura de tests

- `computeCosteoPonderado`: ejemplo cliente (115), stock 0 sin división por cero, filas inválidas, proveedor único.
- `recomputeProductoCosteo`: sincroniza precioLista; no escribe 0 sin cantidad.
- Ingreso/stock: múltiples proveedores, mismo proveedor dos veces, NC/reversa, guarda precioLista, egreso proporcional.
- Endpoints: ponderado 115 al sumar dos proveedores, GET con nombre de proveedor, PUT recalcula, DELETE recalcula, RBAC (cajero 403).

## Pendiente (fuera del sprint)

- **Script de saneamiento**: detectar el mismo producto comprado a varios proveedores (códigos duplicados heredados) y fusionarlos en filas `ProductoProveedor`, sembrando baseline para el stock legacy. Es tarea de datos, se agenda aparte.
- Opcional UI: badge "N proveedores" en la lista de Bodega / Consulta Precios (el precio costo ya muestra el ponderado vía `precioLista`).

## Estado de branches

- `codex/spr-bodega-cierre-brechas`: cierre S2/S3/S4/S6 + contraste + fixes de lint.
- `codex/spr-bodega-01-multiproveedor`: S1 completo (incrementos 1–4) encima de la anterior.
- Los 5 archivos de RAG siguen sin commitear, intactos (no son de este trabajo).
