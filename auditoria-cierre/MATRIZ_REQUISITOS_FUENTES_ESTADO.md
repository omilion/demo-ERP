# Matriz de trazabilidad — requisito original, cambio y estado

Leyenda: **Sí** = implementado; **Parcial** = existe una parte; **No usado** = implementado sin evidencia productiva; **No** = brecha.

## Taller de Corte

Fuente: [Encuesta_taller_de_corte_Plastimar.docx](fuentes-originales/Encuesta_taller_de_corte_Plastimar.docx), respuestas de Jenifer Breidenbach y Mercedes Rodrigues.

| Requisito original | Cambio/estado actual | Estado |
|---|---|---|
| Recibir número de orden/MK desde jefatura | ODT e ítems visibles; relación por taller | Parcial: no hay etapas Corte en producción |
| Ver medidas, colores y características | Detalle/observaciones de ODT disponibles | Parcial: no están garantizados como ficha inmutable |
| Evitar discrepancia de colores o imágenes | Existe evidencia fotográfica, no foto de referencia destacada en la tarjeta | Parcial |
| Registrar producto trabajado por día | Modelo/API de avance con cantidad, fecha, usuario e IP | Sí en código; no usado |
| Informar cantidades listas | Suma de avances y estado Listo | Sí en código; no usado |
| Estados En proceso y Terminado | Estados por etapa | Sí |
| Registrar quién hizo el trabajo | Responsable y usuario del avance | Sí en código; responsables nulos en producción |
| Priorizar por días hasta entrega | Filtros/prioridad manual | No: fecha comprometida vacía y sin cálculo automático |
| No modificar entrega, vendedor u observaciones críticas | No existe bloqueo completo de esos campos durante producción | No |
| Acceso de lectura + registro | Rol `taller_operario` y permiso `taller.avance` | Parcial: API específica exige `taller:write` |
| Entregar a Confección y validación por jefatura | Etapas relacionadas | No: sin aceptación formal ni dependencia |

## Taller de Confección

Fuente: [Encuesta_taller_de_confeccion_Plastimar.docx](fuentes-originales/Encuesta_taller_de_confeccion_Plastimar.docx), respuestas de Zalma Lobos.

| Requisito original | Cambio/estado actual | Estado |
|---|---|---|
| Ver todas las órdenes MK y no depender de aviso | Tablero general de ODT y filtros | Sí en código; adopción no demostrada |
| Recibir largo, ancho, alto, colores y diseño desde Corte | Datos pueden ir en ítem/observaciones | Parcial: sin traspaso estructurado ni aceptación |
| Registrar producción por operaria | Responsable y observación genérica | No: falta cantidad/evento diario por operaria |
| Asignar trabajo | Selector de responsable | Sí, pero las 28.414 etapas están sin asignar |
| Priorizar por fecha o solicitud comercial | Prioridad y filtros | Parcial: fecha comprometida vacía |
| Autorizar muestras y artículos nuevos | No hay workflow de autorización | No |
| Registrar rechazo/reproceso | Estado Rechazado con motivo | Parcial: backend sí, UI operaria insuficiente |
| Notificar a Despacho al terminar | Estado puede alimentar disponibilidad | Parcial: sin entrega/recepción formal |
| Acceso de lectura + registro | Rol Taller para supervisora y Operario para ejecución | Sí con brechas de permiso/alcance |

## Taller de Espuma

Fuente: [Encuesta_taller_de_espuma_Plastimar.docx](fuentes-originales/Encuesta_taller_de_espuma_Plastimar.docx), respuestas de Sebastián Mella.

| Requisito original | Cambio/estado actual | Estado |
|---|---|---|
| Pendiente / En proceso / Listo | Estados por etapa | Sí |
| Ver urgencia automática | Prioridad manual y filtros | No: no hay cálculo por fecha comprometida |
| Filtrar por estado y prioridad | Tablero y filtros | Sí |
| Ver medidas, foto y stock | ODT + Bodega Taller | Parcial: foto no destacada y maestros incompletos |
| Densidad como propiedad de espuma | Campo `densidadKgM3` en materia prima | Sí en código; 0/4 materiales de Espumas cargados |
| Controlar cambio de densidad con autorización | Validación de lote/calidad | No: no existe aprobación de sustitución por Diego |
| Calcular y descontar material | Consumo por ODT y stock | Sí en código; no usado |
| Solicitar/recibir lotes | Modelo y endpoints de lote | Sí en código; 0 lotes |
| Control de calidad del lote | aprobado/observado/rechazado | Sí en código; no usado |
| Registrar merma y motivo | Campos y formulario | Sí en código; no usado |
| Resolver falta de material y combinar planchas | No hay reserva, sugerencia ni autorización formal | No |
| Entregar a Bodega/Despacho | Estado de etapa | Parcial: sin aceptación formal |
| Acceso lectura + registro | Usuario Taller con materiales/movimientos | Sí; enlace RRHH pendiente |

## Requisitos transversales del consolidado y planes

| Fuente | Requisito | Cambio/estado actual | Estado |
|---|---|---|---|
| Informe consolidado | Integrar flujo entre áreas y evitar WhatsApp/Excel | Modelo integrado y tableros | Parcial: eventos operativos en cero |
| Plan de pendientes, punto 2 | Trabajo interno sin venta y centro de costo | ODT admite origen interno | Sí en código; no usado |
| Plan de pendientes, punto 3 | Objetar/devolver trabajo a Ventas | Devolución con motivo | Sí |
| Plan de pendientes, punto 4 | Densidad, lote, calidad y merma | Modelo, rutas y UI | Sí en código; sin configuración/uso |
| Encuesta Bodega 1 | Trazabilidad de entrada/salida y responsables | Bodega Taller e historial | Parcial: 0 movimientos |
| Encuestas de Taller | Calidad y reproceso | Lote y estado Rechazado | No como proceso transversal |

## Corrección frente a documentos previos

Las revisiones `09_taller_corte.md`, `10_taller_confeccion.md` y `11_taller_espuma.md` reflejan producción al 26 de agosto. Desde entonces se cargaron recetas y se implementaron varios puntos. Se conservan como línea base histórica, pero esta matriz y la evidencia del 1 de septiembre prevalecen para el estado actual.
