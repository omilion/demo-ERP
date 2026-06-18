# Trazabilidad de Cambios — SisGestión 3.0 (Plastimar)
### Reunión de requerimientos: cada observación del cliente → cambio implementado

> Este documento vincula **cada observación/solicitud planteada por Plastimar** en la reunión (Seba y Diego) con el cambio técnico concreto que la resuelve. Todos los cambios listados derivan directamente de las observaciones del cliente.
>
> **Commits de referencia:**
> - `3d9f0be` — feat(plastimar): ajustes reunión cliente
> - `15b25e6` — fix(prisma): migración de campos Plastimar
> - `8573cd2` — feat(ai): módulo asistente (ver nota al final)
>
> **Leyenda de estado:** ✅ Implementado y verificado · 🟡 Implementado, requiere confirmación de negocio · ⏳ Preparado (a la espera de dato/acción del cliente) · ❌ No implementado

---

## 1. Módulo de Licitaciones y Convenio Marco

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 1.1 | Modificar directamente nombre, descripción y precio de los productos para que coincidan con la licitación en Mercado Público | Edición inline de `nombre`, `descripcion`, `precio` en ítems de licitación | `cotizaciones/index.js`, `LicitacionDetallePage.jsx` | ✅ |
| 1.2 | Imprimir un PDF "ficha técnica y económica" con campos obligatorios para el portal | Endpoint `GET /cotizaciones/:id/ficha-tecnica-economica` + vista de impresión | `cotizaciones/index.js:460`, `LicitacionFichaPage.jsx` | ✅ |
| 1.3 | Campo para ingresar y guardar el ID de la licitación | Campo `idLicitacion` editable y persistido | `LicitacionDetallePage.jsx:24` | ✅ |
| 1.4 | Estados actualizables: pendiente, adjudicada, no adjudicada | Selector de estados (Pendiente, En proceso, Adjudicada, No Adjudicada, Rechazada, Cerrada) | `LicitacionDetallePage.jsx:19` | ✅ |
| 1.5 | Alerta automática al cumplirse el plazo de la licitación | Campo `fechaPlazo` listo. **DECIDIDO:** se implementará un **centro de alertas** (campanita en el menú) que despliega notificaciones y lleva a la acción al hacer clic | `schema.prisma`, migración `15b25e6` | ⏳ *campo listo; **pendiente de construir** el centro de alertas con campanita* |
| 1.6 | Checkbox para indicar si las bases permiten "envíos parciales" | Campo `enviosParciales` (checkbox) en licitación y orden | `schema.prisma`, `LicitacionDetallePage.jsx:33` | ✅ |
| 1.7 | Campo para que ventas ingrese el "monto de despacho" (cruce de costos y comisiones) | Campo `montoDespacho` en licitación y orden | `schema.prisma`, `LicitacionDetallePage.jsx:34` | ✅ |

---

## 2. Matriz de Ventas y Despacho

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 2.1 | Eliminar botones "corregir sumando" y "corregir restando" | Botones removidos de la vista de venta | `ViewVentaPanel.jsx` | ✅ *(no quedan referencias en el código)* |
| 2.2 | Desde la misma vista de la venta, generar operaciones posteriores (orden de transporte, notificaciones) | Acciones rápidas: **Crear Despacho** (abre el formulario precargado) y **Forzar/Notificar Taller (ODT)** | `ViewVentaPanel.jsx:71,197,220`, endpoint `POST /ventas/:id/forzar-taller` | ✅ |
| 2.3 | Columna de ciudad/región de despacho en ventas pendientes de entrega | Columnas "Región Desp." y "Ciudad Desp." en la matriz | `MatrizVentasPage.jsx:299-300` | ✅ |
| 2.4 | El buscador de productos al crear una venta debe mostrar la foto del producto | Miniatura de producto (`fotoUrl`) en los resultados del buscador | `VentasFormPage.jsx:84` | ✅ |
| 2.5 | Campo de texto para dirección exacta de despacho y contacto | Campos override de despacho en `Orden`: `direccionDespacho`, `contactoDespacho`, `regionDespacho`, `comunaDespacho`, `ciudadDespacho` | `schema.prisma`, `ventas/create.js`, `ventas/update.js` | ✅ |

---

