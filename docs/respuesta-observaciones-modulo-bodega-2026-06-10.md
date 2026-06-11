# Respuesta a observaciones del cliente — Módulo Bodega, Despachos y Ventas

Fecha de revisión: 10-06-2026
**Actualizado: 11-06-2026** — tras ejecutar los sprints de cierre de brechas (S1 multi-proveedor, S2 MK→Taller, S3 campos de catálogo, S4 ubicación desplegable, S6 filtros/navegación, y subida de contraste). Los puntos cerrados se marcan abajo con "✅ Implementado (10-06)".

Fuente cliente: `OBSERVACIONES MODULO BODEGA.docx` (texto + 9 capturas de pantalla del legacy y del ERP nuevo).

Verificación realizada directamente contra el código actual del ERP nuevo (frontend y backend). Nota importante: estas mismas observaciones se analizaron el 26-05-2026 (`docs/respuesta-observaciones-modulo-bodega-con-legacy-2026-05-26.md`) y desde entonces se ejecutaron los sprints de remediación. **La mayoría de los puntos que el cliente reportaba como faltantes ya estaban implementados, y los pendientes reales se cerraron el 10-06-2026.** Este documento responde punto por punto: si falta o no, qué está mejorado, en qué difiere, y cómo se llega en el ERP nuevo.

> Trazabilidad del cierre: `docs/plan-cierre-brechas-cliente-bodega-2026-06-10.md`, `docs/sprints-cierre-brechas-bodega-2026-06-10/`. Branches: `codex/spr-bodega-cierre-brechas` (S2/S3/S4/S6 + contraste) y `codex/spr-bodega-01-multiproveedor` (S1).

## Resumen ejecutivo

| Estado | Cantidad |
|---|---:|
| ✅ Resuelto (existe y funciona) | 36 |
| 🟡 Parcial (bloqueado por definición del cliente o alcance externo) | 6 |
| 🔵 Tema de datos, no de funcionalidad | 1 |
| ❌ No implementado | 0 |

**Cerrado en este ciclo (antes pendiente):** código maestro → ahora multi-proveedor con costo ponderado (1.9), notificación MK→Taller (2.11), descripción licitación (2.6), eliminar descripción larga (2.7), link de compra (2.8), edad y materialidad (2.4), ubicación física como desplegable (2.2), **precio licitación manual por producto (2.3)**, proveedor como desplegable en Bodega (1.3), filtros combinables y columna Web en Consulta Precios (3.1, 3.3), doble click en Despachos (5.4), y subida de contraste de texto (parte de 2.12/6.1/6.2).

**Queda 🟡 (no por falta de trabajo, sino por definición externa):** regla automática de precio web (2.5 — espera fórmula del cliente), densidad/"modo legacy" visual (2.12, 5.3, 6.1, 6.2 — validación visual), integración SII para emitir DTE (6.3 — alcance nuevo a cotizar). 🔵 datos: auditoría de fotos migradas (1.7).

---

## 1. BODEGA INVENTARIO (lista de productos)

