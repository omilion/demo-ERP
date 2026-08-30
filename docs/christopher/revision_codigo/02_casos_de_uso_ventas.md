# Casos de uso de ventas

Fuente: `C_Casos_de_Uso_Ventas_Plastimar_18-08-2026.docx`.

## Resultado general

Los seis flujos están representados en el ERP, pero sólo Venta Web y los DTE tienen reglas de validación relativamente maduras. Venta Sala, Marketplace, Trato Directo y la adjudicación parcial requieren cierre funcional.

## CU-01 — Venta Sala

**Estado: Parcial.** Existe Nueva Venta, cálculo de ítems, descuentos, pagos y emisión posterior de DTE. Sin embargo, `VentasFormPage` exige cliente para una venta nueva, mientras que el caso de uso permite boleta sin cliente y exige identificación sólo para factura. Tampoco hay una interfaz simplificada específica para ventas bajo $100.000.

**Para aprobar:** permitir venta anónima únicamente para boleta; exigir RUT/razón social/correo al escoger factura; definir si el umbral de $100.000 cambia campos o sólo experiencia visual; probar que no se duplica una venta ante reintento.

## CU-02 — Venta Web

**Estado: Parcial alto.** OC Online/Venta Web, confirmaciones de pago y la separación de órdenes están presentes. El dominio CRM contempla confirmación `WEBPAY` o `PAGO`.

**Para aprobar:** prueba integrada de Webpay rechazado, transferencia pendiente, pago confirmado y diferencia de monto. Debe demostrarse que una orden pendiente no se convierte en venta confirmada y que el total persistido es el monto realmente cobrado.

## CU-03 — Licitación y Compra Ágil

**Estado: Parcial alto.** CRM es la entrada de nuevas licitaciones y compras ágiles; captura ID, fecha, productos, despacho y observaciones, y una oportunidad aprobada crea la venta en Matriz. La entrada independiente antigua fue retirada del menú y se conserva sólo para historial.

**Brecha crítica:** el caso exige convertir parcial o totalmente según cantidades adjudicadas. La cotización CRM actual aprueba el conjunto de ítems; no modela `cantidad adjudicada` por línea. También debe confirmarse la regularización de una OC llegada antes de la cotización.

## CU-04 — Convenio Marco y Trato Directo

**Estado: Parcial.** Convenio Marco está clasificado, solicita OC y aparece en Matriz. Trato Directo no está en el catálogo actual de tipos, por lo que no puede mantener la separación ni reporte solicitados.

**Para aprobar:** agregar Trato Directo como tipo, sus validaciones de referencia y filtro de reportes; confirmar umbrales de aprobación y documentos obligatorios para cada canal.

## CU-05 — Marketplace

**Estado: Parcial.** Se registra canal Marketplace y campos de comisión. 

**Para aprobar:** exigir origen y referencia externa; definir si el total se ingresa ya neto o se calcula desde bruto menos comisión; impedir cierre si el total no cuadra con el comprobante del marketplace; auditar cambios de precio/código.

## CU-06 — Cotización Web cliente particular

**Estado: Parcial alto.** CRM conserva cotización comercial, ítems, gestión y conversión a venta. La cotización puede editarse vinculada a la oportunidad sin duplicarla.

**Para aprobar:** versionar propuesta original y cambios posteriores, registrar aceptación del cliente y asegurar que la conversión mantenga referencia, ítems, valores y documentos.

## Inconsistencia a resolver

El documento indica que Compra Ágil se gestiona sólo en SisGestión, pero la decisión vigente es crearla desde CRM. Debe actualizarse el caso de uso; de otro modo una prueba de auditoría mediría un flujo ya sustituido.

---

## Datos de producción (26-08-2026)

| Dato | Valor | Qué cambia |
|---|---|---|
| Órdenes por tipo | Venta Web 6.119 · Venta sala 4.909 · Licitacion 2.648 · Convenio Marco 2.618 · Normal 60 | Grafías duplicadas: "Venta sala"/"Venta Sala" (4.909 vs 7) y "Licitacion"/"Licitación" (2.648 vs 5). Todo reporte por tipo las cuenta separado |
| **Marketplace** | **0 ventas clasificadas como tal**, pero ~196 con rastro del canal | Falabella 166 (138 bajo un mismo cliente, 11 bajo uno llamado "VENTA FALABELLA") y Mercado Libre 30, registradas como Venta sala o Venta Web. Los campos de comisión están vacíos en las 16.371 órdenes |
| **Trato Directo** | **0 en código y 0 en datos** | Las ventas de esa modalidad están hoy dentro de los 2.618 de Convenio Marco, sin forma de separarlas después |
| **Adjudicación parcial** | **221 casos reales** de 26.708 ítems adjudicados | Responde la decisión abierta: **sí se necesita**. Y confirma que es una regresión: `cotizacion_licitacion_items.cantAdjudicados` la modela, `crm_cotizacion_items` no |
| Estados de venta | 15.813 con `estado_entrega = "Entregado"` | Ese valor no está en el enum de validación. Editar esas ventas devuelve 400 |

