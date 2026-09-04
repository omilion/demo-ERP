---
documento: DOC-06
titulo: Manual operativo de Caja y Cobranza
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Caja, cobranza y finanzas
uso: Marcha Blanca
---

# DOC-06: Manual operativo de Caja y Cobranza

## 1. Principios de control

- Cada pago debe quedar asociado a una venta y a un documento referencial activo.
- No registres pagos sin turno abierto.
- No dupliques un movimiento por demora de pantalla.
- La evidencia bancaria o de tarjeta no reemplaza el registro en el ERP, y el ERP no reemplaza la validación del abono real.

## 2. Apertura de turno

1. Abre **Caja** y confirma sucursal/caja.
2. Presiona **Abrir Turno** y espera confirmación.
3. El flujo vigente no solicita fondo fijo en la apertura. Si Plastimar necesita controlarlo, mantenlo según el procedimiento administrativo externo y repórtalo como **Falta** para evaluación funcional.
4. Verifica que exista un único turno activo antes de cobrar.

## 3. Registrar un pago o abono

1. Desde Caja/Cobranza, selecciona la venta con saldo pendiente.
2. Verifica cliente, número interno, saldo y documento referencial.
3. Selecciona medio de pago y completa número/fecha/referencia que solicite la pantalla.
4. Ingresa un monto mayor que cero y no superior al saldo.
5. Confirma una vez.
6. Verifica simultáneamente el movimiento de caja y el nuevo saldo de la venta.

Si la transferencia todavía no está confirmada, no la registres como pagada. Si el medio o documento fue mal imputado, no ingreses un segundo movimiento compensatorio sin autorización; solicita reversa/corrección.

## 4. Cierre y arqueo

1. Presiona **Cerrar Turno**.
2. Cuenta e informa los medios que presenta el formulario: efectivo, tarjetas, transferencias, cheques u otros habilitados.
3. Compara el total contado con el esperado.
4. Si existe diferencia, vuelve a contar y revisa movimientos. Registra la observación; el sistema puede permitir confirmar con diferencia, por lo que la autorización de cierre sigue siendo responsabilidad de la jefatura.
5. Confirma y conserva el resumen de cierre.

## 5. Cobranza

- Usa las pestañas de cartera activa e histórico.
- Prioriza el indicador **Más de 30 días**, además de vencimiento, monto y compromisos internos.
- Registra abonos parciales sólo con turno abierto y documento referencial.
- Verifica que saldo pendiente y total abonado sean coherentes.
- No prometas bloqueo automático de nuevas ventas o despachos por morosidad: aplica la política comercial definida y escala al responsable.

## 6. Excepciones

- **Pago duplicado:** no borres ni compenses sin autorización; registra ambos IDs/montos.
- **Monto excede saldo:** corrige el valor o revisa la venta.
- **No hay turno:** abre el turno autorizado; no uses la cuenta de otro cajero.
- **Diferencia de arqueo:** conserva conteo, medio, monto esperado/real y hora.
- **Saldo no se actualiza:** busca el movimiento antes de repetir.
- **Documento sin referencia activa:** selecciona la referencia correcta; no inventes números.

## 7. Criterio de cierre

La prueba se aprueba cuando el pago existe una sola vez, el saldo disminuye exactamente, el turno corresponde al usuario/sucursal y el cierre explica cualquier diferencia.
