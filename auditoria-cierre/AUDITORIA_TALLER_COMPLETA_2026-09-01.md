# Auditoría funcional, técnica y operacional de Talleres

## 1. Objetivo

Determinar, para Corte, Confección y Espuma:

- qué dato dispara el trabajo;
- qué ve y escribe cada rol;
- qué cambia al avanzar estados;
- qué recibe o envía a otros módulos;
- si el flujo responde a las encuestas originales;
- si la UI permite trabajar con rapidez y sin depender de instrucciones paralelas;
- si la implementación está configurada y utilizada en producción.

Esta auditoría no confunde código disponible con proceso adoptado. Cada conclusión distingue **implementado**, **configurado** y **usado**.

## 2. Fuentes y evidencia

Fuentes principales:

- [Encuesta Taller de Corte](fuentes-originales/Encuesta_taller_de_corte_Plastimar.docx), Jenifer Breidenbach y Mercedes Rodrigues.
- [Encuesta Taller de Confección](fuentes-originales/Encuesta_taller_de_confeccion_Plastimar.docx), Zalma Lobos.
- [Encuesta Taller de Espuma](fuentes-originales/Encuesta_taller_de_espuma_Plastimar.docx), Sebastián Mella.
- [Encuesta Bodega 1](fuentes-originales/Encuesta_bodega_1_Plastimar.docx), para los traspasos de materiales y producto terminado.
- [Informe consolidado](fuentes-originales/Informe_Consolidado_ERP_Plastimar_24-08-2026.docx).

También se revisaron el código en `main`, la base productiva, los planes de reparto, las revisiones del 26 de agosto, la auditoría técnica de Sebastián y las capturas históricas incluidas en esta carpeta.

## 3. Arquitectura funcional observada

El flujo esperado es:

`Venta/MK u ODT interna → coordinación de Taller → etapa por especialidad → avance/consumo/calidad → siguiente etapa → Despacho → cierre`.

El sistema modela gran parte de esa cadena:

- la ODT puede nacer de una venta o de un centro de costo;
- cada ítem se relaciona con uno o más talleres;
- cada relación tiene estado, responsable, fechas y observación;
- Corte dispone de avances estructurados y fotografías;
- materiales pueden descontarse con lote, calidad y merma;
- existe bitácora de ciertos cambios;
- una ODT puede devolverse a Ventas, cerrarse o anularse.

La cadena real no está cerrada porque las etapas no tienen responsables, la captura operacional no se usa y no existe un control formal de calidad/aceptación entre áreas.

## 4. Auditoría de coordinación general

### Disparador y datos de entrada

Las ODT históricas provienen de ventas. El sistema también permite ODT internas con centro de costo, pero producción no contiene ninguna. Los datos disponibles incluyen cliente, ítems, cantidades, observaciones, prioridad, talleres asociados y, según el origen, orden de venta.

### Qué ve y hace coordinación

La pantalla principal permite lista y Kanban, filtros, KPI, asignación de responsables, prioridades y cambios de estado. Puede crear/editar ODT, pasarla por talleres, devolverla a Ventas, cerrarla o anularla según permisos.

### Qué activa

- Asignar responsable modifica la relación ítem–taller.
- Cambiar estado actualiza fechas de inicio/listo y registra bitácora si el estado cambia.
- Devolver a Ventas cambia el estado de la orden y exige motivo.
- Cerrar cambia la ODT a Terminada o Entregada.
- Anular marca la ODT eliminada y registra el hecho.

### Hallazgos críticos

- No hay un grafo obligatorio de transiciones. Entre estados no destructivos se permiten saltos directos.
- El cierre no verifica que todas las etapas estén listas, que calidad esté aprobada, que el consumo cuadre ni que Despacho acepte.
- El Kanban hereda esa flexibilidad y facilita cambios inválidos con una simple confirmación.
- El KPI “Pendientes críticas” muestra prioritarias, pero su acceso directo filtra Pendiente sin conservar la prioridad urgente.
- Capacidad mide conteo de ODT, no unidades, minutos estándar, complejidad ni carga de receta.
- No hay fechas comprometidas en producción; los KPI de atraso/prioridad no pueden ser confiables.

### Dictamen

**Funcionalmente útil, pero no suficientemente controlado para ser la fuente única del proceso.**

## 5. Taller de Corte

### Requisito original

La encuesta indica que Jenifer y Mercedes reciben del jefe el número de orden/MK; necesitan medidas, colores, características e imagen correcta; registran el producto trabajado en un cuaderno; informan cantidades listas; priorizan por días hasta entrega; requieren un registro automático por orden, estados En proceso/Terminado e identidad del trabajador.

### Implementación encontrada

