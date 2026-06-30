# Plan — Trazabilidad por producto en el Asistente IA (rentabilidad + tiempos de taller)

> **Para el agente constructor.** Agregar al asistente la capacidad de analizar un producto: rentabilidad (margen) y tiempos de producción. Diseño validado contra datos reales del VPS. **Costo = promedio de compras (sin dimensión temporal).** No tocar la base de datos (todo es lectura). No deploy.

---

## 0. Contexto y hechos verificados (NO re-investigar, ya está confirmado)

El asistente vive en `backend/src/routes/ai/`. Las tools se registran en `backend/src/routes/ai/tools/index.js` con el patrón `register(definition, async (prisma, input) => {...})`, SOLO LECTURA, parámetros tipados.

**Datos disponibles (verificados en la base real):**
- **Costo de compra:** `catalogo.detalle_facturas_proveedor` (28.512 líneas con `precio > 0`). Se vincula al producto por **`codigo_interno`** (NO por producto_id). ⚠️ Las facturas **NO tienen fecha de documento** (`fechaDoc` = 0 registros) → el costo se calcula como **PROMEDIO**, sin dimensión temporal. NO se puede responder "cuándo fue más rentable".
- **Precio de venta:** `ventas.orden_items.precio_unitario`, vinculado por `producto_id`.
- **Tiempos de taller:** `taller.odt_item_talleres` tiene `fecha_inicio` y `fecha_listo` por producto/taller. ⚠️ **Solo ~18 de 26.830 registros tienen ambas fechas** → cobertura MUY baja. La tool igual se construye, pero DEBE advertir la limitación.
- **Cruce validado:** `productos.codigo_interno = detalle_facturas_proveedor.codigo_interno` funciona; el cálculo de margen da resultados correctos (ej. margen 40-55% en productos reales).

---

## 1. Tool nueva: `ficha_producto`

**Objetivo:** dado un producto, devolver su expediente integral (rentabilidad + tiempos de taller) para que el agente responda preguntas abiertas.

**Definición:**
```
name: 'ficha_producto'
description: 'Expediente integral de UN producto: rentabilidad (margen = precio de venta
  vs. costo de compra) y tiempos de producción en taller. Usar para preguntas como
  "qué margen deja este producto", "cuánto tiempo estuvo en taller espuma", "cuál fue su
  mejor tiempo de producción", "es rentable el producto X". Recibe el código o nombre del
  producto. NO sirve para rankings de varios productos (para eso usar ranking_ventas).'
input_schema:
  - producto (string, requerido): código interno o nombre (búsqueda parcial) del producto.
```

**Implementación (SQL crudo, patrón de las tools existentes):**

1. **Resolver el producto:** buscar por `codigo_interno` exacto o `nombre ILIKE %producto%`. Si hay varios, tomar el de más ventas (o devolver lista corta si es ambiguo). Si no existe → `{ encontrado: false }`.

2. **Bloque `rentabilidad`** (por `codigo_interno` del producto):
   ```sql
   -- costo promedio de compra
   SELECT round(avg(precio)) FROM catalogo.detalle_facturas_proveedor
   WHERE codigo_interno = $codigo AND precio > 0
   -- precio promedio de venta + unidades + monto
   SELECT round(avg(precio_unitario)) AS precio_prom,
          sum(cantidad)::int AS unidades,
          round(sum(cantidad*precio_unitario)) AS monto
   FROM ventas.orden_items oi JOIN ventas.ordenes o ON o.id=oi.orden_id
   WHERE oi.producto_id = $id AND o.eliminada=false AND oi.eliminado=false
   ```
   - `margenPct = round((1 - costoPromCompra / precioPromVenta) * 100)` (si ambos > 0; si no, null).
   - Incluir SIEMPRE: `nota: 'Costo = promedio de todas las compras del producto, sin considerar la fecha. El margen no refleja variaciones de costo en el tiempo.'`

3. **Bloque `taller`** (tiempos de producción, por `producto_id`):
   ```sql
   SELECT t.nombre AS taller,
          count(*)::int AS veces,
          round(avg(EXTRACT(EPOCH FROM (oit.fecha_listo - oit.fecha_inicio))/3600)::numeric, 1) AS horas_prom,
          round(min(EXTRACT(EPOCH FROM (oit.fecha_listo - oit.fecha_inicio))/3600)::numeric, 1) AS mejor_horas
   FROM taller.odt_item_talleres oit
   JOIN taller.odt_items oi ON oi.id = oit.odt_item_id
   JOIN taller.talleres t ON t.id = oit.taller_id
   WHERE oi.producto_id = $id
     AND oit.fecha_inicio IS NOT NULL AND oit.fecha_listo IS NOT NULL
     AND oit.fecha_listo >= oit.fecha_inicio
   GROUP BY t.nombre
   ```
   - Devolver `porTaller: [{ taller, veces, tiempoPromedioHoras, mejorTiempoHoras }]`.
   - Contar también `vecesEnProduccionTotal` (sin filtro de fechas) para contexto.
   - Incluir SIEMPRE: `nota: 'Los tiempos se calculan solo sobre registros con inicio y fin marcados. Hoy la mayoría de las ODT no registra estos tiempos, por lo que la cobertura es baja y los promedios pueden no ser representativos.'`
   - Si no hay ningún registro con tiempos → `porTaller: []` y la nota explica que no hay datos de tiempo para ese producto.

