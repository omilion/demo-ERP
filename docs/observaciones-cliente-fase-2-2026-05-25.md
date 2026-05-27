# Observaciones cliente - Fase 2

Fecha de ordenamiento: 2026-05-25  
Fuente principal: `plastimar_transcripcion_extraida.txt`, reunion del 2026-05-20.  
Nota: la transcripcion viene con codificacion danada; los puntos se normalizaron semanticamente.

## Resumen ejecutivo

El cliente no entrego una lista cerrada de bugs, sino observaciones de proceso y dudas funcionales durante la revision de Fase 2. Varias ya estan resueltas total o parcialmente en el repo actual; otras requieren definicion del cliente antes de implementar.

Lectura general:

- Lo mas critico de negocio es cerrar la relacion cliente/sucursal, compras/proveedores con recepcion de mercaderia y reglas de validacion de productos.
- CRM y ventas necesitan revision con el equipo comercial antes de cerrar alcance, porque ahi el cliente explicito que tomara mas tiempo.
- Bodega/productos parece ser el modulo mas rapido de validar, pero aun necesita definicion de campos obligatorios y reglas visuales/operativas.
- La parte visual queda subordinada a funcionalidad y datos; el cliente acepto revisar primero funcionamiento y despues UI.

## Estados usados

| Estado | Significado |
|---|---|
| Resuelto | Ya existe evidencia concreta en schema/rutas/frontend/docs. |
| Parcial | Hay base implementada, pero falta una regla, UX, validacion o cierre end-to-end. |
| Pendiente de definicion | No conviene implementar sin confirmacion del cliente. |
| Duda tecnica | Hay que verificar en ambiente/datos reales antes de marcarlo cerrado. |
| Fuera de Fase 2 inmediata | Relevante, pero corresponde a infraestructura, IA/RAG, web o fase posterior. |

## Matriz de observaciones

