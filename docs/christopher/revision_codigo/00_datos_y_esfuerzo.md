# Revisión de datos y esfuerzo

Complemento a las 12 fichas de revisión. Aquellas contrastan el levantamiento contra el **código**; ésta lo contrasta contra los **datos reales de producción** y estima el **esfuerzo** de cerrar cada brecha.

La distinción importa: un módulo puede estar correctamente implementado y ser inútil porque nadie llenó los campos. Y al revés, una brecha que parece grande puede resolverse en horas.

Todas las cifras salen de consultas de sólo lectura contra producción el 26-08-2026.

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

El formulario de venta lee el estado actual y lo reenvía al guardar. Resultado: al editar cualquiera de esas 15.813 ventas, el servidor responde **400**. Reproducido:

```
venta creada con estadoEntrega = Entregado
PUT reenviando ese mismo estado -> 400
{"error":"Invalid option: expected one of
  \"Pendiente entrega\"|\"En despacho\"|\"Entregada\"|\"Parcial\""}
```

Lo mismo ocurre en `estado_pago`: existen **"Rechazada Webpay" (17)** y **"Pendiente Webpay" (1)**, que tampoco están en el enum. Y a la inversa, `"Parcial"` y `"En despacho"` están permitidos pero **nunca se usaron**.

Esto refuerza el bloqueo #1 de la revisión —formalizar el flujo de estados— con evidencia dura: el problema no es sólo que los estados estén repartidos en tres campos, es que **la validación y los datos no hablan el mismo idioma**.

**Esfuerzo: XS.** Alinear el enum con los valores reales y decidir la grafía canónica. La normalización de los 15.813 registros es un `UPDATE` acotado.

---

## 2. Módulos con código pero sin uso

Aquí las fichas dicen "Parcial" porque falta funcionalidad. El dato muestra que además **nadie los está usando**, lo que cambia la prioridad.

| Área | Lo que existe | Uso real | Lectura |
| --- | --- | --- | --- |
| **Marketplace** | Canal y campos de comisión en el modelo | **0 ventas** | Nunca se usó. Cerrar las brechas del CU-05 no tiene urgencia hasta que exista la primera operación |
| **Recetas / insumos** | Tablas de recetas, materiales y procesos | **0 recetas, 0 materiales** sobre 37.162 productos | El Taller de Espuma pide "cálculo de insumos por OT"; hoy no hay ni una receta cargada. La funcionalidad sin datos no sirve |
| **Bitácora de taller** | Tabla y pantalla | **3 registros** para 5.772 ODT | Existe pero el taller no la usa. Antes de mejorarla hay que entender por qué |
| **Evidencia fotográfica** | Tabla `taller_evidencias` | **0 registros** | El Taller de Confección la pide como brecha; la tabla ya existe y está vacía |
| **Facturación electrónica** | DTE completo, tipos 33/34/52/61 | **28 documentos** en total | El módulo funciona pero está en marcha blanca. La regla de máximo 20 ítems no se puede validar: el DTE más grande tiene 14 |
| **RRHH** | 37 trabajadores, 25 activos | **0 vinculados a un usuario** | La matriz de permisos ligada al cargo que pide el levantamiento no tiene de dónde colgarse |

---

## 3. Datos que responden preguntas abiertas de la revisión

### Adjudicación parcial: sí la necesitan

La ficha de Casos de Uso la marca como "decisión requerida" — si Plastimar la necesita, hay que implementarla. El dato la responde:

- 162.453 ítems de licitación
- 26.708 con cantidad adjudicada
- **221 con adjudicación parcial real** (adjudicado > 0 y menor que lo cotizado)

No es un caso teórico: ocurre. Y refuerza que es una **regresión**, no una brecha nueva — `cotizacion_licitacion_items.cantAdjudicados` existe y tiene esos 221 casos, mientras que `crm_cotizacion_items` sólo tiene `cantidad`.

### Trato Directo: confirmado ausente

Cero coincidencias en código y cero en datos. No es que esté mal clasificado: no existe.

### Grafías duplicadas en tipo de venta

| Grafía | Órdenes |
| --- | --- |
| Venta sala | 4.909 |
| Venta Sala | 7 |
| Licitacion | 2.648 |
| Licitación | 5 |
| Test | 2 |

Cualquier reporte que agrupe por tipo cuenta estos como categorías distintas. Es el mismo patrón que corregimos en comuna y región.

**Esfuerzo: XS.**

---

## 4. Cobertura de datos por área

