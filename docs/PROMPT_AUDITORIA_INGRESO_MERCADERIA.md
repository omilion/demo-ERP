Necesito una AUDITORÍA PROFUNDA, de punta a punta, del módulo "Ingreso Mercadería"
del ERP Plastimar (monorepo: frontend React + backend Node/Fastify + Postgres/Prisma).
NO implementes nada todavía: primero audita, documenta y propone. Entrega un informe.

## Puntos de entrada conocidos (verifícalos, no los asumas completos)
- Vista lista: frontend/src/pages/stock-ingresos/StockIngresosPage.jsx  (ruta /stock-ingresos)
- Menú: frontend/src/components/TopBar.jsx:64 -> { label: 'Ingreso Mercaderia', route: '/stock-ingresos', module: 'bodega' }
- Formulario/creación: frontend/src/pages/bodega/BodegaFormPage.jsx y frontend/src/pages/bodega/BodegaPage.jsx
- API cliente: frontend/src/api/stockIngresos.js (y lo que use: proveedores.js, productos.js, ubicaciones.js, pagosProveedores.js)
- Backend: backend/src/routes/stock-ingresos/index.js y backend/src/routes/stock-ingresos/apply.js
- Rutas relacionadas a rastrear: ordenes-compra-proveedores, pagos-proveedores, productos, proveedores, ubicaciones, historial-materiales, bodega-taller, despachos, ventas
- Schema: backend/prisma/schema.prisma (tablas de documentos de bodega, detalle, stock, movimientos, proveedores, ubicaciones/bodegas)

## 1) Flujo de punta a punta (lo más importante)
Documenta con precisión, citando archivo:línea:
- ¿QUÉ es exactamente un "documento de ingreso"? Tipos de documento soportados (factura,
  guía, nota de crédito, ingreso sin documento, etc.) y qué cambia en cada uno.
- ¿CÓMO se LLEGA a esta pantalla? Todas las entradas: menú, dashboard, links desde órdenes
  de compra a proveedor, notificaciones, deep links con query params. ¿Se puede llegar con
  el módulo precargado/filtrado? ¿Los permisos/roles que la habilitan y dónde se chequean
  (frontend guard vs backend)?
- ¿CÓMO se SALE? Qué acciones cierran el ciclo: aplicar a stock, marcar pagado, anular,
  editar, eliminar, exportar. Qué estado queda en BD tras cada salida y si es reversible.
- Máquina de estados completa del documento (borrador -> aplicado -> pagado -> anulado...),
  incluyendo el "Pendientes stock" que muestra la KPI. Dibuja el diagrama de estados y di
  qué transiciones NO están cubiertas o permiten estados inconsistentes.
- Cada BOTÓN y ACCIÓN de la pantalla y del formulario: "Nuevo doc", "CSV resumen",
  "CSV detalle", Columnas, Zoom, expandir, paginación, acciones por fila (ver/editar/
  aplicar/anular). Para cada uno: qué endpoint llama, qué payload, qué valida, qué pasa
  si falla, si es idempotente, si hay confirmación, si respeta permisos.
- Idempotencia y concurrencia de "aplicar a stock": ¿se puede aplicar dos veces? ¿hay
  transacción? ¿doble submit? ¿race condition con dos usuarios? Esto es crítico: audítalo
  a nivel de código y de transacción SQL.

## 2) Conexiones con el flujo de venta y el resto del sistema
- ¿En qué parte del flujo cotización -> venta -> ODT/taller -> despacho -> facturación
  participa el ingreso de mercadería? Explica el rol del stock que ingresa.
- Trazabilidad hacia atrás: orden de compra a proveedor -> ingreso -> stock -> costo.
- Trazabilidad hacia adelante: ingreso -> disponibilidad para venta/despacho -> costo de
  la venta / margen en reportes gerenciales.
- Impacto en COSTOS y PRECIOS: ¿el ingreso actualiza costo del producto? ¿cómo (último
  costo, promedio ponderado, ninguno)? ¿Toca precios de venta? Contrasta con lo que el
  sistema realmente hace, no con lo que el nombre sugiere.
- Impacto en CAJA / PAGOS A PROVEEDORES: ¿el "Estado pago" del documento se sincroniza con
  el módulo pagos-proveedores, o son dos verdades separadas? Si hay doble fuente de verdad,
  márcalo como hallazgo alto.
- Historial de materiales / movimientos: ¿queda registro auditable de quién ingresó qué y
  cuándo? ¿Hay bitácora/auditoría? Si se anula, ¿queda rastro?
- Multi-bodega: cómo se resuelve la bodega destino y si hay fugas entre bodegas
  (bodega principal vs bodega taller).

