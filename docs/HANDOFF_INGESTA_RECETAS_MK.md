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

### 3.1 Cuatro problemas del importador actual que hay que corregir (revisión verificada contra el Excel)

Estos cuatro puntos fueron detectados en una revisión posterior y **confirmados leyendo el Excel**. Si se ignoran, el informe puede decir "98% correcto" y aun así dejar recetas mal. **El porqué de cada uno importa:**

**a) Un producto ocupa VARIAS filas, no una.** El Excel tiene 6.740 filas y 2.758 códigos únicos: ~1.295 productos son multi-fila (el producto arriba + sus componentes debajo, mismo código en col C). El importador actual se queda con **una sola fila** (la de mayor AK) y de ahí lee los materiales. **Verificado:** MK-263 tiene TREVIRA (fila 15), NAPA (fila 16) y VELUR (fila 17) en filas distintas. Leer solo la fila principal **pierde 2 de 3 telas**. → Hay que construir cada receta desde su **bloque completo**, una `RecetaMaterial` por cada fila de material del bloque.

**b) Un mismo código puede aparecer en BLOQUES SEPARADOS (dos productos distintos).** **Verificado: 14 códigos** están en bloques no contiguos (MK-263D, MK-601AM, MK-131, MK-103J, MK-30C…). El dedup actual "mayor AK" **elige uno y borra el otro en silencio**. → Hay que detectar estos casos y **bloquearlos** para revisión, no elegir automáticamente.

**c) El margen NO es uno de seis valores fijos.** **Verificado: van de 5% a 285%, con 43 valores distintos**, muchos sobre 100% (105, 110, 115… 285). Peor: `parseTransferMarginFormula` (líneas 25 y 33 del importador) **devuelve 35 por defecto cuando no hay fórmula O cuando el regex no matchea**. Así, los decimales, los 5 productos sin fórmula usable, y MK-96 (margen 0%, AN=AL) **caen todos a 35% mal**, y nadie se entera. → Extraer el margen literal de la fórmula; nunca defaultear a 35%. Ver §6 para el tratamiento exacto.

**d) La coincidencia del 98,2% cuenta FILAS FÍSICAS, no productos.** Calculada por producto es 98,55% (2.718/2.758), pero quedan **40 productos con diferencias reales** — sets cuyo AK incluye otros productos o costos que no están en V+Z. Esos 40 no deben importarse como correctos solo porque el promedio global pasa 98%. → La validación se calcula **por producto**, y esos 40 se bloquean.

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
| AA | tipo de tela | pista secundaria de vínculo (ej. "TREVIRA-1,50") — ver §5.1, la fórmula es mejor |
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

### 5.1 Cómo resolver qué material es cada línea (en orden de confianza)

**Advertencia — no usar precio parecido como identidad.** El importador NO debe deducir "esta línea vale $3.070 → es algodón, que también vale $3.070". Precio coincidente **no** prueba identidad: dos materiales pueden tener el mismo precio, y una línea de espuma a $3.070 no es algodón aunque el algodón valga eso. Vincular por precio produce recetas falsas que parecen correctas.

Resolver el material de cada fila en este orden, cayendo al siguiente solo si el anterior no da certeza:

1. **Referencia de fórmula al catálogo del Excel (método primario).** ~78% de las líneas de tela toman su precio con una **referencia de celda** a la fila de catálogo (fila 5 de la hoja). Esa referencia dice exactamente a qué material apunta — es mucho más confiable que comparar nombres o precios. Leer la fórmula de la celda de precio (`cell.f`) y resolver a qué celda del catálogo apunta.
2. **Tabla controlada de alias** (mapeo explícito nombre-Excel → código `MP-*`), para los nombres que no usan referencia de fórmula.
3. **Nombre normalizado** (sin tildes, mayúsculas) contra el catálogo, solo si hay match inequívoco.
4. **Si no hay certeza → residual.** Dejar el costo en `materialesMonto` y **reportarlo**. Nunca inventar el vínculo.

### 5.2 Reglas de desglose

- **Tela**: cantidad = col X (metros). Vincular por el método de §5.1. Cada tela del bloque es su propia línea `RecetaMaterial`.
- **Espuma**: **dejarla como monto residual por ahora** (decisión tomada, ver §6). El Excel la modela por cubicaje×densidad, no como una materia prima con nombre, y el catálogo aún no tiene espumas separadas por densidad/unidad. Crear vínculos de espuma ahora sería inventar. Se hará cuando se definan esas materias primas con Plastimar.
- **Accesorios (col AI)**: monto residual cuando el Excel no tenga su desglose.
- **Evitar duplicar costo**: `residual = V + Z − (suma de materiales efectivamente vinculados)`. Lo vinculado sale del monto; lo no vinculado queda como residual. Así el costo total no cambia, solo se reparte entre lo trazable y lo que aún no.
- **Precio para calcular**: el precio del Excel es solo la **fotografía de validación**. La receta usa el **precio vigente del ERP** (el del catálogo `MP-*`), que es lo que permite el recálculo automático a futuro.
- **Trazabilidad por línea**: guardar en `notas` (o donde corresponda) la hoja, fila, fórmula original, alias aplicado y nivel de confianza. Sirve para auditar después qué se vinculó y cómo.

---

## 6. Reglas de trabajo (NO negociables)

