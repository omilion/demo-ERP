# Plan de cierre de brechas del cliente — Módulo Bodega / Despachos / Ventas

Fecha: 10-06-2026
Base: `docs/respuesta-observaciones-modulo-bodega-2026-06-10.md`
Branch sugerida por sprint: `codex/spr-bodega-<NN>-<slug>`

## Cómo leer este plan

- **Un sprint por problema** (los pendientes reales y parciales se cierran de forma trazable). Cada sprint es independiente y mergeable por separado.
- **Multiagente por sprint**: cada sprint pasa por 4 roles antes de cerrarse (ver abajo). Ningún sprint se da por cerrado sin aprobación de los 4.
- **Smoke + QA obligatorios por sprint**: cada sprint define su smoke test (humo, flujo feliz mínimo) y su QA (matriz de casos: feliz, error, permisos, bordes). No se cierra un sprint sin ambos en verde.
- Orden recomendado por valor/dependencia: **S1 → S9**. S1 (código maestro) es el más grande; el resto son acotados.

### Roles multiagente (aplican a TODOS los sprints)

| Rol | Agente | Responsabilidad |
|---|---|---|
| **Implementador** | `general-purpose` (o Codex) | Escribe el código + tests unitarios/integración. |
| **Revisor de correctitud** | `code-review` (high) | Bugs, regresiones, seguridad RBAC, consistencia transaccional. |
| **Revisor de simplicidad/reuso** | `simplify` | Que no se duplique lógica ya existente (pricing, movimientos, exports). |
| **QA / Verificación** | `verify` + smoke manual | Corre la app, ejecuta la matriz QA y el smoke, adjunta evidencia. |

### Definición de "Hecho" (Definition of Done) — común a todos los sprints

- [ ] Código implementado con cambios mínimos y trazables.
- [ ] Migración Prisma incluida y reversible (si aplica).
- [ ] Tests backend nuevos/actualizados verdes: `npm.cmd run test:full -- --reporter=dot`.
- [ ] Frontend lint + build verdes: `npm.cmd run lint` y `npm.cmd run build`.
- [ ] **Smoke test** ejecutado y documentado (ver cada sprint).
- [ ] **Matriz QA** ejecutada (feliz / error / permisos / borde) y documentada.
- [ ] Revisión multiagente: correctitud ✅, simplicidad ✅, QA ✅.
- [ ] Doc de cierre del sprint en `docs/sprints-cierre-brechas-bodega-2026-06-10/SPR-BD-<NN>.md` con evidencia y comandos.

---

## S1 — Multi-proveedor con costo ponderado (reemplaza el "código maestro")

**Brecha cliente:** punto 1.9. Un mismo producto comprado a varios proveedores. El cliente lo pidió como "código maestro que agrupe códigos distintos", pero esos códigos distintos eran un **parche del legacy** (un solo campo `proveedor` por fila, costo last-price-wins, filas duplicadas — ver `facturas_bodega/agregar_detalle/actualizar_detalle.php`). **No se replica el parche: se modela bien.**
**Estado actual:** no existe. `Producto` tiene un único `proveedor`/`proveedorId`. **DESBLOQUEADO** — diseño confirmado con el cliente el 10-06-2026.

### Modelo confirmado (exacto)
```
1 código de producto (el real)
   ├── Proveedor A → costo $100, cantidad 10
   └── Proveedor B → costo $120, cantidad 30
   Stock total      = 40
   Costo ponderado  = (100×10 + 120×30) / 40 = $115
   Precio de venta  = 1 solo (el de la empresa, NO por proveedor)
```
- El **costo** varía por proveedor; el **precio de venta es único** por producto.
- El **costo ponderado** alimenta `Producto.precioLista`, de modo que el motor de precios actual (venta sala, licitación, web vía `computeConsultaPrecios`) sigue funcionando sin cambios.

### Decisión de diseño tomada (regla de egreso)
- Al **ingresar** stock (factura proveedor): suma a la fila del proveedor de esa factura y actualiza su costo. ✅ sin ambigüedad.
- Al **egresar/vender** stock: se reduce **proporcionalmente** entre proveedores, lo que mantiene estable el costo ponderado. (Alternativas FIFO o manual quedan como mejora futura; proporcional es el default elegido por simplicidad y estabilidad del costo.)

