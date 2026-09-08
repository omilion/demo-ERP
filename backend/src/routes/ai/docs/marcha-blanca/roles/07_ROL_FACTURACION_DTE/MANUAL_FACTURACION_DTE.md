---
documento: DOC-07
titulo: Manual operativo de Facturación Electrónica DTE
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Facturación y finanzas
uso: Marcha Blanca
---

# DOC-07: Manual operativo de Facturación Electrónica DTE

## 1. Alcance y estados

El área prepara, emite, envía y consulta documentos tributarios. Son etapas distintas:

| Estado/acción | Significado |
|---|---|
| Borrador | Editable, sin folio tributario consumido |
| Emitir DTE | Valida, asigna folio CAF, firma y genera el documento |
| Emitido | Tiene folio; todavía puede faltar el envío |
| Enviar al SII | Transmite el documento |
| Enviado | Existe Track ID; la respuesta definitiva aún debe consultarse |
| Aceptado/Rechazado/Reparo | Resultado informado por el SII |

No repitas **Emitir** o **Enviar** por demora. Primero actualiza/consulta el documento y comprueba folio y Track ID.

## 2. Tipos habituales

- DTE 33: Factura electrónica afecta.
- DTE 34: Factura electrónica exenta.
- DTE 39: Boleta electrónica.
- DTE 52: Guía de despacho electrónica.
- DTE 61: Nota de crédito electrónica referenciada.

El tipo debe responder a la operación y antecedentes tributarios; no lo selecciones sólo porque permite avanzar.

## 3. Regla interna de 20 líneas

SisGestión aplica un **límite operativo interno de Plastimar de 20 líneas de detalle por documento**. No es correcto describirlo en este manual como un límite general impuesto por el SII.

Si una operación supera 20 líneas, divide manualmente los ítems en más de un documento, controla que no haya omisiones/duplicidades y verifica que la suma de neto, exento, IVA y total represente la operación completa. El ERP no divide automáticamente 35 líneas en 20 + 15.

## 4. Procedimiento de emisión

1. Abre **Facturación → Documentos**.
2. Crea o abre el borrador vinculado a la venta/guía.
3. Revisa tipo DTE, receptor, RUT, razón social, giro, dirección, comuna, referencias, ítems, cantidades, precios, descuentos, exentos e impuestos.
4. Para DTE 52 revisa además tipo de despacho e indicador de traslado.
5. Corrige en borrador; después de emitir no edites informalmente el documento.
6. Presiona **Emitir DTE** una vez y confirma folio/estado.
7. Presiona **Enviar al SII** una vez y registra el Track ID.
8. Consulta/actualiza hasta obtener respuesta del SII.
9. Si es aceptado, continúa el flujo. Si es rechazado o con reparo, revisa el detalle antes de decidir corrección, reenvío o nota.

## 5. Notas de crédito DTE 61

1. Ubica el documento original correcto.
2. Define el motivo según la operación autorizada: anulación, corrección de texto o corrección de montos.
3. Revisa referencia, folio, fecha, montos e ítems afectados.
4. Emite, envía y consulta el estado como cualquier DTE.
5. Verifica el efecto contable/comercial esperado. No uses una nota de crédito como mecanismo de prueba.

## 6. Auditoría de excepciones

Usa **Revisar excepciones** en la trazabilidad venta → guía → DTE. Investiga ventas/guías sin documento, documentos sin envío, vínculos incompletos, rechazos y duplicidades. Abrir el informe no corrige automáticamente la excepción.

## 7. Manejo seguro de errores

- **Sin folio:** sigue siendo borrador; corrige los datos.
- **Con folio y sin Track ID:** no vuelvas a emitir. Evalúa/reintenta sólo el envío por el flujo habilitado.
- **Con Track ID:** consulta; no vuelvas a subir el mismo XML.
- **Certificado/CAF:** no compartas archivo, clave ni contenido. Reporta sólo el mensaje seguro y el tipo de fallo.
- **Rechazo SII:** conserva código/mensaje, folio, Track ID, tipo DTE, ambiente y hora.
- **Servicio SII no disponible:** deja el documento en estado verificable y escala; no declares aceptación.

## 8. Criterio de cierre

La prueba se aprueba cuando existe un único folio por operación emitida, el Track ID corresponde al envío, el estado final fue consultado, los totales cuadran y toda nota referencia el documento correcto.
