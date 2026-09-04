# Auditoría del módulo de Costeo de Fabricación

Fecha: 2026-09-03 · Alcance: `/costeo` completo (frontend, API y motor de cálculo)
Ámbito revisado:

- `frontend/src/pages/costeo/CosteoPage.jsx`
- `frontend/src/pages/costeo/components/EditorRecetaModal.jsx`
- `frontend/src/pages/costeo/components/PanelCobertura.jsx`
- `frontend/src/api/costeo.js`
- `backend/src/routes/costeo/{index,service,engine,excel-import}.js`
- `backend/src/routes/bodega-taller/*` (la pestaña Materias Primas consume esta API)

---

## 1. Resumen

El módulo funciona de punta a punta —hay recetas, motor de cálculo, snapshots y
cobertura— pero tenía **tres defectos que alteran el costo sin avisar** y una capa
de UI construida a base de modales que no sigue el layout de los módulos ya
trabajados. Los defectos de cálculo, los tres puntos de diseño marcados y los cinco
problemas de fondo (permisos, motor duplicado, procesos, recálculo masivo y la
duplicación del CRUD) quedaron corregidos; lo que sigue abierto está en la
sección 5.

Riesgo de fondo: `Aplicar a Precio Lista` **sobrescribe `producto.precioLista`**
(`backend/src/routes/costeo/service.js:432`). Todo error de cálculo aguas arriba
termina en el precio de venta del catálogo.

---

## 2. Defectos corregidos en esta pasada

### 2.1 La receta perdía el monto de materiales del Excel (crítico) — CORREGIDO

El importador deja el residuo de materiales sin desglose en
`receta.materialesMonto` (`backend/src/routes/costeo/excel-import.js:544`), y el
motor lo suma como una línea más (`service.js:384`). El editor **no lo leía ni lo
enviaba**, y `upsertReceta` lo default-ea a 0 (`service.js:210`): con abrir una
receta importada y pulsar *Guardar borrador*, el monto se iba a cero y el costo
de fabricación se desplomaba en silencio. Ahora el editor lo conserva, lo envía y
lo muestra como línea del desglose.

### 2.2 El desglose en vivo mostraba $0 en todos los insumos de bodega — CORREGIDO

`useBodegaTaller()` responde `{ items, total, … }`, pero el editor leía
`materialesBodega?.data`, que no existe: la lista quedaba vacía y **todo material
de bodega valía $0 en el preview** (el selector sí los listaba, porque ahí sí se
leía `.items`). El usuario veía un costo y al aplicar se grababa otro.

### 2.3 El preview inventaba el valor hora — CORREGIDO

Sin tarifa vigente el preview usaba `3800`/`4200` fijos mientras el servidor
calcula la hora en **cero** (`service.js:372`). Preview y valor aplicado diferían
sin que nada lo indicara. Ahora ambos usan 0, y el aviso de "faltan tarifas" del
panel de cobertura queda como única señal.

### 2.4 "Recalcular con las tarifas vigentes" no recalculaba nada — CORREGIDO

El botón llamaba a `/recalcular-masivo` sin `aplicar`, es decir **solo simula**,
y el toast leía `r.actualizadas ?? r.total`, campos que la respuesta no trae
(`{ totalProcesados, aplicado, resultados }`): se anunciaba "Recalculadas recetas"
—sin número— tras una operación que no cambió nada. Ahora dice que es simulación
e informa cuántas recetas dan diferencia de costo.

---

## 3. Cambios de UI aplicados (lo marcado por el usuario)

1. **Materias primas dejó de vivir en modales.** Los cuatro modales (alta, edición,
   cambio de precio e historial) se reemplazaron por una pantalla íntegra,
   `frontend/src/pages/costeo/MateriaPrimaFormPage.jsx`, con el layout estándar
   (`FormPage` + `FormSection`/`FormField`), y tres rutas:
   `/costeo/materias/nueva`, `/costeo/materias/:id` (lectura) y
   `/costeo/materias/:id/editar`. Es **el mismo layout en los tres modos**: en
   lectura los campos van deshabilitados y se suma el historial de precios.
2. **Filtros y buscador subieron a la fila de herramientas de la tabla**, junto al
   botón *Columnas*, con alto 28 px (`toolbarExtra` de `Table`, igual que Bodega
   Taller). Se sumó "Limpiar filtros" y el contador.