### Alcance técnico
- **Schema** (`backend/prisma/schema.prisma`): nuevo modelo `ProductoProveedor` con `@@unique([productoId, proveedorId])`:
  ```
  productoId Int, proveedorId Int, costo Float @default(0),
  cantidad Int @default(0), ultimaCompra DateTime?, activo Boolean @default(true)
  ```
  Relaciones a `Producto` (onDelete: Cascade) y `Proveedor`. Mantener `Producto.proveedor`/`proveedorId` como "proveedor principal" para compatibilidad y vistas que muestran uno solo.
- **Cálculo** (nuevo helper, p. ej. `productos/costeo.js`): `stockTotal = Σ cantidad`; `costoPonderado = stockTotal > 0 ? Σ(costo×cantidad)/stockTotal : 0` (guardia división por cero). Tras cada cambio, sincroniza `Producto.stock = stockTotal` y `Producto.precioLista = round(costoPonderado)`.
- **Backend ingreso** (`stock-ingresos/apply.js`): por cada línea `destino=producto`, upsert `ProductoProveedor(producto, pago.proveedorId)`: `cantidad += linea.cantidad`, `costo = linea.precio`, `ultimaCompra = now`; recalcular stock/costo ponderado. Reusa el `DetalleFacturaProveedor` que ya captura cantidad+precio+proveedor.
- **Backend egreso** (movimientos `productos/` egreso/ajuste y consumo por venta): reducir `cantidad` proporcional por proveedor y recalcular.
- **Endpoints**: `GET /productos/:id/proveedores` (lista con costo, cantidad, costo ponderado y stock total) + CRUD manual para sembrar/corregir filas (necesario para migrar los duplicados legacy). Escritura con `catalogo:write` + `bodega:write`.
- **Frontend** (`BodegaFormPage.jsx`): sección "Proveedores y costos" — tabla editable de proveedor/costo/cantidad, con stock total y costo ponderado calculados en vivo. En `BodegaPage.jsx`/Consulta Precios el "Precio costo" ya muestra el ponderado (viene de `precioLista`); opcional badge "N proveedores".
- **Migración de datos (tarea aparte, no bloquea el sprint):** script que detecta el mismo producto comprado a varios proveedores (códigos duplicados heredados) y los fusiona en filas `ProductoProveedor`. Se agenda como saneamiento.
- **Tests**: ponderado con el ejemplo exacto (115), stock total 0 sin división por cero, ingreso que crea/actualiza fila de proveedor, egreso proporcional, permisos, único por (producto, proveedor).

### Smoke test (S1)
1. Producto `P-001`. 2. Ingreso factura Proveedor A: 10 un a $100 → fila A creada, stock 10, costo ponderado $100. 3. Ingreso factura Proveedor B: 30 un a $120 → fila B, stock 40, **costo ponderado $115**. 4. Egreso de 4 un → stock 36, costo ponderado sigue ≈$115. 5. El "Precio costo" en Bodega y Consulta Precios refleja $115.

### Matriz QA (S1)
| Caso | Esperado |
|---|---|
| Feliz: 2 proveedores (ejemplo) | Stock 40, costo ponderado $115 |
| Borde: stock total 0 | Costo ponderado 0, sin error de división |
| Ingreso al mismo proveedor 2 veces | Acumula cantidad, costo = última compra, ponderado correcto |
| Egreso/venta | Reduce proporcional, costo ponderado estable |
| Único (producto, proveedor) | No permite filas duplicadas |
| Precio de venta | Permanece único, NO se altera por proveedor |
| Permisos: sin `catalogo:write`/`bodega:write` | No puede editar costos/proveedores |

---

## S2 — Notificación automática "MK → Taller"

**Brecha cliente:** punto 2.11. Todo producto con código que empiece por `MK` debe notificar a taller al crear/editar/importar.
**Estado actual:** no existe. **Reuso clave:** ya existe `bitacoraTaller` (canal de avisos de taller) usado en `pasar-taller`. **Prioridad:** P1 — barato y muy visible para el cliente.

### Alcance técnico
- **Backend**: hook en `productos/create.js`, `productos/update.js` y rutas de importación masiva (`productos/importar/*`): si `codigoInterno` empieza con `MK` (case-insensitive), crear registro en `bitacoraTaller` (o tabla de notificaciones de taller) con tipo `producto-mk`, productoId, usuario y timestamp. Idempotente: no duplicar si ya se notificó para ese producto en creación.
- **Frontend**: indicador en el módulo Taller / Bitácora de productos MK pendientes de revisar (badge o lista). Mínimo viable: que el aviso aparezca en la bitácora existente.
- **Tests**: crear producto MK → genera aviso; crear no-MK → no genera; importar lote con mezcla MK/no-MK → avisos solo para MK; editar producto a código MK → genera aviso una vez.