| Área | Registros | Cobertura del dato clave |
| --- | --- | --- |
| Ventas | 16.371 órdenes | Completa |
| Cobranza | 864 órdenes con deuda | Completa |
| CRM | 33.934 oportunidades | Completa. Sin gestiones humanas registradas |
| Clientes | 16.645 | Tipo: 97% (recién clasificado). **Segmento: 0% útil**, los 16.645 en "C" |
| Bodega | 37.162 productos, 479 ubicaciones | **Ubicación asignada: 2.430 productos (6,5%)** |
| Taller | 5.772 ODT | Estados: Pendiente 5.123 (88,8%), Listo 647, Asignada 2 |
| Facturación | 28 DTE | Marcha blanca |
| RRHH | 37 trabajadores | Sin vínculo a usuarios |

Dos cifras merecen atención:

**Bodega, 6,5% de productos ubicados.** El levantamiento pide tablero de inventario por ubicación y lectura obligatoria de código de barra. Con 34.732 productos sin ubicación asignada, ese tablero nace vacío. La nomenclatura estructurada existe y está bien aplicada en las 479 ubicaciones creadas; el problema es la asignación masiva.

**Taller, 88,8% en Pendiente.** O las ODT no se están cerrando en el sistema, o el estado no refleja la realidad del taller. Cualquiera de las dos invalida los reportes de avance que pide Gerencia.

---

## 5. Esfuerzo estimado por brecha

Escala: **XS** menos de un día · **S** 1 a 3 días · **M** 1 a 2 semanas · **L** más de 2 semanas.

| Brecha | Origen | Esfuerzo | Nota |
| --- | --- | --- | --- |
| Alinear enum de estados con los datos | Este documento | XS | Defecto activo, afecta al 96,6% de las ventas |
| Unificar grafías de tipo de venta | Este documento | XS | Script, mismo patrón que comuna/región |
| Trato Directo como tipo | CU-04 | S | Tipo, validación de referencia y filtro de reportes |
| Cliente opcional en boleta | CU-01 | S | Condicionar la validación al tipo de documento |
| Referencia externa en Marketplace | CU-05 | S | Sin urgencia: 0 ventas |
| Adjudicación parcial por línea | CU-03 | M | Campo, UI, conversión parcial a venta. Es recuperar lo que el módulo antiguo hacía |
| Alertas de cobranza 15/5/0 | Cobranza | M | Requiere definir antes el modelo de compromiso de pago |
| Versionado de cotización | CU-06 | M | |
| Flujo único de estados de venta | Gerencia | L | Máquina de estados, migración de datos y ajuste de todos los módulos que leen estado |
| Motor de alertas con escalamiento | Gerencia | L | Responsables, vencimiento, bitácora |
| Inventario disponible/reservado/dañado | Bodega 2 | L | Modelo nuevo, no sólo pantalla |
| Consumo de insumos por OT | Taller Espuma | L | Depende de cargar recetas primero: hoy hay 0 |

---

## 6. Qué haría primero

El orden que sugieren estos datos difiere del de las fichas, porque incorpora costo y uso real:

1. **Alinear el enum de estados** (XS). Es un defecto activo que bloquea la edición de casi todas las ventas. No es una brecha del levantamiento, es algo roto hoy.
2. **Unificar grafías de tipo de venta** (XS). Barato y desbloquea cualquier reporte por tipo.
3. **Cliente opcional en boleta y Trato Directo** (S cada uno). Son las dos brechas de Ventas con menor costo y efecto directo en la operación diaria.
4. **Decidir adjudicación parcial** (M). Los 221 casos confirman que se necesita; y mientras no exista, el módulo antiguo no se puede retirar del todo.
5. **Recién después, lo estructural**: flujo de estados y motor de alertas, que son los dos L y conviene abordarlos con el diseño ya acordado con el cliente.

**Lo que postergaría:** Marketplace, hasta que exista la primera venta. Y todo lo que dependa de recetas, hasta que se carguen: mejorar el cálculo de insumos sobre una tabla vacía no cambia nada para el taller.

---

## 7. Advertencia sobre los criterios de aceptación

Las fichas proponen criterios correctos pero no dicen contra qué ambiente se ejecutan. Deben correrse contra la base local de docker-compose (**puerto 55432**), nunca contra el túnel de producción (55433), porque varios implican crear ventas, cerrar ODT y emitir documentos.

Varios de esos criterios pueden ser pruebas automatizadas en vez de manuales, como ya se hizo con el flujo de cotizaciones del CRM y con los cuatro casos de reglas de descuento.
