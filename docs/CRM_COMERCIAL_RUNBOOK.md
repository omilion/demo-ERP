# CRM comercial — migración, activación y operación

## Alcance implementado

- Etapas comerciales separadas del estado legacy.
- Resultado ganado, perdido y cierre histórico sin clasificar.
- Canal, tipo de venta, confirmación y motivo de pérdida estructurados.
- Historial inmutable de gestiones y cambios de etapa.
- Semáforo calculado en días hábiles.
- Movimiento automático de cotización a seguimiento a los 3 días hábiles.
- Aprobación por pago de Caja/Webpay y por OC online correlacionada.
- Relación CRM con cliente y orden.
- Métrica de conversión corregida: ganadas / (ganadas + perdidas).

La integración incluida es con los módulos internos de Plastimar. Un ERP externo queda fuera de este alcance.

## 1. Preparación

1. Respaldar PostgreSQL.
2. Confirmar que `DATABASE_URL` apunta al ambiente correcto.
3. Generar Prisma Client:

   ```powershell
   cd backend
   npm run db:generate
   ```

4. Aplicar la migración aditiva:

   ```powershell
   npx prisma migrate deploy
   ```

La migración agrega columnas y tablas, pero no clasifica registros históricos.

## 2. Previsualización y backfill

Ejecutar primero:

```powershell
npm run crm:backfill
```

El comando solo muestra cuántos registros quedarían en cada etapa. Después de revisar el reporte:

```powershell
npm run crm:backfill:apply
```

Reglas conservadoras:

- Cerrado legacy → `CERRADO / SIN_CLASIFICAR`.
- En Gestión o En Espera legacy → `SEGUIMIENTO`.
- Pendiente con número de cotización → `COTIZACION_ENVIADA`.
- Pendiente sin evidencia de cotización → `PENDIENTE_CLASIFICACION`.
- En Espera legacy conserva `subestadoEspera = LEGACY_EN_ESPERA`.

El script es repetible: solo procesa filas donde `etapa_comercial` todavía es nula.

## 3. Job automático

Simulación manual:

```powershell
npm run job:crm
```

Ejecución real:

```powershell
npm run job:crm:apply
```

El modo por defecto es siempre simulación. La ejecución real:

- evalúa solo `COTIZACION_ENVIADA`;
- excluye `COMPRA_AGIL`;
- usa días hábiles;
- mueve desde 3 días sin gestión;
- registra historial;
- es idempotente.

Ejemplo de cron Linux cada hora laboral:

```cron
CRON_TZ=America/Santiago
0 8-18 * * 1-5 cd /ruta/plastimar/backend && npm run job:crm:apply >> /var/log/plastimar-crm.log 2>&1
```

## 4. Verificación funcional antes de activar

- Abrir `/crm` como administrador y como vendedor.
- Confirmar visibilidad de cartera.
- Revisar las cinco columnas, incluida `Por clasificar` para legacy o leads sin cotización.
- Registrar una gestión y comprobar la línea de tiempo.
- Probar límites del semáforo.
- Intentar perder sin motivo: debe bloquearse.
- Intentar ganar sin pasar por Venta aprobada: debe bloquearse.
- Clasificar un cierre histórico como ganado o perdido.
- Reabrir como administrador: debe pedir motivo, limpiar el resultado vigente y conservar el historial anterior.
- Registrar un pago de Caja y un Webpay sobre una orden vinculada: CRM debe quedar en Venta aprobada.
- Procesar una OC online correlacionada: debe vincular la orden y aprobar la oportunidad.
- Revisar que una falla de facturación o despacho no convierta la venta en perdida.

## 5. Pruebas técnicas

```powershell
cd backend
npx vitest run test/crm.test.js test/crm-commercial.test.js test/caja-payment-helpers.test.js

cd ../frontend
npm run build
```

Para la regresión integrada se requiere PostgreSQL local migrado.

## 6. Monitoreo

Revisar:

- errores y candidatos del job CRM;
- oportunidades sin propietario;
- cierres `SIN_CLASIFICAR`;
- aprobaciones sin orden vinculada;
- pagos u OC que no pudieron correlacionarse;
- oportunidades vencidas por vendedor;
- tasa ganada/perdida y volumen excluido por falta de clasificación.

## 7. Reversa segura

- Desactivar el cron del CRM.
- Revertir el frontend/backend a la versión anterior si fuera necesario.
- No eliminar las columnas ni tablas nuevas: contienen historial.
- Las columnas legacy `estado`, `accion`, `resultado` y `comentarios` se mantienen para compatibilidad.
- Investigar y corregir datos antes de reactivar el job.
