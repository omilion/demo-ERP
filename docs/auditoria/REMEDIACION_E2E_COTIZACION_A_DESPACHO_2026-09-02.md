# Remediación E2E: cotización a despacho

Fecha: 2026-09-02
Base de auditoría: `docs/auditoria/AUDITORIA_E2E_COTIZACION_A_DESPACHO_2026-09-02.md`

## Aplicado y verificado

1. **Alertas de stock crítico.** `GET /api/notificaciones` declara ahora su
   límite (`limite`, entre 1 y 5.000), cuántos avisos entrega (`visibles`) y si
   dejó avisos fuera (`truncadas`). La campana mantiene un máximo ergonómico de
   100, pero indica "100 prioritarias de N" en vez de aparentar que N avisos
   caben en el panel. Las pruebas pueden solicitar el conjunto completo sin
   depender del ranking de una base de datos realista.
2. **Pruebas E2E reproducibles.** Se agregó `npm run test:e2e:docker`. Ejecuta
   en procesos separados los ocho flujos de cotización, venta, taller,
   despacho, relevos por rol y avisos contra `plastimar_test`. Así evita que Vitest acumule el
   grafo de módulos de todos los flujos y agote memoria. Sus temporales quedan
   en `backend/tmp/` (ignorado), por lo que tampoco dependen del disco `C:`.
3. **Relevos operativos por rol.** `test/flujo-roles-e2e.test.js` ejecuta una
   venta mixta y persiste el recorrido vendedor → coordinación comercial → jefe
   de taller → operario → bodeguero (despacho, picking, packing, guía borrador
   y tracking) → cajero → encargada de facturación con permiso granular →
   gerencia. También verifica que `solo_lectura` no pueda mutar y que `rrhh`
   permanezca fuera del flujo logístico. La caja y los datos usados son
   exclusivos de la prueba y se eliminan al terminar.

Verificación realizada:

```text
npm run test:e2e:docker      # 8 archivos, 132 pruebas aprobadas
npm run build                # frontend compilado correctamente
```

No se modificó producción ni se ejecutaron migraciones en este cambio.

## Decisiones necesarias antes de automatizar el resto

| Hallazgo | Por qué no se automatiza sin decisión | Definición requerida |
| --- | --- | --- |
| Stock de venta | Hoy una venta directa rebaja `stock` y registra kardex al crear la venta. Pasarla a reserva modifica disponible, devoluciones, documentos ya creados y la fecha contable del costo. | Confirmar si el modelo será **reservar al confirmar y rebajar físicamente al despachar**, y aprobar plan de transición para órdenes vigentes. |
| Crédito | No hay cupo, antigüedad, documentos vencidos tolerados ni excepción autorizable definidos por cliente. | Política: cálculo de deuda, umbral, estados bloqueados y roles que pueden liberar. |
| Órdenes de compra | La sugerencia existe, pero crear OC automática puede comprometer compras reales. | Regla de reposición, proveedor preferente, monto máximo y si requiere aprobación. |
| Guía DTE 52 | El borrador conserva los datos de despacho, pero emitir/enviar al SII es una operación fiscal irreversible. | Definir si al completar packing se crea sólo borrador o se permite emisión automática, con responsable fiscal. |
| Correo, SMS y WhatsApp | No hay proveedor, credenciales, plantillas aprobadas ni registro de consentimiento. | Proveedor/cuenta, remitente, plantillas y reglas de opt-in/opt-out. |
| Chofer y POD | Firma, evidencia fotográfica y retención de datos tienen efecto operativo y legal. | Campos obligatorios, quién puede confirmar entrega y política de retención. |
| Rol facturador | Actualmente emitir se entrega de forma granular (`facturacion.emitir`) a roles existentes. | Confirmar si se crea un rol estándar `facturador` y su matriz completa. |
| Contabilidad y CxC | Existen documentos y estados financieros, pero no un catálogo de cuentas/regla de asientos aprobado. | Plan de cuentas, momento de devengo y conciliación esperada. |

## Criterio de cierre

Estos puntos no deben marcarse como funcionales por la sola existencia de una
pantalla o un endpoint. Se cierran cuando la decisión respectiva esté aprobada,
la automatización esté cubierta por prueba de concurrencia/idempotencia y se
valide en `plastimar_test` antes de cualquier despliegue.
