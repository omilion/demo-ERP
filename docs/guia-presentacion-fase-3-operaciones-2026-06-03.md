# Guia tecnica para dominar la presentacion de Fase 3 Operaciones

Archivo presentado: `presentacion-entrega-fase-3-operaciones-2026-06-03.html`  
Objetivo de esta guia: entender tecnicamente que significa cada diapo dentro del ERP, que partes del software la respaldan y como explicarlo con seguridad al cliente.

## Lectura general de Fase 3

Fase 3 no se debe entender como "se agregaron pantallas". La idea correcta es: el ERP empezo a comportarse como un sistema operacional conectado.

En un ERP, una operacion sana no queda como registros aislados. Una venta debe poder seguirse hacia produccion, consumo de materiales, despacho, entrega, responsable, costo y trazabilidad. Esa es la tesis tecnica de la presentacion.

La base conceptual es:

- `Orden`: la venta u orden comercial.
- `OrdenItem`: las lineas/productos vendidos.
- `Odt`: la orden de trabajo de taller/produccion.
- `OdtItem`: los productos o items que se fabrican/trabajan dentro de la ODT.
- `OdtItemTaller`: asignacion de cada item a un taller especifico, con estado propio.
- `MovimientoBodega`, `BodegaTallerMovimiento`, `TelaMovimiento`: movimientos de stock por consumo.
- `TallerHistorialMaterial`: historial operacional de materiales consumidos.
- `Despacho` y `GuiaDespacho`: salida fisica/logistica.
- `PackingBulto` y `PackingEvento`: preparacion por linea, bulto y auditoria de packing.
- `DespachoTrackingEvento`: historial de seguimiento logistico.
- `Trabajador`: responsable operativo desde RRHH.

---

## Diapo 1 - Portada: "SisGestion 3.0 Operaciones Plastimar"

### A que se refiere

La portada marca que la entrega no es de "modulos core", sino de operacion. La palabra clave es Operaciones porque esta fase cruza tres areas que en el negocio dependen una de otra:

- produccion/taller,
- bodega/materiales,
- despacho/logistica,
- RRHH como fuente de responsables.

### Como se refleja en el software

El ERP ya no se mira solo por menu. Se mira como circuito:

1. Ventas crea o alimenta la necesidad.
2. Taller recibe esa necesidad como ODT.
3. Bodega entrega o descuenta materiales.
4. Despacho prepara y entrega.
5. RRHH entrega datos de responsables/cargos.
6. Reportes/costeo/productividad leen todo eso.

### Como explicarlo con dominio

Puedes decir:

"Fase 3 es cuando el ERP empieza a controlar el ciclo operacional. No es solo que exista Taller, Despachos o RRHH; lo importante es que esos modulos ya conversan entre si a nivel de datos."

### Punto tecnico importante

El ERP nuevo evita depender solo de textos o numeros sueltos tipo `nInterno`. Se intenta trabajar con relaciones reales: `ordenId`, `odtId`, `productoId`, `trabajadorId`, etc.

---

## Diapo 2 - Resumen ejecutivo: "Fase 3 queda cerrada como bloque operacional usable"

### A que se refiere

La diapo resume que la fase ya tiene suficiente base para revisar operacion real. No dice que todo el ERP completo esta finalizado; dice que el bloque operacional tiene estructura usable.

### Como se refleja en el software

Los bloques funcionales son:

- Taller/ODT: vista tabla y Kanban.
- Produccion por item/taller.
- Consumo de materiales desde ODT.
- Despacho y guias con relacion a venta/ODT.
- Packing por linea.
- Tracking de despacho.
- RRHH operativo.
- Costeo y productividad.

### Rutas/endpoints que respaldan esto

- `GET /api/odts`
- `GET /api/odts/kanban`
- `GET /api/odts/meta/operarios`
- `GET /api/odts/meta/carga-operarios`
- `GET /api/odts/meta/productividad`
- `POST /api/odts/:id/consumos`
- `GET /api/despachos/ordenes/:ordenId/packing`
- `PUT /api/despachos/ordenes/:ordenId/packing`
- `GET /api/despachos/:id/tracking`
- `POST /api/despachos/:id/tracking`
- `GET /api/rrhh/operativo`

