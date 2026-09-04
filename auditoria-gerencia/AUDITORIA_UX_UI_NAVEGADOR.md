# Auditoría UX/UI y comportamiento en navegador

## Alcance de evidencia

| Dimensión | Estado | Evidencia |
|---|---|---|
| Estructura, filtros, estados de carga y navegación | Confirmado por código frontend | Componentes y consultas de Reportería Gerencial/Dashboard |
| Respuestas y latencia productiva | Confirmado en producción | API y logs del VPS |
| DOM, capturas, FPS, long tasks y tablet | **No verificado visualmente** | El controlador integrado no pudo iniciar su runtime |

No se infieren capturas ni fluidez. Cualquier afirmación visual se limita a lo demostrable por estructura y estilos del código.

## Hallazgos críticos

### 1. Arquitectura de información equivocada para dirección

No hay una vista de Dirección ni una Analítica Financiera diferenciadas. Gerencia recibe una sola reportería con pestañas operativas. En cinco segundos no puede responder:

- ¿ganamos o perdemos dinero y por qué?;
- ¿qué caja tendremos en 4, 8 y 12 semanas?;
- ¿qué negocio, cliente o línea destruye margen?;
- ¿cuánto capital está detenido en inventario?;
- ¿cuál es el cuello de botella del taller?

La portada debe priorizar seis a ocho KPIs certificados, variación vs. presupuesto/período anterior, alertas y explicación. Hoy predominan conteos de actividad.

### 2. Filtros incompletos y costosos

- El rango inicial abarca del 1 de enero al 31 de diciembre del año actual, incluso si la fecha actual es septiembre. Eso parece “año” pero no comunica YTD ni período futuro vacío.
- No existen atajos Mes, Trimestre, YTD, últimos 12 meses ni cierre anterior.
- No hay selector de sucursal visible pese a que el alcance se filtra en backend.
- Vendedor y cliente disparan nuevas consultas al escribir; no hay debounce.
- El filtro “Cliente/RUT” no aplica la misma semántica en órdenes, web y licitaciones.
- No se muestra la zona horaria, fecha de corte ni última actualización.

### 3. Carga y fallos ambiguos

La pantalla lanza hasta 12 solicitudes: cinco agregados especializados y siete endpoints generales/fallback. Presenta una franja “Actualizando reportes…” y textos, no skeletons por bloque.

El mecanismo de fallback considera una sección utilizable si **cualquiera** de sus consultas aporta datos. Esto puede esconder la caída del agregado oficial y mostrar una mezcla parcial sin una advertencia ejecutiva. Para BI es inaceptable: un dato degradado debe declarar origen, alcance y estado.

### 4. Gráficos visualmente simples pero analíticamente débiles

Los gráficos son barras DOM/CSS y limitan la cantidad de marcas, por lo que el renderizado gráfico aislado probablemente es liviano. Esto es una inferencia de implementación, no una medición de FPS.

Problemas confirmados:

- períodos obtenidos con `Object.entries(...).slice(-12)` sin orden cronológico garantizado;
- ausencia de ejes, unidades, meta y comparación homogénea;
- “top 7” sin categoría “Otros”, por lo que no reconcilia con el total;
- etiquetas CLP extensas propensas a competir por espacio;
- colores sin definición analítica estable ni soporte visible para accesibilidad;
- no hay intervalos de confianza, estado conciliado o advertencias de calidad.

### 5. Drill-down insuficiente

Algunas tablas permiten abrir órdenes u ODT, pero los KPIs combinados no conservan una relación completa con todos los registros contribuyentes. CxC, caja y stock navegan como máximo a módulos generales. Un ejecutivo no puede explicar una variación frente a Finanzas sin rehacer el cálculo.

### 6. Exportación bloqueante

Solo existe Excel. El navegador espera un blob mientras el backend recalcula reportes y construye el libro en el proceso principal de Node. No hay:

- trabajo en segundo plano;
- progreso o identificador de tarea;
- botón deshabilitado durante generación;
- notificación persistente al completar;
- historial de exportaciones;
- PDF ejecutivo.

En producción, la exportación YTD medida tardó 3,07 s. Con concurrencia o crecimiento de datos, puede degradar caja/taller/bodega porque comparte CPU, RAM y base.

### 7. Riesgo de ceros falsos

El dashboard operativo usa valores cero como placeholder inicial. Para dirección, un cero antes de completar la carga es indistinguible de un resultado real. Debe usarse estado “cargando/sin dato/error”, nunca un número financiero plausible.

### 8. Ergonomía por formato de pantalla

El layout limita el contenido a aproximadamente 75% del viewport y un máximo cercano a 1440 px: en pantallas 2K/4K puede desperdiciar área útil. Algunas grillas usan anchos mínimos de 360 px, con riesgo de scroll/compresión en tablet. Esto debe confirmarse visualmente antes de aprobar responsive.

## Pruebas en navegador todavía obligatorias

Cuando se restablezca el controlador integrado, registrar evidencia en una sesión autenticada:

1. Capturas a 2560×1440, 1920×1080, 1440×900, 1024×768 y orientación tablet vertical.
2. Valores iniciales reales del DOM y cambio Mes/Trimestre/YTD una vez implementados.
3. Waterfall de las 12 solicitudes actuales y comparación tras consolidarlas.
4. Performance trace: long tasks, main-thread blocking, FPS y memoria al cambiar rango cinco veces.
5. Verificar abortado de requests anteriores al escribir rápidamente en filtros.
6. Exportar simultáneamente desde dos sesiones y confirmar que la UI no se bloquea.
7. Navegación por teclado, foco, lector de pantalla, contraste y alternativas no cromáticas.
8. Reconciliar un KPI elegido con cada documento de su drill-down.

## Diseño recomendado

- **Fila 1:** ingreso neto, margen bruto, EBITDA, caja disponible/proyectada, CxC vencida e inventario valorizado; todos con variación, meta, corte y estado de conciliación.
- **Fila 2:** alertas accionables ordenadas por impacto monetario y urgencia.
- **Fila 3:** tendencia y puente explicativo (precio, volumen, mix, costo), no solo barras decorativas.
- **Nivel 2:** drill-down con filtros persistentes y breadcrumb hasta documento fuente.
- **Modo gerencial:** resumen limpio; **modo analista:** definiciones, conciliación, exportación y detalle.