1. **El sistema se mantiene VACÍO hasta orden del cliente.** Decisión del dueño (flipe): tarifas y recetas quedan vacías a propósito para que Plastimar las llene desde el principio; lo está revisando con ellos. **No corras `--apply` contra producción sin confirmación explícita del dueño.**
2. **Dry-run primero, siempre.** El importador corre en dry-run por defecto y debe imprimir un informe: cuántas recetas, % de coincidencia con la columna AK, y las que no se pudieron desglosar. `--apply` solo tras revisar ese informe.
3. **No tocar `producto.precioLista`.** La ingesta crea/actualiza recetas. Que eso se traduzca en un nuevo precio de costo es un paso APARTE ("Aplicar a precio costo"), con snapshot, decidido por el usuario. El importador **nunca** debe escribir `precioLista`.
4. **Validar POR PRODUCTO, no por fila.** Comparar el costo que calcula el motor contra AK del Excel (tolerancia ±$2) **por producto único**, no contando filas físicas (eso infla el número). Hoy por producto es 98,55%; los **40 productos que no cuadran** (sets cuyo AK incluye costos fuera de V+Z) se **bloquean**, no se importan como correctos.
5. **El margen: extraer el literal, nunca defaultear a 35%.**
   - Extraer el porcentaje literal de la fórmula de la columna AN (van de 5% a 285%).
   - **Respetar el valor literal aunque supere 100%** — el Excel es la fuente de verdad de Allegro. Un 285% NO se bloquea: se importa y se **marca prominente en el informe** para revisión.
   - **Por qué no se bloquea el margen alto:** `margenTransferencia` es un campo editable **por receta** en el panel (editor de receta → "Margen Transferencia (%)"). Si un 285% estaba mal, se corrige ahí en un segundo y el costo se recalcula solo. No hace falta frenar la importación por eso.
   - MK-96 tiene AN=AL → margen **0% literal**, se respeta.
   - Los **5 productos sin fórmula usable** SÍ se bloquean: no hay valor que importar, y defaultear a 35% sería inventar.
6. **No inventar vínculos de material** (ver §5.1). Si un material no matchea con confianza, dejarlo como monto residual y reportarlo. Precio parecido ≠ identidad.
7. **Bloquear en el dry-run (no importar hasta revisión):**
   - los 40 productos cuyo costo no cuadra con AK;
   - los 5 productos con margen sin fórmula utilizable;
   - los 14 códigos que aparecen en bloques separados (dos productos con el mismo código);
   - cualquier residual negativo (`V+Z − vinculados < 0` = se vinculó de más).
8. **Códigos duplicados en bloques separados:** tomar la variante cuyo nombre coincida con el producto actual del ERP; si no hay coincidencia clara, **bloquear** y reportar. Nunca elegir por "mayor AK" a ciegas (eso borra la otra variante en silencio). *[Decisión de negocio pendiente de confirmar con Plastimar sobre casos ambiguos.]*
9. **Idempotencia.** Correr el script dos veces no debe duplicar (upsert por `codigo_interno`).

---

## 7. Verificación esperada

Contra base real (Postgres, no mocks — convención del proyecto):

1. Los productos MK generan receta sin duplicar, construyendo cada una desde su **bloque completo** (no una sola fila). Un producto multi-material (ej. MK-263: Trevira + NAPA + Velur) queda con **una línea por material**, no con una sola.
2. Coincidencia con la columna AK **por producto** ≥ 98% (no por fila). Los 40 que no cuadran quedan **bloqueados en el informe**, no importados.
3. Para un producto con desglose: líneas `RecetaMaterial` vinculadas + `materialesMonto` residual + mano de obra = el costo de fabricación del Excel. **El residual nunca es negativo.**
4. **Prueba de recálculo automático** (el objetivo del trabajo): cambiar el precio de una materia prima vinculada → el costo del producto que la usa cambia; los snapshots anteriores NO cambian (son inmutables).
5. El margen importado es el **literal** del Excel (no 35% por defecto); los casos sin fórmula quedan bloqueados, no en 35%.
6. El informe del dry-run lista explícitamente los 4 grupos bloqueados (§6.7) antes de cualquier `--apply`.
7. `npm run test:ci` en verde (incluye `costeo-engine`, `costeo-service`, `costeo-routes`). Agregar casos para: bloque multi-fila, multi-material, margen literal >100%, residual, y código en bloques separados.

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

El importador ya crea las recetas con el costo correcto pero como monto único; falta **expandir ese monto en líneas por material vinculadas al catálogo de 70 materias primas** —construyendo cada receta desde su bloque completo, resolviendo el material por referencia de fórmula (no por precio), respetando el margen literal, y bloqueando los casos dudosos (40 que no cuadran, 5 sin fórmula, 14 códigos duplicados, residuales negativos)— para que el costo se recalcule solo al cambiar un precio, sin inventar vínculos, sin tocar precios, con dry-run e informe, y sin correr en producción hasta que el dueño lo autorice.

---

## 10. Historial de revisión

- **v1** — handoff inicial.
- **v2** — incorpora la revisión verificada contra el Excel: productos multi-fila/multi-material (§3.1a), códigos en bloques separados (§3.1b), margen 5%–285% y el bug del default a 35% (§3.1c), validación por producto vs por fila (§3.1d), resolución de material por referencia de fórmula (§5.1), enfoque residual + trazabilidad (§5.2), y criterios de bloqueo en el dry-run (§6.7). El margen alto NO se bloquea porque es corregible por receta en el panel.
