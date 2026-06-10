# Respuesta a observaciones del cliente — Módulo Bodega, Despachos y Ventas

Fecha de revisión: 10-06-2026

Fuente cliente: `OBSERVACIONES MODULO BODEGA.docx` (texto + 9 capturas de pantalla del legacy y del ERP nuevo).

Verificación realizada directamente contra el código actual del ERP nuevo (frontend y backend). Nota importante: estas mismas observaciones se analizaron el 26-05-2026 (`docs/respuesta-observaciones-modulo-bodega-con-legacy-2026-05-26.md`) y desde entonces se ejecutaron los sprints de remediación. **La mayoría de los puntos que el cliente reporta como faltantes hoy ya están implementados.** Es probable que el cliente esté evaluando una versión anterior o no haya encontrado dónde está cada función. Este documento responde punto por punto: si falta o no, qué está mejorado, en qué difiere, y cómo se llega en el ERP nuevo.

## Resumen ejecutivo

| Estado | Cantidad |
|---|---:|
| ✅ Resuelto (existe y funciona) | 24 |
| 🟡 Parcial (existe con diferencias o falta un detalle) | 9 |
| ❌ No implementado (pendiente real) | 8 |
| 🔵 Tema de datos, no de funcionalidad | 1 |

Pendientes reales: código maestro, ubicación física como desplegable, campos edad/materialidad, descripción licitación, eliminar descripción larga, link de compra, regla automática "MK → taller" e integración SII. Todo lo demás existe.

---

## 1. BODEGA INVENTARIO (lista de productos)

**Cómo se llega:** menú superior **Bodega → Inventario** (ruta `/bodega`, pestaña "Bodega Inventario").

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 1.1 | Agregar filtros de búsqueda | ✅ No falta | La vista tiene 6 filtros desplegables (estado de stock, Web sí/no, categoría, subcategoría, estado inventario, estado operativo), 3 filtros de texto (proveedor, ubicación, ID Marco) y búsqueda por código, código de barra o nombre. |
| 1.2 | Publicado en la web sí/no, que lo muestre también en la tabla | ✅ No falta | Existe la columna **"Web"** con etiqueta verde "Si" / gris "No", y además un filtro desplegable "Web: todos / si / no". |
| 1.3 | Filtros con menú desplegable | 🟡 Casi completo | Los filtros principales ya son desplegables. Proveedor, ubicación e ID Marco siguen siendo texto libre; convertir proveedor a desplegable es un ajuste menor (el catálogo de proveedores ya existe en el sistema). |
| 1.4 | Permita entrar al editar con doble click | ✅ No falta | Doble click sobre cualquier fila abre directamente "Editar Producto". También funciona con teclado (flechas + Enter). |
| 1.5 | Generar descargables: Exportar Excel, Masivo Stock, Masivo Precios, Masivo Web, etc. | ✅ No falta | Botón **"Exportar Excel"** (genera archivo con las mismas columnas del legacy: Foto, Cod Interno, ID Marco, Cod Barra, Mostrar Web, Nombre, Categoría, Subcategoría, Descuento, Precio Costo, Precio venta + IVA, Precio Conv. Marco, Precio Licitación, Stock Crítico, Stock, Estado, Proveedor, Ubicación). Botón **"Importar"** con 4 modos masivos: Actualizar precios, Actualizar stock, Actualizar web y Crear productos nuevos. **Mejora sobre legacy:** acepta CSV y Excel XLSX, y prevalida el archivo completo antes de aplicar (muestra errores fila por fila), cosa que el legacy no hacía. |
| 1.6 | Se muestre nombre del proveedor | ✅ No falta | Columna "Proveedor" en la tabla. |
| 1.7 | Las fotos no coinciden con el nombre o código | 🔵 Tema de datos | No es una falla del módulo nuevo: las fotos vienen de la migración del legacy (`foto_extra`). El módulo permite corregir cada producto (miniatura, foto principal y galería). Se requiere una auditoría de datos para detectar y corregir los cruces foto/código heredados. |
| 1.8 | No mostrar stock mínimo en el stock | ✅ No falta | "Stock crít." y "Stock" son columnas separadas, y con el botón de **selector de columnas** cada usuario puede ocultar la columna de stock crítico si no quiere verla. |
| 1.9 | Trabajar código maestro (un producto vendido por varios proveedores, agrupar códigos sumando stock y precio ponderado) | ❌ Falta | Confirmado: no existe. Es un requerimiento nuevo (tampoco existía en el legacy). Requiere diseño: entidad "código maestro" que agrupe códigos por proveedor, con stock agregado y costo ponderado. |
| 1.10 | Botón "Ingreso de Mercadería" cambiar por "Crear nuevo" | ✅ No falta | El botón para crear producto ya se llama **"Crear nuevo"**. "Ingreso Mercadería" quedó como módulo aparte solo para facturas/boletas de proveedor que suman stock (igual que el legacy `facturas_bodega`). |
| 1.11 | Orden de tabla: Foto – Código – Mostrar Web – Nombre – Categoría – Subcategoría – Precio Costo – Precio Venta – Precio Licitación – Stock – Proveedor – Estado | ✅ No falta | El orden actual respeta exactamente esa secuencia: Foto, Cod., (ID Marco, Cod. Barra), Web, Nombre, Categoría, Subcategoría, (Desc.), P. costo/lista, P. venta/web, P. licitación, (Stock crít.), Stock, Proveedor, Estado. Las columnas extra entre paréntesis se pueden ocultar con el selector de columnas y la preferencia queda guardada por usuario. |
| 1.12 | Agregar filtro subcategoría | ✅ No falta | Filtro desplegable de subcategoría, dependiente de la categoría elegida. |
| 1.13 | Permitir múltiples filtros | ✅ No falta | Todos los filtros se combinan entre sí y con la búsqueda (ej.: categoría + subcategoría + web sí + proveedor + estado). |