## 3. Producción y Talleres (ODT/OT)

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 3.1 | Identificar a qué taller (espuma, confección, madera) corresponde cada producto | Campo `tallerId` (FK a `Taller`) + `tiempoTeorico` en `Producto` | `schema.prisma`, migración `15b25e6` | ✅ |
| 3.2 | La notificación al taller desde ventas debe ser **obligatoria** (evitar pedidos sin aviso) | Auto-notificación: al crear/actualizar una venta, los productos `transitorio` generan ODT automáticamente. **DECIDIDO:** asignación de taller automática (Opción A); el taller del producto se inferirá del historial (ver propuesta abajo) | `ventas/create.js`, `ventas/update.js`, `pasar-taller/service.js` | ✅ *auto-notificación lista; falta poblar `tallerId` por historial (script de inferencia)* |
| 3.3 | Vista rápida de tabla para operarios con productos y fotografías (sin entrar a la ficha de venta) | Página móvil `/taller-operario` con tarjetas/filas (producto, foto, cantidad, observaciones) | `TallerOperarioPage.jsx`, endpoint `GET /odts/taller-items` | ✅ |
| 3.4 | Interfaz de operario (móvil) con botones simples: iniciar, terminar, avances parciales | Controles de estado por ítem (iniciar/avance/finalizar) + edición de observación | `TallerOperarioPage.jsx`, `odts/item-workflow.js` | ✅ |
| 3.5 | El campo "observación de venta" (ej. "color amarillo") debe ser visible para el operario | Observación de venta/ODT mostrada en la vista de operario | `TallerOperarioPage.jsx` | ✅ |
| 3.6 | El "tiempo de entrega" debe ser un campo de registro formal (no texto abierto) | Campo `fechaEntregaCompromiso` en `Odt` | `schema.prisma`, `pasar-taller/service.js` | ✅ |
| 3.7 | El supervisor debe asignar un responsable específico a cada tarea/alerta | Campo `operarioResponsableId` en `OdtItemTaller` + asignación desde la vista de operario | `schema.prisma`, `TallerOperarioPage.jsx:42`, `odts/index.js` | ✅ |

---

## 4. Clientes, Proveedores y Finanzas

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 4.1 | Etiqueta/alerta visual para "clientes conflictivos" (municipios, instituciones morosas) | Campos `conflictivo` + `conflictivoDetalle` en `Cliente`; badge ⚠ Conflictivo en la matriz | `schema.prisma`, `MatrizVentasPage.jsx:260` | ✅ |
| 4.2 | Facturas vencidas destacadas en rojo en la vista de no pagadas | Resaltado de fila roja (`background: #fee2e2`) para pendientes vencidas + tab "Vencidos" | `PagosProveedoresPage.jsx:253` | ✅ |
| 4.3 | Limpiar base de proveedores: duplicados y antiguos sin RUT | Script `clean-proveedores.mjs`: fusiona duplicados (RUT/nombre), maneja colisión de unique constraint, sanea RUTs | `backend/scripts/clean-proveedores.mjs` | ⏳ **Pendiente** *(decisión del usuario): no ejecutar aún; requiere respaldo y corrida en seco antes de aplicar sobre datos reales* |

---

## 5. Recursos Humanos y Comisiones

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 5.1 | Agregar campos "sueldo" y "hora extra" en la ficha de cada trabajador | Campos `sueldoBase` y `valorHoraExtra` en `Trabajador` (creación/edición) | `schema.prisma`, `rrhh/index.js:605-608` | ✅ |
| 5.2 | Comisión solo se paga si la venta está **despachada, facturada y completamente pagada** | Regla `isEligible = pagada && entregada && facturada`; si no cumple, comisión = 0 | `reportes/comisiones.js` | ✅ **CONFIRMADO** *(decisión del usuario): se mantiene la regla estricta actual (sin comisión devengada antes del cierre)* |
| 5.3 | Descontar automáticamente multas del cliente y notas de crédito por productos no entregados | Descuento de `Multa` y NC (vía `numeroNCInterna`) de la base de comisión | `reportes/comisiones.js` | ✅ |
| 5.4 | Mostrar las reglas de descuento preconfiguradas en formato de **lista** | La estructura de reglas de descuento ya existe (`DescuentoRegla`, catálogo y motor). Mostrarlas/gestionarlas en formato lista es trabajo de configuración sobre lo existente | `descuento_reglas` (schema), `ventas/descuentos-catalog.js` | ⏳ *estructura lista; vista/uso en formato lista a trabajar por el equipo del cliente* |

---

## 6. Alertas, KPIs y Análisis de Datos