Existe una API específica de Corte que entrega bandeja, detalle, progreso, avances diarios y evidencias fotográficas. El avance guarda cantidad terminada, fecha, observación, usuario e IP; al primer avance puede pasar la etapa a En proceso. La UI móvil general permite iniciar/finalizar y escribir una nota.

### Brechas funcionales

- Producción no tiene etapas denominadas Corte ni avances/evidencias; el flujo no está adoptado.
- Los endpoints especializados de avance/evidencia exigen `taller:write`, pero el rol `taller_operario` solo tiene `taller.avance:write` y lectura general. El permiso diseñado para el operario no habilita esas rutas.
- La suma anterior de avances se consulta antes de iniciar la transacción. Dos solicitudes simultáneas pueden superar el objetivo.
- La pantalla operario abre en “Mis tareas”; con cero asignaciones muestra una bandeja vacía.
- La tarjeta no presenta la foto real del producto/MK, pese a ser un requisito expreso para evitar errores de color e imagen.
- La nota es mutable y única; no sustituye un historial diario inalterable.
- No hay pausa, rechazo ni motivo de reproceso accesibles en esa UI.
- Un operario puede usar el selector para reasignar responsable; esa acción debería pertenecer a jefatura/supervisión.
- No existe lectura destacada de días restantes ni alerta automática de urgencia.

### Dictamen

**La solución específica va en la dirección correcta, pero hoy es inaccesible para el rol diseñado y no tiene evidencia productiva.**

## 6. Taller de Confección

### Requisito original

Zalma revisa Sisgestión, requiere ver todas las órdenes MK, registrar producción por operaria, recibir dimensiones/colores/diseño desde Corte, asignar verbalmente, priorizar por fechas o solicitudes comerciales, pedir autorización en muestras/nuevos artículos y notificar a Despacho cuando termina. No existe registro estándar de rechazo o reproceso.

### Implementación encontrada

Confección usa el flujo genérico de ítem–taller: asignación, estado, inicio/listo, observación y responsable. El rol de Zalma posee gestión y cierre; Jenifer/Mercedes poseen avance. Las ODT y sus especificaciones se pueden consultar.

### Brechas funcionales

- El registro móvil no captura cantidad diaria por operaria; la observación reemplaza esa necesidad de manera débil.
- No existe una cola de autorización para muestras o artículos nuevos.
- Rechazado requiere motivo en backend, pero no hay acción clara de rechazo/reproceso en la UI operaria.
- No existe una inspección de calidad formal ni una aceptación de la entrega desde Corte.
- La notificación a Despacho deriva del estado, pero no hay entrega/recepción con usuario, fecha, cantidad y discrepancias.
- Sin responsables ni fechas comprometidas, Zalma no puede gobernar carga ni prioridad desde el sistema.
- El sistema no obliga a preservar dimensiones, colores y diseño como especificaciones visibles e inmutables durante la ejecución.

### Dictamen

**El tablero administra estados, pero no representa todavía el trabajo diario descrito por Zalma.**

## 7. Taller de Espuma

### Requisito original

Sebastián consulta pedidos y coordina prioridades con Zalma y Diego; registra Pendiente/En proceso/Listo; cambios de densidad requieren autorización; necesita urgencia automática, filtro por estado/prioridad, medidas, referencia fotográfica y stock; calcula material manualmente, solicita stock por correo, no registra consumos ni mermas y realiza inventario semanal. Si falta material, Diego autoriza reemplazos.

### Implementación encontrada

El modelo incorpora densidad, espesor y formato en materia prima; lotes con calidad aprobado/observado/rechazado; consumos con lote, calidad, merma y motivo; descuento de stock; pantalla de consumo; ODT interna; estados de etapa y permisos de materiales/movimientos para Sebastián.

### Brechas funcionales y de datos

- Bodega Taller tiene 70 materiales activos en total; ninguno de los 4 asociados a Espumas tiene densidad, espesor o formato.
- No hay lotes, movimientos ni consumos.
- La exigencia de lote aprobado depende de que el material tenga densidad; los maestros nulos dejan la regla inactiva.
- Calidad del lote no reemplaza calidad del producto cortado/confeccionado.
- No existe flujo de solicitud y aprobación de sustitución de densidad por Diego.
- No hay reserva de material por ODT ni visibilidad de faltantes contra demanda futura.
- El lote se consulta y luego se decrementa sin condición atómica; bajo concurrencia puede quedar negativo.
- El formulario existe, pero no está conectado a una operación evidenciada en producción.
- No existe prioridad automática basada en fecha comprometida; ese campo está vacío en todas las ODT.
- No hay RRHH localizado/enlazado para Sebastián en la consulta por nombre.

### Dictamen

**La arquitectura implementada resuelve el diseño, pero la función está dormida por falta total de datos maestros y adopción.**

## 8. Bodega Taller y materiales

### Entrada y salida de datos

