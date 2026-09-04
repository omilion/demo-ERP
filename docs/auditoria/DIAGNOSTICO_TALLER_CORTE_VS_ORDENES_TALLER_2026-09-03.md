# Diagnóstico: Taller de Corte vs. Órdenes de Taller

**Fecha:** 2026-09-03  
**Alcance:** revisión local de código e historial Git. Sin cambios funcionales, sin consultas a producción, sin push ni despliegue.  
**Rama revisada:** `remediacion-auditoria-2026-09-01`.

## Conclusión ejecutiva

`Taller de Corte` no usa un modelo de tarea distinto: tanto su panel dedicado como el módulo general trabajan sobre `OdtItemTaller`, vinculado a una `OdtItem` y a un registro `Taller`. La diferencia es de **nivel operativo y de capacidades**:

- `/taller` lista y administra principalmente **OTs**; sus pestañas filtran las OTs relacionadas con cada taller.
- `/taller-corte` lista directamente **tareas `OdtItemTaller` de Corte** y añade avance cuantificado, evidencias fotográficas y bitácora de operación.

La bifurcación fue intencional: se incorporó el 10-08-2026 para atender una minuta operativa de Corte, varios meses después de que existieran las pestañas de Espumas, Confecciones y Madera. No es el caso de “Corte se construyó primero”. Sin embargo, el diseño quedó como una especialización codificada para un solo taller: reutiliza las mismas entidades genéricas, pero concentra endpoints, UX y reglas con el literal `Taller de Corte`. Es, por tanto, **una necesidad operativa real implementada mediante una deuda de generalización**, no una duplicación accidental pura.

## 1. Rutas y componentes

| Superficie | Ruta | Componente / backend | Evidencia |
| --- | --- | --- | --- |
| Gestión general de OTs | `/taller` | `TallerPage` | `frontend/src/router.jsx:109`; `frontend/src/pages/taller/TallerPage.jsx:41-67` |
| Operario genérico | `/taller-operario` | `TallerOperarioPage` | `frontend/src/router.jsx:113`; `frontend/src/pages/taller/TallerOperarioPage.jsx:6-29` |
| Operación dedicada de Corte | `/taller-corte` | `TallerCortePage` | `frontend/src/router.jsx:114`; `frontend/src/pages/taller/TallerCortePage.jsx:50-70` |
| Menú | Órdenes de Taller / Taller de Corte | enlaces separados | `frontend/src/components/TopBar.jsx:48-49` |
| API especializada de Corte | `/api/taller-corte` | router `taller-corte` | `backend/src/app.js:53,138`; `backend/src/routes/taller-corte/index.js:187-215` |
| API general de OTs | `/api/odts` | router de OTs | `frontend/src/api/odts.js:4-13`; `backend/src/routes/odts/list.js:61-133` |

Las tres rutas requieren el módulo `taller`, no un permiso de ruta exclusivo de Corte: `frontend/src/router.jsx:109-114`. Tampoco existe un rol de Corte en el enum de Prisma ni una regla RBAC exclusiva para esa área: `backend/prisma/schema.prisma:55-66`; `backend/src/middleware/rbac.js:46-64`.

## 2. Fuente de datos y modelo persistente

| Aspecto | Órdenes de Taller (`/taller`) | Taller de Corte (`/taller-corte`) |
| --- | --- | --- |
| Consulta principal | `GET /api/odts`, con `tipo=Corte` u otro tipo | `GET /api/taller-corte/items`, con `mine` y `estado` |
| Entidad raíz que lista | `Odt` (una orden puede contener varios ítems/talleres) | `OdtItemTaller` (una tarea concreta de un ítem en un taller) |
| Filtro de área | `tipoTallerFilter`: legado `Odt.tipo` **o** relación `OdtItem.talleres.Taller.nombre` | busca el `Taller` activo cuyo nombre es exactamente `Taller de Corte` y filtra por su `tallerId` |
| Avances y evidencia | no se exponen como operación rica en la tabla/pestaña | `OdtAvance`, `TallerEvidencia` y `BitacoraTaller` por tarea |
| Estados de tarea | endpoint genérico de estado de `OdtItemTaller` | mismo estado genérico, además de registrar avance/evidencia |

