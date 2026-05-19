# Sprint 1 saneamiento produccion - 2026-05-18

## Estado

Sprint iniciado en modo seguro.

- Produccion consultada solo lectura.
- No se ejecutaron `UPDATE`, `DELETE` ni `INSERT`.
- Se agrego auditor dry-run: `backend/scripts/sprint1-saneamiento-audit.mjs`.
- Comando local: `npm run data:sprint1-audit -- --json --include-sql`.

## Objetivo

Sanear datos contaminados ya migrados antes de seguir agregando funcionalidades.

Este sprint no cubre todavia `movimientos_stock`; ese modulo requiere diseno separado porque el origen legacy parece ser snapshot historico de stock, no movimientos transaccionales.

## Resultado dry-run produccion

### Producto huerfano

| Tabla | Total | Match exacto por codigo | Sin match catalogo | Ambiguo | Sin codigo |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ventas.orden_items` | 8676 | 2526 | 6150 | 0 | 0 |
| `taller.odt_items` | 262 | 62 | 200 | 0 | 0 |
| **Total** | **8938** | **2588** | **6350** | **0** | **0** |

Lectura:

- Hay 2588 filas corregibles por regla estricta: `codigo_interno` normalizado coincide con exactamente un producto de catalogo.
- Hay 6350 filas que no tienen producto en catalogo. No deben inventarse ni reasignarse automaticamente.

Accion recomendada:

1. Aplicar primero solo los 2588 `exact_code_match`, con backup y tabla de auditoria.
2. Mantener los 6350 como deuda manual: crear productos legacy, mapear manualmente o permitir `producto_id` nullable/legacy.

### Precios negativos en ventas

| Check | Valor |
| --- | ---: |
| Items con `precio_unitario < 0` | 688 |
| Ordenes afectadas | 589 |
| Precio minimo | -1099960 |
| Precio maximo negativo | -1 |

Lectura:

- No se debe auto-corregir. Puede representar devoluciones, notas o errores de migracion.
- Requiere validacion comercial antes de tocar montos.

Accion recomendada:

- Generar muestra agrupada por tipo de orden, cliente y fecha.
- Definir con negocio si se normaliza a nota de credito/devolucion o se deja como historico.

### Ordenes con mismatch RUT vs cliente_id

| Check | Valor |
| --- | ---: |
| Ordenes con RUT distinto al cliente asociado | 6686 |
| Candidatos con RUT unico exacto | 4898 |
| Candidatos ambiguos | 1655 |
| Sin cliente destino por RUT | 133 |
| Clientes actuales afectados | 2295 |
| Clientes destino afectados | 1970 |

Lectura:

- Hay un lote grande potencialmente corregible: 4898 ordenes donde `rut_cliente` apunta a un cliente unico distinto.
- Las muestras muestran un patron de desplazamiento/asignacion equivocada entre clientes, no solo formato de RUT.

Accion recomendada:

1. Preparar script con auditoria y rollback para reasignar solo `cliente_id` cuando el RUT normalizado tenga un unico cliente destino.
2. No tocar los 1655 ambiguos ni los 133 sin destino.
3. Recalcular impactos de saldos/cobranza despues del backfill.

### Guias despacho con fechas invalidas

| Check | Valor |
| --- | ---: |
| Total guias | 11762 |
| Fecha pre-2000 | 7560 |
| Fecha `1970-01-01` | 7558 |
| Fecha futura > 1 ano | 1 |
| `1970-01-01` con `orden_id` | 7558 |
| Derivable desde `ventas.ordenes.created_at` | 7558 |
| Derivable desde `guias_despachos.created_at` | 7558 |

Lectura:

- `fecha_guia` es `NOT NULL`, por lo tanto no se puede convertir a `NULL` sin migracion de esquema.
- `created_at` de la guia es fecha de migracion (`2026-05-15`), no fecha historica real.
- `orden.created_at` existe y es historica, pero no necesariamente es fecha de guia.

Accion recomendada:

- No aplicar UPDATE automatico todavia.
- Opcion segura de esquema: permitir `fecha_guia` nullable y mover `1970-01-01` a `NULL`.
- Opcion operativa: derivar desde `orden.created_at` solo si el cliente acepta que es una fecha aproximada, no historica real de guia.

### Guias duplicadas

| Check | Valor |
| --- | ---: |
| Grupos duplicados por `n_guia` | 123 |
| Filas extra duplicadas | 131 |
| Max filas en un grupo | 7 |

Lectura:

- No se puede resolver solo por numero de guia. Hay que revisar `origen`, `n_interno` y documento real.

Accion recomendada:

- Mantener como revision manual; no bloquear el resto del saneamiento.

### Bitacora taller sin ODT

| Check | Valor |
| --- | ---: |
| Total bitacora | 12740 |
| Sin `odt_id` | 12740 |
| Sin fecha | 1 |
| Texto con numero de 4-6 digitos | 2437 |
| Candidatos debiles unicos por numero contra ODT/orden | 90 |
| Candidatos debiles ambiguos | 17 |

Lectura:

- La bitacora legacy parece ser mayoritariamente reporte diario general de taller, no bitacora por ODT.
- Las muestras iniciales no traen una clave confiable. Hay textos como tareas diarias, viajes, aseo, embalaje, carga, etc.
- Aunque se puede extraer algun numero del texto, eso no es una regla segura para backfill masivo.

Accion recomendada:

- No hacer backfill automatico de `odt_id`.
- Tratar esta bitacora como bitacora diaria legacy.
- Ajustar UX/modelo si se quiere mostrar historico legacy separado de bitacora por ODT.

## Orden de apply recomendado

1. Backup nuevo de produccion.
2. Apply controlado de `producto_id` huerfano con match exacto por `codigo_interno`: 2588 filas.
3. Auditoria posterior de integridad.
4. Script separado para `ordenes.cliente_id` por RUT unico: 4898 candidatos, con tabla de auditoria y rollback.
5. Decidir estrategia de `fecha_guia`: cambio de esquema a nullable o fecha aproximada.
6. Dejar precios negativos, duplicados de guia y bitacora sin ODT como revision funcional/manual.

## No hacer todavia

- No migrar `movimientos_stock` en este sprint.
- No crear productos automaticamente para 6350 items sin match.
- No corregir precios negativos sin validacion de negocio.
- No derivar bitacora a ODT usando regex de texto.
- No cambiar fechas de guia a `orden.created_at` sin aceptacion explicita del cliente.

## Comandos ejecutados

Todas las consultas fueron `SELECT` sobre produccion.

```bash
node --check backend/scripts/sprint1-saneamiento-audit.mjs
```

Consulta remota read-only via SSH/psql contra `plastimar_erp` para obtener los conteos del sprint.
