# Sprint 3 - Limpieza controlada de datos

Fecha: 2026-05-18
Proyecto: Plastimar ERP
Alcance: diagnostico y preparacion de limpieza de datos productivos, sin modificar datos en VPS.

## Objetivo

Este sprint no busca "limpiar a mano" la base de datos productiva. El objetivo es dejar herramientas repetibles, auditables y reversibles para atacar los hallazgos criticos detectados en Sprint 2:

- `ventas.orden_items.producto_id` apuntando a productos inexistentes.
- `taller.odt_items.producto_id` apuntando a productos inexistentes.
- RUT de clientes y proveedores duplicados, invalidos o con formato inconsistente.
- Stock negativo en catalogos operativos.
- Fechas anomalas tipo `0001-01-01`, `1970-01-01`, fechas pre-2000 o fechas futuras extremas.

MercadoPublico queda fuera de este sprint y fuera del alcance del proyecto actual.

## Resultado ejecutivo

Se agregaron cuatro herramientas de auditoria/limpieza controlada:

| Script | Proposito | Modo seguro |
| --- | --- | --- |
| `backend/scripts/data-cleanup-plan.mjs` | Vista consolidada de hallazgos prioritarios | Dry-run por defecto |
| `backend/scripts/cleanup-producto-orphans.mjs` | Plan especifico para productos huerfanos en ventas/taller | Dry-run por defecto; `apply` solo con confirmacion explicita |
| `backend/scripts/rut-duplicates-cleanup.mjs` | Clasificacion de RUT en clientes/proveedores | Dry-run por defecto; `apply` solo formatea RUT unicos |
| `backend/scripts/stock-negative-dates-audit.mjs` | Evidencia para stock negativo y fechas anomalas | Dry-run por defecto; no ajusta stock automaticamente |

No se ejecuto ningun `apply` en produccion. Todas las ejecuciones contra VPS fueron de solo lectura o generaron archivos temporales removidos al terminar.

## Hallazgos reales en VPS

### Productos huerfanos

Auditoria especializada ejecutada contra VPS en modo dry-run:

| Metica | Valor |
| --- | ---: |
| Filas inspeccionadas | 8.938 |
| Correcciones seguras por codigo interno exacto | 2.595 |
| Filas omitidas por requerir revision manual | 6.343 |

Detalle por tabla:

| Tabla | Correcciones seguras | Manual / omitidas |
| --- | ---: | ---: |
| `ventas.orden_items` | 2.533 | 6.143 |
| `taller.odt_items` | 62 | 200 |

Criterio de correccion segura:

- La fila tiene `codigo_interno`.
- Existe exactamente un producto vigente en `catalogo.productos` con el mismo `codigo_interno` normalizado.
- El `producto_id` actual apunta a un producto inexistente.
- La accion propuesta solo reemplaza `producto_id`, no cambia precio, cantidad, descripcion, historial ni documentos.
- El script genera SQL reverso por cada fila candidata.

No se corrigen automaticamente:

- Codigos inexistentes en catalogo.
- Codigos ambiguos.
- Filas sin codigo interno.
- Casos donde el nombre parece similar pero el codigo no calza exactamente.

### RUT clientes y proveedores

El primer intento del auditor de RUT en VPS quedo demasiado pesado porque contaba uso con consultas laterales por cada cliente/proveedor. Se corrigio el script para usar agregados por lote. El dry-run corregido corrio en 6,1 segundos contra VPS.

Resultado del dry-run:

| Metrica | Valor |
| --- | ---: |
| Entidades revisadas | 2 |
| Filas totales revisadas | 17.733 |
| Grupos con accion | 3.961 |
| Filas afectadas por alguna accion | 4.430 |
| Filas elegibles para formato automatico | 3.274 |
| Filas que requieren revision manual | 1.156 |

Clasificacion global:

| Clasificacion | Filas |
| --- | ---: |
| `safe_format_only` | 3.274 |
| `real_duplicate` | 841 |
| `invalid` | 275 |
| `placeholder_empty` | 24 |
| `placeholder_zero` | 16 |

Detalle por entidad:

| Entidad | Filas | Grupos | Afectadas | Formato automatico | Manuales |
| --- | ---: | ---: | ---: | ---: | ---: |
| `clientes` | 16.945 | 3.193 | 3.648 | 2.555 | 1.093 |
| `proveedores` | 788 | 768 | 782 | 719 | 63 |

