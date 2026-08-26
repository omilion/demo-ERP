# Revisión de datos y esfuerzo

Complemento a las 12 fichas. Aquéllas contrastan el levantamiento contra el **código**; ésta lo contrasta contra los **datos reales de producción** y estima el **esfuerzo** de cerrar cada brecha.

La distinción importa: un módulo puede estar correctamente implementado y ser inútil porque nadie llenó los campos. Y al revés, una brecha que parece grande puede resolverse en horas.

**Medición:** 26-08-2026, entre 10:30 y 12:10, sobre la base productiva `plastimar_erp`. Todas las consultas son de sólo lectura y están transcritas en el anexo, para que cualquiera pueda reproducirlas.

---

## 1. Hallazgo crítico: el 96,6% de las ventas no se puede editar

No estaba en el levantamiento ni en las fichas, y es un defecto activo hoy.

`estado_entrega` en producción:

| Valor | Órdenes | ¿Lo acepta la validación? |
| --- | --- | --- |
| **Entregado** | **15.813** | **No** |
| Pendiente entrega | 557 | Sí |
| Entregada | 1 | Sí |

La validación de `PUT /api/ventas/:id` acepta `['Pendiente entrega', 'En despacho', 'Entregada', 'Parcial']`. El dato real dice **"Entregado"**, en masculino.

El formulario lee el estado actual y lo reenvía al guardar. Resultado: editar cualquiera de esas 15.813 ventas responde **400**. Reproducido:

```
venta creada con estadoEntrega = Entregado
PUT reenviando ese mismo estado -> 400
{"error":"Invalid option: expected one of
  \"Pendiente entrega\"|\"En despacho\"|\"Entregada\"|\"Parcial\""}
```

Lo mismo en `estado_pago`: existen **"Rechazada Webpay" (17)** y **"Pendiente Webpay" (1)**, fuera del enum. A la inversa, `"Parcial"` y `"En despacho"` están permitidos y **nunca se usaron**.

### Cómo abordarlo — en tres pasos, no en uno

Una corrección anterior de este documento proponía un `UPDATE` directo sobre los 15.813 registros. **Eso es incorrecto como primer paso** y se corrige aquí.

1. **Ampliar la validación para aceptar los valores reales.** Desbloquea la edición de inmediato, no toca un solo dato y es reversible. Esfuerzo XS.
2. **Normalizar en API y UI**, de modo que cualquier grafía entrante se resuelva a la forma canónica al leer y al escribir, sin depender de que la base ya esté limpia. Esfuerzo S.
3. **Recién entonces migrar los datos**, con respaldo previo y registro de auditoría. Esfuerzo S.

**"Pendiente Webpay" y "Rechazada Webpay" no son errores ortográficos.** Describen estados reales del flujo de pago en línea y hay que decidir su forma canónica antes de tocarlos: si son estados de pago propiamente tales, si pertenecen a un campo aparte del ciclo Webpay, o si se mapean a "No pagada" perdiendo el matiz. Es una decisión de negocio, no de limpieza.

---

## 2. Módulos con código pero sin uso

Aquí las fichas dicen "Parcial" porque falta funcionalidad. El dato muestra que además **nadie los está usando**, lo que cambia la prioridad y el tipo de trabajo.

| Área | Lo que existe | Uso real | Lectura |
| --- | --- | --- | --- |
| **Recetas / insumos** | Tablas de recetas, materiales y procesos | **0 recetas, 0 materiales** sobre 37.162 productos | El Taller de Espuma pide "cálculo de insumos por OT"; no hay ni una receta cargada |
| **Bitácora de taller** | Tabla y pantalla | **3 registros** para 5.772 OT | Existe y el taller no la usa |
| **Evidencia fotográfica** | Tabla `taller_evidencias` | **0 registros** | La estructura ya existe y está vacía |
| **Facturación electrónica** | DTE tipos 33/34/52/61 | **28 documentos** | Marcha blanca. El DTE más grande tiene 14 ítems, así que la regla de máximo 20 no se puede validar con datos reales |
| **RRHH** | 37 trabajadores, 25 activos | **0 vinculados a un usuario** | La matriz de permisos por cargo no tiene de dónde colgarse |

---

## 3. Marketplace: el canal sí se usa, pero se registra mal

Una versión anterior de este documento afirmaba "Marketplace: 0 ventas" y recomendaba postergarlo. **Es una lectura equivocada y se corrige aquí.**

Lo correcto es: **0 ventas clasificadas como Marketplace**. Buscando el rastro del canal en el resto de las órdenes aparece lo siguiente:

| Rastro en observaciones | Órdenes | Tipo con que se registraron |
| --- | --- | --- |
| Falabella | 166 | Venta sala, Venta Web, Licitacion |
| Mercado Libre | 30 | Venta Web, Venta sala |
| Marketplace (literal) | 1 | |

Y el detalle es elocuente: de las 166 de Falabella, **138 están bajo un mismo cliente, "Romina Lillo"**, y 11 bajo un cliente cuyo nombre es literalmente **"félix olavarria VENTA FALABELLA)"**. Las de Mercado Libre se reparten entre "CONSUMIDOR FINAL" y personas naturales.