**Corrección a CU-05:** el canal **sí se usa**, y eso sube su prioridad en vez de bajarla. Hay del orden de 196 operaciones registradas fuera del tipo Marketplace, con el canal anotado en observaciones o incrustado en el nombre del cliente, y sin comisión registrada. El margen de esas ventas está sobrestimado en los reportes.

> Medido con consultas de sólo lectura sobre la base productiva. Detalle transversal en [00_datos_y_esfuerzo.md](00_datos_y_esfuerzo.md).

---

## Avance del 28-08-2026

Trabajo aplicado sobre el código, con las cifras medidas contra una copia local de producción.

### CU-04 — Trato Directo y Compra Ágil: resueltos en el catálogo

Ambos tipos ya existen y son seleccionables, filtrables y reportables.

Al implementarlo aparecieron **tres defectos que la revisión no había detectado**:

1. **Compra Ágil se ofrecía al editar una venta pero el backend la rechazaba.** El selector la incluye desde hace tiempo; la validación no. Guardar devolvía 400.
2. **El CRM no mapeaba el canal `COMPRA_AGIL` a ningún tipo de orden.** Una oportunidad de compra ágil ganada se habría guardado como `Normal`, quedando además contada como venta de mostrador en los reportes. Es un defecto **latente**: hoy el CRM no tiene ninguna oportunidad de ese canal ni ninguna cerrada como ganada, así que no alcanzó a producir datos malos. Habría aparecido la primera vez que se ganara una compra ágil.
3. **El mapa inverso, al crear la venta desde una oportunidad, tenía una entrada muerta** (`CONVENIO_MARCO`, que no es un canal del CRM) y le faltaban las dos vivas. Crear la venta desde una oportunidad de compra ágil respondía siempre 400.

Queda pendiente, y es **decisión de Plastimar**: las ventas de Trato Directo ya registradas viven dentro de los 2.618 de Convenio Marco y no hay criterio automático para separarlas. El tipo permite distinguirlas de aquí en adelante.

### Grafías: el filtro de Licitación devolvía el 0,2%

Cinco módulos definían por su cuenta qué grafías cuentan como cada tipo, con conjuntos distintos, de modo que **el mismo filtro entregaba totales distintos según la pantalla**. Además varios nombraban una sola grafía.

| Filtro | Antes devolvía | Ahora | Diferencia |
|---|---|---|---|
| Ventas · Licitación | 5 | 2.653 | **+2.648** |
| Comisiones · Licitación | 5 | 2.653 | **+2.648** |
| Convenio Marco | 2.618 | 2.618 | sin cambio (no hay variante en los datos) |

El caso de comisiones importa aparte porque **afecta pagos**: el reporte contemplaba el mojibake pero no la grafía sin tilde, que es la mayoritaria.

Se centralizaron las grafías en un catálogo único y se agregó un resolvedor de slugs, de modo que un tipo nuevo trae filtro que funciona desde el primer día. Antes, un filtro por un tipo no contemplado devolvía **todas** las ventas en Matriz (la consulta quedaba sin filtro) o **ninguna** en Reportes (se comparaba contra el slug crudo).

**Decisión pendiente de negocio:** si `Normal` debe contar como venta de sala. Se unificó incluyéndola —es la mayoritaria y es como el legacy grababa el mostrador—, pero está en un solo lugar: si Plastimar dice que no, se saca de ahí y las cinco pantallas se corrigen juntas.

### CU-05 — Marketplace: la comisión es recuperable

Se agregó la **referencia externa** obligatoria (N° de orden del portal), que es lo que CU-05 exige para poder conciliar contra el comprobante.

Y al medir apareció algo que cambia el pronóstico: **la liquidación del portal quedó escrita en las observaciones**, con este formato:

> *"Falabella pagó $5.044 por esta venta. Resumen: Venta total $8.850, se le resta $2.390 por cofinanciamiento logístico y $1.416 comisión por venta."*

La aritmética cuadra exacto, así que **la comisión histórica se puede recuperar sin pedirle nada a nadie**. El script `backend/scripts/reclasificar-marketplace.mjs` (dry-run por defecto) clasifica en dos niveles:

| Nivel | Órdenes | Criterio |
|---|---|---|
| **Alta** | **132** | Trae la liquidación del portal y la aritmética verifica |
| Alta, aritmética no cuadra | 10 | Se omiten: el parseo entendió mal |
| **Media** | **118** | El cliente se llama como el canal, o la observación dice "VENTA MERCADO LIBRE", "COMISION FALABELLA", "LIQUIDACION FALABELLA N° 85276787" |
| Descartadas | 16 | Sólo mención del nombre; quedan para revisión manual |

Montos recuperables del nivel alta:

| Canal | Órdenes | Comisión | Cofinanciamiento logístico | Venta total |
|---|---|---|---|---|
| Falabella | 112 | $675.595 | $682.710 | $4.239.463 |
| París | 20 | $62.083 | $96.650 | $361.908 |

**Corrección a la cifra anterior de esta ficha:** eran ~196 operaciones porque el conteo original omitió **París** (45 órdenes) y usó un patrón más estrecho para Falabella. El total con rastro es **276**, de las cuales 250 se identifican con confianza.

**Dos cosas que el script no hace a propósito.** No inventa la comisión donde no está escrita —un valor supuesto parecería un dato medido—, y no inventa la referencia externa, que no está en la base y sale de los comprobantes del portal.

**Decisión pendiente:** el modelo tiene un solo campo de comisión, pero el portal descuenta **dos** conceptos: comisión por venta y cofinanciamiento logístico. Se graba la comisión por venta, que es lo que el campo declara, y el cofinanciamiento queda anotado en observaciones. Si Plastimar necesita separarlo para el margen, requiere campo propio.

### CU-03 — Adjudicación parcial: resuelta

La venta ahora se crea por lo **adjudicado**, no por lo cotizado. Antes, aprobar una adjudicación parcial generaba una venta por el total cotizado — se facturaba de más.

Fue más barato de lo estimado porque **las tablas de cotización del CRM están vacías**: las 18.528 cotizaciones viven en la tabla legacy, así que no hubo datos que migrar y el cambio es puramente hacia adelante.

El modelo distingue tres situaciones, que el `default 0` del legacy no permitía separar:

| Valor | Significado | Al aprobar |
|---|---|---|
| `null` | Adjudicación no registrada | Se vende la cantidad cotizada |
| `0` | La línea no fue adjudicada | No pasa a la venta |
| `N` | Adjudicación parcial o total | Se venden N |

Con el `0` por defecto no se puede distinguir "todavía no registro la adjudicación" de "no me adjudicaron nada", y llevan a ventas distintas.

Incluye restricción en base de datos (`cantAdjudicados <= cantidad`): el legacy tiene una fila que lo incumple, señal de que sin restricción ocurre. Si ninguna línea queda adjudicada, aprobar falla en vez de crear una venta vacía.

El espejo hacia la tabla legacy conserva **ambas** cifras —cotizada y adjudicada—, de modo que la parcialidad no se pierde al sincronizar.

### CU-06 — Versionado y aceptación: resuelto

El problema de fondo no era que faltara una pantalla: **editar una cotización hacía `deleteMany` + `create` sobre los ítems**, de modo que la propuesta anterior se destruía. No había forma de saber qué se le había ofrecido al cliente ni qué fue lo que aceptó.

Ahora, antes de sobrescribir, la propuesta vigente se archiva como versión inmutable —ítems, descuento y monto de despacho— con su total, quién la cambió, cuándo y por qué.

**La aceptación se registra contra una versión**, no sólo contra la cotización. Eso es lo que da valor al versionado: si después se edita, el sistema avisa que *el cliente aceptó la versión 2 y la vigente es la 3*. Sin fijar la versión, una edición posterior a la aceptación pasa inadvertida.

Se registra quién aceptó, por qué vía (orden de compra, correo, portal, verbal, otro) y con qué referencia. La vía está restringida en la base: si queda como texto libre, termina como el campo de ejecutiva, imposible de reportar. Y cuando la vía tiene respaldo documental —orden de compra o correo— la referencia es obligatoria; una aceptación verbal no tiene documento que exigir.


---

### CU-02 — Venta Web: verificado

Lo que la ficha pedía demostrar era esto: *que una orden pendiente no se convierte en venta confirmada y que el total persistido es el monto realmente cobrado*.

**Una orden pendiente no es una venta.** `Pendiente Webpay` y `Rechazada Webpay` tienen estado propio y ninguno es terminal. Y el rechazo pesa más que la entrega: si el pago se cayó, que la mercadería haya salido no cierra la venta — la convierte en un problema que alguien tiene que ver.

Los dos estados se conservan al normalizar. Aplastarlos a `No pagada` perdería la distinción entre *está esperando* y *se cayó el pago*, que llevan a acciones distintas.

**El total es lo cobrado, no lo vendido.** Un cobro menor deja la venta parcial aunque el portal haya confirmado la transacción; un cobro mayor no genera saldo negativo; y una venta en cero no cuenta como pagada — marcarla así la haría desaparecer de cobranza.

13 casos en `cu02-venta-web-pago.test.js`.

---

### CU-01 — Boleta sin cliente: resuelto en facturación

Lo cerró Sebastián con una restricción que permite `cliente_id` nulo sólo cuando el tipo es Venta Sala; los demás tipos siguen obligados a vincular cliente.

---

### Estado de la ficha

Los seis casos de uso están cerrados o verificados.

