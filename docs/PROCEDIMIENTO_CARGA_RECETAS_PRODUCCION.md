# Cargar recetas de costeo en producción

Procedimiento para llevar las 2.554 recetas y sus tres tarifas a la base productiva. Probado completo sobre una copia de producción el 31-08-2026.

**Duración estimada:** 20 minutos, la mayor parte esperando el respaldo.

---

## Qué se va a escribir

| | Cantidad |
|---|---|
| Tarifas de mano de obra | 3 |
| Recetas de producto | ~2.555 |
| Líneas de material | ~4.104 |
| Líneas de proceso | ~4.832 |

No se modifica ningún producto, venta ni orden de trabajo. Las recetas son registros nuevos en tablas que hoy están vacías.

---

## Antes de empezar

**Confirmar que hay respaldo del día.** El pipeline hace uno en cada despliegue, pero esta carga no pasa por ahí. Si el respaldo automático es más viejo que unas horas, tomar uno a mano:

```bash
pg_dump "$DATABASE_URL" --schema=taller -Fc -f respaldo_taller_$(date +%F).dump
```

Basta con el esquema `taller`: es el único que se toca. Restaurarlo devuelve el estado exacto anterior.

**Tener el Excel a mano.** `NUEVOS CALCULOS_PRECIOS_MK_14-07-2026.xls`. No está en el repositorio a propósito —es un archivo de trabajo del cliente que cambia— así que hay que pasarle la ruta al script.

---

## Paso 1 · Simular, sin escribir nada

```bash
cd backend
DATABASE_URL="<produccion>" node scripts/import-costeo-excel.mjs "<ruta al Excel>"
```

**Es sólo lectura**: sin `--apply` no escribe nada. Devuelve el informe completo.

Lo que hay que mirar antes de seguir:

```
Productos encontrados en ERP:     2659      ← si es un número chico, la base está mal apuntada
Coinciden con AK (+/- $2):        98.55%    ← el motor reproduce el Excel
Recetas elegibles:                2555
Recetas bloqueadas:               203
```

**Si "Productos encontrados" da 3 o similar, detenerse.** Significa que `DATABASE_URL` apunta a la base de pruebas y no a producción. Nos pasó, y llevó a concluir que faltaban las recetas cuando el problema era la conexión.

**Si el porcentaje contra AK baja del 95%,** algo cambió en el Excel y hay que revisar antes de cargar.

---

## Paso 2 · Las tarifas

El importador **se niega a correr sin ellas**, y hace bien: sin tarifas la mano de obra se calcula en cero y el costo de fabricación queda corto sin avisar.

```bash
DATABASE_URL="<produccion>" node scripts/cargar-tarifas-costeo.mjs
```

Muestra qué haría. Si la tabla dice `crear` en las tres:

```bash
DATABASE_URL="<produccion>" node scripts/cargar-tarifas-costeo.mjs --apply --allow-production
```

| Taller | Proceso | $/hora | De dónde sale |
|---|---|---|---|
| espumas | corte | 3.800 | celda `$AV$6` del Excel |
| confecciones | confeccion | 4.200 | celda `$AV$4` del Excel |
| confecciones | enfundado | 4.200 | verificado contra el costo del Excel |

El de enfundado no está parametrizado en la planilla, así que se resolvió con datos: con 4.200 el motor reproduce el costo del Excel en el 98,55% de los productos; con el otro valor candidato, en el 1,52%.

---

## Paso 3 · Las recetas

```bash
DATABASE_URL="<produccion>" node scripts/import-costeo-excel.mjs "<ruta al Excel>" --apply --allow-production
```

Las dos banderas son deliberadas: `--apply` para escribir, `--allow-production` para hacerlo en una base remota. Ninguna de las dos ocurre por inercia.

Al terminar:

```
Recetas aplicadas:     2555
Errores de escritura:  0
```

**Si hay errores de escritura, no continuar**: revisar el detalle antes de nada más.

---

## Paso 4 · Verificar

Entrar a **Costeo de Fabricación** en el ERP. El panel de arriba debe mostrar:

```
87,9%   2.554 de 2.905 productos MK
```

Y **no** debe aparecer el aviso rojo de tarifas faltantes.

Después, abrir cualquier producto MK y confirmar que el costo de fabricación tiene un valor coherente. Si sale en cero o muy bajo, las tarifas no se aplicaron.

---

## Si hay que volver atrás

Las recetas viven en tres tablas propias y no las referencia nada más, así que se pueden borrar sin arrastrar nada:

```sql
BEGIN;
DELETE FROM taller.receta_procesos;
DELETE FROM taller.receta_materiales;
DELETE FROM taller.producto_recetas;
DELETE FROM taller.tarifas_proceso;
-- Revisar los conteos antes de confirmar
COMMIT;
```

Los productos, las ventas y las órdenes de trabajo no se tocan.

---

## Después de cargar

**Las 203 bloqueadas necesitan a Plastimar.** Se agrupan así:

| Causa | Casos |
|---|---|
| Producto no está en el catálogo | 99 |
| Variante ambigua | 49 |
| El costo no cuadra con el Excel | 40 |
| Sin fila principal | 12 |
| Residual negativo | 9 |

No hay criterio automático para ninguna. El panel de Costeo lista los productos sin receta con enlace al editor, así que se pueden ir completando de a uno.

**Cuando cambie el valor hora**, no editar las tarifas: se carga una nueva con su fecha —la anterior queda como histórico— y se recalcula desde la pantalla. Así queda registrado con qué tasa se costeó cada cosa.

---

## Qué NO hace este procedimiento

- No toca precios de venta de los productos.
- No modifica productos, ventas ni órdenes de trabajo.
- No resuelve las 203 bloqueadas.
- No carga materias primas: usa las 70 que ya existen. Las 746 líneas de BOM sin vínculo quedan como monto totalizado en la receta, que es correcto —el costo total está bien— y se desglosan a medida que se carguen más materias primas.