| # | Observacion normalizada | Modulo | Estado actual | Que implica | Evidencia / notas |
|---:|---|---|---|---|---|
| 1 | Un mismo RUT puede tener varias sucursales, regiones, comunas o presupuestos distintos. Ejemplos: Fundacion Integra, JUNJI, IND. | Clientes / Ventas | Resuelto parcial | Mantener cliente canonico por RUT, pero operar con sucursales/contactos/presupuestos asociados. Validar que ventas siempre puedan seleccionar sucursal. | La transcripcion lo marca como observacion en lineas 108-121. El repo ya tiene `ClienteSucursal`, rutas `/clientes/:id/sucursales` y `clienteSucursalId` en ventas. Falta QA funcional con casos reales del cliente. |
| 2 | La recepcion de mercaderia se hace desde factura: se ingresa detalle, codigos, rollos/metraje/cantidades, y eso alimenta bodega/productos o bodega taller. | Compras / Proveedores / Stock | Resuelto parcial | Cerrar flujo compra/proveedor -> detalle factura -> aplicar stock -> movimiento trazable. Revisar si falta OC previa o solo recepcion contra factura. | Transcripcion lineas 157-180. El repo tiene `DetalleFacturaProveedor`, `stockAplicadoAt`, `/api/pagos-proveedores` con detalles y `/api/stock-ingresos/aplicar/:pagoId`. Docs lo siguen marcando como compras parcial. |
| 3 | Bodega de productos y bodega taller son diferentes: productos comercializables vs insumos/telas/materiales. | Inventario / Taller | Resuelto parcial | Mantener separacion operativa, permisos y vistas por bodega; evitar duplicar logica. | Transcripcion lineas 163-178. El repo tiene `Producto` con `bodega` y modulo `bodega-taller`; docs lo marcan parcial alto. Falta confirmar reglas de transferencia y visibilidad por rol. |
| 4 | Taller no siempre sabe que se compro una tela; se requiere visibilidad compartida de compras/stock para quien corresponda. | Compras / Taller / Roles | Parcial | Conectar recepcion de compra con disponibilidad de taller, respetando permisos de costo/precio. | Transcripcion lineas 179-182. Hay base de stock y roles, pero falta validar UX de notificacion/visibilidad para taller. |
| 5 | CRM debe permitir agendar actividad futura, por ejemplo "llamar al cliente la proxima semana". | CRM | Pendiente de definicion | Agregar tareas/recordatorios por usuario: fecha, responsable, tipo de accion, estado, notificacion. | Transcripcion lineas 265-272. El CRM actual tiene estados, comentarios, accion/resultado y kanban, pero no se ve modelo formal de recordatorio/notificacion por usuario. |
| 6 | CRM podria notificar al vendedor lo que tiene que hacer hoy y medir pendientes por usuario. | CRM / Notificaciones | Pendiente de definicion | Crear bitacora/tareas CRM por usuario y panel de pendientes diarios. Definir si es in-app, email o ambas. | Transcripcion lineas 268-272. No hay evidencia de notificaciones CRM productivas. |
| 7 | CRM debe servir para medir tasa de cierre, tiempo en estados y performance por vendedor. | CRM / Reportes | Parcial | Reportes por vendedor: leads asignados, conversion, tiempo en pendiente/gestion/cierre. | Transcripcion lineas 272-280. Hay CRM con estados y reportes generales, pero falta confirmar metricas comerciales especificas. |
| 8 | Drag and drop del CRM se mostro como esperado, pero durante la demo se "bugueo" o no tomo una tarjeta. | CRM / UI | Duda tecnica | Reproducir en navegador real y probar cambio de estado por drag/drop. | Transcripcion lineas 249-262. El frontend usa `@dnd-kit` en `CrmPage.jsx`; requiere QA manual/productivo. |
| 9 | Al cerrar un prospecto CRM deberia transformarse en cliente y entrar al flujo de cotizacion/orden/ODT. | CRM / Clientes / Ventas | Parcial | Definir regla exacta de conversion: cuando estado=cerrado, crear/actualizar cliente, cotizacion u orden. | Transcripcion lineas 188-200 y 262. Hay integracion conceptual y enlaces a orden, pero falta confirmar automatismo end-to-end. |
| 10 | Se debe revisar una tabla de duplicados/datos dudosos y que el cliente confirme cuales son duplicados. | Migracion / Datos | Parcial | Mantener planilla de revision manual, filtros y decision de canonico. Requiere accion del cliente. | Transcripcion linea 206. Ya existen archivos de revision cliente y canonico en `docs/revision-cliente-saneamiento-2026-05-19/`. |
| 11 | Hay que definir fecha/hito de corte para datos historicos segun aparicion del numero interno; Diego recuerda 2014 o 2017. | Migracion / Historico | Pendiente de definicion | Determinar primer uso confiable de `numero interno`; datos previos quedan como historico consultable, no operacional. | Transcripcion lineas 209-227. Falta confirmacion exacta del hito. |
| 12 | El sistema nuevo debe evitar operaciones "sueltas": taller, despacho, caja o stock deben venir relacionados a flujo real. | Integridad operacional | Resuelto parcial | Mantener validadores relacionales y no permitir registros huerfanos nuevos. | Transcripcion lineas 98-103 y 122-140. Hay relation guards, indices y docs de integridad; conviene mantener QA sobre flujos nuevos. |
| 13 | Productos necesitan definir campos obligatorios. | Productos / Bodega | Pendiente de definicion | Lista de requeridos por tipo de producto: codigo, nombre, categoria, proveedor, unidad, ubicacion, precio, stock, web, foto, etc. | Transcripcion lineas 296-300. Backend tiene validaciones base, pero el propio equipo dijo que no hay validacion exhaustiva por negocio. |
| 14 | Fotos: el legacy maneja imagen chica y grande; a futuro se deberia subir principal y generar/derivar miniatura automaticamente. | Productos / Web | Parcial | Mantener foto principal, foto grande y galeria; idealmente agregar carga/generacion automatica, no solo URLs. | Transcripcion lineas 1-30 y 302-305. Repo ya tiene `fotoUrl`, `fotoUrlGrande`, `fotosGaleria` y derivacion chica/grande, pero no queda claro si hay upload/generacion automatica desde UI. |
| 15 | La pagina antigua `plastimar.cl/login.php` permite cargar fotos secundarias; no debe replicarse como dependencia futura. | Web / Productos | Resuelto conceptual | Migrar datos utiles, pero eliminar dependencia operativa del legacy. | Transcripcion lineas 52-79. El repo nuevo ya modela galeria y catalogo publico; falta validar migracion final de assets. |
| 16 | Producto debe manejar precio lista, precio marco, precio web y eventualmente listas por canal. | Productos / Comercial | Parcial | Definir precios por canal o tabla de listas si excede campos actuales. | Transcripcion lineas 292-300. Repo tiene `precioLista`, `precioMarco`, `precioWeb`, descuentos marco y descuentos; no hay modelo completo de listas por canal. |
| 17 | Producto debe manejar ubicacion fisica, unidad de medida, estado inventario, transito/reservado/descontinuado. | Productos / Inventario | Parcial | Completar reglas y filtros de inventario; confirmar si todos son campos obligatorios o estados derivados. | Transcripcion lineas 292-307. Schema tiene ubicacion/estado inventario y docs marcan inventario parcial alto. Requiere QA de UI. |
| 18 | Se espera historial de movimientos de stock y de cambios de precio. | Productos / Stock | Resuelto parcial | Verificar que ambos historiales se vean en UI y no solo existan en backend. | Transcripcion lineas 307-310. Repo tiene movimientos de producto/stock e historiales; docs dicen que historial de precios de compra aun debe robustecerse. |
| 19 | Bitacoras y estados deben evaluarse: si son texto libre, seleccionables, colores, cambios de estado, etc. | Todos los modulos | Pendiente de definicion | Definir catalogos de estado por modulo y componentes visuales. | Transcripcion linea 310. Requiere decision UX/operacion del cliente. |
| 20 | Filtros por fechas y vistas rapidas por semana/mes segun modulo. | Todos los modulos / UX | Parcial | Agregar filtros consistentes por modulo: fecha, estado, responsable, cliente, OC, ODT, guia. | Transcripcion linea 310. Muchos endpoints tienen filtros; docs aun listan filtros faltantes en matriz ventas, despachos, bitacora e historial materiales. |
| 21 | RRHH fue levantado desde data existente; cliente debe indicar si quiere contratos digitales, liquidaciones, antecedentes, vacunas, subcontratos, etc. | RRHH | Parcial | Convertir data migrada en flujo real de gestion documental y laboral. | Transcripcion linea 310. Repo tiene modulo RRHH y docs lo marcan parcial; falta alcance operativo final. |
| 22 | Ventas y CRM son los modulos mas complejos; requieren reunion con equipo de ventas. | Ventas / CRM | Pendiente de definicion | Levantar observaciones directas del equipo comercial antes de cerrar UX y reglas. | Transcripcion lineas 318-333. No corresponde cerrar solo con supuestos tecnicos. |
| 23 | Bodega y modulos similares seran revisados primero por el cliente porque son mas rapidos. | Bodega / Productos | Accion de gestion | Preparar checklist de QA por modulo y resolver en ciclos cortos. | Transcripcion lineas 318-333. No implica codigo por si solo. |
| 24 | Primero funcionalidad y datos; despues interfaz visual mas bonita/facil. | UX / Plan | Accion de gestion | Priorizar reglas, flujos, integridad y datos antes de pulido visual. | Transcripcion lineas 326-330. Alineado con plan actual. |
| 25 | Infraestructura: conviene evaluar alojar todo en VPS, migrar otros servicios y hacer mantencion de seguridad periodica. | Infraestructura | Fuera de Fase 2 inmediata | Definir hosting final, backups, llaves, mantenimiento trimestral y eventual aumento de recursos. | Transcripcion lineas 346-358. Es decision de operacion/produccion, no modulo core. |
| 26 | Para RAG/IA se necesitara VPS de 4 GB. | IA / Infraestructura | Fuera de Fase 2 inmediata | Presupuestar upgrade antes de implementar RAG. | Transcripcion lineas 360-364. La Fase 4/RAG esta marcada como faltante en docs. |
| 27 | Retroalimentacion del cliente deberia llegar en documento con descripcion minima y pantallazos marcados. | Gestion proyecto | Accion de gestion | Pedir formato unico de observaciones por modulo: pantalla, problema, comportamiento esperado, prioridad. | Transcripcion lineas 366-371. Esto ayuda a convertir feedback en tareas verificables. |