4. **Retorno final:**
   ```
   { encontrado: true, producto: {id, codigo, nombre, categoria, stock},
     rentabilidad: {...}, taller: {...} }
   ```

---

## 2. Extender la tool existente `ranking_ventas` con orden por margen

En la tool `ranking_ventas` (ya existe en `tools/index.js`):
- Agregar al enum `ordenar_por` la opción **`margen`** (además de `monto` y `cantidad`).
- Cuando `ordenar_por = 'margen'` y `agrupar_por = 'producto'`:
  - Calcular por producto: precio promedio de venta (del período) y costo promedio de compra (de `detalle_facturas_proveedor` por `codigo_interno`).
  - `margenPct` por producto; ordenar DESC por margen.
  - Devolver en cada fila: `unidades, montoCLP, costoPromCLP, margenPct`.
- Si `ordenar_por='margen'` con `agrupar_por='categoria'`: calcular margen agregado por categoría (o marcar que el margen solo aplica a nivel producto). Decidir lo más simple; si es complejo, restringir margen a `producto` y documentarlo en la `description`.
- Actualizar la `description` de la tool para mencionar que ahora puede rankear por rentabilidad.
- Incluir la misma `nota` sobre el costo promedio.

> Esto cubre "¿qué producto es el más rentable?" → `ranking_ventas(agrupar_por='producto', ordenar_por='margen')`.

---

## 3. System prompt

En `backend/src/routes/ai/llm.js`, agregar una regla:
- "Para analizar UN producto (margen, rentabilidad, tiempos de taller) usa `ficha_producto`. Para rankings de productos por rentabilidad usa `ranking_ventas` con `ordenar_por='margen'`."
- "El costo es un PROMEDIO de compras sin fecha: NUNCA afirmes 'cuándo' fue más/menos rentable un producto en el tiempo, porque ese dato no existe. Si te lo preguntan, acláralo."
- "Los tiempos de taller tienen baja cobertura (pocos registros): SIEMPRE comunica esa limitación cuando reportes promedios de tiempo, y no presentes el dato como definitivo."

---

## 4. Frontend (mínimo)

Agregar a `TOOL_LABELS` en `AiChat.jsx` y `AsistentePage.jsx`:
```
ficha_producto: 'Analizando el producto…',
```

---

## 5. Pruebas obligatorias (reportar resultados)

1. **Backend arranca** sin errores (smoke import de `src/app.js`).
2. **Frontend compila** (`npm run build`).
3. **Pruebas de la tool contra datos reales** (vía runTool en un script node, como en los tests existentes):
   - `ficha_producto` con un producto que tenga ventas y compras → devuelve margen coherente (verificar contra: un producto real da margen ~40-55%).
   - `ficha_producto` con un producto sin tiempos de taller → `taller.porTaller: []` + nota de limitación.
   - `ficha_producto` con producto inexistente → `encontrado: false`.
   - `ranking_ventas(agrupar_por='producto', ordenar_por='margen')` → lista ordenada por margen DESC.
4. **Tests unitarios:** agregar al menos 2 tests en `test/ai-assistant.test.js` (ficha_producto encuentra/no encuentra; ranking por margen ordena).
5. **No-regresión:** las tools existentes (consultar_ventas, ranking por monto/cantidad, comisiones, etc.) siguen funcionando. `vitest run ai-assistant` 100% verde.

---

## 6. Lo que NO se hace (límites explícitos)
- NO se toca la base de datos (todo lectura).
- **NO se implementa NINGÚN análisis temporal de rentabilidad.** El dato de fecha de compra (`fechaDoc`) no existe en la base, por lo tanto:
  - NO usar `createdAt` de la factura como proxy de fecha de costo.
  - NO ofrecer parámetros de período/fecha en la parte de costo de `ficha_producto`.
  - NO devolver evolución de margen, ni "antes/después", ni nada que sugiera una línea de tiempo de rentabilidad.
  - El costo es **un único número promedio por producto**, punto. La rentabilidad es una foto, no una película.
- NO se promete precisión en tiempos de taller (cobertura baja).
- NO deploy. Dejar el código en working tree para revisión.

---

## Archivos a tocar
| Archivo | Cambio |
|---|---|
| `backend/src/routes/ai/tools/index.js` | Tool nueva `ficha_producto` + extender `ranking_ventas` con `margen` |
| `backend/src/routes/ai/llm.js` | Reglas de uso y de honestidad (costo promedio, cobertura tiempos) |
| `frontend/src/components/AiChat.jsx` | Label de estado |
| `frontend/src/pages/asistente/AsistentePage.jsx` | Label de estado |
| `backend/test/ai-assistant.test.js` | Tests nuevos |