3. **"Nueva materia prima" está a la altura de las pestañas**, en la barra de tabs.
   La misma regla se aplicó a "Nueva tarifa de proceso".

Además, tres arreglos que venían pegados a lo anterior:

- El alta mostraba `Densidad (kg/mÂ³)` (mojibake de encoding). Corregido.
- La edición **enviaba siempre `precio`**: si el campo quedaba vacío el costo se
  grababa en 0 y, si cambiaba, se escribía historial sin motivo. Ahora el precio
  viaja solo cuando cambia de verdad y pide motivo en ese momento.
- La edición solo mostraba densidad/espesor/formato si el material **ya** tenía
  alguno de esos datos o su taller se llamaba "Espumas": no había forma de cargar
  la ficha técnica a un material que no la tuviera. La sección ahora está siempre.
- El filtrado de materias primas era **en memoria sobre la primera página**: la
  API sirve de a 200 (`bodega-taller/index.js:104`) y el contador "71 de 71"
  habría mentido apenas el catálogo pasara ese tamaño. Ahora filtra y pagina en
  el servidor.

---

## 4. Segunda pasada: los cinco puntos de fondo

Todos resueltos. El detalle de cada uno:

### 4.1 Permiso: la ficha de materia prima la comparten Taller y Costeo

`can()` ya aceptaba una lista de módulos, así que `/bodega-taller` pasa a
`fastify.rbac(['taller', 'costeo'], …)`. Un usuario con `costeo` y sin `taller`
ya ve y edita la ficha; sin ninguno de los dos sigue recibiendo 403 (cubierto
por test). El registro de **lotes** queda deliberadamente en `taller:write`: es
trazabilidad de stock, no costeo. Se sumó `costeo` a la lectura de las listas
que la ficha necesita para llenarse —talleres, categorías de bodega taller y el
listado saneado de proveedores— sin abrir el resto de esos módulos. La UI además
oculta Editar cuando el usuario no tiene write en ninguno de los dos.

### 4.2 Un solo motor de costeo

El frontend ya no importa `backend/src/routes/costeo/engine.js` cruzando la raíz
del repo. En su lugar hay `POST /costeo/calcular`, que recibe la receta en
borrador y devuelve el mismo desglose que se graba al aplicar: mismos precios,
mismas tarifas, mismo redondeo. El editor lo llama con 300 ms de debounce y
pinta los subtotales por línea con lo que devuelve el servidor. Un test de
integración compara `POST /calcular` contra `POST /recetas/:id/calcular` y exige
que den lo mismo — esa era la garantía que faltaba y de cuya ausencia salieron
los defectos 2.2 y 2.3.

El endpoint también devuelve **avisos**: proceso sin tarifa vigente y material
que ya no existe. El editor los muestra en rojo sobre el desglose y marca la
línea afectada con "$0 · sin tarifa", en vez de dejar un cero indistinguible de
un costo real.

### 4.3 Catálogo de procesos

`backend/src/routes/costeo/procesos.js` es la única lista, servida por
`GET /costeo/procesos` y consumida por el alta de tarifas y por el editor.
`createTarifa` rechaza con 400 cualquier proceso fuera del catálogo, y la
normalización saca tildes además de bajar a minúsculas, de modo que
"CONFECCIÓN", "Confección" y "confeccion" resuelven al mismo proceso en vez de
crear tarifas paralelas que no cruzan con ninguna receta. El `<select>` del
editor ofrece además el proceso que la receta ya tiene aunque esté fuera del
catálogo, marcado como tal: antes se abría en blanco y al guardar lo reescribía
con otro.

### 4.4 Recálculo masivo

Ahora primero calcula todo (solo lecturas) y después escribe **el lote entero en
una sola transacción**: una caída a la mitad ya no deja medio catálogo con el
precio nuevo y medio con el viejo. Las tarifas se leen una vez para todo el lote
en lugar de por producto (eran ~3 consultas extra en cada iteración). La
respuesta trae el informe producto por producto —precio actual, calculado,
diferencia y avisos— más el conteo de errores.

### 4.5 Ficha única de materia prima