## Orden recomendado para convertir en tareas

1. **Clientes/sucursales**: cerrar QA con casos reales de RUT generico, comuna, region, presupuesto y contacto.
2. **Compras/recepcion/stock**: validar flujo factura -> detalle -> aplicar stock -> visibilidad en bodega/taller.
3. **Productos/bodega**: definir campos obligatorios, fotos, precios, ubicacion y estados.
4. **CRM**: separar bugs actuales de drag/drop de nuevos requerimientos de tareas, recordatorios y metricas.
5. **Ventas**: revisar con equipo comercial antes de cambiar reglas grandes.
6. **Datos historicos**: confirmar hito de corte exacto por numero interno.
7. **RRHH**: definir si queda solo consulta migrada o flujo documental real.
8. **Infra/RAG**: tratar como decision posterior a Fase 2 core.

## Dudas que hay que devolver al cliente

| Duda | Por que importa |
|---|---|
| Cual es la fecha exacta o criterio confiable desde que el numero interno empezo a ordenar la operacion: 2014, 2017 u otro hito? | Define que datos quedan operativos y cuales historicos. |
| Para RUT genericos, que campos distinguen una sucursal operativa: region, comuna, presupuesto, contacto, unidad compradora, direccion, email? | Evita fusionar clientes que comparten RUT pero operan distinto. |
| La recepcion de mercaderia debe partir desde OC proveedor o basta registrar factura recibida? | Cambia el flujo compras end-to-end. |
| En CRM, que tipos de tarea necesitan: llamada, correo, visita, cotizacion, seguimiento, otro? | Define modelo de agenda y notificaciones. |
| Las notificaciones deben ser solo dentro del sistema o tambien por correo/WhatsApp? | Afecta infraestructura e integraciones. |
| Que campos son obligatorios para producto normal, producto web, insumo/tela y producto de taller? | Permite implementar validaciones correctas sin bloquear operacion. |
| Los estados deben ser texto libre o catalogos cerrados con colores por modulo? | Define UX, reportes y calidad de datos. |
| RRHH sera repositorio documental o modulo operativo con aprobaciones/asistencia/reportes? | Evita sobredimensionar una parte fuera del core comercial. |

## Ya resuelto o encaminado

- Cliente canonico con sucursales existe en schema, backend y formulario.
- Recepcion de stock por factura/proveedor existe como base tecnica.
- Productos ya soportan foto chica/grande, galeria, descripcion/precio web y catalogo publico.
- CRM tiene kanban por estados y edicion de registro.
- Bodega/taller y productos estan separados en modulos.
- Reportes gerenciales y trazabilidad existen en estado parcial alto.
- Fase 4 IA/RAG sigue faltante y no debe confundirse con cierre de Fase 2.

## Riesgos si se cierra Fase 2 sin resolver esto

- Datos comerciales pueden quedar correctos por RUT pero incorrectos por sucursal/unidad compradora.
- Compras y taller pueden seguir desalineados si la recepcion de factura no queda visible para bodega/taller.
- CRM puede quedar como tablero visual sin agenda real de vendedores.
- Productos pueden seguir aceptando registros incompletos si no se definen campos obligatorios.
- El cliente puede pedir cambios grandes en ventas despues, si no se revisa con el equipo comercial antes.
