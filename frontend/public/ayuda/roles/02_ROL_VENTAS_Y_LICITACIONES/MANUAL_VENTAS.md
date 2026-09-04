---
documento: DOC-02
titulo: Manual operativo de Ventas y Licitaciones
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Ventas, mesón y equipo comercial
uso: Marcha Blanca
---

# DOC-02: Manual operativo de Ventas y Licitaciones

## 1. Objetivo y límites del rol

Ventas registra correctamente la necesidad del cliente y hace seguimiento en la Matriz. Crear una venta **no significa** que Despacho, Cobranza o Facturación ya estén terminados. Cada módulo conserva su confirmación y responsable.

## 2. Elegir el flujo correcto

| Caso | Punto de inicio | Control obligatorio |
|---|---|---|
| Venta Sala/mesón | Ventas → Nueva Venta | Puede quedar sin cliente sólo cuando corresponde a consumidor final |
| Convenio Marco | Nueva Venta | Cliente, OC de Convenio Marco no duplicada y datos de despacho |
| Licitación | CRM | ID y fecha de licitación; convertir a venta sólo cuando se apruebe |
| Compra Ágil | CRM | Antecedentes de la oportunidad y aprobación comercial |
| Venta Web | Flujo de pedidos web | Revisar datos importados antes de continuar |
| Marketplace | Nueva Venta | Canal, número de orden del portal y comisión |

## 3. Crear una Venta Sala o venta directa

1. Abre **Ventas → Nueva Venta** y confirma tipo de venta y vendedor asignado.
2. Busca al cliente por nombre o RUT. Para Venta Sala de consumidor final, deja el cliente vacío sólo si corresponde; no crees clientes ficticios.
3. Agrega productos y revisa código, descripción, cantidad, precio y stock mostrado.
4. Completa plazo, tipo de días y fecha tope calculada.
5. Completa región, comuna, dirección y datos de contacto de despacho. El correo del contacto es obligatorio cuando la pantalla lo solicita.
6. Registra monto de despacho, observaciones y especificaciones que deban conocer Taller/Bodega/Despacho.
7. Revisa descuentos. Si aparece una regla o aprobación requerida, solicita/aplica la autorización; no fuerces el valor por fuera del flujo.
8. Antes de guardar, lee el resumen y verifica total, cliente, canal y productos.
9. Presiona **Crear Venta** una sola vez y espera confirmación.

## 4. Licitaciones y Compras Ágiles

Estas oportunidades se crean desde **CRM**, no desde la venta normal. La cotización CRM todavía no es una venta en la Matriz.

1. Registra organismo/cliente, oportunidad, ID, fecha, plazo, referencia y OC cuando exista.
2. Adjunta o referencia las condiciones comerciales en observaciones.
3. Revisa productos, cantidades y precio ofertado.
4. Sólo al aprobar/adjudicar, usa el flujo de conversión a venta.
5. Confirma que la venta creada aparezca en Matriz y conserve sus referencias.

## 5. Qué sucede al guardar

- La venta aparece en la Matriz.
- El sistema valida disponibilidad y ajusta stock según el flujo vigente; no asumas que todo queda en `Stock Reservado`.
- Los productos configurados como transitorios pueden generar aviso/ODT hacia Taller. Revisa el estado y usa la acción **Pasar a Taller** cuando corresponda.
- Despacho debe programar la salida; Facturación debe preparar/emitir/enviar el DTE; Caja/Cobranza debe registrar el pago.

## 6. Seguimiento y modificaciones

Busca por cliente, RUT, venta o número interno. Distingue estado de orden, pago y entrega. Si existen pagos, entregas o documentos, algunos datos quedan bloqueados: no anules ni reconstruyas la venta para evitar el control. Escala el caso.

## 7. Excepciones frecuentes

- **Sin stock:** confirma si el producto es transitorio/fabricable. No prometas fecha hasta ver el tratamiento correcto.
- **Cliente obligatorio:** fuera de Venta Sala, selecciona el cliente correcto y completa datos faltantes.
- **OC duplicada o inválida:** verifica la referencia; no agregues caracteres para eludir la validación.
- **Precio/descuento inesperado:** detente y solicita aprobación.
- **Doble clic o demora:** no vuelvas a crear. Busca la venta en Matriz antes de reintentar.
- **Error posterior al guardado:** reporta número de venta, cliente, canal, producto y hora.

## 8. Cierre del caso de prueba

Una prueba de Ventas está aprobada cuando la venta/cotización queda una sola vez, con canal y cliente correctos, totales coherentes, plazo y despacho completos, y el estado posterior coincide con el producto vendido.
