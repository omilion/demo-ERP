---
documento: DOC-04
titulo: Manual operativo de Despacho y Reparto
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Despacho, reparto y bodega de salida
uso: Marcha Blanca
---

# DOC-04: Manual operativo de Despacho y Reparto

## 1. Objetivo y control humano obligatorio

Despacho asegura que la mercadería preparada llegue al destinatario correcto, con cantidades, documento y trazabilidad coherentes. Durante la Marcha Blanca **no se debe asumir que el sistema impide toda salida sin DTE**: el responsable debe verificar el respaldo antes de cargar el vehículo.

## 2. Estados de tracking

La secuencia normal registrada por el sistema comienza en `Preparado` y continúa por `Patio` → `Didáctico` → `Reparto` → `Entregado`. Según el caso también pueden aparecer `Incidencia`, `Reprogramado`, `Retenido` o `Devuelto`. `En ruta` puede verse en datos históricos; usa las acciones habilitadas por la pantalla.

No saltes estados ni marques `Entregado` antes de contar con confirmación real. En retiro de cliente, sigue el flujo específico que permita la pantalla.

## 3. Preparar y programar una salida

1. Abre **Bodega → Despachos** y localiza la venta.
2. Verifica picking/packing, unidades listas y autorización de parcialidad.
3. Confirma destinatario, región, comuna, dirección, contacto, teléfono y correo.
4. Presiona **Programar Salida** y completa fecha, modalidad y datos de transporte que solicite la pantalla.
5. Revisa que la programación aparezca una sola vez y con la fecha correcta.

## 4. Guía de Despacho DTE 52

1. Presiona **Preparar Guía DTE 52** para crear/revisar el borrador.
2. Confirma receptor, dirección de destino, tipo de despacho, indicador de traslado, productos y cantidades.
3. Emite el DTE para asignar folio y firma.
4. Envía al SII. Un Track ID confirma recepción del envío, **no aceptación definitiva**.
5. Consulta el estado hasta obtener respuesta y conserva la representación impresa/digital definida para la salida.

> Si el documento queda en `Borrador`, `Emitido` o `Enviado`, interpreta cada estado literalmente. No informes “Aceptado” hasta que el sistema muestre esa respuesta.

## 5. Entrega y cierre

1. Registra los hitos reales en el orden mostrado.
2. En la entrega, valida receptor, cantidad y observaciones.
3. Marca `Entregado` sólo con evidencia conforme.
4. Verifica que la venta refleje el estado de entrega actualizado. El área financiera debe consultar su bandeja; no dependas de una notificación automática no visible.

## 6. Parciales y excepciones

- **Parcial:** incluye únicamente lo cargado y conserva el saldo pendiente.
- **Cliente ausente/dirección incorrecta:** registra `Incidencia` o `Reprogramado` y la causa.
- **Mercadería retenida:** usa `Retenido` y evita marcarla como entregada.
- **Rechazo/devolución:** usa `Devuelto`, registra causa y entrega físicamente a Bodega para su regularización.
- **Error de DTE:** no generes una segunda guía para “probar”. Registra venta, guía, folio si existe, Track ID, hora y mensaje.
- **Cantidad distinta al packing:** detén la salida y reconcilia con Bodega.

## 7. Checklist antes de que salga el vehículo

- Venta y destinatario correctos.
- Productos y cantidades coinciden con packing.
- Dirección y contacto verificados.
- Programación y responsable registrados.
- Guía DTE 52 revisada y en el estado autorizado por Facturación.
- Parcialidad/incidencia documentada.

## 8. Criterio de cierre

La prueba se aprueba cuando existe una sola programación, tracking secuencial, guía vinculada sin duplicidad, cantidades coherentes y entrega/incidencia registrada con evidencia.
