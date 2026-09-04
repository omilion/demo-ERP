---
documento: DOC-09
titulo: Protocolo de Feedback y reporte de fallas
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Todo el personal
uso: Marcha Blanca
---

# DOC-09: Protocolo de Feedback y reporte de fallas

## 1. Cuándo usarlo

Usa **Reportar observación** cuando encuentres una Falla, Falta o Mejora en una pantalla operativa donde el widget esté habilitado. El reporte complementa —no reemplaza— el aviso inmediato a la jefatura frente a un bloqueo, riesgo de dinero, stock, entrega, datos personales o SII.

## 2. Clasificación

- **Falla:** una función existente no entrega el resultado esperado.
- **Falta:** el proceso necesita un dato, control o acción que hoy no existe.
- **Mejora:** el proceso funciona, pero puede hacerse más claro, rápido o seguro.

## 3. Antes de enviar

1. No repitas la operación si podría duplicar venta, pago, stock, ODT, guía o DTE.
2. Anota el identificador de la operación y la hora.
3. Retira de la vista información sensible que no sea necesaria.
4. Si la pantalla contiene datos personales, encuadra/marca sólo el área pertinente cuando sea posible.

## 4. Contenido de un buen reporte

- Título corto: módulo + problema.
- Qué intentabas hacer.
- Pasos mínimos para reproducirlo.
- Qué esperabas y qué ocurrió.
- Venta, ODT, SKU, guía, DTE u otro identificador.
- Impacto: bloquea/no bloquea; afecta cliente, stock, dinero, despacho o SII.
- Mensaje exacto visible, sin incluir secretos.

## 5. Evidencia automática y privacidad

El widget puede incorporar ruta, usuario/contexto y una captura de la superficie operativa. La implementación oculta campos de entrada y elementos marcados para redacción, pero **no garantiza que todo nombre, RUT, precio o texto ya visible quede anonimizado**.

Nunca incluyas contraseñas, datos completos de tarjetas/cuentas, tokens, claves privadas, certificado digital, CAF o secretos. Revisa la captura antes de enviarla y limita su distribución al equipo autorizado.

## 6. Después de enviar

1. Conserva el identificador/ticket si la pantalla lo informa.
2. Para casos bloqueantes, avisa a la jefatura e indica que el ticket ya fue creado.
3. No inventes una solución alternativa. Usa sólo el procedimiento autorizado.
4. Cuando soporte informe una corrección, repite el mismo caso con datos controlados.
5. Cierra como validado sólo si el resultado esperado se cumple y no aparece un efecto secundario.

## 7. Severidad sugerida

- **Bloqueante:** no se puede continuar de forma segura.
- **Alta:** afecta dinero, stock, entrega, datos o SII, aunque existe contingencia autorizada.
- **Media:** dificulta o aumenta el riesgo de error.
- **Baja:** texto, orden visual o mejora de experiencia.

## 8. Ejemplo

**Falla — Caja — pago no actualiza saldo.** Venta 1234, 10:35. Registré transferencia de $50.000 con documento X; apareció confirmación, pero el saldo no cambió. No reintenté. Afecta dinero y atención del cliente.