### Smoke test (S2)
1. Crear producto `MK-TEST-1` → aparece aviso en Taller/Bitácora. 2. Crear `ESP-TEST-1` → no aparece aviso. 3. Importar CSV con 1 MK + 1 normal → solo 1 aviso.

### Matriz QA (S2)
| Caso | Esperado |
|---|---|
| Feliz: crear MK | Aviso en taller |
| Feliz: mayúscula/minúscula `mk-001` | Detecta igual |
| Negativo: código `AMK-1` (MK no al inicio) | No notifica |
| Importación masiva mixta | Avisos solo para MK, conteo correcto |
| Permisos | Solo usuarios con acceso a taller ven los avisos |
| Idempotencia | No duplica aviso al re-guardar el mismo MK |

---

## S3 — Campos de catálogo del producto (descripción licitación, link compra, edad, materialidad; eliminar descripción larga)

**Brechas cliente:** puntos 2.4, 2.6, 2.7, 2.8. Se agrupan porque tocan el mismo modelo y formulario.
**Estado actual:** ninguno existe; "Descripción larga" sí existe y debe reemplazarse. **Prioridad:** P2. **Parcialmente bloqueado:** confirmar con cliente si edad/materialidad son texto libre o listas (pregunta 6 del doc base).

### Alcance técnico
- **Schema** (`Producto`): agregar `descripcionLicitacion String?`, `linkCompra String?`, `edad String?`, `materialidad String?`. Mantener `descripcion` en BD por compatibilidad de datos migrados pero **ocultar el campo "Descripción larga" del formulario** (no borrar columna para no perder histórico).
- **Backend**: extender Zod en `create.js`/`update.js` y proyección en `list.js`/`get.js`. Incluir nuevos campos en export de productos.
- **Frontend** (`BodegaFormPage.jsx`): quitar "Descripción larga"; agregar "Descripción licitación" (textarea), "Link de compra" (input URL con validación), "Edad" y "Materialidad" (input o select según decisión cliente).
- **Tests**: persistencia de cada campo, validación de URL del link, que descripción larga ya no se exija ni muestre.

### Smoke test (S3)
1. Editar producto → ver los 4 campos nuevos y NO ver "Descripción larga". 2. Guardar con link válido e inválido. 3. Confirmar que aparecen en el export Excel.

### Matriz QA (S3)
| Caso | Esperado |
|---|---|
| Feliz: completar 4 campos y guardar | Persisten y se ven al reabrir |
| Error: link de compra mal formado | Validación bloquea/avisa |
| Borde: campos vacíos | Guarda sin error (son opcionales) |
| Datos migrados: producto con descripción larga antigua | No se pierde en BD, no se muestra en UI |
| Export | Nuevos campos presentes en el archivo |

---

## S4 — Ubicación física como desplegable (catálogo de ubicaciones)

**Brecha cliente:** punto 2.2. Ubicación física debe ser menú desplegable, no campo abierto.
**Estado actual:** campo de texto libre (`Producto.ubicacion`). **Prioridad:** P2.

### Alcance técnico
- **Schema**: nuevo modelo `Ubicacion` (id, nombre/código, activo) en schema `catalogo`. Opcional `ubicacionId` en `Producto` (mantener `ubicacion` string para datos migrados; sembrar catálogo a partir de los valores distintos existentes).
- **Backend**: CRUD de ubicaciones (admin/config), endpoint GET para poblar el desplegable. Migración de seed que extrae ubicaciones únicas actuales.
- **Frontend**: en `BodegaFormPage.jsx` reemplazar input "Ubicación física" por `Select` con autocompletar + opción "crear nueva" si tiene permiso. Filtro de ubicación en `BodegaPage.jsx` pasa de input a select.
- **Tests**: seed correcto, no perder ubicaciones migradas, crear/usar nueva ubicación.

### Smoke test (S4)
1. Abrir producto → ubicación es desplegable con valores existentes. 2. Seleccionar una y guardar. 3. Filtrar bodega por esa ubicación.

### Matriz QA (S4)
| Caso | Esperado |
|---|---|
| Feliz: elegir ubicación existente | Persiste |
| Migración: productos con ubicación texto previa | Quedan mapeados, no se pierden |
| Crear ubicación nueva (con permiso) | Aparece en el catálogo |
| Permisos: usuario sin config | No puede crear ubicaciones, solo elegir |
| Filtro por ubicación en lista | Resultados correctos |

