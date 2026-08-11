# Handoff — Ingesta de recetas de los productos MK

**Para:** el agente que completará la ingesta de recetas.
**Objetivo:** convertir las recetas de los ~2.758 productos MK en recetas **con desglose real de materiales** (BOM), vinculadas al catálogo de materias primas que ya está cargado.
**Estado:** el importador ya existe y funciona, pero carga el costo de materiales como **un monto único sin desglose**. Falta expandir ese monto en líneas reales por material. Eso es lo que hay que terminar.

---

## 1. Contexto imprescindible

Plastimar vende productos que fabrica **Allegro** (empresa relacionada). Los códigos `MK-*` (~2.848 productos activos) son de Allegro. Allegro calcula sus costos en un Excel (`NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls`) y le vende a Plastimar con un margen.

Modelo de costo (verificado leyendo las fórmulas del Excel):

```
costo fabricación = Σ materiales (espuma + tela + accesorios) + Σ mano de obra (horas × tarifa)
      ↓ × (1 + ajuste global)          ajuste = 3%
costo ajustado
      ↓ × (1 + margen de transferencia)   margen VARÍA por producto: 35% (59%), 25%, 20%, 15%, 45%, 55%
costo de transferencia  =  lo que Plastimar paga  =  producto.precioLista
```

> **El margen de transferencia NO es fijo.** Se extrae del porcentaje literal de la fórmula de la columna AN de cada fila. Nunca hardcodear 35%.

El módulo de costeo del ERP ya reproduce este modelo. Motor puro: `backend/src/routes/costeo/engine.js`. Servicio: `backend/src/routes/costeo/service.js`. Plan original completo: `docs/PLAN_MODULO_COSTEO_FABRICACION.md`.

---

## 2. Qué ya está hecho (no rehacer)

| Pieza | Estado |
|---|---|
| Módulo de costeo (schema, motor, API, UI) | ✅ desplegado en producción y funcionando |
| Importador `backend/scripts/import-costeo-excel.mjs` | ✅ crea recetas; **98,2% de coincidencia** con la columna AK del Excel |
| Catálogo de materias primas (`taller.bodega_taller`, códigos `MP-*`) | ✅ **70 cargadas** en producción, con precio, unidad, taller y detalle |
| Tarifas de mano de obra (`taller.tarifas_proceso`) | ⚠️ **VACÍAS por decisión del cliente** — ver §6 |
| Recetas (`taller.producto_recetas`) | ⚠️ **VACÍAS por decisión del cliente** — ver §6 |

**El importador ya deduplica bien:** el Excel usa varias filas por producto (la del producto + las de sus componentes debajo, con el mismo código). El script se queda con la fila de mayor costo AK (la del producto). 6.740 filas → 2.758 productos únicos.

---

## 3. La limitación a resolver (el trabajo pendiente)

Hoy, al aplicar, el importador crea la receta con **el monto de materiales como una sola cifra**, sin desglose:

```js
// backend/scripts/import-costeo-excel.mjs (~línea 213)
await upsertReceta(prisma, productoDB.id, {
  materialesMonto: receta.materialesMonto,   // = valorEspuma (col V) + valorTela (col Z), UN NÚMERO
  materiales: [],                            // ← VACÍO: no hay líneas por material
  procesos,                                  // ← esto sí está bien (corte/confección/enfundado)
  ...
});
```

`materialesMonto` es un campo de `ProductoReceta` que guarda el costo de materiales tal cual, sin decir de qué material salió. **Da el costo correcto**, pero tiene una consecuencia:

> Si mañana sube el precio del algodón, el costo NO se recalcula solo, porque la receta no sabe que lleva algodón. Hay que reimportar del Excel.

**Tu trabajo:** convertir ese monto único en **líneas reales** de `RecetaMaterial`, cada una vinculada a una materia prima del catálogo (`bodega_taller` o `telas`). Cuando eso esté, el costo se recalcula solo al cambiar un precio — que es el objetivo del módulo.

---

## 4. Modelo de datos que hay que llenar

```prisma
model RecetaMaterial {
  id             Int
  recetaId       Int            // la receta del producto
  bodegaTallerId Int?           // UNO de estos dos (XOR): materia prima general...
  telaId         Int?           // ...o una tela
  cantidad       Float          // cuánto: kg, mt, m², etc.
  unidad         String?
  notas          String?
}
```

Regla dura (ya validada en el backend): **exactamente uno** de `bodegaTallerId` / `telaId`. Ambos o ninguno → error 400. `onDelete: Restrict`: no se puede borrar una materia prima usada en una receta.

Las 70 materias primas están en `taller.bodega_taller` con códigos `MP-ALGODON`, `MP-TREVIRA-ESTAMPADO`, `MP-MELAMINA-15-MM-BLANCA`, etc. El campo `detalle` guarda su categoría (Rellenos, Telas y Textiles, Ferretería…). Precio en `precio`, unidad en `unidad_medida`, taller en `taller_id`.

---

## 5. Cómo mapear desde el Excel (hoja `MK`)

Encabezados en la **fila 10**, datos desde la **fila 11**. Cada producto tiene su fila + filas de componente debajo (mismo código en col C).

**Fila del producto** (totales ya calculados por el Excel):

| Col | Contenido | Uso |
|---|---|---|
| C | código (`MK-*`) | match con `producto.codigo_interno` (96% calza) |
| H | nombre | referencia |
| V | valor total set espuma | monto de espuma (hoy va a `materialesMonto`) |
| Z | v/mt × set tela | monto de tela |
| AA | tipo de tela | **la pista para vincular la tela correcta** (ej. "TREVIRA-1,50", "DIF TEXT") |
| X, Y | metros de tela, $/mt | cantidad y precio unitario de la tela |
| AB, AD, AF | horas corte / confección / enfundado | procesos (ya se importan bien) |
| AI | accesorios monto | `accesoriosMonto` |
| AK | costo fabricación | **validación** contra el motor |
| AN | costo ajustado | de aquí sale el % de margen (porcentaje literal de la fórmula) |

