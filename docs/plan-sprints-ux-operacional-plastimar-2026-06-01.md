# Plan de sprints UX operacional Plastimar

Fecha: 2026-06-01  
Alcance: Bodega inventario, editor de producto, tablas configurables, talleres/ODT, accesos rapidos post-login y menu principal.  
Regla de entrega: push a git, sin deploy.

## Mecanica multiagente

Cada sprint se ejecuta con agentes especialistas. Los agentes entregan diagnostico, criterios de aceptacion y riesgos. Codex actua como revisor tecnico-producto: aprueba, pide cambios o bloquea avance. No se inicia el siguiente sprint hasta que el sprint actual tenga smoke y QA aprobados.

Agentes:

- Agente Bodega/Inventario: valida stock, estados, producto, precios, imagenes y filtros operativos.
- Agente Taller/Produccion: valida ODT, estados, lista de trabajo, prioridades y edicion.
- Agente UX Operacional: ordena pantallas segun tareas reales del usuario.
- Agente Frontend: implementa vistas, tablas, popups, formularios y componentes reutilizables.
- Agente Backend/Datos: ajusta modelos, endpoints, upload, preferencias por usuario y normalizacion de estados.
- Agente Roles/Permisos: valida accesos rapidos, menu y visibilidad por rol.
- Agente QA/Smoke: prueba rutas, permisos, edicion, filtros, upload y regresiones.

Flujo por sprint:

1. Agentes entregan hallazgos y propuesta.
2. Codex revisa y aprueba o pide cambios.
3. Se implementa solo lo aprobado.
4. Se ejecuta smoke del sprint.
5. Se ejecuta QA funcional.
6. Si falla, se corrige dentro del mismo sprint.
7. Solo con QA aprobado se pasa al sprint siguiente.

## Sprint 0 - Baseline operativo legacy vs nuevo

Objetivo: fijar comportamiento esperado antes de tocar codigo.

Entregables:

- Mapa legacy vs nuevo para Bodega inventario, editor producto, Bodega taller, Talleres/ODT, Caja, Ventas, Licitaciones y RRHH.
- Inventario de accesos rapidos legacy convertidos a rutas modernas con filtros aplicados.
- Matriz de roles: admin, ventas, bodega, caja, taller, rrhh y solo lectura.
- Lista de campos criticos por modulo.

Criterios de aceptacion:

- Cada acceso rapido legacy tiene equivalente moderno o queda marcado como brecha.
- Cada rol tiene alcance de menu definido.
- Queda claro que se conserva por operacion y que se mejora por UX.

Smoke/QA:

- Revisar login por rol.
- Revisar rutas actuales.
- Revisar datos base de productos, stock, precios, ODT y caja.

## Sprint 1 - Bodega inventario: estado de inventario

Problema: el estado del inventario no se reconoce ni se muestra con claridad.

Objetivo: normalizar y mostrar estado operativo por producto.

Estados propuestos:

- Disponible.
- Stock critico.
- Sin stock.
- Inactivo o bloqueado, si aplica por datos legacy.
- Incompleto, si faltan datos clave.

Tareas:

- Identificar campos legacy usados para stock, visibilidad, bloqueo, categoria, proveedor y precios.
- Definir regla backend para calcular estado.
- Exponer estado normalizado en API.
- Mostrar badge de estado en tabla Bodega inventario.
- Agregar filtro por estado.

Criterios de aceptacion:

- Todo producto visible tiene estado.
- El estado coincide con stock y datos reales.
- El usuario puede filtrar por estado.
- No se rompe importacion, edicion ni busqueda de productos.

Smoke/QA:

- Entrar a Bodega.
- Filtrar por stock critico.
- Abrir producto.
- Confirmar consistencia entre tabla y editor.

## Sprint 2 - Editor de producto: grupos, jerarquia y upload imagen

Problema: el editor esta plano y la imagen se maneja por URL.

Objetivo: reorganizar el editor y reemplazar URL por carga de archivo.

Grupos de edicion:

- Datos del producto: nombre, descripcion, codigo interno, codigo de barra, categoria, subcategoria, proveedor y detalles.
- Inventario: stock, stock minimo/critico, ubicacion si existe, estado, visibilidad web y observaciones internas.
- Precios: precio venta, precio convenio, descuentos, costo y margen si existen.
- Imagenes: subir imagen, preview, reemplazar, eliminar y fallback sin foto.

Tareas:

- Reorganizar UI del editor en secciones claras.
- Crear boton de upload de imagen.
- Crear endpoint backend para carga.
- Validar tipo y tamano de archivo.
- Guardar ruta en producto.
- Mantener compatibilidad con imagenes existentes.

Criterios de aceptacion:

- El usuario no pega URLs manualmente.
- El upload muestra preview.
- La imagen queda visible en tabla y editor.
- Los campos quedan agrupados de forma clara.

Smoke/QA:

- Editar producto existente.
- Subir imagen.
- Guardar.
- Recargar.
- Confirmar persistencia.

## Sprint 3 - Selector de columnas por usuario

Problema: las tablas no se adaptan al trabajo de cada usuario.

Objetivo: permitir agregar/quitar columnas desde una tabla base.

Alcance inicial:

- Bodega inventario.
- Bodega taller.
- Talleres/ODT.

Funcionamiento:

- Boton "Columnas".
- Popup con checklist.
- Acciones: seleccionar, quitar, restaurar base y guardar.
- Persistencia por usuario y por modulo.
- Columnas obligatorias protegidas.

Tareas:

- Crear componente reutilizable de selector de columnas.
- Definir columnas base por modulo.
- Crear almacenamiento de preferencias por usuario.
- Aplicar preferencias al render de tabla.