### Como explicarlo con dominio

"Cuando decimos bloque operacional usable, nos referimos a que ya existe una ruta de trabajo completa: ver ODTs, cambiar estados, consumir materiales, preparar productos para despacho, registrar eventos logisticos y medir tiempos/costos."

### Cuidado al decirlo

No decir "todo esta 100% cerrado para produccion sin validacion". Lo correcto es:

"La base operacional esta implementada y lista para validacion funcional con usuarios reales."

---

## Diapo 3 - PDF base: "Alcance de Fase 3 segun la propuesta original"

### A que se refiere

Esta diapo alinea la presentacion con el documento base. Fase 3, segun el PDF, corresponde a:

- Produccion / ODT.
- Despacho / Logistica.
- RRHH operativo.

### Como se refleja en el software

Produccion / ODT:

- Modelo principal: `Odt`.
- Items: `OdtItem`.
- Talleres asignados: `OdtItemTaller`.
- Estados: `Pendiente`, `Asignada`, `En proceso`, `Control calidad`, `Terminada`, `Entregada`, manteniendo compatibilidad con `Prioritaria`.
- Responsable: relacion operacional con `Trabajador`.

Despacho / Logistica:

- Modelos: `Despacho`, `GuiaDespacho`, `PackingBulto`, `PackingEvento`, `DespachoTrackingEvento`.
- La venta queda con `estadoEntrega`, que se recalcula segun despacho, guia, packing o tracking.

RRHH operativo:

- Modelo: `Trabajador`.
- Se usa para asignar responsables, filtrar cargos y alimentar costo estimado de mano de obra.

### Como explicarlo con dominio

"Esta diapo es importante porque evita mezclar alcances. Lo que estamos cerrando como Fase 3 es lo que el PDF definia como Operaciones: producir, despachar y conectar responsables."

### Pregunta probable

**"Y la app movil del operario?"**

Respuesta tecnica:

"Quedo diferida. Para cerrar la operacion inicial se resolvio con Kanban, acciones rapidas, estados, bitacora, productividad y responsable operativo desde escritorio. La app movil seria una capa adicional de captura, no la base del modelo operacional."

---

## Diapo 4 - Base previa: "El pulido de Fase 2 se adelanto en paralelo a Fase 3"

### A que se refiere

Esta diapo explica que Fase 3 no se construyo encima de una base desordenada. Mientras se avanzaba Operaciones, se adelanto el pulido de Fase 2 para suavizar adopcion.

En terminos ERP, esto es clave: produccion depende de ventas, productos, bodega y clientes. Si esos datos base estan mal, taller y despacho tambien fallan.

### Como se refleja en el software

Fase 2 sostiene a Fase 3 asi:

- `Cliente` y sucursales: evitan ventas ambiguas.
- `Producto`: permite que las lineas vendidas y consumos tengan producto real.
- `Orden` y `OrdenItem`: base para saber que se vendio.
- Bodega/productos/telas/materiales: base para descontar stock.
- Caja/cobranza/reportes: contexto comercial y financiero.
- RBAC/permisos: controla quien puede operar o modificar.

### Que significa "compatibilidad con legacy"

No significa copiar el sistema antiguo pantalla por pantalla. Significa:

- conservar rutas de trabajo reconocibles,
- mantener filtros importantes,
- mapear modulos antiguos a equivalentes modernos,
- cerrar SPR legacy,
- dejar evidencia visual de lo viejo vs lo nuevo,
- evitar que el usuario sienta que perdio funciones.

### Como explicarlo con dominio

"Adelantamos el pulido de Fase 2 porque Operaciones no vive sola. Una ODT necesita venta, cliente y producto. Un consumo necesita bodega y stock. Un despacho necesita orden e items. Si esas piezas no estaban ordenadas, Fase 3 quedaba fragil."

---

## Diapo 5 - Flujo operacional: "El ciclo diario queda conectado desde venta hasta entrega"

