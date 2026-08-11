# Informe de cierre — ingesta de recetas MK

Fecha: 2026-08-11

Alcance: importador de recetas del módulo de costeo.

Estado de datos: solo dry-run; no se escribieron recetas, tarifas, materias primas ni precios.

## 1. Cambios realizados

### `backend/src/routes/costeo/excel-import.js`

- Se separó la lectura y validación del Excel en funciones puras y testeables.
- Se agrupan las 6.740 filas en 2.758 códigos y se detectan los códigos que reaparecen en bloques separados.
- La variante se selecciona por similitud inequívoca entre el nombre del Excel y el nombre del producto ERP. Una coincidencia dudosa queda bloqueada.
- Las filas de materiales se obtienen desde los rangos realmente referenciados por las fórmulas de `T` y `Z`; no se suman indiscriminadamente todas las filas del código.
- El material se resuelve en este orden: referencia de fórmula a la fila 5, alias controlado y nombre normalizado exacto.
- El precio nunca se utiliza como identidad del material.
- Cada línea vinculada conserva cantidad física, unidad y trazabilidad: hoja/fila, fórmula, referencia, alias/confianza y costo fuente.
- La espuma con cubicaje/densidad queda en el residual, sin inventar una materia prima.
- El residual se calcula con costos fuente: `V + Z - costo fuente de líneas vinculadas`. Un residual inferior a -$2 bloquea la receta.
- El costo vigente del ERP se calcula separadamente con los precios actuales del catálogo y las tarifas activas.
- El margen se extrae literalmente. Se soportan porcentajes, factores, margen 0% (`AN = AL`) y valores sobre 100%. Nunca se usa 35% por defecto.
- La validación histórica por producto se mantiene independiente de la selección segura de variante, reproduciendo 2.718/2.758 coincidencias.

### `backend/scripts/import-costeo-excel.mjs`

- Dry-run por defecto con informe de cobertura, validación, bloqueos, duplicados, márgenes, materiales no resueltos, residuales y mayores desvíos.
- Consulta productos, materias primas, talleres y tarifas desde Postgres; no usa IDs de talleres hardcodeados.
- Ya no crea tarifas automáticamente.
- Solo `--apply` escribe recetas elegibles mediante el `upsertReceta` existente.
- Una base remota requiere adicionalmente `--allow-production`.
- `--apply` se rechaza si faltan las 70 materias primas, los talleres, las tres tarifas necesarias o si ninguna línea BOM pudo vincularse.
- El script nunca escribe `producto.precioLista`.

### `backend/test/costeo-excel-import.test.js`

Se agregaron seis pruebas para:

1. Margen literal 285%, factor 1.35, margen 0% y fórmula ausente/no soportada.
2. Producto multifila y multimaterial (`Trevira + NAPA + Velur`).
3. Precedencia de referencia de fórmula sobre una pista `AA` incorrecta.
4. Selección por nombre y bloqueo de códigos en bloques separados ambiguos.
5. Residual negativo.
6. Espuma por densidad conservada como residual.

### `backend/package.json`

- La nueva suite se agregó a `npm run test:ci`.

## 2. Verificaciones ejecutadas

### Suite CI backend

Comando: `npm run test:ci`

- 27 archivos de prueba aprobados.
- 253 pruebas aprobadas.
- 0 pruebas fallidas.
- Vitest informó una advertencia preexistente deprecando consultas concurrentes sobre un cliente `pg`; no produjo fallos.

### Módulo de costeo

Comando focalizado con las suites de motor, servicio, rutas e importador:

- 4 archivos aprobados.
- 35 pruebas aprobadas.

### Frontend

Comando: `npm run build`

- Build aprobado.
- Vite mantiene la advertencia existente de un chunk principal superior a 500 kB.

## 3. Resultado del dry-run real

Excel: `NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls`

Base usada: Postgres local configurado en `backend/.env` (`localhost`, sin producción).

| Métrica | Resultado |
|---|---:|
| Filas físicas MK | 6.740 |
| Códigos MK únicos | 2.758 |
| Códigos en bloques separados | 14 |
| Coincidencias contra AK por producto | 2.718 / 2.758 (98,55%) |
| Productos del Excel encontrados en la base local | 2.510 |
| Recetas elegibles con el estado actual de la base | 2.417 |
| Recetas bloqueadas | 341 |
| Materias primas activas locales | 0 |
| Tarifas activas locales | 0 |
| Líneas BOM vinculadas localmente | 0 |
| Líneas sin vínculo por catálogo local vacío | 5.082 |
| Líneas de espuma residuales | 3.669 ($98.257.037 fuente) |
| Márgenes sobre 100% | 37 |

Los bloqueos se superponen:

| Motivo | Cantidad |
|---|---:|
| Producto no encontrado en la base local | 248 |
| Variante ambigua | 59 |
| Costo no cuadra con AK | 40 |
| Sin fila principal confiable | 12 |
| Margen sin fórmula utilizable | 5 |

De los 14 códigos en bloques separados, 11 se resolvieron por nombre y 3 quedaron bloqueados. De los 59 casos de variante ambigua, 46 sí tienen producto local; el resto se superpone con productos ausentes. El criterio detecta también variantes distintas dentro de un mismo tramo del código, no solamente reapariciones separadas, para evitar mezclar dos recetas.

Mayores desvíos contra AK observados: `MK-62F`, `MK-62H`, `MK-180G`, `MK-180K`, `MK-203D`, `MK-435F`, `MK-435G`, `MK-435B`, `MK-62E` y `MK-62G`. El informe completo del comando lista los 20 mayores.

Productos bloqueados por margen sin fórmula: `MK-283`, `MK-016`, `MK-132`, `MK-110` y `MK-901`. `MK-96` se interpreta correctamente como margen literal 0%.

## 4. Decisiones de implementación

- Se separó costo fuente de costo vigente: el primero valida el Excel; el segundo permite que una variación futura del catálogo recalcule la receta sin alterar cantidades físicas.
- La referencia de fórmula conserva la máxima confianza incluso cuando usa un alias controlado para llegar al nombre canónico del ERP.
- Una selección por nombre exige puntaje mínimo y diferencia suficiente respecto de la segunda alternativa. En empate o similitud débil se bloquea.
- Los materiales no resueltos no bloquean por sí solos: permanecen en `materialesMonto` y aparecen en el informe.
- La aplicación exige catálogo y tarifas completos para impedir que un `--apply` accidental vuelva a crear recetas de monto único o costos laborales en cero.

## 5. Pendientes antes de cualquier aplicación

1. Cargar o restaurar en un entorno local/controlado las 70 materias primas y las tres tarifas; la base local actual está vacía en esos catálogos.
2. Repetir el dry-run para medir cobertura BOM real, alias no resueltos y cualquier residual negativo con IDs verdaderos.
3. Revisar manualmente los 46 productos locales con variante ambigua y los 248 códigos ausentes.
4. Revisar los 40 desvíos contra AK y los cinco márgenes ausentes.
5. Obtener autorización explícita del dueño antes de usar `--apply`; para una base remota se requiere además `--allow-production`.

No se ejecutó `--apply` y no se conectó a producción.