**Cómo se llega:** menú superior **Bodega → Inventario** (ruta `/bodega`, pestaña "Bodega Inventario").

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 1.1 | Agregar filtros de búsqueda | ✅ No falta | La vista tiene 6 filtros desplegables (estado de stock, Web sí/no, categoría, subcategoría, estado inventario, estado operativo), 3 filtros de texto (proveedor, ubicación, ID Marco) y búsqueda por código, código de barra o nombre. |
| 1.2 | Publicado en la web sí/no, que lo muestre también en la tabla | ✅ No falta | Existe la columna **"Web"** con etiqueta verde "Si" / gris "No", y además un filtro desplegable "Web: todos / si / no". |
| 1.3 | Filtros con menú desplegable | ✅ Implementado (10-06) | El filtro de **proveedor en Bodega pasó de texto libre a desplegable** con el catálogo de proveedores. Los demás filtros principales ya eran selects. |
| 1.4 | Permita entrar al editar con doble click | ✅ No falta | Doble click sobre cualquier fila abre directamente "Editar Producto". También funciona con teclado (flechas + Enter). |
| 1.5 | Generar descargables: Exportar Excel, Masivo Stock, Masivo Precios, Masivo Web, etc. | ✅ No falta | Botón **"Exportar Excel"** (mismas columnas del legacy). Botón **"Importar"** con 4 modos masivos: Actualizar precios, Actualizar stock, Actualizar web y Crear productos nuevos. **Mejora sobre legacy:** acepta CSV y Excel XLSX, y prevalida el archivo completo antes de aplicar (errores fila por fila). |
| 1.6 | Se muestre nombre del proveedor | ✅ No falta | Columna "Proveedor" en la tabla. |
| 1.7 | Las fotos no coinciden con el nombre o código | 🔵 Tema de datos | No es una falla del módulo nuevo: las fotos vienen de la migración del legacy (`foto_extra`). El módulo permite corregir cada producto (miniatura, foto principal y galería). Se requiere una auditoría de datos para detectar y corregir los cruces heredados. |
| 1.8 | No mostrar stock mínimo en el stock | ✅ No falta | "Stock crít." y "Stock" son columnas separadas, y con el **selector de columnas** cada usuario puede ocultar la de stock crítico. |
| 1.9 | Trabajar código maestro (un producto vendido por varios proveedores, agrupar sumando stock y precio ponderado) | ✅ Implementado (10-06) | **Resuelto mejor que el "código maestro" que pidió** (ese era un parche por lo precario del legacy: un solo campo proveedor y costo "última compra gana"). Ahora un producto tiene **varios proveedores, cada uno con su costo**; el sistema calcula **stock total** y **costo ponderado** = Σ(costo×cantidad)/Σcantidad. Ejemplo: A(10×$100)+B(30×$120) → stock 40, costo $115. El **precio de venta sigue siendo único**. **Cómo se llega:** ficha del producto → sección "Proveedores y costos". El ingreso por factura actualiza la fila del proveedor automáticamente. Pendiente solo el script de saneamiento que fusiona los códigos duplicados heredados (tarea de datos). |
| 1.10 | Botón "Ingreso de Mercadería" cambiar por "Crear nuevo" | ✅ No falta | El botón para crear producto ya se llama **"Crear nuevo"**. "Ingreso Mercadería" quedó como módulo aparte para facturas/boletas que suman stock (igual que `facturas_bodega` legacy). |
| 1.11 | Orden de tabla: Foto – Código – Mostrar Web – Nombre – Categoría – Subcategoría – Precio Costo – Precio Venta – Precio Licitación – Stock – Proveedor – Estado | ✅ No falta | El orden actual respeta esa secuencia; las columnas extra se ocultan con el selector de columnas (preferencia por usuario). |
| 1.12 | Agregar filtro subcategoría | ✅ No falta | Filtro desplegable de subcategoría, dependiente de la categoría elegida. |
| 1.13 | Permitir múltiples filtros | ✅ No falta | Todos los filtros se combinan entre sí y con la búsqueda. |

---

## 2. EDITAR PRODUCTO (formulario)

**Cómo se llega:** Bodega → Inventario → doble click en un producto (o botón "Editar"). Para crear: botón "Crear nuevo". Ruta `/bodega/:id/editar`.

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 2.1 | Falta agregar subcategoría | ✅ No falta | Campo "Subcategoría" (desplegable dependiente de la categoría) en "Datos del producto". |
| 2.2 | Ubicación física debe ser menú desplegable, no campo abierto | ✅ Implementado (10-06) | "Ubicación física" pasó a **desplegable** con catálogo de ubicaciones. La migración sembró las ubicaciones existentes y mapeó los productos. Se puede crear una ubicación nueva desde el formulario (con permiso de configuración). |
| 2.3 | Falta agregar precio licitación | ✅ Implementado (11-06) | En la ficha (sección Precios) hay un **checkbox "Definir precio manual"**: desmarcado muestra el **precio automático** (costo + % licitación del proveedor) como referencia; marcado habilita el campo para **escribir el precio manual**, que sobrescribe al cálculo. El valor efectivo se refleja en Bodega (columna "P. licitación"), Consulta de Precios y exportaciones. |
| 2.4 | Falta agregar edad, materialidad | ✅ Implementado (10-06) | Campos **Edad** y **Materialidad** agregados al producto (texto libre). Si luego se quieren como listas cerradas, es un ajuste menor. |
| 2.5 | Precio web viene por defecto de precio costo vs proveedor | 🟡 Bloqueado (cliente) | Hoy el precio web vacío usa el precio lista; venta sala y licitación se derivan del % del proveedor. Falta aplicar la regla automática al precio web. **Pendiente respuesta:** confirmar la fórmula exacta. |
| 2.6 | Agregar descripción licitación | ✅ Implementado (10-06) | Campo **"Descripción licitación"** agregado a la ficha. |
| 2.7 | Eliminar descripción larga | ✅ Implementado (10-06) | El campo "Descripción larga" se **ocultó del formulario** (el dato se conserva en BD para no perder histórico migrado). |
| 2.8 | Agregar descripción link de compra | ✅ Implementado (10-06) | Campo **"Link de compra"** agregado, con validación de URL (http/https) en frontend, backend e importación. |
| 2.9 | Agregar historial de precio costo y stock | ✅ No falta | En la ficha: **"Historial de precios"** (fecha, precio anterior/nuevo, % variación, usuario) y **"Movimientos manuales de stock"** (ingreso/egreso/ajuste con motivo, categoría, fecha, usuario). |
| 2.10 | Permitir agregar más de 1 fotografía | ✅ No falta | Miniatura, Foto principal y **Galería** (múltiples). Subida directa JPG/PNG/WEBP hasta 4 MB con vista previa. |
| 2.11 | Productos con código "MK" se deben notificar a taller | ✅ Implementado (10-06) | Al crear/editar/importar un producto cuyo código empieza con **MK**, se genera un **aviso automático en la Bitácora de Taller** (idempotente, no duplica). **Cómo se llega:** módulo Taller / Bitácora. Si se prefiere otro canal (correo), es configurable. |
| 2.12 | Achicar campos, no usar letra gris, usar negro, más compacto | 🟡 Avanzado parcial | **Contraste subido (10-06):** los textos secundarios grises se oscurecieron a nivel global (tokens de tema), aplicando "usar negro, no gris" en toda la app. Queda pendiente la parte de **densidad** ("más compacto"), que conviene validar con una pantalla de muestra antes de aplicar global. |