Criterio de formato automatico de RUT:

- El RUT normalizado es valido segun digito verificador chileno.
- El RUT normalizado aparece una sola vez en la tabla.
- Solo cambia puntuacion/case a formato canonico, por ejemplo `123456785` a `12.345.678-5`.
- Antes de actualizar se revalida que no exista colision normalizada con otra fila.

Queda manual:

- RUT reales duplicados.
- RUT invalidos.
- RUT vacios.
- RUT placeholder en cero.
- Cualquier caso que pueda afectar identidad legal o documentos historicos.

### Stock negativo y fechas anomalas

Auditoria especializada ejecutada contra VPS en modo dry-run:

| Metrica | Valor |
| --- | ---: |
| Filas con stock negativo detectadas por herramienta especializada | 26 |
| Fechas anomalas detectadas | 134 |
| Columnas de fecha escaneadas | 108 |

Clasificacion de fechas:

| Tipo | Cantidad |
| --- | ---: |
| `pre_2000` | 55 |
| `sentinel_1970` | 45 |
| `sentinel_0001` | 8 |
| `future_extreme` | 26 |

Criterio:

- Stock negativo no se corrige automaticamente. Se genera evidencia del ultimo movimiento cuando existe.
- Fechas sentinel anulables pueden ser candidatas a `NULL`, pero solo en staging y con confirmacion explicita `APPLY_DATE_NULLS`.
- Fechas no anulables, fechas reales antiguas y fechas futuras extremas quedan para revision manual.

Nota: el auditor general de Sprint 2 marco mas hallazgos de stock que esta herramienta especializada. La diferencia se debe a que Sprint 2 conto todos los productos negativos del catalogo general; Sprint 3 prioriza filas con evidencia operativa para preparar correccion controlada. Antes de tocar produccion se debe usar ambos reportes como baseline.

## Scripts agregados

### `data-cleanup-plan.mjs`

Comando:

```bash
npm run data:cleanup-plan -- --task=all --limit=200
```

Tareas soportadas:

- `all`
- `product-orphans`
- `rut-duplicates`
- `stock-dates`

Comportamiento:

- Dry-run por defecto.
- Limita muestras para revision.
- Clasifica cada hallazgo en automatico seguro o manual.
- El unico `apply` permitido es para productos huerfanos con match exacto y requiere `--confirm=UPDATE_EXACT_PRODUCT_ORPHANS`.

### `cleanup-producto-orphans.mjs`

Comando:

```bash
npm run data:cleanup-products
```

Uso recomendado:

```bash
npm run data:cleanup-products -- --samples=50 --json --out=artifacts/product-orphans.json
```

Reglas:

- Match exacto por `codigo_interno` normalizado.
- No usa similitud por nombre.
- No borra filas.
- No modifica cantidades, precios ni documentos.
- Genera plan reversible.
- En entornos productivos exige bandera adicional antes de aplicar.

### `rut-duplicates-cleanup.mjs`

Comando:

```bash
npm run data:cleanup-ruts -- --entity=all
```

Salidas:

- Texto por defecto.
- `--json`.
- `--csv`.
- `--out=path`.

Reglas:

- Normaliza RUT eliminando todo salvo digitos y `K`.
- Valida digito verificador chileno.
- Separa placeholders, invalidos, duplicados reales y formato seguro.
- `--apply` solo corrige formato de RUT validos y unicos.
- No fusiona clientes/proveedores.
- No reasigna ventas, cobranzas, ODT ni pagos.

### `stock-negative-dates-audit.mjs`

Comando:

```bash
npm run data:cleanup-stock-dates
```

Opciones:

- `--only-stock`
- `--only-dates`
- `--limit=100`
- `--future-years=10`
- `--schemas=auth,bodega,caja,catalogo,clientes,rrhh,taller,ventas`
- `--json`

Reglas:

- Stock negativo siempre queda como ajuste manual inventariado.
- Fechas sentinel anulables pueden limpiarse solo con `--apply --confirm=APPLY_DATE_NULLS`.
- No toca fechas no anulables.

## Plan de ejecucion recomendado

### 1. Preparar staging real

1. Tomar backup nuevo de produccion con `pg_dump -Fc`.
2. Restaurar en una base staging aislada.
3. Configurar backend staging apuntando a esa base.
4. Deshabilitar integraciones externas y envios reales.
5. Ejecutar `npm run data:audit` para baseline.

