# Evidencia de producción — Talleres

## Método y alcance

Consultas SQL de solo lectura ejecutadas el 1 de septiembre de 2026 sobre la base PostgreSQL de producción del VPS Plastimar. Se verificaron ODT, etapas, responsables, eventos, evidencias, consumos, recetas, materiales de Espuma, lotes, movimientos, usuarios y enlaces de RRHH.

El código se revisó en `main`, commit `3024f38fc96f7d6f6818661c7e39a1ee1deea8fd`, que coincide con `origin/main` al momento de la auditoría. El directorio desplegado del VPS no contenía metadatos Git; por eso no se afirma que el binario desplegado corresponda exactamente a ese SHA.

## ODT y estados

| Indicador | Resultado |
|---|---:|
| ODT no eliminadas | 5.772 |
| Pendiente | 5.123 |
| Listo | 647 |
| Asignada | 2 |
| Con orden de venta | 5.772 |
| ODT internas/centro de costo utilizadas | 0 |
| Con fecha de inicio | 895 |
| Con fecha de término | 895 |
| Con fecha de entrega comprometida | 0 |
| Creadas desde 2026-08-31 | 0 |

La capacidad de ODT interna está implementada, pero no hay evidencia de uso. La ausencia total de fecha comprometida impide priorización objetiva por atraso o días restantes.

## Etapas productivas

| Taller/etapa | Estado | Cantidad |
|---|---|---:|
| Confecciones | Pendiente | 10.020 |
| Confecciones | Listo | 4.382 |
| Confecciones | En proceso | 2 |
| Espumas | Pendiente | 11.784 |
| Espumas | Listo | 1.479 |
| Externo | Listo | 533 |
| Externo | Pendiente | 210 |
| Externo | En proceso | 4 |

No se encontraron etapas históricas denominadas Corte. El flujo especializado de Corte depende de esas relaciones y, además, no tiene avances registrados.

Calidad de las 28.414 relaciones etapa–ítem:

| Campo | Con dato |
|---|---:|
| Responsable asignado | 0 |
| Fecha de inicio | 20 |
| Fecha de listo | 1.108 |
| Observación | 158 |

## Eventos y trazabilidad

| Tabla/registro | Cantidad |
|---|---:|
| Avances estructurados de ODT | 0 |
| Evidencias de Taller | 0 |
| Bitácora Taller | 3 |
| Consumos/materiales de Taller | 0 |
| Historial de materiales | 0 |

No hay evidencia de cantidades diarias, tiempo, fotos, mermas, reprocesos ni entrega formal a la siguiente etapa.

## Costeo

| Elemento | Cantidad |
|---|---:|
| Recetas de producto | 2.554 |
| Materiales de receta | 4.104 |
| Procesos de receta | 4.832 |
| Snapshots de costeo | 0 |

Las recetas fueron cargadas después de la revisión del 26 de agosto. Falta demostrar que el costo calculado se congela y conserva por ODT/cotización.

## Espuma y Bodega Taller

| Indicador | Resultado |
|---|---:|
| Materiales activos en Bodega Taller | 70 |
| Materiales activos asociados a Espumas | 4 |
| Con densidad | 0 |
| Con espesor | 0 |
| Con formato | 0 |
| Lotes | 0 |
| Movimientos de Bodega Taller | 0 |
| Consumos con lote/calidad/merma | 0 |

La estructura existe en el esquema, pero no está configurada. Los cuatro materiales asociados a Espumas son Algodón, NAPA, Picado y Plumavit según la vista productiva disponible; ninguno tiene los atributos técnicos nuevos. La regla que exige lote aprobado se aplica a materiales de espuma que tengan densidad; con densidad nula, la protección no entra en acción.

## Usuarios y RRHH asociados a Taller

| Persona | Usuario/rol | Permisos relevantes | RRHH |
|---|---|---|---|
| Dyan Cortés | `bodeguero` | gestión de Taller y compras | Enlazado |
| Zalma Lobos | `taller` | gestión y cierre de Taller | Enlazado |
| Sebastián Mella | `taller` | materiales y movimientos | No localizado por nombre en RRHH |
| Jenifer Breidenbach | `taller_operario` | avance de Taller | Enlazada; además existe otro registro RRHH activo sin usuario |
| Mercedes Rodríguez | `taller_operario` | avance de Taller | Enlazada |

Riesgos:

- El rol operario abre “Mis tareas”, pero no existen asignaciones.
- Jenifer tiene dos registros activos en RRHH, solo uno enlazado al usuario.
- Sebastián requiere confirmación/alta en RRHH y enlace con su usuario.

## Reproducibilidad

Las consultas normalizadas están en [evidencia/CONSULTAS_PRODUCCION_TALLER.sql](evidencia/CONSULTAS_PRODUCCION_TALLER.sql). No incluyen credenciales, correos ni otros secretos.