---

## 3. CONSULTA DE PRECIOS

**Cómo se llega:** menú **Bodega → Consulta Precios** (ruta `/consulta-precios`).

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 3.1 | Permitir múltiples filtros | ✅ Implementado (10-06) | Bodega, proveedor, categoría y subcategoría ahora son **combinables** entre sí (antes los modos eran excluyentes). |
| 3.2 | Agregar botones de filtro | ✅ No falta | Replica los botones del legacy: **Todos, Código barra, Código interno, ID Marco, Nombre producto, Proveedor, Categoría**. Proveedor y categoría despliegan selects con el catálogo. |
| 3.3 | Agregar subcategoría y Mostrar Web | ✅ Implementado (10-06) | Subcategoría ya existía (filtro + columna). Se **agregó la columna "Web" (Si/No)** en esta vista. |
| 3.4 | Mostrar precio costo, precio venta, precio licitación, proveedor, stock | ✅ No falta | Columnas: Precio Costo, Desc. categoría/producto, **Normal sala + IVA**, **Con descuento**, **Conv. Marco**, **Licitación**, Proveedor, Stock. **Mejoras:** precio costo editable en línea, cálculo automático con % proveedor/IVA/descuentos, export Excel y PDF, selector de columnas. |

---

## 4. INGRESO MERCADERÍA / FACTURAS DE BODEGA

**Cómo se llega:** menú **Bodega → Ingreso Mercaderia** (ruta `/stock-ingresos`). El equivalente a "Cobranza Proveedores" del legacy está en **Caja → Pagos Proveedores** (ruta `/pagos-proveedores`).

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 4.1 | Agregar búsqueda de filtros | ✅ No falta | 7 filtros: **Desde, Hasta, N Doc, Documento (Factura/Boleta/Nota), Estado pago, Bodega, Proveedor** (nombre, RUT o código). |
| 4.2 | Debe contener toda esta información (tabla legacy de Cobranza Proveedores) | ✅ No falta | En Pagos Proveedores están todas las columnas del legacy (N° Doc, Documento, Estado, Proveedor con RUT, fechas, Creada por, Total, NC), los accesos rápidos "Facturas/Boletas no pagadas (n)", export CSV resumen/detalle y KPIs que el legacy no tenía. |
| 4.3 | Permitir crear nueva factura | ✅ No falta | Dos variantes: (1) **Ingreso Mercadería → "Nuevo doc"** con detalle por código que **suma stock y actualiza costo** (ahora vía costo ponderado por proveedor, ver 1.9); (2) **Pagos Proveedores → "Nueva boleta/factura"** simple sin stock. Aplicar stock es auditable y reversible; soporta Notas de crédito. |

---

## 5. MÓDULO DESPACHOS