---

## S5 — Precio licitación manual + regla de precio web por defecto

**Brechas cliente:** puntos 2.3 y 2.5. **Estado actual:** precio licitación se calcula (costo + % proveedor); precio web vacío usa precio lista. **Bloqueado por:** preguntas 2 y 3 del doc base → confirmar antes de codificar.

### Alcance técnico (según decisión cliente)
- Si piden **precio licitación manual**: agregar `precioLicitacion Float?` en `Producto`; en `pricing.js`/`computeConsultaPrecios`, usar el manual si está presente, si no, el calculado (fallback actual). Mostrar campo editable en formulario y columna.
- Si piden **regla de precio web**: aplicar en `pricing.js` la fórmula confirmada (ej. costo + % proveedor con IVA) como default cuando `precioWeb` es null. Documentar la fórmula.
- **Tests**: precedencia manual > calculado; fallback cuando manual es null; fórmula web correcta con y sin descuento.

### Smoke test (S5)
1. Producto sin precio licitación manual → muestra el calculado. 2. Ingresar manual → prevalece. 3. Borrar manual → vuelve al calculado. 4. Precio web vacío → toma el default por fórmula.

### Matriz QA (S5)
| Caso | Esperado |
|---|---|
| Manual presente | Prevalece sobre calculado |
| Manual ausente | Usa fórmula proveedor (sin regresión) |
| Web vacío | Aplica default confirmado |
| Web con valor | Respeta el valor manual |
| Export y Consulta Precios | Coherentes con la regla |

---

## S6 — Ajustes finos de filtros y navegación (UI acotada)

**Brechas cliente:** 1.3 (proveedor como desplegable en Bodega), 3.1 (combinar filtros en Consulta Precios), 3.3 (columna Mostrar Web en Consulta Precios), 5.4 (doble click en Despachos).
**Estado actual:** todos parciales y baratos. Se agrupan en un sprint de "pulido". **Prioridad:** P2 — alto impacto percibido, bajo costo.

### Alcance técnico
- `BodegaPage.jsx`: filtro proveedor pasa de input a `Select` con catálogo de proveedores (ya disponible vía `useProveedores`).
- `ConsultaPreciosPage.jsx`: permitir combinar bodega + proveedor + categoría/subcategoría simultáneamente (hoy los modos son excluyentes); agregar columna "Web" (Si/No) usando el dato ya disponible.
- `DespachosPage.jsx`: activar `onRowDoubleClick` en la matriz para abrir el detalle de la venta (la `Table` ya lo soporta; Bodega lo usa).
- **Tests**: front lint/build; pruebas de integración existentes no deben romper.

### Smoke test (S6)
1. Bodega: filtrar por proveedor desde el desplegable. 2. Consulta Precios: aplicar bodega + proveedor + categoría a la vez. 3. Consulta Precios: ver columna Web. 4. Despachos: doble click en una fila abre la venta.

### Matriz QA (S6)
| Caso | Esperado |
|---|---|
| Bodega proveedor select | Filtra correcto, combinable con el resto |
| Consulta Precios filtros combinados | Resultado intersección, sin perder modos |
| Columna Web en Consulta Precios | Si/No correcto por producto |
| Doble click despachos | Abre detalle de venta correcto |
| Accesibilidad: teclado | Sigue funcionando (Enter/flechas) |

---

## S7 — Exportaciones Excel nativas (.xlsx) donde el cliente lo pida

**Brecha cliente:** 1.5, 3.4, 6.6. **Estado actual:** ya hay exportaciones, pero en CSV (abren en Excel). El cliente menciona "Exportar a Excel" como botón explícito. **Prioridad:** P3 — solo si el cliente exige `.xlsx` con formato real.

### Alcance técnico
- **Backend**: helper de export que genere `.xlsx` (librería liviana, p. ej. `exceljs`) reusando los mismos builders de filas que hoy alimentan `rowsToCsv` (productos, matriz ventas, despachos, pagos proveedores). No duplicar la lógica de armado de filas.
- **Frontend**: botones existentes apuntan al endpoint `.xlsx`; mantener CSV como alternativa.
- **Tests**: el endpoint responde con content-type correcto y filas esperadas.

### Smoke test (S7)
1. Exportar productos a Excel → archivo `.xlsx` abre con columnas y formato. 2. Exportar matriz ventas (resumen) → idem.