Criterios de aceptacion:

- El usuario puede ocultar/mostrar columnas.
- La seleccion persiste al recargar.
- Otro usuario mantiene su propia vista.
- Admin puede volver a vista completa/base.

Smoke/QA:

- Ocultar columna.
- Guardar.
- Recargar.
- Confirmar persistencia.
- Cambiar rol/usuario y confirmar aislamiento.

## Sprint 4 - Talleres: estados y lista principal

Problemas:

- Estados ODT deben ser Pendiente, En proceso y Listo.
- La vista principal de ODT esta en cards y debe ser lista operativa.

Objetivo: normalizar estados y transformar la vista principal a lista.

Estados permitidos:

- Pendiente.
- En proceso.
- Listo.

Tareas:

- Mapear estados actuales a los tres estados nuevos.
- Normalizar backend/modelo si aplica.
- Cambiar vista principal de cards a tabla/lista.
- Agregar filtros rapidos por estado, prioridad, fecha, numero OT y cliente.
- Mantener indicadores/KPIs como resumen, no como reemplazo de la lista.

Criterios de aceptacion:

- Todas las ODT tienen estado valido.
- La lista permite revisar muchas ODT rapido.
- Cambiar estado es claro y trazable.
- Las cards dejan de ser la vista principal.

Smoke/QA:

- Abrir Talleres.
- Filtrar pendientes.
- Cambiar ODT a En proceso.
- Cambiar ODT a Listo.
- Confirmar que la lista actualiza.

## Sprint 5 - Editores jerarquizados

Problema: los editores no guian al usuario.

Objetivo: definir y aplicar un patron comun de edicion.

Patron:

- Encabezado con identificador, estado y accion principal.
- Secciones agrupadas por tarea.
- Campos criticos arriba.
- Datos secundarios colapsables.
- Acciones peligrosas separadas.
- Historial/auditoria al final.

Editor ODT propuesto:

- Resumen ODT: numero, estado, prioridad, fecha y responsable.
- Cliente / venta origen: cliente, documento, venta vinculada y contacto.
- Trabajo solicitado: productos, medidas, materiales y observaciones.
- Produccion: taller, operario, avance y fechas.
- Historial: cambios de estado, comentarios y auditoria.

Criterios de aceptacion:

- El usuario entiende que editar primero.
- No se pierden campos existentes.
- El patron se puede reutilizar en producto, venta, cliente y caja.

Smoke/QA:

- Abrir ODT.
- Editar campos criticos.
- Guardar.
- Confirmar historial/estado.

## Sprint 6 - Inicio con accesos rapidos y menu simplificado

Problema: el legacy tenia un menu enorme con accesos que en realidad son filtros importantes. El nuevo debe simplificar sin perder velocidad operativa.

Objetivo: crear pantalla post-login con accesos rapidos por rol y menu principal reducido.

Menu principal simplificado:

- Dashboard.
- Ventas.
- Bodega.
- Caja.
- RRHH.
- Licitaciones.
- Taller.
- Configuracion/Admin, solo si corresponde.

Accesos rapidos iniciales:

- Stock critico bodega.
- Stock critico bodega taller.
- Ventas no pagadas.
- Ventas pendientes de entrega.
- Consulta precios.
- Nueva venta sala.
- Venta web / OC.
- Convenio marco.
- ODT pendientes.
- ODT prioritarias.
- Taller espumas pendientes.
- Taller confecciones pendientes.
- Movimientos caja hoy.
- Buscar caja por fechas.
- Buscar por documento.
- Licitaciones cotizadas.

Reglas por rol:

- Admin ve todo.
- Ventas ve ventas, consulta precios, licitaciones y clientes permitidos.
- Bodega ve inventario, stock critico, proveedores y despachos si aplica.
- Caja ve caja, cobranza y movimientos.
- Taller ve ODT y materiales de taller.
- RRHH ve solo RRHH.
- Solo lectura ve accesos definidos sin acciones de escritura.

Criterios de aceptacion:

- Login redirige a inicio operativo.
- Cada card abre una ruta real con filtro aplicado.
- El menu queda reducido y funcional.
- La visibilidad respeta roles.

Smoke/QA:

- Login admin: ve todos los accesos.
- Login bodega: ve solo accesos de bodega.
- Login taller: ve solo accesos de taller.
- Probar card con filtro aplicado.

## Sprint 7 - QA integral y cierre

Objetivo: validar la experiencia completa antes de considerar deploy.

Pruebas:

- Login por roles.
- Menu por roles.
- Accesos rapidos.
- Bodega inventario.
- Editor producto.
- Upload imagen.
- Selector de columnas.
- Bodega taller.
- Lista ODT.
- Cambio de estados ODT.
- Editor ODT.
- Regresion en ventas, caja y licitaciones si comparten componentes.

Criterios de cierre:

- Sin warnings visibles en UI.
- Sin errores de consola criticos.
- Sin rutas rotas.
- Sin perdida de datos al editar.
- Upload funcionando.
- Preferencias de columnas persistentes.
- Permisos respetados.
- Smoke aprobado por sprint.
- QA final aprobado.

## Orden recomendado

1. Bodega inventario y editor producto.
2. Selector de columnas reutilizable.
3. Talleres/ODT.
4. Accesos rapidos y menu simplificado.
5. QA integral.

Razon: Bodega inventario y producto son el dolor operativo inmediato. El selector de columnas conviene hacerlo temprano porque se reutiliza. Talleres depende de normalizar estados. Accesos rapidos y menu se cierran mejor cuando las rutas y filtros ya estan estables.
