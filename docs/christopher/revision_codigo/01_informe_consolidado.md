# Informe consolidado ERP Plastimar

Fuente: `Informe_Consolidado_ERP_Plastimar_24-08-2026.docx`.

## Lectura ejecutiva

El informe reúne necesidades reales de todas las áreas, pero no es una pauta de aceptación lista para firmar: combina problemas actuales, funcionalidades deseadas, diagramas propuestos y decisiones que todavía no están cerradas. El ERP ya tiene los módulos principales, por lo que el trabajo prioritario es cerrar las reglas críticas y probar el flujo completo entre áreas.

## Cobertura comprobada

| Área | Estado | Evidencia actual |
|---|---|---|
| Ventas y CRM | Parcial alto | Rutas `/ventas`, `/crm`, cotizaciones CRM, Matriz, descuentos y despacho. |
| Bodega | Parcial alto | Rutas `/bodega`, `/ubicaciones`, productos, movimientos y filtros de stock. |
| Talleres | Parcial | Rutas `/taller`, `/taller-corte`, ODT y `/bitacora-taller`. |
| Facturación | Parcial alto | Motor DTE, documentos, guías, factura, boleta, NC y ND. |
| Cobranza | Parcial alto | Ruta `/cobranza`, pagos y saldos asociados a ventas. |
| RRHH y permisos | Parcial | Rutas `/rrhh`, `/usuarios`, permisos por módulo y auditoría. |
| Reportes y alertas | Parcial | Reportería gerencial, notificaciones y alertas puntuales; no un motor integral configurable. |

## Brechas transversales

1. **Estado único de la venta — crítico.** La aplicación maneja estado comercial, estado de pago, estado de entrega y documentos, pero no impone el flujo único propuesto `Creada → Confirmada → Pagada → Facturada → Despachada → Cerrada`.
2. **Alertas operacionales — alta.** Existen notificaciones puntuales, pero faltan reglas configurables, destinatario, vencimiento, escalamiento y cierre para todas las excepciones descritas.
3. **Trazabilidad productiva — alta.** Hay ODT y bitácora, pero faltan registros obligatorios por etapa para consumo, merma, rechazo/retrabajo y responsable.
4. **Inventario operativo — alta.** Ubicaciones y reservas existen; falta consolidar claramente stock físico, disponible, reservado y dañado en una misma regla de disponibilidad.
5. **Cierre de levantamientos — bloqueante de alcance.** Taller de Madera y Operaciones no tienen encuesta válida. No se debe desarrollar su flujo definitivo hasta entrevistar a sus responsables.

## Decisiones que Plastimar debe confirmar

- Si Licitación y Compra Ágil requieren adjudicación parcial por cada producto.
- Si Trato Directo debe ser un tipo de venta independiente de Convenio Marco.
- Qué alertas bloquean una operación y cuáles sólo informan.
- Quién puede aprobar descuentos, anulaciones, plazos excepcionales, venta sin stock y notas de crédito relevantes.

## Criterio para dar por cerrado el informe

El informe estará cubierto cuando cada requisito crítico tenga: dueño de negocio, regla escrita, permiso definido, prueba automatizada o guion de aceptación, y evidencia de prueba en ambiente de staging.

---

## Datos de producción (26-08-2026)

El levantamiento se evaluó contra código. Al cruzarlo con los datos aparecen tres cosas que cambian la lectura general:

- **Un defecto activo que el levantamiento no lista:** 15.813 de 16.371 órdenes (96,6%) tienen `estado_entrega = "Entregado"`, un valor que la validación del `PUT` no acepta. Editarlas responde 400. Está reproducido.
- **Varios módulos existen pero nadie los usa:** Marketplace 0 ventas, recetas 0 sobre 37.162 productos, bitácora de taller 3 registros para 5.772 OT, evidencia fotográfica 0.
- **Una brecha resultó ser una regresión:** la adjudicación parcial tiene 221 casos reales en el módulo antiguo y no existe en el CRM.

El diagnóstico "parcial" se sostiene, pero el motivo cambia según el área: en unas falta código, en otras falta uso.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