### A que se refiere

Esta es una de las diapos mas importantes. Muestra el modelo mental del ERP: una venta se transforma en trabajo, el trabajo consume materiales, se prepara para despacho y termina con seguimiento logistico.

### Como funciona tecnicamente

Flujo de datos:

1. `Cliente` y sucursal identifican a quien se vende.
2. `Orden` representa la venta.
3. `OrdenItem` representa cada producto vendido.
4. `Odt` se crea o se vincula a la orden.
5. `OdtItem` representa lo que taller debe producir.
6. `OdtItemTaller` distribuye el item en talleres.
7. `POST /api/odts/:id/consumos` descuenta materiales.
8. Costeo lee consumos, precios y responsable.
9. Packing actualiza `OrdenItem.nEntregados`.
10. `Despacho` y `GuiaDespacho` registran salida.
11. Tracking agrega eventos logisticos.
12. Auditoria/integridad evita operaciones sin origen.

### Que gana el ERP

- Trazabilidad: se puede responder de donde viene cada movimiento.
- Control: no se modifica cualquier cosa si ya hay entrega, pago o documento.
- Reporteria: se pueden calcular atrasos, costos, productividad y pendientes.
- Adopcion: el usuario ve el flujo completo, no datos fragmentados.

### Como explicarlo con dominio

"La idea es que una orden no se pierda en el camino. Desde que nace en ventas hasta que se entrega, cada modulo agrega informacion, pero mantiene el mismo hilo operacional."

### Frase tecnica util

"El ERP deja de ser una coleccion de mantenedores y pasa a ser un sistema transaccional conectado."

---

## Diapo 6 - Produccion: "ODT queda como nucleo operativo de taller"

### A que se refiere

La ODT es la unidad central de produccion. En vez de que taller trabaje con registros sueltos o comentarios, la ODT concentra:

- cliente,
- venta origen,
- productos/items,
- responsable,
- estado,
- plazo,
- bitacora,
- consumos,
- costo,
- avance.

### Modelos principales

- `Odt`: cabecera de la orden de trabajo.
- `OdtItem`: productos o trabajos dentro de la ODT.
- `OdtItemTaller`: asignacion del item a un taller, con estado independiente.
- `Taller`: catalogo de talleres.
- `TallerHistorialMaterial`: historial de materiales usados.
- `Trabajador`: responsable operativo.

### Estados ODT

Estados a explicar:

- `Pendiente`: existe pero aun no entra en trabajo.
- `Asignada`: ya tiene responsable o plan de ejecucion.
- `En proceso`: ya comenzo; se puede marcar fecha de inicio.
- `Control calidad`: etapa de revision antes de cerrar.
- `Terminada`: produccion lista.
- `Entregada`: ya fue entregada o cerrada hacia logistica.
- `Prioritaria`: se conserva por compatibilidad legacy.

### Produccion por item/taller

El detalle tecnico importante es que no todo ocurre solo en la cabecera de ODT. Cada item puede tener talleres asociados:

- `pendiente`,
- `en_proceso`,
- `pausado`,
- `listo`,
- `cancelado`.

Esto permite decir que una ODT puede estar viva aunque algunas partes ya esten listas y otras no.

### Consumo de materiales

Endpoint:

- `POST /api/odts/:id/consumos`

Tipos de consumo:

- `producto`: descuenta bodega de productos.
- `material_taller`: descuenta bodega taller.
- `tela`: descuenta inventario de telas.

Controles:

- valida ODT existente,
- valida cantidad,
- valida item/material,
- rechaza stock insuficiente,
- registra movimiento,
- registra historial,
- evita stock negativo por concurrencia con descuento condicionado.

### Kanban

Endpoint:

- `GET /api/odts/kanban`

El Kanban no es solo visual. Es una consulta operativa con mas capacidad que el listado paginado normal. Permite ver trabajo por estado y priorizar.

### Costeo

El costeo es derivado, no contable final. Lee:

- materiales consumidos,
- precios actuales,
- horas derivadas de fechas de produccion,
- sueldo liquido estimado / 180 horas,
- venta vinculada para margen estimado.

