# Sprint 2 - Trazabilidad y control de caja

Fecha: 2026-05-19  
Estado: implementado en codigo, pendiente de push/deploy.

## Objetivo

Evitar que caja opere como movimientos sueltos sin relacion verificable. Este sprint ordena la escritura de movimientos, el cierre de turno y los reportes para que ingresos/egresos queden trazables y auditables.

## Problemas corregidos

Antes de este sprint:

- `orden_id` se aceptaba directo al crear movimiento, sin validar que la orden existiera.
- `gasto_tipo_id` se aceptaba directo, incluso en ingresos o con gastos inactivos.
- Se permitian movimientos con monto `0`.
- Historico y export de caja podian incluir movimientos eliminados logicamente.
- Se podia borrar un movimiento aunque el turno ya estuviera cerrado.
- El cierre de turno calculaba snapshot fuera de un bloqueo transaccional fuerte.
- No existia `origen_tipo/origen_id` para clasificar formalmente el movimiento.

## Cambios realizados

### Modelo de datos

Se agregaron campos a `caja.movimientos_caja`:

- `origen_tipo`
- `origen_id`

Tambien se agrego relacion Prisma/FK hacia orden:

- `caja.movimientos_caja.orden_id -> ventas.ordenes.id`

Migracion:

- `backend/prisma/migrations/20260519113000_add_cash_movement_traceability/migration.sql`

La FK queda `NOT VALID` para no bloquear bases con historico legacy pendiente de limpiar.

### Creacion de movimientos

Ruta:

- `POST /api/caja/turno/:id/movimientos`

Reglas nuevas:

- `monto` debe ser mayor que cero.
- `ordenId`, `gastoTipoId` y `origenId` deben ser positivos.
- Si viene `ordenId`, la orden debe existir.
- Si viene `gastoTipoId`, el gasto debe existir y estar activo.
- `gastoTipoId` solo aplica a egresos.
- Un egreso debe tener `gastoTipoId` u `ordenId`.
- Si no hay origen explicito, se clasifica como:
  - `orden` cuando hay `ordenId`;
  - `gasto` cuando hay `gastoTipoId`;
  - `manual` en ingresos manuales.

La creacion bloquea el turno con `FOR UPDATE` antes de insertar. Asi no puede entrar un movimiento mientras el turno se esta cerrando.

### Apertura y cierre de turno

Cambios:

- Abrir turno valida que la caja exista y este activa.
- Abrir turno usa advisory lock transaccional para evitar doble apertura concurrente.
- Cerrar turno bloquea la fila del turno con `FOR UPDATE`.
- El snapshot del cierre se calcula dentro de la misma transaccion.
- El cierre excluye movimientos eliminados.

### Borrado logico

Ruta:

- `DELETE /api/caja/movimientos/:id`

Regla nueva:

- No se puede eliminar un movimiento perteneciente a un turno cerrado.

Esto evita que el cierre oficial quede descuadrado despues de emitido.

### Historico y reportes

Ahora excluyen movimientos eliminados por defecto:

- `GET /api/caja/historico`
- `GET /api/caja/historico/years`
- `GET /api/reportes/export/caja`
- pagos asociados en detalle de venta

### Auditoria

Se agregaron controles:

- `caja.movimientos_origen_tipo_nulo`
- `caja.ingresos_sin_orden_ni_documento`
- `caja.egresos_sin_gasto_ni_orden`
- `caja.movimientos_origen_orden_mismatch`
- `caja.movimientos_origen_gasto_mismatch`

## Validaciones ejecutadas

Comandos ejecutados en `backend`:

```bash
npm.cmd exec prisma validate
node --check src/routes/caja/movimientos.js
node --check src/routes/caja/turno.js
node --check src/routes/caja/historico.js
node --check src/routes/reportes/index.js
npm.cmd run db:generate
npm.cmd test -- caja-traceability.test.js data-integrity-audit.test.js operational-utils.test.js backend-helpers.test.js
git diff --check
```

Resultado:

- Prisma schema valido.
- Prisma Client generado.
- Sintaxis JavaScript valida.
- 23 tests focalizados pasan.
- `git diff --check` sin errores.

Tambien se intento correr `npm.cmd test -- caja.test.js`. Ese test HTTP existente no quedo ejecutable en este entorno local porque depende de login/seed/base de datos de desarrollo: primero fallo por secretos JWT ausentes y luego por respuestas 401/errores Prisma del ambiente. No fue una falla de sintaxis ni de las reglas nuevas cubiertas por los tests unitarios de este sprint.

## Pendiente fuera de este sprint

Este sprint no resuelve todavia:

- conciliacion historica de movimientos de caja legacy;
- agregar `created_by_user_id`/`deleted_by_user_id` en tabla de caja;
- mejorar el audit plugin para extraer `entity_id` en rutas anidadas;
- regla de negocio fina para ingresos manuales sin orden, documento ni referencia;
- politica de reapertura o ajuste formal de turnos cerrados.

## Criterio de aceptacion

El Sprint 2 queda aceptable si en staging/produccion se confirma:

1. Crear ingreso con orden valida graba `orden_id`, `origen_tipo=orden`, `origen_id=orden_id`.
2. Crear egreso exige gasto u orden.
3. No permite gasto en ingreso.
4. No permite borrar movimientos de turnos cerrados.
5. El cierre ignora eliminados y queda consistente con los movimientos visibles.
6. Historico/export no muestran eliminados por defecto.
7. Auditoria reporta caja sin origen o inconsistencias reales.