## 3) Integridad de datos y conexión a base
- Revisa el schema Prisma de todas las tablas involucradas: FKs, unicidad (¿se puede cargar
  dos veces el mismo N° de documento del mismo proveedor?), nullables peligrosos, índices
  faltantes para los filtros que expone la UI (fecha, proveedor, bodega, estado pago).
- Revisa las queries del backend: N+1, paginación real vs en memoria, filtros que se
  ignoran silenciosamente, cálculos de totales (KPI "Monto pagina" vs total global — hoy
  el KPI dice "Pagina actual", evalúa si eso confunde al usuario).
- Tipos numéricos y redondeo: montos, IVA, cantidades decimales, moneda extranjera si
  aplica. ¿Decimal o float? ¿Dónde se pierde precisión?
- Validaciones: ¿el backend valida todo lo que valida el frontend? Prueba mentalmente un
  request malicioso/malformado directo al endpoint (cantidades negativas, producto de otra
  empresa, bodega inexistente, montos que no cuadran con el detalle).
- Autorización a nivel de endpoint: ¿cualquier usuario autenticado puede aplicar stock?

## 4) ¿Se ve toda la información necesaria?
Compara lo que el negocio necesita ver contra lo que la tabla y el formulario muestran.
Lista campos FALTANTES o no visibles sin entrar al detalle: proveedor, N° documento, tipo,
fecha emisión vs fecha ingreso, bodega, N° de OC asociada, neto/IVA/total, estado stock,
estado pago, vencimiento, usuario que ingresó, cantidad de ítems. Di cuáles deberían estar
en la grilla por defecto y cuáles en el detalle.

## 5) Auditoría UI/UX (hay hallazgos ya detectados, confírmalos y amplíalos)
Hallazgos que el usuario ya marcó y que DEBES incorporar como parte del informe:
(a) Falta un BUSCADOR GENERAL de la vista. Hoy solo hay filtros sueltos; debe existir un
    campo de búsqueda global (N° doc, proveedor, RUT, producto) coherente con el patrón
    usado en el resto del ERP — identifica ese patrón en otras páginas y reúsalo.
(b) El campo "Proveedor" es hoy un input de texto libre ("Nombre, RUT o codigo"). Debe ser
    un SELECTOR CON BÚSQUEDA (combobox/autocomplete contra la tabla de proveedores), no
    texto libre, para evitar filtros que no matchean nada. Verifica si existe ya un
    componente de este tipo en el proyecto y reúsalo en vez de crear uno nuevo.
(c) LAYOUT: todos los filtros (Desde, Hasta, N Doc, Documento, Estado pago, Bodega,
    Proveedor) deben quedar agrupados dentro del MISMO contenedor de filtros — hoy quedan
    en una fila superior separada del contenedor de la tabla, con una barra intermedia
    semivacía (Columnas / Zoom) que desperdicia espacio vertical. Propón la estructura
    correcta comparándola con cómo lo resuelven otras páginas del sistema (busca la página
    con el patrón de filtros mejor resuelto y úsala como referencia canónica).
Además audita: estados vacíos, loading/skeletons, manejo y visibilidad de errores,
feedback tras acciones (toasts), accesibilidad (labels, foco, navegación por teclado,
contraste), responsive, consistencia de formato de fecha/moneda con el resto del ERP,
densidad de la tabla, y si las KPI cards del tope aportan o solo ocupan espacio.

## 6) Entregable
Genera un informe en Markdown en docs/ (o auditoria-cierre/) llamado
AUDITORIA_INGRESO_MERCADERIA.md con:
1. Resumen ejecutivo (5-10 bullets, para gerencia, sin jerga técnica).
2. Mapa del flujo de punta a punta + diagrama de estados (mermaid).
3. Mapa de conexiones con venta/despacho/facturación/caja/costos (mermaid).
4. Inventario de acciones y endpoints (tabla: acción -> endpoint -> validaciones -> riesgos).
5. Hallazgos numerados y clasificados por severidad (Crítico / Alto / Medio / Bajo) y por
   categoría (Datos/BD, Lógica de negocio, Seguridad/permisos, UI/UX, Rendimiento).
   Cada hallazgo: evidencia con archivo:línea, cómo reproducirlo, impacto en el negocio,
   y fix propuesto concreto.
6. Plan de corrección priorizado, separando quick wins (<1h) de cambios estructurales.
7. Preguntas abiertas al negocio, si las hay.

## Reglas
- Lee el código real antes de afirmar cualquier cosa; cada afirmación va con archivo:línea.
- Si algo no lo puedes verificar, dilo explícitamente como "no verificado" en vez de suponer.
- NO modifiques código de producción ni la base de datos en esta pasada. Solo el informe.
- No hagas push ni toques el entorno de producción bajo ninguna circunstancia.
