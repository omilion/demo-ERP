# Politica de cliente canonico para ERP nuevo - 2026-05-19

## Decision tecnica

Para la nueva tecnologia se establece un modelo con cliente canonico.

El ERP legacy permitia asociar clientes, pero la asociacion no era una relacion fuerte `orden -> cliente_id`. Era una referencia textual por `rut_cliente` o `email`, repetida en varios modulos. Eso no se debe heredar al ERP nuevo.

## Principio

El ERP nuevo debe tener:

- un cliente maestro canonico;
- ordenes apuntando a `cliente_id`;
- duplicados conservados solo como alias/historico mientras se audita;
- ninguna fusion fisica destructiva sin lote separado.

## Reglas de saneamiento

### Regla 1: RUT valido + evidencia legacy

Si el RUT de la orden es valido y el forense legacy identifica un cliente maestro segun la forma en que el ERP viejo resolvia `rut_cliente` o `email`, se puede actualizar `ventas.ordenes.cliente_id` al cliente canonico sugerido.

Archivo de dry-run:

- `docs/revision-cliente-saneamiento-2026-05-19/19_mapeo_cliente_canonico_dry_run.csv`

Resultado:

| Metrica | Valor |
| --- | ---: |
| Grupos RUT validos con cliente canonico | 215 |
| Ordenes corregibles por politica canonica | 1645 |
| Confianza `ALTA_LOGICA_LEGACY_RUT_VALIDO` | 213 grupos |
| Confianza `ALTA_EMPATE_IDENTICO_USAR_ID_MENOR` | 2 grupos |

### Regla 2: RUT invalido o generico

No se debe fusionar por RUT cuando el RUT es invalido o generico.

Ejemplos observados:

- `000000000`
- `0000000000`
- `111111111`
- otros RUT que no pasan digito verificador.

Estos casos pueden haber sido usados como comodines en el ERP viejo. Aunque el sistema antiguo los resolviera hacia un primer cliente, no son base segura para unificar clientes en la nueva tecnologia.

Resultado:

| Metrica | Valor |
| --- | ---: |
| Ordenes con RUT invalido/generico | 23 |

### Regla 3: Sin cliente destino

Si el RUT es valido pero no existe cliente destino claro, no se inventa automaticamente.

Resultado:

| Metrica | Valor |
| --- | ---: |
| Ordenes con RUT valido sin cliente destino | 188 |

Estas filas quedan en:

- `docs/revision-cliente-saneamiento-2026-05-19/20_clientes_revision_manual_final.csv`

### Regla 4: No borrar duplicados en el primer apply

El primer lote no debe borrar ni fusionar fisicamente filas de `clientes.clientes`.

Orden recomendado:

1. Actualizar `ventas.ordenes.cliente_id` para las 1645 ordenes corregibles.
2. Auditar saldos/reportes/cobranza.
3. Crear tabla de alias o equivalencias `cliente_duplicado_id -> cliente_maestro_id`.
4. Recien despues decidir si se inactivan duplicados.

## Por que no fusionar todo directamente

Hay RUTs genericos/invalidos usados por clientes distintos. Unificar solo por `rut_normalizado` seria incorrecto.

La politica correcta no es "mismo RUT siempre se fusiona". La politica correcta es:

> RUT valido + evidencia legacy + cliente maestro sugerido = actualizacion automatizable.

Y para los demas:

> RUT invalido/generico o sin destino claro = revision manual o historico.

## Siguiente sprint propuesto

Sprint Cliente Canonico 1:

- Backup previo.
- Crear tabla de auditoria.
- Dry-run de 1645 ordenes.
- Apply transaccional sobre `ventas.ordenes.cliente_id`.
- Smoke API.
- Auditoria especifica de clientes/cobranza.

No incluye:

- borrar clientes;
- fusionar fisicamente datos maestros;
- crear clientes faltantes;
- resolver RUTs invalidos/genericos.