La consulta general es una lista de `Odt`: `backend/src/routes/odts/list.js:115-133`. El filtro de tipo está en `backend/src/routes/odts/operations.js:19-42` y mezcla el campo legado `Odt.tipo` con relaciones de talleres reales. La vista dedicada consulta directamente `prisma.odtItemTaller.findMany`: `backend/src/routes/taller-corte/index.js:208-225`.

No existe una tabla de “tarea de corte” propia. El modelo compartido es `OdtItemTaller`, con `tallerId`, estado, asignación y fechas: `backend/prisma/schema.prisma:1713-1755`. Los avances y evidencias también son genéricos, aunque hoy sólo los publique la API de Corte: `backend/prisma/schema.prisma:1820-1873`; `backend/src/routes/taller-corte/index.js:248-318,329-360`.

## 3. Tipos de taller y tratamiento especial

No hay un enum Prisma ni catálogo central de tipos. El nombre de taller es un `String` único en el modelo `Taller`: `backend/prisma/schema.prisma:1690-1711`. Las listas están replicadas en varias capas:

| Lugar | Definición / comportamiento |
| --- | --- |
| Pestañas administrativas | `Corte`, `Espumas`, `Confecciones`, `Madera`, `Externo`: `frontend/src/pages/taller/TallerPage.jsx:52-67` |
| Cola de operario genérica | Sólo `Espumas`, `Confecciones`, `Madera/Externo`; Corte queda fuera: `frontend/src/pages/taller/TallerOperarioPage.jsx:6-10` |
| Filtro backend | reconoce texto `corte`, `espuma`, `confe`, `madera`, `externo`: `backend/src/routes/odts/operations.js:19-42` |
| Corte especializado | literal `CORTE_NOMBRE = 'Taller de Corte'`: `backend/src/routes/taller-corte/index.js:6,33-55` |

La equivalencia de Madera y Externo tampoco es consistente en presentación: el filtro general cruza ambos nombres para ambas pestañas (`backend/src/routes/odts/operations.js:25-26`), mientras que la cola de operario los agrupa en una sola opción (`frontend/src/pages/taller/TallerOperarioPage.jsx:8`). Esto confirma que los “tipos” son convenciones de texto, no una política de dominio centralizada.

Los estados de tarea sí son comunes: `pendiente`, `en_proceso`, `pausado`, `listo`, `rechazado`, `cancelado`, definidos en `backend/src/routes/odts/item-workflow.js:1-9`. Corte no tiene una máquina de estados distinta; aporta operaciones adicionales sobre esa misma tarea:

- registrar avance con transacción, bloqueo asesor y actualización de progreso: `backend/src/routes/taller-corte/index.js:248-318`;
- adjuntar evidencia con validación de formato y tamaño: `backend/src/routes/taller-corte/index.js:329-360`;
- reflejar ambos eventos en `BitacoraTaller`: `backend/src/routes/taller-corte/index.js:308-315,355-359`.

## 4. Por qué existe la separación: evidencia Git

| Hito | Commit / evidencia | Lectura |
| --- | --- | --- |
| Pestañas Espumas, Confecciones y Madera | `1fd0f559` (2026-05-13) | La gestión por área ya existía antes de Corte. |
| Pestaña Externo | `530cd0d2` (2026-05-14) | Se amplió la lista de áreas sin panel dedicado. |
| Cola genérica de operario | `4bd6abc` (2026-07-29), `TallerOperarioPage` | Diseñada para Espumas, Confecciones y Madera; no incorpora Corte. |
| Panel, API y migración de Corte | `6fa4835` (2026-08-10), mensaje `feat: completa minuta operativa y taller de corte` | Se agregaron ruta, UI, API, `OdtAvance`, `TallerEvidencia` y semilla de `Taller de Corte`. Es una decisión posterior para un flujo de piso más rico. |
| Reproceso y alertas de Corte | `7bc3118` (2026-08-28) | El flujo especializado siguió evolucionando. |
| Restricción de avance por operario | `b12c3c0` (2026-09-01) | Se endureció la operación para que el operario no reasigne a terceros. |
| Bloqueo de avance por progreso | `3e91377` (2026-09-01) | Se añadió validación de progreso a la API dedicada. |