Se eliminó el formulario duplicado. `frontend/src/pages/materias-primas/MateriaPrimaFormPage.jsx`
es la única ficha, con todos los campos de los dos módulos —código interno y de
barra, nombre, detalle, taller, categoría, subcategoría, proveedor, sucursal,
unidad, costo con motivo, stock, stock crítico y ficha técnica de espuma— más
historial de precios y lotes en modo lectura. La abren los dos listados:

| Entrada | Ruta |
|---|---|
| Costeo → Materias Primas | `/materias-primas/:id?volver=/costeo?tab=materias` |
| Bodega Taller | `/materias-primas/:id?volver=/bodega-taller` |

`MaterialModal` de Bodega Taller quedó borrado. Precio y stock solo viajan al
servidor cuando cambian de verdad, así que ya no se ensucia el historial de
precios ni se generan movimientos de ajuste que nadie hizo.

---

## 5. Pendientes que siguen abiertos

| # | Hallazgo | Evidencia |
|---|---|---|
| 1 | `GET /costeo/snapshots` sin `productoId` devuelve **todos** los snapshots sin límite ni paginación. | `service.js` (`getSnapshots`) |
| 2 | `margenTransferencia` 35% sigue hardcodeado en el motor, el servicio y el editor. Debería ser configuración. | `engine.js:10`, `service.js`, `EditorRecetaModal.jsx` |
| 3 | El "margen" se aplica como **markup sobre el costo** (`costo × (1+m)`), no como margen sobre precio. Es consistente con el Excel de MK, pero la etiqueta induce a error a quien lea el desglose. | `engine.js:60` |
| 4 | La pestaña **Recetas** conserva el layout viejo: filtros sueltos sobre la tabla (no en `toolbarExtra`), buscador **sin debounce** —una consulta por tecla— y **dos paginadores** a la vez. | `CosteoPage.jsx` |
| 5 | Dos botones para una sola acción: "Simular Recálculo Masivo" en Recetas y "Simular con las tarifas vigentes" en el panel de cobertura llaman al mismo endpoint con los mismos parámetros. | `CosteoPage.jsx`, `PanelCobertura.jsx` |
| 6 | La simulación masiva ya devuelve el informe completo, pero la UI sigue mostrando solo el conteo. Falta la pantalla que liste qué producto sube, cuánto y por qué. | `PanelCobertura.jsx` |
| 7 | El editor de recetas sigue siendo un modal de 1000 px; es el candidato natural a pantalla íntegra después de Materias Primas. | `EditorRecetaModal.jsx` |
| 8 | Tarifas no permite **editar**: hay que desactivar y crear de nuevo. Tampoco expone el histórico, aunque la API lo soporta (`?historico=1`). | `CosteoPage.jsx` |
| 9 | Ningún rol otorga `costeo` salvo `admin` (`*`); solo se llega por permisos extra. Correcto si es deliberado, conviene dejarlo escrito. | `backend/src/middleware/rbac.js` |
| 10 | Dato de producción: en la vista revisada (71 materias primas) **ninguna tiene taller asignado**. Corrección respecto de la primera versión de este informe: esto **no** deja la mano de obra en cero —la tarifa cruza por el taller del PROCESO de la receta, no por el del material—; lo que sí rompe es el filtro por taller de la lista y la ficha técnica de espumas (el contador de espumas da 0 porque se deduce del taller del material). | `service.js` (`prepararEntradas`), evidencia de pantalla |

---

## 6. Verificación

- **Backend**: `costeo-service` y `costeo-routes` pasan, con 6 casos nuevos —
  paridad entre `POST /calcular` y el cálculo del producto, aviso de proceso sin
  tarifa, catálogo de procesos y rechazo del proceso fuera de él, lectura de la
  ficha con permiso `costeo` sin `taller` (y 403 sin ninguno), lote aplicado en
  una sola transacción con las tarifas leídas una vez.
- Las suites de RBAC, permisos por función, proveedores, categorías de bodega
  taller y pasar-taller pasan sin cambios.
- **Frontend**: `eslint` limpio en lo tocado —quedan 4 errores previos en
  `BodegaTallerPage` (`canDelete`, `clearFilters`, `handleDelete`, `selectStyle`
  sin usar) que ya estaban antes—, `vite build` compila, y los 2 tests que fallan
  en `Table.test.jsx` (redimensionado de columnas) también fallaban antes
  (verificado con `git stash`).
