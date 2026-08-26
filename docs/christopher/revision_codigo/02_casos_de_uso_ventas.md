# Casos de uso de ventas

Fuente: `C_Casos_de_Uso_Ventas_Plastimar_18-08-2026.docx`.

## Resultado general

Los seis flujos están representados en el ERP, pero sólo Venta Web y los DTE tienen reglas de validación relativamente maduras. Venta Sala, Marketplace, Trato Directo y la adjudicación parcial requieren cierre funcional.

## CU-01 — Venta Sala

**Estado: Parcial.** Existe Nueva Venta, cálculo de ítems, descuentos, pagos y emisión posterior de DTE. Sin embargo, `VentasFormPage` exige cliente para una venta nueva, mientras que el caso de uso permite boleta sin cliente y exige identificación sólo para factura. Tampoco hay una interfaz simplificada específica para ventas bajo $100.000.

**Para aprobar:** permitir venta anónima únicamente para boleta; exigir RUT/razón social/correo al escoger factura; definir si el umbral de $100.000 cambia campos o sólo experiencia visual; probar que no se duplica una venta ante reintento.

## CU-02 — Venta Web

**Estado: Parcial alto.** OC Online/Venta Web, confirmaciones de pago y la separación de órdenes están presentes. El dominio CRM contempla confirmación `WEBPAY` o `PAGO`.

**Para aprobar:** prueba integrada de Webpay rechazado, transferencia pendiente, pago confirmado y diferencia de monto. Debe demostrarse que una orden pendiente no se convierte en venta confirmada y que el total persistido es el monto realmente cobrado.

## CU-03 — Licitación y Compra Ágil

**Estado: Parcial alto.** CRM es la entrada de nuevas licitaciones y compras ágiles; captura ID, fecha, productos, despacho y observaciones, y una oportunidad aprobada crea la venta en Matriz. La entrada independiente antigua fue retirada del menú y se conserva sólo para historial.

**Brecha crítica:** el caso exige convertir parcial o totalmente según cantidades adjudicadas. La cotización CRM actual aprueba el conjunto de ítems; no modela `cantidad adjudicada` por línea. También debe confirmarse la regularización de una OC llegada antes de la cotización.

## CU-04 — Convenio Marco y Trato Directo

**Estado: Parcial.** Convenio Marco está clasificado, solicita OC y aparece en Matriz. Trato Directo no está en el catálogo actual de tipos, por lo que no puede mantener la separación ni reporte solicitados.

**Para aprobar:** agregar Trato Directo como tipo, sus validaciones de referencia y filtro de reportes; confirmar umbrales de aprobación y documentos obligatorios para cada canal.

## CU-05 — Marketplace

**Estado: Parcial.** Se registra canal Marketplace y campos de comisión. 

**Para aprobar:** exigir origen y referencia externa; definir si el total se ingresa ya neto o se calcula desde bruto menos comisión; impedir cierre si el total no cuadra con el comprobante del marketplace; auditar cambios de precio/código.

## CU-06 — Cotización Web cliente particular

**Estado: Parcial alto.** CRM conserva cotización comercial, ítems, gestión y conversión a venta. La cotización puede editarse vinculada a la oportunidad sin duplicarla.

**Para aprobar:** versionar propuesta original y cambios posteriores, registrar aceptación del cliente y asegurar que la conversión mantenga referencia, ítems, valores y documentos.

## Inconsistencia a resolver

El documento indica que Compra Ágil se gestiona sólo en SisGestión, pero la decisión vigente es crearla desde CRM. Debe actualizarse el caso de uso; de otro modo una prueba de auditoría mediría un flujo ya sustituido.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| Órdenes por tipo | Venta Web 6.119 · Venta sala 4.909 · Licitacion 2.648 · Convenio Marco 2.618 · Normal 60 | Grafías duplicadas: "Venta sala"/"Venta Sala" (4.909 vs 7) y "Licitacion"/"Licitación" (2.648 vs 5). Todo reporte por tipo las cuenta separado |
| **Marketplace** | **0 ventas** | CU-05 pierde urgencia: el canal existe y nunca se usó |
| **Trato Directo** | **0 en código y 0 en datos** | Las ventas de esa modalidad están hoy dentro de los 2.618 de Convenio Marco, sin forma de separarlas después |
| **Adjudicación parcial** | **221 casos reales** de 26.708 ítems adjudicados | Responde la decisión abierta: **sí se necesita**. Y confirma que es una regresión: `cotizacion_licitacion_items.cantAdjudicados` la modela, `crm_cotizacion_items` no |
| Estados de venta | 15.813 con `estado_entrega = "Entregado"` | Ese valor no está en el enum de validación. Editar esas ventas devuelve 400 |

**Corrección a CU-05:** el estado sigue siendo Parcial, pero la prioridad baja al último lugar. Sin operaciones registradas, cerrar sus reglas es trabajo sobre un canal inactivo.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).