El `blame` de `frontend/src/pages/taller/TallerPage.jsx:52-67` atribuye Corte y su parámetro a `6fa4835`, mientras que los otros talleres preceden ese cambio. El de `backend/src/routes/taller-corte/index.js:1-80` atribuye la base de la API al mismo commit y las validaciones posteriores a `3e91377`.

**Diagnóstico de causa:** hubo un requisito real de negocio para Corte —asignar, iniciar, registrar avance cuantificado, adjuntar foto/evidencia y terminar—, pero se resolvió como un vertical exclusivo. El modelo de datos ya era apto para reutilizarse; la deuda técnica está en haber acoplado el comportamiento y la navegación al nombre de Corte, sin convertir esas capacidades en un panel parametrizable por taller.

## 5. Impacto actual para el usuario

### Diferencias funcionales comprobables

| Operación | `/taller` | `/taller-corte` |
| --- | --- | --- |
| Ver trabajo por área | Sí, como OTs filtradas | Sí, como tareas de Corte filtradas |
| Unidad mostrada | OT | tarea `OdtItemTaller` |
| Asignación | desde el detalle/flujo genérico | visible y accionable por tarjeta |
| Inicio, pausa, listo, reapertura | Sí, estado genérico en detalle | Sí, estado de la misma tarea más acciones de tarjeta |
| Avance de cantidad / progreso real | No como flujo operativo visible | Sí, modal `Registrar avance` |
| Foto/evidencia de operación | No en la pestaña general | Sí, subida de evidencia |
| Bitácora de avance por tarea | No expuesta como operación equivalente | Sí, mediante los eventos de avance/evidencia |
| Cola personal | página genérica, sin Corte | Sí, es el filtro inicial de Corte |

La pestaña Corte y el panel de Corte **no deben tener el mismo contador**: la primera cuenta OTs por estado de OT (`frontend/src/pages/taller/TallerPage.jsx:653-660`), mientras el segundo cuenta tareas y su asignación/estado (`frontend/src/pages/taller/TallerCortePage.jsx:57-70`). Una OT mixta puede aparecer en más de un taller, y una OT puede originar varias tareas; comparar los números como si fueran la misma métrica induce a error.

Existe una discrepancia de permisos que merece revisión posterior: el backend permite registrar avances con `taller.avance:write` (`backend/src/routes/taller-corte/index.js:246-248`), permiso que posee `taller_operario` (`backend/src/middleware/rbac.js:58-64`), pero la vista usa la capacidad amplia `taller:write` para presentar acciones de escritura (`frontend/src/pages/taller/TallerCortePage.jsx:50-58,210-237`). Si `can()` mantiene esa semántica, un operario autorizado a avanzar puede no ver el botón para hacerlo. Es una brecha UI/RBAC, no evidencia de un modelo diferente.

### Contadores en cero y mensaje “No hay tareas para este filtro”

El estado inicial de Corte es `soloMias = true`: `frontend/src/pages/taller/TallerCortePage.jsx:50,57`. Por lo tanto, la pantalla abre en **“Mis tareas”** y los cuatro contadores se calculan sólo sobre las tareas asignadas al usuario autenticado: `frontend/src/pages/taller/TallerCortePage.jsx:65-70,156-179`.

Con esa lógica, el resultado observado es compatible con una cola vacía para ese usuario y **no basta para concluir que falten tareas de Corte**. La comprobación correcta es cambiar a **“Cola completa”**, que quita `mine=true`: `frontend/src/pages/taller/TallerCortePage.jsx:166-176`.