### 2. Resolver bloqueo previo de catalogo

Antes de actualizar `producto_id`, resolver el codigo duplicado `PACK4` detectado en Sprint 2. Si un codigo interno existe duplicado, no se debe automatizar ninguna reasignacion basada en ese codigo.

### 3. Aplicar productos huerfanos por lote

Orden recomendado:

1. `ventas.orden_items` con match exacto.
2. `taller.odt_items` con match exacto.

Validaciones por lote:

- Conteo esperado antes/despues.
- Muestra de ordenes afectadas.
- `npm run data:audit`.
- Reversibilidad disponible.

### 4. Aplicar formato de RUT unicos

Solo aplicar `safe_format_only`.

No aplicar automaticamente:

- Duplicados reales.
- Invalidos.
- Placeholders.

Validaciones:

- Buscar colisiones normalizadas antes y despues.
- Revisar que ventas/cobranzas/ODT sigan consultando.
- Exportar CSV para revision del socio antes de produccion.

### 5. Stock negativo

No aplicar script automatico. Preparar plan manual por producto/tela/material:

- Ver ultimo movimiento.
- Contrastar contra factura, ingreso, ODT o ajuste historico.
- Registrar ajuste inventariado con usuario y motivo.
- Mantener evidencia adjunta al ticket o bitacora.

### 6. Fechas anomalas

Orden:

1. Sentinel anulables (`0001-01-01`, `1970-01-01`) a `NULL` solo en staging.
2. Fechas futuras extremas manuales.
3. Fechas pre-2000 manuales, porque pueden ser reales o datos legacy.

## Criterio de aceptacion para pasar a produccion

Se puede pasar a produccion solo si:

- Staging fue restaurado desde backup productivo fresco.
- Todos los scripts corrieron en staging.
- `npm run data:audit` no empeora ningun indicador.
- La cantidad de filas a modificar coincide exactamente con el plan.
- Existe backup productivo inmediatamente anterior.
- Existe plan de reversa probado.
- El socio reviso CSV/JSON de productos huerfanos y RUT.
- El cliente o responsable operacional valido los cambios manuales de stock/fechas.

## Validaciones ejecutadas localmente

Comandos ejecutados:

```bash
node --check backend/scripts/data-cleanup-plan.mjs
node --check backend/scripts/cleanup-producto-orphans.mjs
node --check backend/scripts/rut-duplicates-cleanup.mjs
node --check backend/scripts/stock-negative-dates-audit.mjs
npm.cmd test -- --run test/data-cleanup-plan.test.js test/producto-orphan-cleanup.test.js test/rut-duplicates-cleanup.test.js test/stock-negative-dates.test.js test/data-integrity-audit.test.js
```

Resultado:

- Sintaxis OK.
- 5 archivos de pruebas OK.
- 38 pruebas OK.

Tambien se ejecuto una validacion focal posterior a la optimizacion del auditor de RUT:

```bash
npm.cmd test -- --run test/rut-duplicates-cleanup.test.js test/data-cleanup-plan.test.js
```

Resultado:

- 2 archivos de pruebas OK.
- 12 pruebas OK.

## Riesgos pendientes

- La base contiene muchos datos legacy con referencias rotas. Una limpieza parcial puede mejorar integridad pero tambien revelar errores funcionales ocultos.
- RUT duplicados reales requieren decision de negocio: fusionar, mantener separados, marcar inactivos o completar RUT correcto.
- Stock negativo no debe "cuadrarse" sin respaldo operacional.
- Fechas antiguas pueden ser datos reales migrados; no tratarlas como basura sin contexto.
- La limpieza debe ejecutarse primero en staging. Produccion no debe ser el primer lugar donde se pruebe un `apply`.

## Siguiente sprint recomendado

Sprint 4 deberia ser "staging y primera limpieza reversible":

1. Levantar una base staging desde backup productivo.
2. Corregir el duplicado de catalogo `PACK4`.
3. Ejecutar `cleanup-producto-orphans` en staging para los 2.595 matches exactos.
4. Ejecutar `rut-duplicates-cleanup` en staging solo para los 3.274 `safe_format_only`.
5. Re-ejecutar `data:audit`.
6. Preparar paquete de aprobacion para produccion con conteos antes/despues, SQL reverso y muestras verificadas.