---

## 2. EDITAR PRODUCTO (formulario)

**Cómo se llega:** Bodega → Inventario → doble click en un producto (o botón "Editar"). Para crear: botón "Crear nuevo". Ruta `/bodega/:id/editar`.

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 2.1 | Falta agregar subcategoría | ✅ No falta | Campo "Subcategoría" (desplegable dependiente de la categoría) en la sección "Datos del producto". |
| 2.2 | Ubicación física debe ser menú desplegable, no campo abierto | ❌ Falta | Confirmado: "Ubicación física" sigue siendo campo de texto libre. Pendiente crear catálogo de ubicaciones (pasillo/rack) y convertirlo en desplegable. |
| 2.3 | Falta agregar precio licitación | 🟡 Parcial | El formulario tiene "Precio marco" (convenio). El **precio licitación se calcula automáticamente**: precio costo + % licitación configurado en el proveedor (misma regla del legacy), y se muestra en Bodega, Consulta de Precios y exportaciones. Lo que no existe es un campo manual "precio licitación" editable por producto. **Pregunta al cliente:** ¿necesitan ingresar un precio licitación manual por producto, o basta el calculado por % proveedor? |
| 2.4 | Falta agregar edad, materialidad | ❌ Falta | Confirmado: no existen esos atributos en el producto. Pendiente agregarlos al catálogo. |
| 2.5 | Precio web viene por defecto de precio costo vs proveedor | 🟡 Parcial | Hoy: precio web vacío usa el precio lista automáticamente. Los precios de venta sala y licitación sí se derivan de precio costo + % del proveedor. Falta aplicar esa misma regla automática al precio web. **Pregunta al cliente:** confirmar la fórmula exacta esperada para el precio web. |
| 2.6 | Agregar descripción licitación | ❌ Falta | Confirmado: existen "Descripción larga" (interna) y "Descripción web", pero no "Descripción licitación" (el legacy sí la tenía como "Detalle para Licitación"). Pendiente. |
| 2.7 | Eliminar descripción larga | ❌ Falta | El campo "Descripción larga" sigue presente. Se eliminará/reemplazará cuando se agregue descripción licitación (puntos 2.6 y 2.7 van juntos). |
| 2.8 | Agregar descripción link de compra | ❌ Falta | Confirmado: no existe campo de link de compra. Pendiente. |
| 2.9 | Agregar historial de precio costo y stock | ✅ No falta | En la misma ficha del producto: **"Historial de precios"** (fecha, precio anterior, precio nuevo, % variación y usuario que hizo el cambio) y **"Movimientos manuales de stock"** (ingresos, egresos y ajustes con motivo obligatorio, categoría del motivo, fecha y usuario). **Mejora sobre legacy:** el legacy permitía editar precio/stock inline pero no guardaba un historial visible con usuario y variación. |
| 2.10 | Permitir agregar más de 1 fotografía | ✅ No falta | Tres espacios: Miniatura, Foto principal y **Galería** (múltiples imágenes). Subida directa de archivo JPG/PNG/WEBP hasta 4 MB con vista previa. |
| 2.11 | Productos con código "MK" se deben notificar a taller | ❌ Falta | Confirmado: no existe regla automática que avise a taller al crear/editar/importar un producto MK. Pendiente definir el disparador y el canal (¿notificación en pantalla del módulo Taller?, ¿correo?). |
| 2.12 | Achicar campos, no usar letra gris, usar negro, más compacto | 🟡 Parcial | Las tablas ya son compactas (fuente monoespaciada 11–12 px, filas densas). Los formularios y textos secundarios aún usan gris. Es un ajuste de diseño global (contraste y densidad) que se puede aplicar si el cliente lo prioriza; se recomienda validarlo con una pantalla de muestra antes de aplicarlo a todo. |