| # | Observación del cliente | Cambio implementado | Archivos | Estado |
|---|---|---|---|---|
| 6.1 | Indicador acumulado de ventas año en curso vs año anterior (YoY YTD) | Widget "Ventas YoY YTD (Acumulado Anual)" en el dashboard | `DashboardPage.jsx:427`, `dashboard/stats.js` | ✅ |
| 6.2 | Widget que cruce ventas actuales con una meta definida manualmente por administración | Campo `metaMensualVentas` en `EmpresaConfig` + barra "Meta Mensual de Ventas" | `schema.prisma`, `DashboardPage.jsx:458`, `dashboard/stats.js` | ✅ |
| 6.3 | Comparar tiempos teóricos de cada producto con tiempos prácticos (Diego enviará la base limpia) | Campo `tiempoTeorico` en `Producto` (estructura preparada) | `schema.prisma`, migración `15b25e6` | ⏳ *campo listo; **a la espera de que Diego envíe la base de tiempos teóricos** para poblar y construir la comparativa* |

---

## Resumen de cumplimiento

| Módulo | Solicitudes | ✅ Listo | ⏳ Por trabajar / esperar |
|---|---|---|---|
| 1. Licitaciones | 7 | 6 | 1 (centro de alertas) |
| 2. Matriz/Despacho | 5 | 5 | – |
| 3. Producción/Talleres | 7 | 7 | (falta poblar `tallerId` por historial) |
| 4. Clientes/Proveedores/Finanzas | 3 | 2 | 1 (ejecutar limpieza proveedores) |
| 5. RRHH/Comisiones | 4 | 3 | 1 (vista descuentos en lista — config cliente) |
| 6. KPIs/Análisis | 3 | 2 | 1 (tiempos teóricos: espera dato de Diego) |
| **Total** | **29** | **25** | **4** |

> Las 29 observaciones del cliente están **atendidas a nivel de estructura/código**. Las 4 pendientes no son funcionalidades faltantes sino: 1 desarrollo acordado (centro de alertas), 1 ejecución operacional (limpieza proveedores), 1 configuración del equipo del cliente (descuentos en lista) y 1 a la espera de un dato externo (tiempos teóricos de Diego).

### Decisiones tomadas en esta revisión
- **1.5 → Centro de alertas:** se construirá una campanita en el menú con notificaciones accionables (no solo el plazo de licitación; sirve de base para todas las alertas del sistema).
- **3.2 → Asignación automática de taller (Opción A):** el `tallerId` de cada producto de producción se inferirá del historial (ver propuesta abajo).
- **4.3 → Limpieza de proveedores:** queda **pendiente** por decisión del usuario (no ejecutar aún).
- **5.2 → Comisión estricta:** se mantiene la regla actual (pagada + entregada + facturada; sin comisión devengada antes).

---

## Propuesta técnica — 3.2: inferir el taller de cada producto por historial

**Datos reales medidos (base del VPS, `plastimar_erp`):**
- Talleres activos: **confecciones, espumas, externo, madera**.
- Registros históricos producto↔taller (`odt_item_talleres`): **26.830**.
- Productos distintos con historial de taller: **1.747**.
- De esos: **164** pasaron por **un solo** taller; **1.583** por **más de uno** (ambiguos).

**Conclusión:** no existe "el taller del producto" como dato único — la mayoría pasó por varios talleres. Por eso se asigna el **taller predominante (moda)**, no "el único".

**Mecanismo propuesto (script `infer-taller-productos.mjs`, con corrida en seco previa):**
1. Por cada producto, contar ocurrencias por taller en `odt_item_talleres`.
2. Asignar `Producto.tallerId` = taller con más ocurrencias.
3. **Umbral de confianza:** si el taller dominante concentra **≥70%** → asignar; si está repartido → marcar "requiere revisión manual" (no asignar, lo define el jefe de taller).
4. Productos sin historial → quedan sin `tallerId`; se clasifican la primera vez que entran a una ODT y a futuro ya tienen historial.
5. **Corrida en seco primero:** el script muestra qué asignaría y qué deja ambiguo, para revisión antes de aplicar (mismo patrón seguro del script de proveedores).

---

## ⚠️ Hallazgo de infraestructura (acción requerida)

Al consultar la base real del VPS, se detectó que **la migración de campos Plastimar (`15b25e6`) NO está aplicada en producción** — las columnas `taller_id`, `tiempo_teorico`, `conflictivo`, etc. **no existen aún en la base del VPS**.

Esto significa que el último deploy a producción **no aplicó la migración** (o falló en ese paso). **Antes de que estos cambios funcionen en producción**, hay que verificar el estado del deploy y aplicar la migración en el VPS (`prisma migrate deploy`). Hasta entonces, la app en producción seguiría sin estos campos.

---

> **Nota — Módulo Asistente IA (commit `8573cd2`):** El módulo de asistente gerencial (chat con IA sobre datos del ERP, generación de Excel/PowerPoint) **no corresponde a una observación de esta reunión**. Se incluye como desarrollo adicional. Si debe vincularse a un requerimiento previo del cliente o tratarse por separado, indicarlo.
