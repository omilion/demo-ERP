# Plan de desarrollo — CRM comercial

## Objetivo

Convertir el CRM en el lugar de seguimiento de oportunidades comerciales reales, conectado al flujo de cotización y venta correspondiente de Plastimar, sin mezclar ventas inmediatas, datos históricos ni órdenes operativas sin contexto.

## Alcance acordado

### Entra al CRM

- Venta Web.
- Licitación.
- Convenio Marco.

### Queda fuera del CRM

- Venta Sala: se crea y cierra directamente en tienda.
- Marketplace: es operación de venta, no pipeline comercial.

### Pendiente de definición del cliente

- Qué representa `Normal` en las ventas existentes.
- Si Telefónica requiere cotización y seguimiento o es una venta directa.
- Si Compra Ágil tendrá un flujo de CRM propio.
- La política de semáforo para registros históricos/importados sin una fecha confiable de gestión.

---

## Fase 0 — Validación con cliente (bloqueante)

1. Acordar la política de cartera importada:
   - qué registros se consideran gestionables;
   - quién será responsable de clasificarlos;
   - qué evento inicia el semáforo;
   - cuándo corresponde cerrar, perder o reactivar.
2. Confirmar las definiciones pendientes para Normal, Telefónica y Compra Ágil.
3. Definir, para cada canal incluido, el evento que permite marcar una oportunidad como GANADA:
   - Venta Web;
   - Licitación;
   - Convenio Marco.
4. Acordar los motivos de pérdida y los datos mínimos para crear una oportunidad.

**Entregable:** acta de decisiones y matriz de canales aprobada.

---

## Fase 1 — Contrato único de canales y flujos

1. Reemplazar los catálogos genéricos actuales del CRM por un contrato comercial único.
2. Definir para cada canal:
   - etiqueta visible;
   - formulario de cotización de origen;
   - campos obligatorios;
   - precios aplicables;
   - condiciones de avance y cierre;
   - entidad ERP que genera;
   - vínculo esperado hacia `ordenId`.
3. Eliminar Venta Sala y Marketplace de los selectores, filtros, creación y automatizaciones del CRM.
4. Mantener compatibilidad de lectura para datos ya importados que tengan esos valores, sin permitir crear nuevos casos de esos canales.

**Criterio de aceptación:** no es posible crear una oportunidad nueva de Sala o Marketplace; toda oportunidad nueva pertenece a un flujo soportado.

---

## Fase 2 — Cotización gemela por canal

### Venta Web

1. Crear/iniciar la oportunidad desde OC Online o desde el flujo de Venta Web.
2. Conservar cliente, productos, cantidades, precios y total calculado desde las líneas.
3. Usar el flujo existente de procesar OC a Venta Web para crear la orden ERP vinculada.

### Licitación

1. Desde CRM, abrir o crear la cotización en el módulo de Licitaciones existente.
2. Conservar ID de licitación, organismo, plazo, ficha técnica/económica e ítems.
3. El cambio a ganada ocurre solo al adjudicar/crear la orden real desde el módulo de Licitaciones.

### Convenio Marco

1. Desde CRM, abrir Nueva venta en modo Convenio Marco.
2. Reutilizar N° de OC obligatorio, validación de unicidad y precios de Convenio Marco.
3. Vincular la orden creada con la oportunidad CRM.

**Criterio de aceptación:** cada canal abre su propio formato existente; ningún canal usa una orden genérica vacía ni pierde sus validaciones de negocio.

---

## Fase 3 — Vínculo CRM ↔ orden ERP

1. Establecer `ordenId` como vínculo canónico entre oportunidad y venta real.
2. Al crear la venta desde el flujo correcto, enlazarla automáticamente a la oportunidad CRM.
3. Al cerrar como GANADA:
   - validar que existe una orden válida y vinculada;
   - bloquear el cierre si faltan cliente, productos u otros datos obligatorios del canal;
   - no crear órdenes vacías como efecto secundario.
4. Mantener los registros históricos excluidos de creación automática de órdenes.
5. Mostrar desde CRM un enlace a la orden, la cotización fuente y el estado operacional, sin confundirlo con el estado comercial.

**Criterio de aceptación:** una oportunidad ganada del pipeline vivo siempre tiene trazabilidad a una orden ERP real; una orden no se duplica.

---

## Fase 4 — Semáforo y saneamiento de cartera importada

1. Marcar explícitamente los registros importados sin fecha confiable de gestión como `PENDIENTE_DE_REVISION`, en vez de vencidos automáticamente.
2. Excluir esos registros del semáforo y de los KPIs operativos hasta que se les asigne responsable y próximo contacto, según la decisión del cliente.
3. Crear acción de asignación/revisión masiva controlada.
4. Registrar auditoría de asignación, nueva fecha de contacto, clasificación y cierre.
5. Mantener las fechas originales solo como referencia histórica; no usarlas por sí solas para medir desempeño actual.

**Criterio de aceptación:** el contador de vencidos representa compromisos comerciales reales del equipo, no antigüedad de una importación.

---

## Fase 5 — Métricas, permisos y pruebas

1. Separar KPIs de:
   - cartera operativa;
   - importados pendientes de revisión;
   - ganadas y perdidas del pipeline vivo;
   - montos calculados desde productos.
2. Aplicar permisos por rol para crear, reasignar, editar, cerrar y reabrir oportunidades.
3. Pruebas automatizadas por canal:
   - creación desde CRM;
   - validaciones específicas;
   - creación/vinculación de orden;
   - cierre ganado y perdido;
   - exclusión de históricos;
   - total de ítems = cantidad × precio.
4. Prueba de aceptación con usuarios de ventas antes de producción.

---

## Orden de implementación recomendado

1. Resolver Fase 0 con el cliente.
2. Fase 1: contrato de canales.
3. Fase 2 y 3 por canal, en este orden: Web, Convenio Marco, Licitación.
4. Fase 4: saneamiento y semáforo.
5. Fase 5: métricas, permisos y aceptación.

## Reglas de entrega

- Todo cambio permanece local y se revisa visualmente antes de cualquier commit o push.
- No se ejecutan migraciones de datos ni automatizaciones sobre producción sin aprobación explícita.
- No se clasifica automáticamente una importación histórica como ganada o perdida sin una regla aprobada por el cliente.