---

## 3. CONSULTA DE PRECIOS

**Cómo se llega:** menú **Bodega → Consulta Precios** (ruta `/consulta-precios`).

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 3.1 | Permitir múltiples filtros | 🟡 Parcial | Hay botones de modo de búsqueda + filtro de bodega combinable. Pero los modos son excluyentes: no se puede filtrar proveedor y categoría a la vez (en eso difiere del punto equivalente de Bodega, que sí combina todo). Si se necesita combinación total aquí, es un ajuste acotado. |
| 3.2 | Agregar botones de filtro | ✅ No falta | Replica exactamente los botones del legacy: **Todos, Código barra, Código interno, ID Marco, Nombre producto, Proveedor, Categoría** (los mismos de la captura del cliente). Proveedor y categoría despliegan selects con el catálogo. |
| 3.3 | Agregar subcategoría y Mostrar Web | 🟡 Parcial | Subcategoría: ✅ filtro (dependiente de categoría) y columna. Mostrar Web: ❌ no es columna en esta vista (sí existe en Bodega Inventario). Agregarla aquí es trivial porque el dato ya viaja. |
| 3.4 | Mostrar precio costo, precio venta, precio licitación, proveedor, stock | ✅ No falta | Columnas: Precio Costo, Desc. categoría, Desc. producto, **Normal sala + IVA** (precio venta), **Con descuento**, **Conv. Marco**, **Licitación**, Proveedor, Stock. **Mejoras sobre legacy:** (1) el precio costo es editable en línea (con permiso) — se escribe y se guarda con Enter; (2) los precios de venta/licitación se calculan solos con el % del proveedor, IVA y descuentos; (3) exportación a Excel y a PDF/imprimir de la vista filtrada; (4) selector de columnas por usuario. |

---

## 4. INGRESO MERCADERÍA / FACTURAS DE BODEGA