O sea: hay del orden de **196 operaciones de marketplace** que se registran como venta de sala o web, con el canal anotado en un campo libre o incrustado en el nombre del cliente. Ninguna usa `marketplace_canal` ni los campos de comisión, que están vacíos en las 16.371 órdenes.

**Esto sube la prioridad de CU-05, no la baja.** No es un canal inactivo cuyas reglas pueden esperar: es un canal activo cuya comisión no se está registrando, lo que significa que el margen de esas ventas está sobrestimado en los reportes.

---

## 4. Datos que responden preguntas abiertas de la revisión

### Adjudicación parcial: sí la necesitan

La ficha de Casos de Uso la marca como "decisión requerida". El dato la responde:

- 162.453 ítems de licitación
- 26.708 con cantidad adjudicada
- **221 con adjudicación parcial real** (adjudicado mayor que cero y menor que lo cotizado)

No es un caso teórico. Y confirma que es una **regresión**: `cotizacion_licitacion_items.cantAdjudicados` existe y tiene esos 221 casos, mientras que `crm_cotizacion_items` sólo tiene `cantidad`.

### Trato Directo: confirmado ausente

Cero en código y cero en datos. Las ventas de esa modalidad están hoy dentro de los 2.618 de Convenio Marco, sin señal en los datos que permita separarlas después.

### Grafías duplicadas en tipo de venta

| Grafía | Órdenes |
| --- | --- |
| Venta sala | 4.909 |
| Venta Sala | 7 |
| Licitacion | 2.648 |
| Licitación | 5 |
| Test | 2 |

Todo reporte que agrupe por tipo las cuenta como categorías distintas.

---

## 5. Cobertura de datos por área

| Área | Registros | Cobertura del dato clave |
| --- | --- | --- |
| Ventas | 16.371 órdenes | Completa |
| Cobranza | 864 órdenes con deuda | Completa |
| CRM | 33.934 oportunidades | Completa. Sin gestiones humanas registradas |
| Clientes | 16.645 | Tipo: 97%. **Segmento: 0% útil**, los 16.645 en "C" |
| Bodega | 37.162 productos, 479 ubicaciones | **Ubicación asignada: 2.430 productos (6,5%)** |
| Taller | 5.772 OT | Pendiente 5.123 (88,8%), Listo 647, Asignada 2 |
| Facturación | 28 DTE | Marcha blanca |
| RRHH | 37 trabajadores | Sin vínculo a usuarios |

**Bodega, 6,5% de productos ubicados.** La nomenclatura de 5 campos está bien aplicada en las 479 ubicaciones creadas; el problema es la asignación pendiente de 34.732 productos.

**Taller, 88,8% en Pendiente.** O las OT no se cierran en el sistema, o el estado no refleja la realidad del taller. Cualquiera de las dos invalida los reportes de avance que pide Gerencia.

---

## 6. Priorización por tipo de acción

Buena parte de lo que el levantamiento pide como "desarrollo" no lo es. Separarlo cambia quién hace el trabajo y cuánto demora.

Escala de esfuerzo: **XS** menos de un día · **S** 1 a 3 días · **M** 1 a 2 semanas · **L** más de 2 semanas.

### Corrección de código

| Brecha | Esfuerzo | Nota |
| --- | --- | --- |
| Ampliar enum de estados a los valores reales | XS | Defecto activo, afecta al 96,6% de las ventas |
| Normalizar estados en API y UI | S | Paso 2 del plan de estados |
| Cliente opcional en boleta (CU-01) | S | Condicionar la validación al tipo de documento |
| Trato Directo como tipo (CU-04) | S | Tipo, validación de referencia y filtro de reportes |
| Referencia externa y comisión en Marketplace (CU-05) | S | Sube de prioridad: hay ~196 operaciones sin comisión registrada |

### Normalización y migración de datos

| Brecha | Esfuerzo | Nota |
| --- | --- | --- |
| Unificar grafías de tipo de venta | XS | Mismo patrón aplicado en comuna y región |
| Migrar estados históricos | S | Sólo después de los pasos 1 y 2 |
| Decidir estado canónico de los Webpay | — | Decisión de negocio previa a cualquier migración |
| Reclasificar las ~196 ventas de marketplace | S | Requiere criterio de negocio para identificarlas |

### Carga y adopción

Trabajo del cliente, no de desarrollo. Sin esto, lo que se programe encima no cambia nada para el usuario.

| Brecha | Esfuerzo | Nota |
| --- | --- | --- |
| Cargar recetas de producto | L | Levantamiento con el taller. Hoy hay 0 |
| Asignar ubicación a 34.732 productos | M | Trabajo de bodega |
| Vincular 25 fichas RRHH a usuarios | XS | Prerrequisito de los permisos por cargo |
| Adopción de bitácora y evidencia en taller | — | Entender primero por qué no se usan |

### Desarrollo funcional