**Cómo se llega:** menú **Bodega → Despachos** (ruta `/despachos`), pestaña "Matriz despacho".

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 5.1 | Debe mostrar toda esta información (matriz legacy) | ✅ No falta | La matriz muestra Fecha, N° interno, Cliente + RUT, OC / ID licitación, Total, Facturado, Estado pago/entrega, detalle de productos con entregados, ODTs, Guías, Documentos, Destino. **Mejoras:** barra de packing, tracking logístico e incidencias — nada de eso existía en el legacy. |
| 5.2 | Permitir búsquedas pendiente de despachos por RUT, región, comuna, ciudad | ✅ No falta | Filtros dedicados **RUT, Región, Comuna, Ciudad** + estado Entrega = "Pendiente entrega", y muchos más, combinables. |
| 5.3 | Lo más similar posible a como está actualmente | 🟡 Decisión de diseño | Información y filtros equivalentes 1:1; el diseño es moderno. Una réplica visual exacta ("modo legacy") es una decisión a validar en sesión guiada. |
| 5.4 | Doble click y entrar al detalle de la venta | ✅ Implementado (10-06) | **Doble click activado** en la matriz: abre el detalle de la venta. El botón "Ver" se mantiene por accesibilidad. |

---

## 6. MÓDULO VENTAS / MATRIZ VENTAS

**Cómo se llega:** menú **Ventas → Matriz Ventas** (ruta `/matriz-ventas`). El detalle de venta abre con un click en la fila. Multas: dentro del detalle de la venta, sección "Multas".

| # | Observación del cliente | Estado | Detalle |
|---|---|---|---|
| 6.1 | En general cuesta mucho leerlo, faltan visualizaciones | 🟡 Avanzado parcial | La matriz ya incluye todas las columnas operativas del legacy (ver 6.2–6.7). **Contraste subido (10-06)**; la densidad fina queda para validar con el usuario clave. |
| 6.2 | Replicar lo más parecido al sistema actual en visualización | 🟡 Avanzado parcial | Funcionalmente replica la matriz legacy (filtros N° Interno, ID Licitación, OC, ODT, Guías, NC, ND, Fechas, Cliente, Tipo Venta; columnas Total/Abono/Facturado/NC/ND/Saldo/Pago/Entrega/ODT/Guías/Docs). Diseño visual moderno; contraste ya mejorado. |
| 6.3 | Documentos: todo tipo generado por SII, y opción de MULTAS | 🟡 Parcial (alcance externo) | **Multas: ✅** (sección en el detalle de cada venta + marca "Tiene multa" + filtro). **Documentos: registro manual ✅** (Factura, Boleta, NC, ND, Guía, Otro). **Emisión electrónica SII (DTE): ❌ no existe** — es alcance nuevo a cotizar/definir aparte. |
| 6.4 | Indicar el tipo de venta: WEB, LICITACIÓN, SALA, etc. | ✅ No falta | Pestañas de tipo + columna "Tipo" con badge por fila. |
| 6.5 | Matriz venta automatizada para ventas del día (hoy) | ✅ No falta | Botón rápido **"Ventas hoy"** que fija el rango a hoy; el título lo indica cuando está activo. |
| 6.6 | Permitir exportaciones de Excel | ✅ No falta | Los 4 exports del legacy (Resumen, Detalle productos, Guías, NC/ND) + "Exportar filtrado". Formato CSV (abre en Excel); si exigen .xlsx nativo con formato, es un ajuste menor. |
| 6.7 | Filtros, etc. | ✅ No falta | 14 filtros combinables + filtros rápidos + búsqueda libre + alcance Operacional/Histórico. |

---

## Pendientes consolidados (post-cierre)

**Bloqueados por definición del cliente:**
1. **Regla automática de precio web** (2.5) — espera la fórmula del cliente (el precio licitación manual ya quedó implementado).

**Decisión de diseño / validación visual:**
2. **Densidad y "modo legacy" visual** (2.12, 5.3, 6.1, 6.2) — el contraste ya se subió; falta validar densidad con pantalla de muestra.

**Alcance nuevo (a cotizar aparte):**
3. **Integración SII** (6.3) — emisión electrónica de DTE.

**Tareas de datos (no de código):**
4. **Auditoría de fotos migradas** (1.7).
5. **Saneamiento de códigos duplicados** del legacy para fusionarlos en el multi-proveedor (1.9) — la funcionalidad ya está; falta el script de migración de datos.

## Preguntas abiertas para el cliente

1. **Precio web:** ¿cuál es la fórmula exacta esperada ("precio costo vs proveedor")? ¿% por proveedor igual que venta sala?
2. **SII:** ¿se requiere emisión de documentos tributarios desde el ERP (integración SII real) o solo registrar los documentos ya emitidos? Lo segundo ya existe.
3. **Densidad UI:** ¿aprueban una pantalla de muestra (antes/después) para validar la compactación antes de aplicarla a todo el sistema?

> Resueltas en este ciclo: código maestro (confirmado como multi-proveedor con costo ponderado), canal de notificación MK (Bitácora de Taller), edad/materialidad (texto libre), precio licitación (campo manual por producto que sobrescribe al calculado).