La Bodega Taller debe recibir materias primas y lotes desde compra/bodega, ofrecer stock por especialidad, descontar consumos por ODT y devolver información de merma/costo. Al finalizar, Taller transfiere producto a Bodega/Despacho.

### Fortalezas

- Existe catálogo por taller, stock, historial, lotes, atributos técnicos y consumo vinculado a ODT.
- El descuento de stock total usa una actualización condicionada para evitar saldo negativo.
- La merma queda separada del consumo útil y exige motivo cuando corresponde.

### Brechas

- Cero movimientos y consumos reales.
- No hay recepción inicial de lotes ni saldo por lote.
- No existe reserva/asignación de material antes de fabricar.
- La anulación/cierre de ODT no presenta una política explícita de reversa o conciliación de materiales.
- El stock por lote tiene riesgo de carrera concurrente.
- La entrega de producto terminado a Despacho no registra aceptación ni diferencia.

## 9. Costeo

### Estado

Las recetas ya fueron cargadas: 2.554 recetas, 4.104 materiales y 4.832 procesos. Esto corrige el principal hallazgo de la revisión del 26 de agosto.

### Brechas

- No existen snapshots de costeo en producción.
- No hay consumos reales para comparar estándar versus real.
- No hay merma real para retroalimentar receta o costo.
- Cerrar una ODT no exige calcular ni congelar el costo final.
- Sin densidades y lotes de espuma no hay trazabilidad del costo por especificación/lote.

### Dictamen

**El costeo está cargado como conocimiento maestro, pero aún no funciona como contabilidad industrial trazable por ODT.**

## 10. Calidad

La calidad es la mayor brecha transversal. Las encuestas muestran una operación informal: Corte reporta errores de colores/imágenes; Confección no tiene rechazo/reproceso estandarizado; Espuma no tiene control de calidad de producto.

El sistema posee estado de calidad del lote y estado Rechazado por etapa, pero falta un objeto de inspección con:

- etapa e ítem inspeccionados;
- cantidad revisada/aprobada/rechazada;
- defecto y causa;
- responsable y fecha;
- evidencia;
- decisión de reproceso, descarte o excepción autorizada;
- bloqueo de transferencia/cierre hasta aprobación.

Sin esto, “Listo” significa terminado por el área, no necesariamente conforme.

## 11. Integraciones y efectos entre módulos

### Ventas → Taller

Ventas aporta orden, cliente, productos, cantidades y observaciones. La devolución con motivo está implementada. Falta proteger especificaciones críticas y cerrar el ciclo de corrección/aceptación.

### Taller → Bodega Taller

El consumo puede descontar stock y lote y registrar merma. No hay evidencia de uso ni reserva previa. El reemplazo de material/densidad no tiene aprobación formal.

### Taller → Costeo

La receta define estándar; consumo y merma deberían construir real. Hoy no hay registros reales ni snapshot final.

### Corte → Confección → Espuma/Externo

Las relaciones por taller existen, pero no hay aceptación explícita entre etapas ni dependencias que impidan iniciar una etapa antes de recibir la anterior.

### Taller → Despacho

Despacho puede inferir disponibilidad desde estados, pero falta una entrega formal con quién entrega, quién recibe, fecha, cantidad y discrepancia.

### Usuarios/RRHH → Taller

Los usuarios clave existen y la mayoría está enlazada a RRHH. Persisten duplicidad de Jenifer, ausencia/localización pendiente de Sebastián y una incompatibilidad entre permisos del operario y rutas específicas de Corte.

## 12. Riesgos técnicos

1. Saltos de estado no controlados.
2. Cierre sin precondiciones productivas.
3. Sobreavance concurrente en Corte.
4. Sobreconsumo concurrente por lote.
5. Permiso de Corte incompatible con `taller_operario`.
6. Observación mutable en vez de evento inalterable.
7. Operarios con posibilidad de reasignar tareas desde la UI.
8. Estados históricos (`Listo`, `Asignada`) y agregaciones de UI (`Terminada`, `Entregada`) requieren una normalización única.
9. Pruebas parciales reportadas por Sebastián incluyen fallos por divergencia de migraciones/constraints en la base de test; deben sanearse antes de usar la suite como señal de regresión completa.

## 13. Dictamen final

El equipo realizó trabajo sustantivo y la base ya permite completar el proceso sin rediseñar desde cero. Pero el sistema todavía no constituye la fuente única y obligatoria de Taller. Faltan controles de flujo, calidad, configuración de Espuma, asignación de responsables, consistencia de permisos y evidencia de adopción.

El cierre debe declararse solo después de ejecutar los escenarios de aceptación definidos en [PLAN_CIERRE_PRIORIZADO.md](PLAN_CIERRE_PRIORIZADO.md) con ODT reales y verificar que los registros aparezcan en producción.