| Brecha | Esfuerzo | Nota |
| --- | --- | --- |
| Adjudicación parcial por línea en CRM | **M alto / L acotado** | Dato por línea, interfaz, validaciones, conversión parcial a venta, actualización de la venta y trazabilidad histórica. Es recuperar lo que el módulo antiguo hacía |
| Alertas de cobranza 15/5/0 | M | Requiere definir antes el modelo de compromiso de pago |
| Versionado de cotización (CU-06) | M | |
| Flujo único de estados de venta | L | Máquina de estados, migración y ajuste de todos los módulos que leen estado |
| Motor de alertas con escalamiento | L | Responsables, vencimiento, bitácora |
| Inventario disponible/reservado/dañado | L | Modelo nuevo, no sólo pantalla |
| Consumo de insumos por OT | L | Depende de que existan recetas |

---

## 7. Qué haría primero

1. **Ampliar el enum de estados** (XS, corrección de código). Es un defecto activo que bloquea la edición de casi todas las ventas.
2. **Unificar grafías de tipo de venta** (XS, datos). Barato y desbloquea cualquier reporte por tipo.
3. **Vincular las fichas de RRHH a usuarios** (XS, carga). Desbloquea permisos por cargo y la asignación de cartera comercial.
4. **Cliente opcional en boleta y Trato Directo** (S cada uno, código). Las dos brechas de Ventas con menor costo y efecto diario.
5. **Marketplace** (S, código + datos). Deja de ser postergable: hay ~196 operaciones cuyo margen está sobrestimado.
6. **Decidir adjudicación parcial** (M alto). Los 221 casos confirman que se necesita, y hasta que exista el módulo antiguo no se puede retirar del todo.
7. **Recién después, lo estructural**: flujo de estados y motor de alertas.

**Lo que sí postergaría:** todo lo que dependa de recetas, hasta que se carguen. Mejorar el cálculo de insumos sobre una tabla vacía no cambia nada para el taller.

---

## 8. Anexo — Consultas usadas

Reproducibles sobre `plastimar_erp`. Ninguna expone datos personales.

```sql
-- Estados reales de la venta
select estado_entrega, count(*) from ventas.ordenes group by 1 order by 2 desc;
select estado_pago,    count(*) from ventas.ordenes group by 1 order by 2 desc;
select estado,         count(*) from ventas.ordenes group by 1 order by 2 desc;

-- Tipos de venta y sus grafías
select tipo, count(*) from ventas.ordenes where not eliminada group by 1 order by 2 desc;

-- Marketplace: campos propios vs rastro en texto libre
select count(*) from ventas.ordenes
 where marketplace_canal is not null or marketplace_comision_pct is not null;
select tipo, count(*) from ventas.ordenes
 where observaciones ~* 'mercado ?libre|mercadolibre|falabella|ripley|marketplace'
 group by 1 order by 2 desc;

-- Adjudicación parcial
select count(*) filter (where cant_adjudicados > 0)                              as con_adjudicado,
       count(*) filter (where cant_adjudicados > 0 and cant_adjudicados < cantidad) as parcial
  from ventas.cotizacion_licitacion_items;

-- Facturación: volumen y tamaño de los DTE
select tipo_dte, estado, count(*) from facturacion.documentos group by 1,2 order by 3 desc;
select max(jsonb_array_length(items)) as max_items,
       count(*) filter (where jsonb_array_length(items) > 20) as sobre_20
  from facturacion.documentos where jsonb_typeof(items) = 'array';

-- Taller: volumen, estados y uso de bitácora y evidencias
select estado, count(*) from taller.odts group by 1 order by 2 desc;
select (select count(*) from taller.bitacora_taller)   as bitacora,
       (select count(*) from taller.taller_evidencias) as evidencias,
       (select count(*) from taller.producto_recetas)  as recetas,
       (select count(*) from taller.receta_materiales) as materiales;

-- Bodega: cobertura de ubicaciones
select count(*) as productos, count(ubicacion_id) as con_ubicacion from catalogo.productos;
select count(*) from catalogo.ubicaciones;

-- Clientes y RRHH
select coalesce(tipo,'(sin tipo)'), count(*) from clientes.clientes group by 1 order by 2 desc;
select segmento, count(*) from clientes.clientes group by 1;
select count(*) as trabajadores, count(*) filter (where estado) as activos,
       count(usuario_id) as con_usuario from rrhh.trabajadores;

-- Cobranza
select count(*) from ventas.ordenes where estado_pago <> 'Pagada' and not eliminada;
```

---

## 9. Advertencia sobre los criterios de aceptación

Las fichas proponen criterios correctos pero no dicen contra qué ambiente se ejecutan. Deben correrse contra la base local de docker-compose (**puerto 55432**), nunca contra el túnel de producción (55433), porque varios implican crear ventas, cerrar OT y emitir documentos.

Varios de esos criterios pueden ser pruebas automatizadas en vez de manuales, como ya se hizo con el flujo de cotizaciones del CRM y con los cuatro casos de reglas de descuento.