### Como explicarlo con dominio

"La ODT concentra la verdad operacional de taller. No solo dice que existe un trabajo; permite saber en que estado esta, quien lo lleva, que materiales consumio, cuanto tiempo tomo y que costo estimado tiene."

### Pregunta probable

**"Si faltan fechas o precios historicos?"**

Respuesta:

"El sistema no inventa datos. Si falta fecha de inicio, termino, sueldo o precio, lo marca como dato incompleto. Eso es mejor que calcular una productividad falsa."

---

## Diapo 7 - Logistica: "Despacho pasa de estado final a seguimiento operacional"

### A que se refiere

Antes la logistica podia verse como un estado: pendiente, parcial, entregado. Ahora se agrega detalle operacional:

- que lineas se prepararon,
- cuanto se entrego de cada item,
- en que bulto va,
- que despacho lo mueve,
- que evento logistico ocurrio,
- si fue entregado, retenido, reprogramado o con incidencia.

### Modelos principales

- `Orden`: venta.
- `OrdenItem`: lineas vendidas; tiene `nEntregados`.
- `Despacho`: registro logistico.
- `GuiaDespacho`: guia asociada.
- `PackingBulto`: bulto fisico o logico.
- `PackingEvento`: historial de cambios por linea.
- `DespachoTrackingEvento`: eventos de seguimiento logistico.

### Packing por linea

Endpoints:

- `GET /api/despachos/ordenes/:ordenId/packing`
- `PUT /api/despachos/ordenes/:ordenId/packing`

Que hace:

- trae items de la orden,
- permite actualizar entregados por linea,
- registra bulto,
- guarda observacion,
- crea eventos por delta,
- recalcula estado de entrega.

Validaciones:

- el item debe pertenecer a la orden,
- no acepta duplicados,
- no acepta negativos,
- no permite entregar mas que la cantidad vendida,
- trabaja en transaccion.

### Tracking logistico

Endpoints:

- `GET /api/despachos/:id/tracking`
- `POST /api/despachos/:id/tracking`

Estados disponibles:

- `Preparado`,
- `En ruta`,
- `Entregado`,
- `Incidencia`,
- `Reprogramado`,
- `Retenido`,
- `Devuelto`.

Si el evento es `Entregado`, el sistema puede sincronizar `Despacho.fechaEntrega` y recalcular `Orden.estadoEntrega`.

### Como explicarlo con dominio

"Packing responde que se preparo y cuanto se entrego por producto. Tracking responde que paso con el despacho despues de preparado. Son dos cosas distintas y por eso estan separadas."

### Diferencia clave

- Packing = preparacion interna por linea/producto.
- Despacho = movimiento logistico.
- Guia = documento asociado.
- Tracking = eventos del movimiento.

---

## Diapo 8 - RRHH operativo: "RRHH alimenta asignacion, alertas y costeo"

### A que se refiere

RRHH no se presenta como modulo documental completo. En Fase 3 se usa como fuente operativa para produccion.

### Como funciona en el software

Responsables:

- `GET /api/odts/meta/operarios` devuelve trabajadores activos asignables.
- La ODT valida `operarioId` contra `Trabajador` activo.
- Taller puede filtrar por responsable.

Cargos:

- `GET /api/rrhh/cargos`
- `GET /api/rrhh/trabajadores?cargo=...`

Operativo RRHH:

- `GET /api/rrhh/operativo`

El tablero muestra:

- dotacion activa por cargo,
- contratos por vencer,
- licencias activas,
- vacaciones programadas,
- trabajadores sin sueldo,
- trabajadores sin cargo,
- trabajadores sin fecha de ingreso.

### Relacion con costeo

El costeo productivo usa sueldo liquido cuando existe. Si no existe, agrega alerta de dato incompleto. Por eso RRHH no es solo "lista de trabajadores": afecta lectura de costo y productividad.

### Como explicarlo con dominio

"RRHH entra en Fase 3 porque taller necesita responsables reales, no nombres escritos a mano. Ademas, si queremos estimar costo de mano de obra, necesitamos datos de trabajador."

