# Temas pendientes para reunión con cliente — CRM comercial

## 1. Semáforo y vencimientos de cartera importada

### Situación observada

La cartera importada desde OC Online muestra una gran cantidad de registros como **VENCIDO**. No significa necesariamente que el equipo haya incumplido una gestión en el CRM nuevo: el cálculo actual toma como referencia las fechas históricas disponibles (cotización, última acción o próximo contacto) y muchas ya son anteriores a la fecha actual.

El origen importado no entrega, para todos los casos, una fecha confiable de última gestión comercial ni un próximo contacto vigente.

### Decisión que debe tomar el cliente

Definir la política para registros importados que no tienen una gestión ni compromiso de seguimiento confiable:

- ¿Deben quedar excluidos del semáforo hasta que una persona responsable los revise o tome?
- ¿Al asignar responsable se debe exigir una fecha de próximo contacto?
- ¿Quién y bajo qué criterio debe cerrar, perder o reactivar los registros heredados?
- ¿Qué fecha debe iniciar el semáforo: importación, asignación, última gestión válida o próximo contacto?
- ¿Cuánto tiempo corresponde a cada estado de alerta (normal, alerta y vencido) para cada tipo de venta?

### Principio propuesto

No declarar vencido un registro importado solo por su antigüedad si no existe un dato de seguimiento confiable. La responsabilidad y la fecha de seguimiento deben quedar asignadas explícitamente por el equipo comercial.

## 2. Canales que entran al CRM y origen de la cotización

### Hallazgos verificados en el sistema actual

La pantalla **Nueva venta** ya maneja estos tipos de orden:

| Tipo de venta | Flujo actual | Particularidades verificadas | Propuesta inicial para CRM |
| --- | --- | --- | --- |
| Venta Sala | Nueva venta directa | Cierre inmediato en tienda; precio normal. | **Excluir del CRM**: decisión ya indicada por el equipo. |
| Venta Web | OC Online / Venta Web y Nueva venta | La OC Online tiene productos y se puede procesar como una Venta Web con cliente ERP. | Incluir; requiere seguimiento hasta ganar/perder. |
| Licitación | Módulo propio de Licitaciones | Tiene formulario propio, ficha técnica/económica, ítems, plazos, adjudicación y luego crea la venta. | Incluir, pero el CRM debe abrir/usar este flujo específico, no una cotización genérica. |
| Convenio Marco | Nueva venta | Exige N° OC único y usa precios de Convenio Marco más IVA. | Incluir; debe reutilizar exactamente esas validaciones y precios. |
| Marketplace | Nueva venta | Pide canal de marketplace: París, Mercado Libre o Falabella; conserva reglas de comisión. | **Excluir del CRM**: venta operativa, sin pipeline comercial. |
| Normal | Soportado por backend y ventas existentes | No aparece como alternativa inicial en Nueva venta, pero existen órdenes de este tipo. | Decisión pendiente: definir si representa venta telefónica/directa u otro flujo que requiera CRM. |
| Telefónica | Aparece como canal en OC Online | Existe como dato de canal importado, pero no como tipo propio en Nueva venta. | Decisión pendiente: confirmar su proceso y si debe tener formulario/cotización propia. |

### Inconsistencia actual que no se debe perpetuar

El CRM hoy ofrece los canales `WEB`, `SALA`, `LICITACION` y `OTRO`, y tipos `COMPRA_AGIL`, `PUBLICA`, `PRIVADA` y `OTRA`. Estos catálogos **no son el mismo contrato** que los tipos reales de venta del ERP; por eso no sirven todavía para crear una cotización válida de cada canal.

### Regla de arquitectura propuesta

El CRM debe ser la oportunidad y seguimiento; la cotización/venta debe ser el flujo comercial real del ERP. Al crear o convertir una oportunidad, se debe abrir el formato gemelo correspondiente:

- Web: flujo OC Online / Venta Web, con sus productos y cliente ERP.
- Licitación: módulo de Licitaciones, con sus identificadores, plazos, ítems y adjudicación.
- Convenio Marco: Nueva venta con N° OC obligatorio, validación de unicidad y precio de marco.
- Telefónica: solo después de que el cliente confirme que es una oportunidad de seguimiento y sus reglas.

La oportunidad CRM debe conservar el vínculo al resultado comercial mediante `ordenId`. Un cierre GANADO del pipeline vivo debe vincular la orden creada por ese formato; no debe crear una orden genérica sin ítems. Los registros históricos importados siguen excluidos de creación automática de órdenes.

### Decisiones requeridas del cliente

1. Confirmar qué tipos ingresan al CRM: Web, Licitación, Convenio Marco, Telefónica, Normal u otros. Marketplace queda excluido.
2. Confirmar que Venta Sala queda definitivamente fuera del CRM.
3. Para cada tipo incluido, definir el evento que lo crea en CRM y el evento que permite marcarlo como GANADO.
4. Definir si Telefónica requiere cotización y seguimiento o es una venta operativa/directa. Normal queda anotado hasta identificar su significado comercial.
5. Confirmar si existe un flujo de Compra Ágil separado; hoy figura en el CRM, pero no como tipo de Nueva venta.