**Filas de componente** (debajo del producto, tienen el desglose fino):

| Col | Contenido |
|---|---|
| H | nombre del componente (ej. "CUBOS (10)", "BLOQUES GRANDES (2)") |
| N | cubicaje |
| O | densidad |
| R | $/cm³ (precio unitario de la espuma) |
| S | valor módulo (= cubicaje × $/cm³) |

> Dato clave: `$/cm³` de la columna R de las filas de componente **coincide** con el precio de las materias primas cargadas (ej. la MANTA a $3.070/… es el "algodón" del catálogo). Ese es el puente para vincular.

### Estrategia sugerida (a criterio del agente)

1. **Tela**: usar la columna AA (tipo de tela) para buscar la materia prima por nombre en `bodega_taller` (las telas están cargadas como `MP-*` en la categoría "Telas y Textiles"). Cantidad = col X (metros). Si no hay match claro, dejar la línea con `materialesMonto` y **reportarlo**, no inventar el vínculo.
2. **Espuma**: es lo más difícil porque el Excel la modela por cubicaje×densidad, no por una materia prima con nombre directo. Puede que convenga dejar la espuma como monto (o crear materias primas de espuma por densidad si el cliente lo confirma). **No forzar un match dudoso.**
3. Lo que no se pueda desglosar con confianza → **mantenerlo en `materialesMonto`** (el campo existe justo para eso) y listarlo en el informe. Es preferible un costo correcto sin desglose que un desglose inventado.

---

## 6. Reglas de trabajo (NO negociables)

1. **El sistema se mantiene VACÍO hasta orden del cliente.** Decisión del dueño (flipe): tarifas y recetas quedan vacías a propósito para que Plastimar las llene desde el principio; lo está revisando con ellos. **No corras `--apply` contra producción sin confirmación explícita del dueño.**
2. **Dry-run primero, siempre.** El importador corre en dry-run por defecto y debe imprimir un informe: cuántas recetas, % de coincidencia con la columna AK, y las que no se pudieron desglosar. `--apply` solo tras revisar ese informe.
3. **No tocar `producto.precioLista`.** La ingesta crea/actualiza recetas. Que eso se traduzca en un nuevo precio de costo es un paso APARTE ("Aplicar a precio costo"), con snapshot, decidido por el usuario. El importador **nunca** debe escribir `precioLista`.
4. **Validar contra la columna AK.** Tras importar, comparar el costo que calcula el motor contra AK del Excel (tolerancia ±$2). Si baja del 90%, **detenerse y reportar** — el mapeo está mal. Hoy está en 98,2%; no bajar de ahí.
5. **No hardcodear 35%.** El margen sale de la fórmula de cada fila.
6. **No inventar vínculos de material.** Si un material no matchea con confianza, dejarlo como monto y reportarlo.
7. **Idempotencia.** Correr el script dos veces no debe duplicar (el importador ya hace upsert por `codigo_interno`).

---

## 7. Verificación esperada

Contra base real (Postgres, no mocks — convención del proyecto):

1. Los 2.758 productos MK generan receta sin duplicar.
2. Coincidencia con la columna AK ≥ 98% (no regresionar).
3. Para un producto con desglose, la suma de las líneas `RecetaMaterial` + `materialesMonto` residual + mano de obra = el costo de fabricación del Excel.
4. **Prueba de recálculo automático** (el objetivo del trabajo): cambiar el precio de una materia prima vinculada → el costo del producto que la usa cambia; los snapshots anteriores NO cambian (son inmutables).
5. `npm run test:ci` en verde (incluye `costeo-engine`, `costeo-service`, `costeo-routes`). Agregar casos para el desglose nuevo.

---

## 8. Archivos y datos de referencia

- Importador actual: `backend/scripts/import-costeo-excel.mjs`
- Cargador de materias primas (ya ejecutado): `backend/scripts/import-materias-primas.mjs`
- Motor de cálculo: `backend/src/routes/costeo/engine.js`
- Servicio (upsertReceta, calcularCosteoProducto): `backend/src/routes/costeo/service.js`
- Plan original del módulo: `docs/PLAN_MODULO_COSTEO_FABRICACION.md`
- Excel origen: `NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls` (lo tiene el dueño; leer con `xlsx@0.18.5`, NO exceljs — no lee `.xls` binario)
- Casos verificados (el motor debe reproducirlos): MK-46 = $52.127 fabricación / $64.429 transferencia · MK-263 = $22.152 · MK-02 = $203.594

### Infraestructura / entorno

- Deploy a producción es **manual** (GitHub Actions en rojo desde el 16-jun). Acceso: `ssh -i ~/.ssh/plastimar_vps_ed25519 root@vps.plastimar.cl`. API en puerto **3001**. Secret JWT: `JWT_ACCESS_SECRET`.
- Base local de test: Docker `plastimar-postgres-local`, puerto 55432, `DATABASE_URL=postgresql://plastimar:plastimar@localhost:55432/plastimar_test?schema=public`.
- Talleres en producción (los ids importan): **1=confecciones, 2=espumas, 3=externo, 4=madera**. NO asumir "1=espumas".

---

## 9. Resumen de una línea

El importador ya crea las recetas con el costo correcto pero como monto único; falta **expandir ese monto en líneas por material vinculadas al catálogo de 70 materias primas**, para que el costo se recalcule solo al cambiar un precio — sin inventar vínculos, sin tocar precios, con dry-run e informe, y sin correr en producción hasta que el dueño lo autorice.
