---
documento: DOC-03
titulo: Manual operativo de Bodega y Logística
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Bodega, logística y compras
uso: Marcha Blanca
---

# DOC-03: Manual operativo de Bodega y Logística

## 1. Objetivo

Bodega mantiene coherencia entre existencia física y sistema. Toda variación debe conservar usuario, fecha, cantidad, motivo y documento de respaldo cuando corresponda.

## 2. Leer correctamente el stock

| Cifra | Significado operativo |
|---|---|
| Stock físico | Existencia registrada antes de descontar compromisos o daño |
| Stock reservado | Cantidad comprometida y no disponible para nuevas operaciones |
| Stock dañado | Cantidad separada por daño/no disponibilidad |
| Stock disponible | Físico menos reservado menos dañado; nunca menor que cero en la vista calculada |

No edites el stock de una ficha existente. Usa **Movimientos** y el tipo autorizado. Un producto nuevo puede registrar existencia inicial si el formulario lo permite; deja el respaldo correspondiente.

## 3. Ingreso manual de mercadería

1. Abre **Bodega → Stock Ingresos → Ingreso Manual**.
2. Selecciona el proveedor correcto.
3. Indica tipo y número del documento de respaldo visible en la recepción.
4. Agrega productos y cantidades realmente recibidas; no copies automáticamente lo solicitado.
5. Contrasta producto, unidad, bodega y cantidad con el documento físico.
6. Confirma una sola vez y verifica el ingreso en el historial/Kardex.

Si la recepción proviene de una Orden de Compra, usa el flujo de recepción de OC disponible y registra sólo lo efectivamente recibido. No fuerces un ingreso manual para cerrar una OC discrepante.

## 4. Ajustes, daño y reversas

- Cuenta físicamente antes de ajustar.
- Selecciona el tipo de movimiento correcto y escribe un motivo verificable.
- Para daño o merma, identifica producto, cantidad y causa; separa físicamente las unidades.
- Una reversa exige autorización y debe neutralizar el movimiento equivocado, no crear un segundo ajuste compensatorio informal.
- Si el sistema y la estantería difieren, congela temporalmente el movimiento del SKU y escala el conteo.

## 5. Telas

El módulo vigente administra el catálogo de telas y movimientos de ingreso/egreso. Registra cantidad, documento o referencia disponible, ubicación y responsable cuando la pantalla lo solicite. No asumas control por rollo, partida, retazo u ODT si esos campos no están visibles; durante la Marcha Blanca anota esa necesidad como **Falta** y conserva el control físico definido por la jefatura.

## 6. Picking y Packing

1. En **Panel Picking**, abre la orden y confirma que producto/cantidad coincidan con lo retirado.
2. Marca el picking sólo después de separar físicamente el producto.
3. En **Panel Packing**, registra la preparación que muestra la pantalla y verifica cantidades entregables.
4. No declares más unidades que las vendidas ni avances productos no preparados.
5. Entrega el pedido a Despacho con identificación de venta y cualquier parcialidad/incidencia.

## 7. Stock crítico y sugerencias de compra

La sugerencia es apoyo para Compras, no una OC automática. Revisa demanda, reservado, dañado, órdenes ya abiertas y plazo del proveedor antes de emitir una compra.

## 8. Excepciones de Marcha Blanca

- **Producto incorrecto/no encontrado:** no uses otro SKU parecido; reporta código, nombre y proveedor.
- **Cantidad negativa o saldo inesperado:** no sigas moviendo el producto; adjunta Kardex y conteo.
- **Documento duplicado:** busca el ingreso antes de reintentar.
- **Recepción parcial:** registra sólo lo recibido y deja pendiente el saldo por el flujo de OC.
- **Picking superior a venta o sin stock:** detente y reporta venta, SKU y cantidades.

## 9. Criterio de cierre

La prueba se aprueba cuando el saldo anterior, el movimiento y el saldo final son coherentes, existe respaldo, el conteo físico coincide y Picking/Packing no duplican cantidades.
