# Fase 3 Operaciones - cierre sprints Kanban, packing y tiempos

Fecha: 2026-06-02

Decision de alcance:

- App movil operario queda diferida a backlog futuro.
- El cierre funcional de Fase 3 se enfoca en Kanban de produccion, packing por linea, tiempos basicos y tracking logistico.

## Sprint 7 - Kanban formal de produccion

Estado: implementado.

Entregado:

- Vista Kanban alternable en Taller / ODTs.
- Columnas operativas: Criticas, Pendientes, Asignadas, En proceso, Control y Listas.
- Tarjetas ODT con cliente, responsable, plazo, atraso y tiempo de produccion.
- Avance rapido de estado desde la tarjeta para usuarios con permiso de taller.
- Filtros de estado ajustados para Prioritaria, Asignada y Control calidad.

Impacto:

- Mejora la visibilidad diaria de carga y estado de produccion.
- Reduce dependencia de revisar solo tabla/listado.

Riesgo residual:

- No incluye drag and drop en este sprint; queda resuelto en Sprint 10.
- La vista usa el page size actual del listado, no una consulta ilimitada.

## Sprint 8 - Packing por linea

Estado: implementado.

Entregado:

- Endpoint logistico `PUT /api/despachos/ordenes/:ordenId/packing`.
- Actualizacion por lote de `OrdenItem.nEntregados`.
- Validacion de item perteneciente a la orden, duplicados, cantidades negativas y exceso sobre cantidad vendida.
- Recalculo transaccional de `Orden.estadoEntrega`.
- Columna Packing en matriz despacho.
- Modal de packing por venta con completar/cero por linea.
- Export CSV de matriz incluye resumen de packing.

Impacto:

- Permite controlar entregas parciales por producto/linea.
- Baja riesgo de despacho incompleto sin visibilidad.

Riesgo residual:

- No registra historial por despacho individual en este sprint; queda resuelto en Sprint 11.
- No incorpora bultos, ubicacion fisica ni lectura codigo de barra.

## Sprint 9 - Tiempos basicos

Estado: implementado.

Entregado:

- Metricas derivadas ODT: horas de produccion, espera, ciclo y atraso.
- Listado y detalle ODT exponen `tiempos`.
- Tabla Taller muestra Tiempo prod. y Atraso.
- Modal ODT muestra Tiempo prod., Ciclo y Atraso.
- Registros de despacho exponen dias/horas de despacho.
- Export CSV de despachos incluye Dias Despacho.

Impacto:

- Entrega primera lectura operativa de atrasos y duracion.
- Habilita control basico sin modificar datos historicos.

Riesgo residual:

- Los tiempos son derivados de fechas existentes; si esas fechas historicas estan incompletas, la metrica queda parcial.
- No calcula costo por taller ni productividad avanzada por tarea.

## Sprint 10 - Kanban completo

Estado: implementado.

Entregado:

- Endpoint `GET /api/odts/kanban` sin paginacion chica para cargar tablero operativo completo.
- Drag and drop en Taller / ODTs para mover tarjetas entre estados.
- Confirmacion antes de aplicar cambio de estado por arrastre.
- Invalidation explicita de listado, detalle y kanban ODT tras cambios.
- Filtro Listo cubre Terminada y Entregada.

Impacto:

- Permite operar taller desde tablero visual, no solo desde tabla.
- Baja friccion para priorizar, asignar y cerrar trabajo diario.

Riesgo residual:

- El movimiento sigue siendo cambio de estado ODT; no mueve tareas internas por item.
- La validacion visual autenticada quedo por smoke manual del usuario por limitacion del browser wrapper.

## Sprint 11 - Packing trazable

Estado: implementado.

Entregado:

- Nuevas tablas `bodega.packing_bultos` y `bodega.packing_eventos`.
- `GET /api/despachos/ordenes/:ordenId/packing` devuelve items, bultos y eventos recientes.
- `PUT /api/despachos/ordenes/:ordenId/packing` mantiene el acumulado por linea y registra historial por delta.
- Asociacion opcional a despacho y bulto, con usuario y observacion del ajuste.
- Modal de packing muestra progreso, bulto, despacho, observacion e historial reciente.
- Prueba API local con bulto nuevo, correccion y actualizacion de bulto existente.