### Limite honesto

No decir que RRHH ya reemplaza toda gestion legal laboral. Lo correcto:

"RRHH esta conectado a la operacion. La gestion laboral completa, documentos oficiales o reglas legales finales requieren validacion administrativa posterior."

---

## Diapo 9 - Sprints cerrados: "Dos capas: cierre base y refinamientos"

### A que se refiere

Esta diapo muestra que Fase 3 no fue improvisada. Se ejecuto primero una base operacional y despues refinamientos.

### Capa 1: Sprints 0 a 6

- Diagnostico operativo.
- ODT como nucleo.
- Workflow por item/taller.
- Consumo de materiales.
- Despacho y guias trazables.
- RRHH conectado.
- QA operacional.

### Capa 2: Sprints 7 a 15

- Kanban formal.
- Packing por linea.
- Tiempos basicos.
- Kanban completo con drag/drop.
- Packing trazable con bultos/eventos.
- Tracking logistico.
- Costeo productivo.
- Productividad avanzada.
- RRHH operativo avanzado.

### Como explicarlo con dominio

"Primero cerramos el flujo minimo: ODT, estado, responsable, consumo, despacho y RRHH. Despues agregamos lo que hace que el modulo sea util para gestion diaria: Kanban, packing, tracking, costos y productividad."

### Por que importa

En ERP conviene construir asi porque evita que una pantalla avanzada exista sobre datos debiles. Primero relaciones y transacciones; despues visualizacion y control.

---

## Diapo 10 - QA y evidencia: "Avance real vs pendientes de entorno"

### A que se refiere

Esta diapo protege la entrega tecnicamente. No basta decir "esta listo"; se muestran pruebas y limitaciones.

### Evidencia tecnica

Validaciones registradas:

- `prisma validate`: schema valido.
- `prisma migrate deploy`: migraciones aplicadas en DB local de prueba.
- `prisma generate`: cliente generado.
- `node --check`: sintaxis backend OK.
- tests focalizados 70/70 en cierre base.
- tests extendidos 87/87 en cierre de Kanban, packing, costeo, RRHH y consumos.
- ESLint focal frontend OK.
- build frontend OK.
- smoke API no destructivo OK.

### Que significa "tests focalizados"

No son todas las pruebas posibles del ERP. Son pruebas enfocadas en lo tocado por Fase 3:

- ODT operations.
- ODT item workflow.
- ODT consumos.
- Despachos traceability.
- Despachos.
- ODT costeo.
- RRHH helpers.
- ODT list helpers.

### Como explicar limitaciones

Limitaciones no bloqueantes:

- app movil diferida,
- smoke visual autenticado no automatizado por herramienta,
- DB local puede no tener schema RRHH completo,
- deploy productivo debe aplicar migraciones nuevas,
- integraciones externas no son parte del cierre Fase 3.

### Como explicarlo con dominio

"La validacion se centro en los contratos criticos de Fase 3. Donde el entorno local no reproduce produccion, el sistema se hizo tolerante y se documento la limitacion."

---

## Diapo 11 - Roadmap: "Avance de otras fases frente al PDF base"

### A que se refiere

Esta diapo ubica Fase 3 dentro del proyecto completo. Sirve para que el cliente no mezcle temas.

### Lectura tecnica por fase

Fase 1:

- base tecnica,
- frontend React,
- API Fastify,
- PostgreSQL,
- Prisma,
- JWT/RBAC,
- deploy.

Fase 2:

- productos,
- bodega,
- ventas,
- clientes,
- CRM,
- caja,
- proveedores,
- reportes,
- compatibilidad/pulido legacy.

Fase 3:

- ODT,
- Kanban,
- consumos,
- packing,
- tracking,
- RRHH operativo,
- costeo,
- productividad.

Fases posteriores:

- IA/RAG y alertas inteligentes.
- SII/DTE.
- backups administrables.
- exportables formales avanzados.
- capacitacion/manuales.
- sitio publico final.

### Como explicarlo con dominio

