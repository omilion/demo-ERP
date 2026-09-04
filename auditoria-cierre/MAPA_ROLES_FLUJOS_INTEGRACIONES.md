# Mapa de roles, flujos e integraciones

## Flujo esperado de punta a punta

1. **Ventas** confirma especificaciones y fecha comprometida.
2. **Jefatura/Coordinación de Taller** valida factibilidad, define etapas, prioridad y responsables.
3. **Corte** consulta ficha, inicia, registra cantidades/evidencia y entrega a Confección.
4. **Confección** acepta, asigna operaria, registra producción/calidad y entrega a la etapa siguiente.
5. **Espuma** consulta densidad/medidas, reserva lote aprobado, registra consumo/merma y entrega.
6. **Calidad** acepta o genera reproceso/rechazo con causa.
7. **Bodega/Despacho** recibe cantidad conforme y registra aceptación/discrepancia.
8. **Costeo** compara receta con consumo real y congela el costo de la ODT.
9. **Coordinación** cierra solo cuando etapas, calidad, materiales y entrega están conformes.

Los pasos 1–3 están modelados parcialmente. Los controles obligatorios de los pasos 4–9 no están completos.

## Matriz por rol

| Rol/persona | Debe ver | Debe escribir/cambiar | Efecto esperado | Estado actual |
|---|---|---|---|---|
| Ventas | ODT devueltas, avance y fecha estimada | Especificaciones y corrección de objeciones | Crea/corrige entrada de Taller | Parcial; falta aceptación de corrección |
| Coordinación/Jefatura Taller | Toda la carga, atraso, bloqueos, materiales y calidad | Prioridad, etapas, responsables, devolución y cierre | Distribuye trabajo y gobierna excepción | UI amplia; cierre y transiciones débiles |
| Zalma / Supervisión Confección | ODT MK, medidas, diseño, carga por operaria | Asignación, prioridad, autorización, rechazo, cierre de etapa | Activa trabajo y entrega a Despacho | Puede gestionar/cerrar; falta registro productivo y calidad |
| Jenifer y Mercedes / Operario | Solo sus tareas, ficha e imagen | Iniciar, cantidad diaria, nota, pausa, terminado, evidencia | Genera trazabilidad y disponibilidad siguiente | Mis tareas queda vacío; API Corte incompatible con permiso |
| Sebastián / Espuma | Sus tareas, densidad, medidas, stock, lote y urgencia | Consumo, lote, merma, estado, solicitud de sustitución | Descuenta stock y habilita entrega | Función implementada sin maestros ni uso |
| Diego / Gerencia | Excepciones, faltantes y cambios técnicos | Aprobar/rechazar sustitución de material/densidad | Autoriza excepción trazable | No existe workflow específico |
| Dyan / Bodega | Solicitudes, reservas, lotes y entregas | Recepción, movimiento, lote, entrega y discrepancia | Abastece Taller y recibe producto | Permisos existen; no hay movimientos reales |
| Despacho | Producto conforme y listo, por fecha/cliente | Recepción, discrepancia y despacho | Cierra entrega física | Disponibilidad inferida, no aceptación formal |
| Calidad | Cola de inspección, evidencia y defectos | Aprobar, rechazar, reprocesar, liberar | Bloquea o libera siguiente etapa | Rol/proceso transversal ausente |
| Costeo/Gerencia | Estándar vs real, merma y desviación | Ajuste controlado de receta/tarifa | Congela costo y retroalimenta | Recetas cargadas; sin snapshot/real |

## Permisos observados

### Roles base

- `taller`: lectura y escritura general de Taller; lectura de Catálogo y Bodega.
- `taller_operario`: lectura general de Taller, lectura/escritura de `taller.avance`, lectura de Catálogo y Bodega.
- `bodeguero`: lectura/escritura de Bodega y Despacho, más permisos adicionales según usuario.

### Usuarios verificados

- **Zalma Lobos:** rol `taller`; extras de gestión y cierre.
- **Sebastián Mella:** rol `taller`; extras de materiales, movimientos y lectura de Despacho.
- **Jenifer Breidenbach:** `taller_operario`, sin extras.
- **Mercedes Rodríguez:** `taller_operario`, sin extras.
- **Dyan Cortés:** `bodeguero`; extras de gestión de Taller y compras.

### Conflictos

1. La API especializada de Corte usa `rbac('taller','write')`; Jenifer y Mercedes no tienen ese permiso general.
2. La UI genérica expone asignación de responsable a operarios, aunque su función debiera limitarse a registrar avance.
3. Los permisos son aditivos: un extra amplio puede expandir más de lo esperado; se requieren pruebas por acción y no solo por menú.

## Eventos y efectos reales

| Acción | Registro local | Efecto en otros módulos | Control faltante |
|---|---|---|---|
| Asignar operario | `operarioResponsableId` | Aparece en “Mis tareas” | Validar mismo taller/rol y limitar a supervisión |
| Iniciar etapa | Estado + fecha inicio + bitácora | Incrementa carga en proceso | Exigir etapa anterior aceptada |
| Registrar avance Corte | Evento cantidad/fecha/usuario/IP | Calcula progreso | Suma atómica y permiso correcto |
| Adjuntar evidencia | Archivo + metadatos + bitácora | Disponible para validación | Política de retención y obligatoriedad |
| Marcar listo | Estado + fecha/usuario listo + bitácora | Puede alimentar siguiente etapa/Despacho | Calidad y cantidad obligatorias |
| Rechazar | Estado + motivo en observación | Debiera abrir reproceso | Caso/cola de reproceso ausente |
| Consumir material | Stock, lote, calidad y merma | Alimenta Bodega/Costeo | Reserva, atomicidad de lote y reversa |
| Devolver a Ventas | Estado/motivo | Ventas corrige | Aceptación y versionado de especificación |
| Cerrar ODT | Estado de cabecera | Finaliza proceso | Gate de etapas, calidad, material, despacho y snapshot |
| Anular ODT | Eliminación lógica + bitácora | Cancela operación | Tratamiento explícito de reservas/consumos |

## Información que debe viajar entre módulos

### Ventas → Taller

- orden/MK, cliente y vendedor;
- fecha comprometida;
- producto, cantidad y unidad;
- medidas, color, diseño, densidad y material;
- imagen/referencia aprobada;
- versión y autor de la última modificación.

### Taller → Bodega/Costeo

- material/lote consumido;
- cantidad útil y merma;
- motivo de merma o sustitución;
- ODT, etapa, usuario y fecha;
- diferencia contra receta.

### Taller → Despacho

- producto y cantidad conforme;
- ODT/MK, cliente y fecha;
- quién entrega y quién recibe;
- bultos/ubicación/evidencia;
- discrepancias o pendientes.

## Regla recomendada de estados

`Pendiente → Asignada → En proceso ↔ Pausada → Pendiente de calidad → Lista → Entregada`.

Salidas excepcionales:

- `En proceso/Pendiente de calidad → Rechazada → En proceso` con motivo y responsable.
- Cualquier estado operativo → `Cancelada` solo con permiso de anulación y conciliación de materiales.

No debe permitirse `Pendiente → Lista`, ni cierre de ODT con una etapa incompleta.

