# Plan — Módulo de descuentos

## Contexto

El catálogo heredado de porcentajes autorizados se eliminó del flujo de venta y el motor de reglas quedó como único responsable: un descuento existe sólo si una regla vigente lo respalda. El cambio ya está aplicado y probado, pero dejó al descubierto varios puntos que conviene resolver antes de que el equipo comercial lo use en serio.

Este documento los ordena por urgencia. No es una lista de deseos: cada punto salió de leer el código o de medir la base.

---

## Estado medido

| Qué | Valor |
| --- | --- |
| Reglas activas en producción | **1**, y es de prueba (`test-desc-rule-1786544157130-regla`) |
| Órdenes con descuento | 1 de 16.371 |
| Catálogo legacy | 164 filas, desactivadas |
| Cobertura de pruebas | 12 casos de integración entre venta y CRM |

---

## Fase 0 — Cargar las reglas reales (bloqueante)

**El módulo está apagado.** Sin reglas vigentes, cualquier descuento se rechaza. Esto no es deuda técnica: es que el área comercial no puede descontar hasta que alguien cargue la política.

No es trabajo de desarrollo, es de negocio. Hay que sentarse con Paulina y traducir la política real a reglas. Preguntas a resolver:

1. ¿Qué descuento puede dar una ejecutiva sin pedir permiso a nadie?
2. ¿Sobre qué monto se justifica un descuento por volumen, y de cuánto?
3. ¿Hay productos o categorías que nunca se descuentan?
4. ¿Convenio Marco y Licitación tienen reglas propias o van con la general?
5. ¿A partir de qué porcentaje se exige aprobación, y quién aprueba?

**Entregable:** entre 4 y 6 reglas cargadas y probadas en un cliente real.

**Riesgo si se posterga:** el equipo se topa con "no hay regla vigente" sin entender por qué, y el módulo queda con fama de roto.

---

## Fase 1 — Lo que puede dejar al equipo trabado

Ambos puntos comparten el mismo problema: producen un bloqueo cuyo mensaje de error no explica la causa real.

### 1.1 El flag `DESCUENTOS_REGLAS_ENABLED`