"El roadmap permite separar que ya es operacion disponible y que pertenece a fases posteriores. Eso es importante para evaluar Fase 3 sin cargarle alcances que son de otra etapa."

---

## Diapo 12 - Comparativa: "De Fase 2 pulida a Fase 3 operable"

### A que se refiere

Esta diapo explica dependencia tecnica entre fases. Fase 3 usa datos de Fase 2; por eso el pulido paralelo fue necesario.

### Capas del ERP

1. Fase 2 pulida:
   - productos,
   - ventas,
   - bodega,
   - clientes,
   - CRM,
   - caja.

2. Compatibilidad legacy:
   - sprints SPR cerrados,
   - capturas comparativas,
   - rutas equivalentes,
   - permisos,
   - filtros reconocibles.

3. Datos relacionados:
   - cliente canonico,
   - producto canonico,
   - venta real,
   - orden e items.

4. Fase 3 operable:
   - ODT,
   - Kanban,
   - consumos,
   - packing,
   - tracking,
   - RRHH.

5. Control:
   - costeo,
   - productividad,
   - auditoria,
   - reportes.

### Como explicarlo con dominio

"La operacion no nace en Taller. Nace desde datos comerciales y de inventario confiables. Por eso Fase 2 pulida es la base de Fase 3 operable."

### Concepto ERP importante

Un ERP depende de maestros y transacciones:

- maestros: clientes, productos, trabajadores, categorias.
- transacciones: ventas, ODT, consumos, despachos, pagos, movimientos.

Si los maestros estan mal, las transacciones salen mal.

---

## Diapo 13 - Validacion funcional: "Que debe validar Plastimar"

### A que se refiere

Esta diapo convierte la presentacion en una pauta de QA funcional con usuarios reales.

### Que se debe probar en el ERP

Taller:

- entrar a `/taller`,
- alternar tabla/Kanban,
- filtrar por estado/responsable,
- abrir ODT,
- cambiar estado,
- revisar bitacora,
- revisar tiempos/costo.

Consumos:

- abrir formulario ODT,
- registrar consumo,
- validar que aparece historial,
- confirmar que no permite stock insuficiente.

Despacho:

- abrir `/despachos`,
- revisar matriz,
- abrir packing,
- modificar entregados por linea,
- registrar bulto/observacion,
- ver eventos.

Tracking:

- abrir modal Tracking,
- agregar evento,
- verificar ultimo estado visible.

RRHH:

- abrir `/rrhh`,
- revisar operativo RRHH,
- filtrar por cargo/empresa,
- verificar trabajadores incompletos o alertas.

### Como explicarlo con dominio

"Esta no es una validacion estetica. Necesitamos confirmar si el flujo representa la forma real de operar: estados correctos, responsables correctos, packing util y tracking suficiente."

### Como recibir feedback

Pedir observaciones asi:

- pantalla,
- accion realizada,
- resultado actual,
- resultado esperado,
- prioridad,
- usuario/area afectada.

Eso evita comentarios ambiguos tipo "no me gusta" o "falta algo" sin criterio de desarrollo.

---

## Diapo 14 - Pendientes no bloqueantes

### A que se refiere

La diapo separa pendientes reales de bloqueantes. En ERP siempre habra backlog, pero no todo impide cerrar una fase.

### Pendientes no bloqueantes explicados tecnicamente

App movil operario:

- seria una interfaz adicional de captura,
- no cambia el modelo base de ODT,
- puede usar los mismos endpoints despues.

Automatizaciones externas:

- geolocalizacion, firma/foto, codigos de barra o integraciones de transporte son extensiones sobre tracking/packing.

Costo avanzado:

- el costo actual es operativo estimado,
- el costo contable requeriria snapshots historicos, indirectos, varios operarios, reglas de gastos y validacion financiera.

IA/RAG:

- fase posterior,
- no afecta cierre operacional actual.

SII/DTE:

- fase de integracion tributaria,
- no corresponde a produccion/taller/despacho.

Capacitacion:

- necesaria para adopcion,
- posterior a validacion funcional,
- idealmente por rol.