**Cómo se llega:** menú **Bodega → Ingreso Mercaderia** (ruta `/stock-ingresos`). El equivalente a "Cobranza Proveedores" del legacy está en **Caja → Pagos Proveedores** (ruta `/pagos-proveedores`).

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 4.1 | Agregar búsqueda de filtros | ✅ No falta | La captura del cliente mostraba solo Desde/Hasta/N° Doc. Hoy la vista tiene 7 filtros: **Desde, Hasta, N Doc, Documento (Factura/Boleta/Nota), Estado pago, Bodega, Proveedor** (por nombre, RUT o código). |
| 4.2 | Debe contener toda esta información (tabla legacy de Cobranza Proveedores) | ✅ No falta | En Pagos Proveedores están todas las columnas del legacy: N° Doc, Documento, **Estado (No pagada/Pagada)**, Proveedor con **RUT**, **Fecha documento, Fecha vencimiento, Fecha pago, Fecha creación, Creada por**, Total, NC. También los accesos rápidos del legacy: **"Facturas no pagadas (n)"** y **"Boletas no pagadas (n)"**, exportación CSV resumen y detalle, y KPIs de pendientes/vencidos/montos que el legacy no tenía. |
| 4.3 | Permitir crear nueva factura (probar en legacy para que lo entiendan) | ✅ No falta | El flujo legacy "Crear Nueva Boleta o Factura" existe en dos variantes: (1) **Ingreso Mercadería → "Nuevo doc"**: cabecera (documento, N° doc, proveedor con buscador, bodega, estado, fechas, observaciones) + **detalle línea por línea por código** con cantidad y costo, que al guardar **suma stock y actualiza el costo** — igual que el legacy; (2) **Pagos Proveedores → "Nueva boleta/factura"**: registro simple sin stock, equivalente al modal legacy "Se creará un nuevo documento para pagar a Proveedor". **Mejoras:** aplicar stock es auditable (quién y cuándo), se puede anular con motivo, y soporta Notas de crédito que descuentan stock. |

---

## 5. MÓDULO DESPACHOS

**Cómo se llega:** menú **Bodega → Despachos** (ruta `/despachos`), pestaña "Matriz despacho".

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 5.1 | Debe mostrar toda esta información (matriz legacy) | ✅ No falta | La matriz muestra: Fecha, N° interno, Cliente + RUT, OC / ID licitación, Total, Facturado, Estado pago, Estado entrega, **Detalle de productos con cantidades y entregados**, ODTs, Guías, Documentos, Destino (dirección, región, comuna, ciudad) y acciones (Ver venta, ODT, Pagos). **Mejoras sobre legacy:** barra de progreso de **packing** (entregados/total con %), **tracking logístico** con eventos (Preparado, En ruta, Entregado, Incidencia, Reprogramado...) y registro de incidencias con responsable y fecha compromiso — nada de esto existía en el legacy. |
| 5.2 | Permitir búsquedas pendiente de despachos por RUT cliente, región, comuna, ciudad | ✅ No falta | Filtros dedicados: **RUT, Región, Comuna, Ciudad**, más estado Entrega = "Pendiente entrega". Adicionales: N° interno, cliente, OC, ID licitación, guía, NC, ND, ODT, tipo de venta, estado pago, "Ventas hoy". Todos combinables. |
| 5.3 | Lo más similar posible a como está actualmente | 🟡 Parcial | La información y los filtros son equivalentes 1:1, pero el diseño es moderno (tarjetas KPI, badges) en lugar de la tabla colorida del legacy. Si el cliente necesita una réplica visual exacta, es una decisión de diseño a validar — recomendamos sesión guiada antes de invertir en "modo legacy". |
| 5.4 | Doble click y entrar al detalle de la venta | 🟡 Parcial | Hoy se entra con el botón **"Ver"** de cada fila (un click). El doble click no está activado en esta tabla, aunque la infraestructura ya lo soporta (Bodega lo usa); activarlo es un cambio de una línea. |

---

## 6. MÓDULO VENTAS / MATRIZ VENTAS

**Cómo se llega:** menú **Ventas → Matriz Ventas** (ruta `/matriz-ventas`). El detalle de venta abre con un click en la fila. Multas: dentro del detalle de la venta, sección "Multas".

