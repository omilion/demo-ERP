# Plan de diseño y construcción — Documentación de uso para el Asistente IA (Plastimar)

> **Objetivo:** que el Asistente Gerencial IA responda preguntas de **uso del sistema** ("¿cómo creo una venta?", "¿dónde marco un cliente conflictivo?", "¿dónde veo las comisiones?"), no solo de datos. Pensado para usuarios nuevos del ERP que no dominan las pantallas.
>
> **Camino técnico acordado:** Fase 1 simple — la documentación se entrega al asistente como **conocimiento base** vía una herramienta `consultar_documentacion` que busca sobre archivos Markdown. **SIN** reactivar la infra de embeddings/pgvector (las tablas `ai.sources/chunks/embeddings` están vacías y huérfanas; no se tocan).
>
> **Flujo de trabajo:** el agente constructor ejecuta TODO este plan (estructura técnica + contenido de los módulos). Luego se revisa.

---

## 1. Diagnóstico de partida (ya verificado)

- La infra RAG documental (`ai.sources/chunks/embeddings`) existe como tablas pero **está vacía, sin modelo Prisma, sin código, sin dependencias de embeddings**. NO usarla.
- La carpeta `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/` tiene 49 `.md` pero son **auditoría técnica de migración**, NO guías de uso. NO reutilizables para este fin.
- El asistente ya es un RAG con herramientas (`backend/src/routes/ai/`). Esto **agrega una herramienta más**, no rehace nada.

---

## 2. Arquitectura técnica (Fase 1)

### 2.1 Almacenamiento del contenido
- Crear carpeta **`backend/src/routes/ai/docs/`** con un archivo Markdown por módulo (ver sección 4).
- Cada archivo es texto plano en español, lenguaje de usuario.
- Un índice `_index.md` lista todos los módulos con una línea de descripción (para que la herramienta sepa qué existe).

### 2.2 Herramienta nueva: `consultar_documentacion`
Registrar en `backend/src/routes/ai/tools/index.js` siguiendo el patrón de las tools existentes:

```
name: 'consultar_documentacion'
description: 'Busca en la documentación de USO del sistema Plastimar cómo realizar una
  tarea o dónde está una función (ej: cómo crear una venta, dónde marcar un cliente
  conflictivo, cómo generar una ficha de licitación). Usar para preguntas de "cómo
  hago...", "dónde está...", "para qué sirve...". NO usar para consultar datos
  (ventas, stock, etc.), para eso están las otras herramientas.'
input_schema:
  - tema (string, requerido): tema o módulo a consultar (ej: "ventas", "licitaciones",
    "crear cliente", "comisiones")
```

**Implementación (sin embeddings):**
- Al iniciar, cargar todos los `.md` de `docs/` en memoria (o leer en cada llamada; son pocos KB).
- Búsqueda por **relevancia simple de palabras clave**: normalizar el `tema` y el contenido (minúsculas, sin tildes), puntuar cada documento por coincidencias de términos en título y cuerpo, devolver el/los 1-3 documentos más relevantes (texto completo o secciones).
- Devolver `{ encontrado: true/false, documentos: [{ modulo, contenido }] }`. Si no hay match razonable, `encontrado: false` para que el asistente diga honestamente que no está documentado.

### 2.3 System prompt
En `backend/src/routes/ai/llm.js`, agregar una regla:
- "Para preguntas sobre CÓMO usar el sistema o DÓNDE está una función, usa `consultar_documentacion`. Si la documentación no cubre el tema, dilo claramente ('eso no está documentado todavía') — NUNCA inventes pasos ni rutas."

### 2.4 Frontend (mínimo)
- Agregar etiqueta de estado en `TOOL_LABELS` (AiChat.jsx y AsistentePage.jsx): `consultar_documentacion: 'Buscando en la documentación…'`.
- (Opcional) Agregar sugerencias de ejemplo tipo "¿Cómo creo una licitación?" en la pantalla del asistente.

### 2.5 Sin migración / sin deploy de BD
Esta fase NO toca la base de datos. Solo código + archivos de contenido.

---

## 3. Estándar de contenido por módulo

Cada archivo `.md` sigue ESTA estructura fija (consistencia = fácil de mantener y de buscar):

```markdown
# [Nombre del módulo]

## Qué es
Una o dos frases: para qué sirve este módulo, en lenguaje de usuario.

## Dónde está
Ruta exacta en el menú: "Menú [Grupo] → [Opción]". Incluir la URL (ej: /ventas/nueva).
Quién puede acceder (rol/permiso) si es relevante.

## Cómo hago lo principal
Lista de las 2-5 tareas más comunes, cada una con pasos numerados claros:
### [Tarea, ej: Crear una venta nueva]
1. Paso...
2. Paso...

## Campos / opciones importantes
Explicar los campos que generan dudas (ej: qué significa "envíos parciales",
"cliente conflictivo", "tipo de venta").

## Preguntas frecuentes
- **¿Pregunta común?** Respuesta breve.

## Errores comunes / cuidados
- Situaciones que confunden o que el usuario debe evitar.
```