Impacto:

- Mantiene compatibilidad con el packing acumulado existente y agrega auditoria operativa.
- Permite responder que se preparo, en que bulto, por que despacho y quien hizo el ajuste.

Riesgo residual:

- No hay lectura de codigo de barra todavia.
- La trazabilidad queda a nivel bulto/evento; no incluye ubicacion fisica de bodega.

## Sprint 12 - Tracking logistico

Estado: implementado.

Entregado:

- Nueva tabla `bodega.despacho_tracking_eventos`.
- `GET /api/despachos/:id/tracking` devuelve ultimo estado y timeline reciente.
- `POST /api/despachos/:id/tracking` registra estado, transporte, ubicacion, observacion, fecha y usuario.
- Lista de despachos expone ultimo tracking y export CSV agrega estado/fecha/ubicacion tracking.
- Modal en Registros de despacho permite ver timeline y agregar eventos logisticos.
- Evento `Entregado` sincroniza `Despacho.fechaEntrega` y recalcula `Orden.estadoEntrega`.

Impacto:

- Permite seguimiento operativo por transportista sin mezclarlo con guias ni matriz de venta.
- Da historial de incidencias/reprogramaciones y deja visible el ultimo estado logistico.

Riesgo residual:

- No incluye integracion externa con transportistas.
- No incluye geolocalizacion automatica ni prueba de entrega con firma/foto.

## Sprint 13 - Costeo productivo

Estado: implementado.

Entregado:

- `costeo` derivado en ODTs para lista, Kanban y detalle.
- Costo de materiales desde historial de egresos/ingresos ODT y precios actuales de catalogo.
- Costo de mano de obra estimado desde sueldo liquido / 180 horas cuando RRHH esta disponible.
- Productividad por ODT: unidades, unidades por hora y costo por unidad.
- Margen estimado cuando la ODT esta vinculada a venta.
- Alertas de datos incompletos: material sin precio, responsable sin sueldo o sin horas de produccion.
- UI Taller muestra costo estimado en tabla, tarjeta Kanban y panel del modal ODT.
- Lecturas ODT toleran ausencia de tabla RRHH en DB local/legacy y no devuelven 500 por eso.

Impacto:

- Entrega primera lectura de rentabilidad operativa por ODT sin crear carga administrativa nueva.
- Permite detectar ODTs con consumo sin precio, sin responsable valorizable o sin horas productivas.

Riesgo residual:

- El costo usa precios actuales, no snapshot historico de precio al momento del consumo.
- Mano de obra es estimacion por responsable principal; no distribuye horas por tarea ni por varios operarios.
- No incluye costos indirectos ni gastos generales de taller.

## Sprint 14 - Productividad avanzada

Estado: implementado.

Entregado:

- Endpoint `GET /api/odts/meta/productividad` con rango de fechas, tipo de taller y filtro por responsable.
- Productividad agregada por responsable principal de ODT cerrada.
- Metricas por responsable: ODTs, unidades, horas productivas, unidades/hora, costo total, costo por unidad, venta y margen estimado.
- Alertas agregadas por responsable para materiales sin precio, mano de obra sin sueldo y ODTs sin horas de produccion.
- Panel en Taller / ODTs con top responsables recientes y click para filtrar la vista por responsable.
- Consulta tolera DB local/legacy sin tabla RRHH igual que el costeo por ODT.

Impacto:

- Permite comparar capacidad y rentabilidad estimada por responsable sin depender de una app movil de operario.
- Da una vista ejecutiva simple para detectar cuellos de botella, baja productividad y datos incompletos de costeo.

Riesgo residual:

- La productividad se atribuye al responsable principal de la ODT; no reparte produccion entre varios operarios.
- Usa fechas de cierre y horas derivadas; si `fechaInicio` o `fechaTermino` faltan, la productividad queda incompleta.
- No mide productividad por tarea interna ni por item individual.

## Sprint 15 - RRHH operativo avanzado

Estado: implementado.

Entregado:

- Endpoint `GET /api/rrhh/operativo` para tablero operativo RRHH.
- Ventana configurable de alertas, por defecto 30 dias y maximo 180.
- Dotacion activa por cargo, filtrable por empresa/cargo.
- Alertas de contratos por vencer, licencias activas, vacaciones programadas y datos incompletos.
- Deteccion de trabajadores activos sin sueldo liquido, sin cargo o sin fecha de ingreso.
- Panel en RRHH / Trabajadores con resumen operativo, eventos y acceso rapido a trabajador/cargo.
- Tolerancia a DB local/legacy sin tablas RRHH: responde contrato vacio con `rrhhSchemaDisponible: false` en vez de 500.

Impacto:

- RRHH queda conectado a la operacion de taller y costeo: identifica datos que afectan asignacion y valorizacion.
- Administracion puede anticipar vencimientos y ausencias sin revisar trabajador por trabajador.

Riesgo residual:

- No promete cumplimiento legal laboral completo; requiere validacion administrativa antes de usarlo como sistema legal.
- No migra documentos historicos ni genera contratos/liquidaciones automaticamente.
- En DB local actual el schema RRHH no esta instalado, por eso el smoke valida tolerancia y contrato, no datos reales.

## Verificacion local

- `npm.cmd exec prisma validate`: OK.
- `npm.cmd exec prisma migrate deploy`: OK en DB local `plastimar_test`.
- `npm.cmd exec prisma generate`: OK.
- `node --check src/routes/despachos/index.js`: OK.
- `node --check src/routes/odts/costeo.js`: OK.
- `node --check src/routes/odts/index.js`: OK.
- `node --check src/routes/rrhh/index.js`: OK.
- `npm.cmd test -- despachos-traceability.test.js despachos.test.js odt-list-helpers.test.js odt-operations.test.js` con `DATABASE_URL` local: 54/54 OK.
- `npm.cmd test -- odt-costeo.test.js odt-operations.test.js odt-list-helpers.test.js`: 20/20 OK.
- `npm.cmd test -- rrhh-helpers.test.js`: 5/5 OK.
- `npm.cmd test -- rrhh-helpers.test.js despachos-traceability.test.js despachos.test.js odt-costeo.test.js odt-operations.test.js odt-list-helpers.test.js odts.test.js odt-consumos.test.js` con `DATABASE_URL` local: 87/87 OK.
- `npx.cmd eslint src/pages/despachos/DespachosPage.jsx src/api/despachos.js`: OK.
- `npx.cmd eslint src/pages/taller/TallerPage.jsx src/api/odts.js`: OK.
- `npx.cmd eslint src/pages/rrhh/RrhhPage.jsx src/api/rrhh.js`: OK.
- `npm.cmd run build -- --configLoader runner`: OK.
- Backend local activo en `http://localhost:3001` / `http://127.0.0.1:3001`.
- Frontend local activo en `http://localhost:5174`; smoke manual de Kanban drag/drop confirmado por usuario.
- Smoke API packing orden 7: bulto nuevo, evento entrega, evento correccion y actualizacion de bulto existente OK.
- Smoke API tracking despacho 216: evento En ruta, timeline, listado y rechazo de estado invalido OK.
- Smoke API costeo ODT: lista, Kanban y detalle devuelven `costeo` OK.
- Smoke API productividad: health OK, login admin OK y `GET /api/odts/meta/productividad?fechaDesde=2026-01-01` responde contrato OK.
- Smoke API RRHH operativo: health OK, login admin OK y `GET /api/rrhh/operativo?dias=30` responde contrato OK con `rrhhSchemaDisponible:false` en DB local.
- Smoke final no destructivo: health/login OK, ODT lista 5/6, Kanban 5, despachos 1, productividad contrato OK y RRHH operativo contrato OK.
- Precheck produccion read-only antes de deploy: `rrhh.trabajadores` existe; `bodega.packing_bultos` y `bodega.despacho_tracking_eventos` aun no existen y deben ser creadas por migraciones del deploy.
- Smoke visual autenticado en browser integrado no ejecutado: el wrapper falla al escribir login por clipboard/click timeout.

## Estado de Fase 3

Con app movil operario diferida, Kanban completo, packing trazable, tracking logistico, costeo productivo, productividad avanzada y RRHH operativo avanzado ya cierran los refinamientos operativos principales de Fase 3.

Pendientes no bloqueantes:

- Despliegue/validacion en ambiente con schema RRHH instalado y datos reales.