### Matriz QA (S7)
| Caso | Esperado |
|---|---|
| Export productos filtrado | XLSX con filas filtradas, no toda la BD |
| Export matriz ventas (4 formatos) | Cada formato correcto |
| Permisos | Respeta RBAC de cada export |
| Volumen grande | No timeout / streaming OK |

---

## S8 — Contraste y densidad de UI (legibilidad operativa)

**Brechas cliente:** 2.12, 5.3, 6.1, 6.2. "Letras grises cansan, usar negro, más compacto, parecido al legacy."
**Estado actual:** tablas ya compactas; textos secundarios en gris. **Prioridad:** P3 — subjetivo, **requiere validación visual con el cliente antes de aplicar global.**

### Alcance técnico
- Pantalla de muestra (1 vista, p. ej. Matriz Ventas) con contraste subido (texto `--text-1`/negro en datos clave) y densidad mayor.
- Ajuste de tokens de tema (`--text-2`/`--text-3`) tras aprobación, aplicado de forma global y consistente.
- Sin cambios de datos ni lógica.

### Smoke test (S8)
1. Mostrar la vista de muestra antes/después al cliente. 2. Tras aprobación, recorrer Bodega, Consulta Precios, Despachos, Matriz Ventas verificando legibilidad y que nada se rompa en el layout.

### Matriz QA (S8)
| Caso | Esperado |
|---|---|
| Contraste AA en datos clave | Cumple |
| Densidad en tablas largas | Legible, sin solapamiento |
| Responsive | No rompe en anchos chicos |
| Aprobación cliente | Registrada antes del merge global |

---

## S9 — Integración SII (emisión de documentos tributarios)

**Brecha cliente:** 6.3. "Documentos: todo tipo generado por SII."
**Estado actual:** registro manual de documentos (Factura/Boleta/NC/ND/Guía) y multas ✅; **emisión electrónica real ❌**. **Prioridad:** P4 — **alcance nuevo, fuera del alcance original.** Debe cotizarse/definirse aparte.

### Pre-requisitos (no es código aún)
1. Definir con el cliente: ¿emisión directa de DTE desde el ERP o solo registro de los ya emitidos? (Si es lo segundo, **ya está hecho**.)
2. Si es emisión: proveedor de facturación electrónica (SII directo vs. tercero tipo LibreDTE/Factura.cl), certificados, folios CAF, ambiente de certificación.
3. Estimación y contrato separado.

### Entregable de este "sprint" (fase 0)
- Documento de alcance y arquitectura propuesta (integración, colas, reintentos, almacenamiento de XML/PDF, estados de DTE).
- No se implementa hasta aprobación comercial.

---

## Tabla maestra de seguimiento

| Sprint | Brecha(s) | Prioridad | Bloqueado por | Tamaño | Smoke | QA |
|---|---|---|---|---|---|---|
| S1 Código maestro | 1.9 | P1 | Decisiones cliente (P1–3) | L | ✔ definido | ✔ |
| S2 Notificación MK | 2.11 | P1 | — | S | ✔ | ✔ |
| S3 Campos catálogo | 2.4/2.6/2.7/2.8 | P2 | Edad/materialidad (P6) | M | ✔ | ✔ |
| S4 Ubicación desplegable | 2.2 | P2 | — | M | ✔ | ✔ |
| S5 Precio licitación/web | 2.3/2.5 | P2 | Fórmulas cliente (P2,3) | S | ✔ | ✔ |
| S6 Filtros/navegación | 1.3/3.1/3.3/5.4 | P2 | — | S | ✔ | ✔ |
| S7 Excel nativo | 1.5/3.4/6.6 | P3 | ¿Exige .xlsx? | M | ✔ | ✔ |
| S8 Contraste/densidad | 2.12/5.3/6.1/6.2 | P3 | Validación visual | S | ✔ | ✔ |
| S9 SII | 6.3 | P4 | Definición comercial | XL | — fase 0 | — |

**Nota datos (no es sprint):** punto 1.7 (fotos migradas que no coinciden) es una **auditoría de datos**, no de código — se agenda como tarea de saneamiento aparte usando los flujos de corrección de imagen que ya existen en la ficha de producto.

## Secuencia recomendada

1. **Sin bloqueo, arrancar ya:** S2, S6 (rápidos, muy visibles).
2. **En paralelo, mandar preguntas al cliente** (las 6 del doc base) para desbloquear S1, S3, S5, S7, S9.
3. **Al recibir respuestas:** S3, S4, S5.
4. **Mayor esfuerzo:** S1.
5. **Bajo prioridad / decisión cliente:** S7, S8.
6. **Comercial aparte:** S9.