[`descuentos/index.js:29`](../backend/src/routes/descuentos/index.js#L29) apaga el motor cuando la variable vale `false`. Antes era inofensivo, porque el catálogo cubría; **ahora apaga los descuentos del sistema entero** y el vendedor sólo ve "no hay una regla de descuento vigente", que no menciona el flag.

**Qué hacer:** eliminar el flag, o —si se quiere conservar como interruptor de emergencia— que el guard distinga *"no hay reglas configuradas"* de *"el motor está deshabilitado"* y lo diga.

**Esfuerzo:** bajo. **Archivos:** `descuentos/index.js`, `ventas/descuentos-guard.js`.

### 1.2 Sólo `admin` puede aprobar descuentos

[`descuentos/index.js:275`](../backend/src/routes/descuentos/index.js#L275) exige rol `admin`. Es el mismo problema que apareció con los roles del área comercial: **Paulina, que es quien dirige comercialmente, necesitaría acceso total al sistema** —RRHH, caja, facturación, usuarios— sólo para autorizar un 15%.

**Qué hacer:** aprobar descuentos debe ser un permiso propio, no el rol admin completo. Encaja con el `permisoDescuentos` que ya existe por usuario, o con el rol de supervisión comercial que quedó pendiente en el plan de usuarios.

**Esfuerzo:** bajo, si se reutiliza `permisoDescuentos`. **Depende de:** la decisión pendiente sobre el rol de supervisión comercial.

---

## Fase 2 — Trazabilidad de la política

Hoy se puede saber por qué se aplicó un descuento a una venta, pero no cómo llegó a existir la regla que lo permitió.

### 2.1 Editar una regla la sobreescribe en silencio

El modelo tiene `version` y un `@@unique([codigo, version])` preparados, pero [el `PUT`](../backend/src/routes/descuentos/index.js#L188) hace `update()` sobre la misma fila. Si alguien baja el máximo del 20% al 10%, no queda registro de que antes era 20.

Las ventas ya emitidas conservan su `descuentoSnapshot`, así que el histórico comercial está a salvo. Lo que se pierde es la historia de la política.

**Qué hacer:** al editar, crear una versión nueva y desactivar la anterior en vez de sobreescribir. La infraestructura ya está en el esquema.

**Esfuerzo:** medio. Hay que decidir qué pasa con las solicitudes pendientes que apuntan a la versión vieja.

### 2.2 Nadie firma las reglas

`DescuentoRegla` tiene `createdAt` y `updatedAt`, pero no quién. Para algo que define cuánto se puede regalar, falta el autor.

**Qué hacer:** agregar `creadoPorId` y `modificadoPorId`. Migración simple, aditiva.

**Esfuerzo:** bajo. Conviene hacerlo junto con 2.1, es la misma migración.

---

## Fase 3 — Que se pueda usar sin leer el código

### 3.1 Una regla sin condiciones tapa a las demás

El motor selecciona `reglas[0]` por prioridad. Una regla sin `tiposVenta` ni `productoIds`, con prioridad alta, **aplica a todas las ventas** y esconde al resto. Nada lo advierte.

Esto no es teórico: apareció escribiendo las pruebas, donde una regla de un caso hacía pasar el caso siguiente por el motivo equivocado.

**Qué hacer:** al crear o editar, si la regla no tiene ninguna condición, advertir que aplicará a todo. No bloquear —puede ser deliberado— pero que sea una decisión consciente.

**Esfuerzo:** bajo.

### 3.2 Los tres porcentajes confunden

`porcentajeSugerido`, `porcentajeAutoaprobado` y `porcentajeMaximo` se parecen demasiado. Hay que leer `statusFor()` para entender que el auto-aprobado es el umbral que dispara la aprobación.

**Qué hacer:** es un problema de etiquetas, no de lógica. En la pantalla:

- *Sugerido* → "Descuento que propone la regla"
- *Auto-aprobado* → "Hasta cuánto puede aplicar el vendedor sin pedir permiso"
- *Máximo* → "Techo absoluto, incluso con aprobación"

**Esfuerzo:** bajo. **Archivo:** `frontend/src/pages/descuentos/DescuentosPage.jsx`.

### 3.3 Queda UI muerta del catálogo

El panel de administración del catálogo legacy sigue en `/descuentos` mostrando dos listas vacías, con botones para crear porcentajes que ya nadie lee.

**Qué hacer:** eliminar ese panel, el endpoint `GET /api/descuentos` y los CRUD de `descuentos_porc` / `descuentos_porc_marco`. Las tablas pueden quedar o irse; ya están desactivadas.

**Esfuerzo:** bajo. Es borrar.

### 3.4 Nada avisa cuando una regla vence

`vigenteHasta` existe pero no hay alerta. Una regla de temporada expira sin que nadie se entere y el vendedor sólo ve "no hay regla vigente".

**Qué hacer:** mostrar las reglas por vencer en la pantalla de administración, y considerar una notificación cuando queden pocos días. El módulo de notificaciones ya existe.

**Esfuerzo:** medio.

---

## Orden recomendado

| # | Qué | Esfuerzo | Bloquea a |
| --- | --- | --- | --- |
| 1 | Fase 0: cargar reglas reales | Reunión + carga | Todo lo demás |
| 2 | 1.1 Flag | Bajo | — |
| 3 | 1.2 Permiso de aprobación | Bajo | Depende del rol de supervisión |
| 4 | 3.3 Borrar UI muerta | Bajo | — |
| 5 | 3.1 Aviso de regla sin condiciones | Bajo | — |
| 6 | 3.2 Etiquetas de los porcentajes | Bajo | — |
| 7 | 2.1 + 2.2 Versionado y autoría | Medio | — |
| 8 | 3.4 Aviso de vencimiento | Medio | — |

Del 2 al 6 son todos de esfuerzo bajo y se pueden agrupar en una sola pasada. El 7 conviene hacerlo antes de que existan muchas reglas cargadas, porque después migrar versiones es más incómodo.

---

## Verificación

La cobertura actual ya cubre el ciclo completo: [`descuentos-reglas-flujo.test.js`](../backend/test/descuentos-reglas-flujo.test.js) valida crear, evaluar, aplicar y registrar sobre cuatro casos reales, y [`crm-cotizaciones-flujo.test.js`](../backend/test/crm-cotizaciones-flujo.test.js) cubre el lado del CRM.

Cada fase debería sumar su prueba:

- **1.1** — con el motor deshabilitado, el error distingue la causa.
- **1.2** — un usuario con permiso de descuentos y sin rol admin puede aprobar.
- **2.1** — editar una regla crea una versión nueva y la venta anterior conserva su snapshot.
- **3.1** — crear una regla sin condiciones devuelve la advertencia.

Todo se corre contra la base local de docker-compose (**puerto 55432**), nunca contra el túnel de producción.