### Como explicarlo con dominio

"Estos temas son evoluciones naturales. Lo importante es que el modelo base ya los soporta mejor que antes: si manana se agrega movil, codigo de barra o firma, ya hay ODT, packing y tracking donde conectarlo."

---

## Diapo 15 - Cierre: "Fase 3 entrega operacion, no solo modulos"

### A que se refiere

Es la conclusion conceptual de toda la presentacion. El ERP ya puede explicar una orden como flujo completo:

- venta,
- ODT,
- taller,
- materiales,
- packing,
- despacho,
- tracking,
- responsable,
- costo,
- productividad.

### Como se refleja tecnicamente

La relacion principal es:

`Orden` -> `OrdenItem` -> `Odt` -> `OdtItem` -> `OdtItemTaller` -> consumos -> packing/despacho/tracking -> reportes/costeo/productividad.

No todos los casos historicos tendran datos perfectos, pero la estructura nueva ya evita que los nuevos movimientos nazcan sin relacion.

### Como explicarlo con dominio

"El cierre de Fase 3 es que ahora podemos seguir la operacion de punta a punta. Eso le da control al usuario operativo y tambien informacion a gerencia: atrasos, responsables, costos, productividad y entregas."

### Cierre recomendado

"El siguiente paso no es inventar otra fase encima, sino validar con usuarios reales, registrar observaciones concretas, aplicar migraciones en produccion y capacitar por rol."

---

## Mapa rapido: diapo vs parte del ERP

| Diapo | Tema | Parte del ERP |
|---:|---|---|
| 1 | Portada operacional | Vision integrada |
| 2 | Resumen ejecutivo | Fase 3 completa como bloque usable |
| 3 | Alcance PDF | Produccion, logistica, RRHH |
| 4 | Pulido Fase 2 paralelo | Base comercial/inventario/legacy |
| 5 | Flujo punta a punta | Orden -> ODT -> consumo -> despacho |
| 6 | Produccion | ODT, Kanban, consumos, costeo |
| 7 | Logistica | Packing, despacho, guia, tracking |
| 8 | RRHH operativo | Trabajadores, cargos, alertas, responsables |
| 9 | Sprints cerrados | Metodo de entrega |
| 10 | QA/evidencia | Tests, build, migraciones, smokes |
| 11 | Roadmap | Ubicacion por fases |
| 12 | Comparativa | Fase 2 como base de Fase 3 |
| 13 | Validacion | QA funcional con usuarios |
| 14 | Pendientes no bloqueantes | Backlog separado |
| 15 | Cierre | ERP operacional conectado |

---

## Respuestas tecnicas cortas para defender la presentacion

### "Por que ODT es tan importante?"

Porque es la unidad operacional de produccion. Sin ODT, taller queda como notas, estados o tareas sueltas. Con ODT, se puede vincular cliente, venta, productos, responsable, estado, materiales, fechas y costo.

### "Por que packing no es lo mismo que despacho?"

Packing es preparacion por linea: cuantos productos de la venta se prepararon o entregaron. Despacho es el movimiento logistico. Tracking es el historial de eventos del despacho.

### "Por que RRHH aparece en una fase de operaciones?"

Porque produccion necesita responsables reales. Ademas, el costo de mano de obra y la productividad dependen de datos de trabajador.

### "Que pasa si faltan datos antiguos?"

El sistema no los inventa. Marca datos incompletos o calcula parcialmente. Eso es correcto para no presentar metricas falsas.

### "El costeo es final?"

No. Es costeo operativo estimado. Sirve para control interno, detectar desviaciones y orientar decisiones. Costeo contable completo requiere reglas financieras posteriores.

### "Que valida el cliente ahora?"

Que el flujo represente la operacion real: estados, responsables, packing, tracking, consumos, permisos, filtros y datos visibles.

### "Por que se pulio Fase 2 en paralelo?"

Porque Fase 3 depende de Fase 2. Produccion necesita ventas/productos/clientes; despacho necesita orden/items; consumos necesitan bodega/stock.