**Tono:** directo, de usuario (no técnico), en español de Chile. Nada de nombres de archivos ni código.

---

## 4. Inventario de módulos a documentar (mapa real del navbar)

Documentar TODOS los siguientes. Prioridad indicada (P1 = primero, lo que más usa la gente nueva).

### Grupo VENTAS
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `ventas.md` | Ventas (listado + crear venta) | `/ventas`, `/ventas/nueva` | **P1** |
| `matriz-ventas.md` | Matriz de Ventas | `/matriz-ventas` | P2 |
| `oc-online.md` | OC Online / Venta Web | `/ordenes-compra` | P3 |
| `crm.md` | CRM | `/crm` | P2 |
| `clientes.md` | Clientes (+ conflictivo, sucursales) | `/clientes` | **P1** |
| `reportes-gerenciales.md` | Reportería Gerencial | `/reportes/gerenciales` | P3 |
| `comisiones.md` | Comisiones (reporte) | `/reportes/comisiones` | P2 |

### Grupo BODEGA
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `bodega.md` | Inventario | `/bodega` | **P1** |
| `consulta-precios.md` | Consulta Precios | `/consulta-precios` | P2 |
| `ingreso-mercaderia.md` | Ingreso Mercadería | `/stock-ingresos` | P2 |
| `bodega-taller.md` | Bodega Taller | `/bodega-taller` | P3 |
| `despachos.md` | Despachos | `/despachos` | P2 |
| `proveedores.md` | Proveedores | `/proveedores` | P2 |

### Grupo CAJA
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `caja.md` | Movimientos de Caja | `/caja` | **P1** |
| `cobranza.md` | Cobranza | `/cobranza` | P2 |
| `pagos-proveedores.md` | Pagos Proveedores (+ vencidas en rojo) | `/pagos-proveedores` | P2 |

### Grupo RRHH
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `rrhh.md` | Trabajadores (+ sueldo, hora extra, liquidaciones) | `/rrhh` | P2 |

### Grupo LICITACIONES
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `licitaciones.md` | Licitaciones (+ ficha téc/eco, ID, estados, edición inline) | `/licitaciones` | **P1** |
| `convenio-marco.md` | Convenio Marco | `/licitaciones?tipo=convenio` | P2 |

### Grupo TALLER
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `taller-odt.md` | ODTs / órdenes de trabajo | `/taller` | **P1** |
| `pasar-a-taller.md` | Pasar a Taller (notificar ODT) | `/pasar-taller` | P2 |
| `taller-operario.md` | Vista de Operario (móvil) | `/taller-operario` | P2 |
| `bitacora-taller.md` | Bitácora | `/bitacora-taller` | P3 |
| `historial-materiales.md` | Historial Materiales | `/historial-materiales` | P3 |

### Grupo ADMIN
| Archivo | Módulo | Ruta | Prioridad |
|---|---|---|---|
| `usuarios.md` | Usuarios | `/usuarios` | P2 |
| `configuracion.md` | Configuración (+ meta mensual ventas) | `/config` | P2 |
| `reglas-descuento.md` | Reglas de Descuento | `/descuentos` | P3 |
| `reglas-comision.md` | Reglas de Comisión | `/admin/comisiones` | P2 |
| `asistente-ia.md` | Asistente IA (cómo usarlo) | `/asistente` | P3 |
| `ia-balance.md` | IA Balance | `/admin/ia-balance` | P3 |

### Transversal
| Archivo | Tema | Prioridad |
|---|---|---|
| `_index.md` | Índice de todos los módulos (1 línea c/u) | **P1** |
| `general.md` | Cómo navegar, login, menú, campana de notificaciones, roles | **P1** |
| `dashboard.md` | Dashboard (KPIs, YoY, meta mensual) | P2 |

---

## 5. Notas de contenido específicas (lo que ya sabemos del sistema)

Para que el constructor escriba con precisión, incorporar estos hechos verificados:

- **Ventas:** el tipo "Normal" fue eliminado; los tipos son Licitación, Convenio Marco, Venta Web, Venta Sala (default Venta Sala). El buscador de productos muestra fotos. La sección de Despacho tiene región/comuna encadenadas, dirección + datos extra, contacto + teléfono separados. Un admin puede asignar la venta a un vendedor (o "Venta del Admin"); un vendedor se autoasigna. Al guardar, redirige al detalle (licitación → módulo licitaciones).
- **Licitaciones:** se puede editar inline nombre/descripción/precio/SKU de cada ítem (override solo de esa licitación, no toca el producto base). Hay botón "Ficha Téc. y Eco." (PDF para Mercado Público). Campos: ID licitación, estados (Pendiente/En proceso/Adjudicada/No Adjudicada/Rechazada/Cerrada), fecha plazo, envíos parciales, monto despacho. Detalle en 2 columnas (datos | productos).
- **Clientes:** se puede marcar "conflictivo" con detalle; aparece un badge ⚠ en la matriz de ventas.
- **Pagos Proveedores:** las facturas pendientes vencidas se resaltan en rojo.
- **Taller:** la notificación a taller es automática al crear venta con productos transitorios; los talleres son Espumas/Confecciones/Madera/Externo. La vista de operario (`/taller-operario`) es móvil: iniciar/avance/finalizar, asignar responsable. "Tiempo de entrega" es un campo formal (fecha compromiso).
- **Comisiones:** se calculan con reglas configurables; la comisión solo se paga si la venta está pagada + entregada + facturada; se descuentan multas y notas de crédito. (Hoy NO hay reglas cargadas → todo da $0 hasta configurarlas en Reglas de Comisión.)
- **Notificaciones (campana):** muestra licitaciones por vencer, facturas vencidas, ODT atrasadas, entregas pendientes. Al hacer clic lleva a la acción.
- **Asistente IA:** consulta datos en vivo y genera Excel/PowerPoint; el pop-up se puede expandir a pantalla completa (`/asistente`) con historial de conversaciones.
- **Dashboard:** KPIs, comparativa YoY YTD, barra de meta mensual de ventas (se define en Configuración).

---

## 6. Criterios de aceptación (para la revisión posterior)

1. Existe `backend/src/routes/ai/docs/` con un `.md` por cada módulo del inventario (sección 4) + `_index.md` + `general.md`.
2. Cada `.md` respeta la estructura estándar (sección 3) y usa lenguaje de usuario (sin código/archivos).
3. La herramienta `consultar_documentacion` está registrada, busca por relevancia, y devuelve `encontrado: false` cuando no hay match (sin inventar).
4. El system prompt instruye usar la tool para "cómo/dónde" y a no inventar.
5. `TOOL_LABELS` actualizado en los 2 frontends.
6. Backend arranca sin errores; el frontend compila.
7. Prueba manual: preguntar al asistente "¿cómo creo una venta?", "¿dónde marco un cliente conflictivo?", "¿cómo saco la ficha de una licitación?" → responde desde la doc con pasos correctos. Preguntar algo no documentado → admite que no lo sabe.
8. NO se tocó la base de datos ni se reactivó la infra de embeddings.

---

## 7. INSTRUCCIÓN PARA EL AGENTE CONSTRUCTOR

> Construí la documentación de uso del Asistente IA de Plastimar siguiendo ESTE plan completo (`docs/PLAN_ASISTENTE_DOCUMENTACION.md`), de una sola vez:
>
> 1. **Lee primero** el código real de cada módulo antes de documentarlo (rutas en `frontend/src/pages/` y `backend/src/routes/`) para que los pasos y campos sean EXACTOS, no inventados. Usa el navbar (`frontend/src/components/TopBar.jsx`) como mapa de rutas.
> 2. Creá `backend/src/routes/ai/docs/` con un `.md` por cada módulo del inventario (sección 4 del plan), más `_index.md` y `general.md`. Respetá la estructura estándar (sección 3) y los hechos verificados (sección 5). Lenguaje de usuario, español de Chile, sin código.
> 3. Implementá la herramienta `consultar_documentacion` (sección 2.2) en `backend/src/routes/ai/tools/index.js`: carga los `.md`, búsqueda por relevancia de palabras clave (normalizada sin tildes), devuelve los más relevantes o `encontrado:false`. SIN embeddings/pgvector.
> 4. Actualizá el system prompt (`backend/src/routes/ai/llm.js`) con la regla de uso (sección 2.3): usar la tool para "cómo/dónde", nunca inventar pasos/rutas.
> 5. Agregá `consultar_documentacion: 'Buscando en la documentación…'` a `TOOL_LABELS` en `AiChat.jsx` y `AsistentePage.jsx`.
> 6. NO toques la base de datos, NO reactives `ai.sources/chunks/embeddings`, NO hagas deploy.
> 7. Al terminar: verificá que el backend arranca y el frontend compila. Probá las preguntas de la sección 6.7 contra el asistente local. Reportá qué módulos documentaste y cualquier campo que no pudiste verificar en el código (para revisión).
>
> Priorizá los módulos P1 primero (deben quedar completos y correctos), luego P2 y P3. Si algún flujo no está claro en el código, marcá ese punto como "POR CONFIRMAR" en el `.md` en vez de inventar.