| # | Observación del cliente | ¿Falta? | Detalle |
|---|---|---|---|
| 6.1 | En general cuesta mucho leerlo, faltan visualizaciones y funcionalidades | 🟡 Parcial | Tras los sprints de remediación, la matriz incluye todas las columnas operativas del legacy (ver 6.2–6.7). La legibilidad/densidad es subjetiva: proponemos sesión con el usuario clave para ajustar contraste y densidad sobre datos reales. |
| 6.2 | Replicar lo más parecido al sistema actual en visualización | 🟡 Parcial | Funcionalmente replica la matriz legacy: filtros por **N° Interno, ID Licitación, OC, ODT, Guías, NC, ND, Fechas, Cliente (RUT y nombre), Tipo Venta** (los mismos botones de la captura), columnas Total/Abono/Facturado/NC/ND/Saldo/Pago/Entrega/ODT/Guías/Docs y detalle de productos por fila. El diseño visual es distinto (moderno). |
| 6.3 | Documentos: agregar todo tipo de documento generado por SII, y opción de MULTAS | 🟡 Parcial | **Multas: ✅ implementado** — en el detalle de cada venta hay sección "Multas aplicadas" (fecha, N° doc, N° multa, interno, monto; agregar y eliminar), el despacho marca "Tiene multa" y se puede filtrar por "Con multa". **Documentos: registro manual ✅** (Factura, Boleta, Nota crédito, ND, Guía, Otro) asociados a la venta vía Caja. **Integración directa con SII (emisión de DTE): ❌ no existe** — confirmado. Es un alcance nuevo que debe cotizarse/definirse aparte si se requiere emisión electrónica desde el ERP. |
| 6.4 | Indicar el tipo de venta: WEB, LICITACIÓN, SALA, etc. | ✅ No falta | Pestañas de tipo (Todos, Venta sala, Venta web, Convenio marco, Licitaciones) + columna "Tipo" con badge de color en cada fila. |
| 6.5 | Matriz venta automatizada para ventas del día (hoy) | ✅ No falta | Botón rápido **"Ventas hoy"** que fija el rango a hoy automáticamente (mismo comportamiento del legacy); el título de la página indica "Ventas hoy" cuando está activo. |
| 6.6 | Permitir exportaciones de Excel | ✅ No falta | Los 4 exports del legacy: **Resumen, Detalle productos, Guías, NC/ND**, más **"Exportar filtrado"** (exporta todo el resultado filtrado, no solo la página visible). Formato CSV que abre directo en Excel; si el cliente exige .xlsx nativo con formato, es un ajuste menor. |
| 6.7 | Filtros, etc. (jugar en legacy) | ✅ No falta | 14 filtros combinables + filtros rápidos (Ventas hoy, No pagadas, Pendiente entrega, Entregadas no pagadas) + búsqueda libre + alcance Operacional/Histórico. Equivalen a todos los botones de búsqueda del legacy. |

---

## Pendientes reales consolidados (orden sugerido)

1. **Código maestro** (1.9) — requerimiento nuevo, el de mayor diseño. Necesita definición funcional con el cliente.
2. **Regla "MK → notificar a taller"** (2.11) — falta definir el canal de notificación.
3. **Campos de producto**: descripción licitación (2.6), eliminar/reemplazar descripción larga (2.7), link de compra (2.8), edad y materialidad (2.4) — un solo sprint de catálogo.
4. **Ubicación física como desplegable** (2.2) — requiere catálogo de ubicaciones.
5. **Precio licitación manual y regla de precio web** (2.3, 2.5) — bloqueado por definición del cliente.
6. **Ajustes menores de UI**: columna Mostrar Web en Consulta Precios (3.3), combinación de filtros en Consulta Precios (3.1), doble click en Despachos (5.4), proveedor como desplegable en filtros de Bodega (1.3).
7. **Contraste/densidad global** (2.12, 5.3, 6.1, 6.2) — validar con pantalla de muestra.
8. **Integración SII** (6.3) — alcance nuevo, definir y cotizar aparte.
9. **Auditoría de fotos migradas** (1.7) — tarea de datos, no de código.

## Preguntas abiertas para el cliente

1. **Código maestro:** ¿el código maestro reemplaza a los códigos por proveedor en ventas/web, o solo agrupa para visualización? ¿El precio ponderado es por stock disponible o por últimas compras?
2. **Precio licitación:** ¿basta el cálculo automático (costo + % licitación del proveedor) que ya existe, o necesitan un campo manual editable por producto?
3. **Precio web:** ¿cuál es la fórmula exacta esperada ("precio costo vs proveedor")? ¿% por proveedor igual que venta sala?
4. **Notificación MK:** ¿cómo debe avisarse a taller? ¿Aviso dentro del módulo Taller, correo, u otra cosa?
5. **SII:** ¿se requiere emisión de documentos tributarios desde el ERP (integración SII real) o solo registrar los documentos ya emitidos? Lo segundo ya existe.
6. **Edad/materialidad:** ¿son texto libre o listas predefinidas? ¿Se usan en la web o en licitaciones?