La configuración ausente de Corte no se mostraría como cero: el backend responde un error de servicio si no encuentra el taller activo: `backend/src/routes/taller-corte/index.js:33-55,187-205`. Una falla HTTP tampoco usa el estado vacío; la UI presenta un panel de error: `frontend/src/pages/taller/TallerCortePage.jsx:72-78`.

No fue posible completar el conteo local de filas: la consulta de sólo lectura contra `plastimar_test`, usando `backend/.env.test.docker`, devolvió `ECONNREFUSED`. No se consultó producción ni se modificó dato alguno. Hasta restablecer ese servicio, no es honesto clasificar el cero como bug de query o falta de datos. Para resolverlo de forma reproducible, ejecutar en un ambiente de prueba operativo:

1. `GET /api/taller-corte/config` para confirmar que existe un `Taller` activo llamado exactamente `Taller de Corte`.
2. `GET /api/taller-corte/items?mine=false` con un usuario que tenga `taller:read`; ese es el conteo real de tareas Corte activas.
3. Comparar con `GET /api/taller-corte/items?mine=true`; la diferencia identifica tareas no asignadas al usuario actual, no una ausencia de datos.
4. Comparar por separado con `GET /api/odts?tipo=Corte`, recordando que ese endpoint cuenta OTs y no tareas.

## 6. Opciones de evolución

| Opción | Descripción | Ventajas | Costos / riesgos | Esfuerzo estimado |
| --- | --- | --- | --- | --- |
| **A. Panel operativo único parametrizado (recomendado)** | Convertir avances, evidencias, cola y tarjetas de Corte en capacidades genéricas de `OdtItemTaller`; abrirlas por `tallerId` o clave canónica desde Órdenes de Taller. | Un modelo, una UX de piso coherente, métricas comparables y nuevas áreas sin copiar rutas. Conserva las particularidades configurables por taller. | Requiere diseñar permisos, migrar endpoints y validar flujos existentes de Corte antes de extenderlos. | 7–10 días de desarrollo, pruebas E2E y QA de datos. |
| **B. Mantener paneles dedicados, pero parametrizarlos y replicarlos** | Mantener `/taller-corte` como plantilla y generar paneles para Espumas, Confecciones, Madera y Externo. | Menor cambio para los usuarios de Corte; cada área puede tener instrucciones y controles propios. | Más navegación y riesgo de cinco variantes que diverjan; obliga a eliminar literales y centralizar configuración de todos modos. | 8–12 días, según diferencias reales de cada planta. |
| **C. Conservar la arquitectura, alinear navegación y expectativas** | Dejar Corte dedicado; renombrar/explicar `/taller` como gestión de OTs y `/taller-corte` como cola operativa, añadir enlaces cruzados y hacer visible el cambio entre “Mis tareas” y “Cola completa”. | Bajo impacto, resuelve confusión inmediata y no altera flujos críticos. | Conserva la deuda, no aporta avance/evidencia equivalente a otros talleres y los indicadores seguirán tener unidades distintas. | 1–2 días más pruebas de regresión. |

## Recomendación

Aplicar primero la opción C como corrección de navegación y observabilidad, si la operación necesita claridad inmediata; luego planificar A como evolución de producto. Antes de cualquiera de las dos, restablecer `plastimar_test` y ejecutar la comparación de cuatro consultas anterior. Eso evita decidir con base en un contador personal vacío y permite verificar la posible brecha UI/RBAC del operario.

## Evidencia y límites

El informe se apoya en el árbol de trabajo local y en `git log`/`git blame`; no utiliza informes históricos como sustituto de código. No se modificó código, esquema, base de datos, producción ni repositorio remoto. El único chequeo de datos intentado fue de lectura sobre la base local de pruebas y no conectó (`ECONNREFUSED`), por lo que la condición de datos reales permanece pendiente de una verificación controlada en el ambiente de pruebas.
