# Minuta de reunión — Limpieza de datos y flujo de ventas

**Fecha:** miércoles 19 de agosto de 2026
**Duración:** 1 h 20 min
**Proyecto:** Plastimar — Sistema de gestión (integración SII / migración SISGES)

**Participantes**

| Organización | Persona | Rol |
| --- | --- | --- |
| Plastimar | Laura Navarro | Gerencia |
| Plastimar | Christopher | Tecnología / base de datos |
| Plastimar | Paulina | Coordinadora de ventas |
| Hazlo Mejor | Omar | Área comercial |
| Hazlo Mejor | Sebastián | Operaciones y administración |

*Aludidos y no presentes:* Diego (Plastimar) y Daniela (Plastimar).

---

## 1. Acuerdo de agendamiento

Toda reunión debe quedar registrada en el calendario con al menos un día de anticipación. **Si no está en el calendario, la reunión no existe.** El acuerdo aplica en ambos sentidos y busca evitar confusiones de coordinación.

---

## 2. Alcance del CRM y flujo de ventas

Se acordó qué tipos de venta entran al CRM y cuáles no.

### Ventas con seguimiento — entran al CRM como oportunidad

| Tipo | Origen |
| --- | --- |
| Cotización web | Lo que llega por la página o por correo |
| Licitación | Mercado público y privado |
| Cotización simple | Prospección proactiva del vendedor |

La **cotización simple es nueva**: no existía en el sistema anterior. Recoge los mismos datos que la cotización web, pero se registra por un canal separado como venta proactiva del vendedor. Permite cotizar a un prospecto sin tener que registrarlo todavía como cliente en el sistema, y aun así hacerle seguimiento. Cubre el caso planteado en la reunión: cuando un cliente privado contacta directamente a una ejecutiva sin pasar por la página.

### Ventas directas — van directo a Matriz de Venta, sin pasar por el CRM

- Venta sala / mesón
- Marketplace
- **Convenio Marco** — la orden de compra llega directamente. Se mantiene implementado porque existe la posibilidad de que retorne el próximo año, según indicación de Diego.

### Acuerdos adicionales del bloque

- **El módulo de Licitaciones independiente desaparece.** Licitación queda integrada al flujo del sistema. Lo que aún se ve como módulo aparte es residuo de la primera etapa del desarrollo y no contiene la data final.
- **Compra ágil se separa de Licitación.** Son de distinto monto, distinta complejidad y distinta urgencia; se necesitan separadas para la reportería y para poder asignar responsable. Falta incorporarla al menú.
- **Compra ágil requiere plazos de alerta propios.** La regla general de 10 días sin gestión no le sirve: el plazo de postulación puede vencerse antes. Se definirán tiempos de semáforo por tipo de venta.
- **El cierre como GANADA dispara el flujo operativo completo.** Al marcar la oportunidad como ganada en el CRM, entra automáticamente a Matriz de Venta y se encadena el resto: productos a taller, orden de compra a proveedores, despacho y facturación. No hay que volver a crear la orden manualmente.

---

## 3. Limpieza de datos

Este fue el tema central de la reunión.

### Situación

La cartera que hoy muestra el CRM está abultada y no refleja la realidad operativa. Los problemas identificados y confirmados por ambas partes:

- El nombre de la ejecutiva se escribió a mano de forma inconsistente a lo largo de los años: la misma persona aparece con varias grafías distintas.
- Hay perfiles de usuario duplicados en el sistema de origen. El perfil de Laura, por ejemplo, aparece tres veces.
- No existe registro de quién hizo cada gestión ni cuándo. No hay catastro de creación, actualización ni eliminación.
- La mayoría de los registros quedó marcada como pendiente o enviada, sin un estado real ni un ejecutivo preciso.

La consecuencia es que hoy no se puede afirmar con certeza si una oportunidad fue gestionada o no, ni comparar el desempeño de una ejecutiva entre un año y otro.

### Corte acordado

**Se trabaja desde el 01-01-2025 hacia adelante**, según indicación de Diego.

Lo anterior a esa fecha queda como **histórico zanjado**: se conserva registrado y se deja lo más depurado posible, pero se asume que no se podrá limpiar al 100%.

Christopher observó que la limpieza previa del año 2025 no cubrió el año tributario completo: quedó una cola de octubre a diciembre que genera ruido e impide filtrar correctamente por año. Ese tramo se incorpora al trabajo de depuración.

### Regla acordada: la cartera se identifica por código, no por persona

El código pertenece a la **cartera**, no a la persona. Se le asigna a quien la atiende en cada momento. Si la persona deja la empresa, su sucesora toma el mismo código y hereda los pendientes, con todo el historial de lo que se hizo antes.

No se crean usuarios compartidos ni usuarios especiales para resolver reasignaciones. Cada persona tiene un usuario único.

### Limpieza en dos etapas

**Etapa 1 — Depuración técnica**
Christopher normaliza en la base de origen: unificación de usuarios, corrección de caracteres especiales, y ordenamiento de regiones, comunas y direcciones. Sobre esa base ya normalizada, Hazlo Mejor rehace los cruces.

**Etapa 2 — Limpieza operativa por ejecutiva**
Cada ejecutiva revisa y limpia **su propia cartera**: verificar lo que está "por clasificar" y lo "enviado", confirmar que el estado corresponda a la realidad, y cerrar o aprobar lo que nunca se marcó.

Esta etapa se hace en una reunión que **cumple doble propósito**: se capacita al equipo en el uso del CRM mientras se limpia la base. Se avanza en ambas cosas al mismo tiempo, y la tarea se reparte entre las ejecutivas en lugar de concentrarse.

El criterio comercial no se puede aplicar automáticamente desde la base — por ejemplo, "este cliente no respondió en tres meses, se cierra" — porque la inconsistencia de los datos no lo permite. Esa decisión la toma cada ejecutiva sobre su propia cartera.

Además, es una oportunidad comercial: buena parte de esos registros tienen menos de un año y pueden retomarse.

### Tablas de conflicto

Hazlo Mejor extraerá **tablas con los registros en conflicto** de órdenes de trabajo, órdenes pendientes, licitaciones y compras online, en un formato que permita reimportarlas después de corregidas. Plastimar toma la decisión sobre esos registros.

Se suma a esa revisión el caso de los registros marcados como **compra ágil**: verificar si efectivamente lo fueron y en qué estado quedaron.

### Bloqueante declarado

Para poder arrancar la limpieza operativa **hay que crear los usuarios reales del equipo comercial**. Hazlo Mejor necesita que Plastimar indique el rol y la cartera de cada persona. Christopher se comprometió a priorizar la entrega de perfiles y credenciales.

Sin esos usuarios no se puede asignar cartera, no se puede repartir la limpieza, y los dashboards por ejecutiva no se pueden construir.

---

## 4. Asignación de oportunidades y permisos

### Distinción aclarada por Paulina

**Venta web directa y cotización web son dos flujos distintos.**

- La **venta web** es automática, no la gestiona ningún vendedor, y por lo tanto **no se asigna** a nadie del equipo comercial.
- La **cotización web** sí se asigna. Hoy la lleva Cinthia Palacios, que atiende clientes privados.

### Acuerdos

- **Se elimina el reparto al azar.** El botón de "asignar pendientes" que distribuía aleatoriamente no corresponde al modo real de trabajo.
- En su lugar, el usuario vendedor lleva como propiedad **qué cartera o tipo de venta atiende**. Esto permite que el sistema sea escalable: si mañana hay dos personas en un canal, o se abre una sucursal, basta con asignar ese privilegio a otro usuario.
- **Licitaciones y compras ágiles las direcciona Paulina**, según la experiencia de cada ejecutiva: las oportunidades más grandes y complejas van a la persona con mayor experiencia. Hoy son tres personas las que atienden ese frente.
- El sistema debe permitir esa asignación manual, **dejar registro del motivo** y evitar cargas desbalanceadas entre ejecutivas.

### Permisos

Actualmente los permisos operan a nivel de módulo completo. Se requiere mayor granularidad:

- Permiso por **tipo de venta** (un vendedor no sólo accede a sus ventas: tiene asignado un tipo de venta).
- Permiso para **ver todas las cotizaciones**, separado del anterior.

Plastimar define quién recibe qué permiso, en conjunto con la creación de los usuarios.

---

## 5. Reportería del CRM

Christopher planteó los reportes requeridos. Se acordó construir:

**Dashboard general del área comercial** y **dashboard por ejecutiva**, con:

- Cotizaciones enviadas
- Seguimientos pendientes
- Ventas aprobadas
- Negocios ganados y perdidos
- Tasa de conversión
- Monto cotizado y monto vendido
- Tareas pendientes

**KPIs de gestión comercial para cierre de mes:**

- Seguimientos realizados en el mes
- Clientes contactados
- Cotizaciones enviadas
- **Tiempo de respuesta por ejecutiva**, con énfasis en quienes atienden clientes privados

La información ya existe en el sistema; falta construir las vistas. Depende de tener creados los usuarios reales.

---

## 6. Otros acuerdos

**Exportación.** Todas las vistas quedarán con **dos botones: Excel (XLSX) y CSV**. Hoy sólo hay CSV. Se mantiene también la opción de ampliar cualquier vista a pantalla completa.

**Módulo Clientes.** Quedó fuera del alcance de esta iteración y aún muestra datos sin actualizar. Christopher ya realizó la limpieza de caracteres especiales y está unificando regiones y comunas en la base de origen. Se acordó:

- Esos campos deben ser **listas de selección, no texto libre** — el ingreso libre es lo que genera el desorden.
- Se agrega el campo **País**, con Chile por defecto y como lista desplegable. Se detectaron clientes extranjeros, principalmente de Argentina, y hubo operaciones con Uruguay. El campo se deja con alcance Latinoamérica y con posibilidad de ampliarse.

**Idea a evaluar — monitores en taller.** Christopher propuso instalar pantallas auxiliares en los talleres de confección, corte, espuma y madera, con los estados de los pedidos refrescándose automáticamente, para que los operarios no pierdan tiempo desplazándose entre talleres a consultar el estado de una tarea. Sería una vista resumida del mismo tablero del sistema. Queda como idea a definir, incluyendo el hardware.

**Levantamiento de casos de uso.** Christopher está documentando los casos de uso por escenario de venta (sala, web, marketplace) y para los operarios, cubriendo todas las fases: prospección, desarrollo, fabricación, envío y recepción conforme. Se entregará como insumo para el desarrollo.

---

## 7. Ruta a revisar

Hazlo Mejor entrega dos rutas de revisión separadas. Cada una tiene responsable, recorrido y qué reportar.

### Ruta 1 — Limpieza de datos

**Responsables:** Paulina y las ejecutivas de venta.
**Objetivo:** dejar la cartera con estados reales y responsables correctos.

Recorrido, sobre el módulo CRM:

1. Filtrar por **ejecutiva** y revisar que la cartera asignada corresponda efectivamente a esa persona. Reportar los casos donde el nombre esté mal escrito o corresponda a otra persona.
2. Revisar el estado **"Por clasificar"**: definir si la oportunidad sigue viva, si corresponde a otra ejecutiva, o si debe cerrarse.
3. Revisar el estado **"Cotización enviada"**: confirmar si hubo gestión posterior. Si la hubo y no está registrada, registrarla. Si no la hubo, decidir si se retoma o se cierra.
4. Sobre lo que se retoma: asignar **prioridad** y **fecha de próximo contacto**.
5. Sobre lo que se cierra: indicar el **resultado** (ganada o perdida) y, si es perdida, el **motivo**.

**Qué reportar:** el trabajo se hace directamente sobre la pantalla del CRM, no en planilla aparte. Lo que sí se reporta por escrito son los casos que el sistema no permita resolver: nombres que correspondan a una persona que ya no está, registros sin datos suficientes para decidir, y cualquier oportunidad que no se pueda clasificar.

### Ruta 2 — Flujo de ventas

**Responsables:** Daniela y Paulina.
**Objetivo:** validar de punta a punta lo que quedó publicado, antes de la reunión con el equipo de ventas.

Recorrido:

1. **Crear una oportunidad por cada canal**: cotización web, licitación y cotización simple. Verificar que cada formulario pida los datos correctos y que las validaciones propias de cada tipo se respeten.
2. **Avanzar la oportunidad por el pipeline**: registrar una gestión, cambiar de estado, y confirmar que queda documentado quién lo hizo y cuándo.
3. **Marcar una oportunidad como GANADA** y verificar que entre automáticamente a **Matriz de Venta** con todos sus datos y productos.
4. **Seguir la cadena que se dispara**: que los productos que corresponden lleguen a **taller**, que lo que hay que comprar aparezca en **órdenes de compra a proveedores**, y que el pedido avance a **despacho** y **facturación**.
5. **Revisar los módulos de importaciones y órdenes de compra a proveedores**, incluyendo la recepción de productos y la sugerencia de compra por ritmo de ventas.
6. **Revisar los indicadores del dashboard** y confirmar que las cifras de ventas y órdenes de trabajo calcen con lo esperado.

**Qué reportar:** por cada punto, si funcionó o no, y en caso de falla el detalle de qué se hizo y qué se esperaba. Se envía en un solo correo de respuesta.

---

## 8. Compromisos y próximos pasos

| Responsable | Compromiso | Plazo |
| --- | --- | --- |
| Hazlo Mejor | Publicar los cambios y enviar el correo con el resumen de módulos modificados y las dos rutas de revisión | Mismo día |
| Hazlo Mejor | Agendar la próxima reunión en ese mismo correo | Mismo día |
| Hazlo Mejor | Preparar las tablas de conflicto en formato reimportable | Por definir |
| Plastimar — Daniela y Paulina | Recorrer las rutas de revisión y entregar sus pendientes | Lunes |
| Plastimar — Christopher | Unificar usuarios y normalizar la base en el origen | En curso |
| Plastimar — Christopher | Entregar perfiles, roles y credenciales | Prioritario |
| Plastimar — Christopher | Entregar los casos de uso y el levantamiento | Próxima reunión |
| Plastimar | Definir rol y cartera de cada persona, y confirmar las identidades duplicadas | Antes de crear los usuarios |
| Ambos | Reunión con el equipo de ventas: capacitación en el CRM y arranque de la limpieza por ejecutiva | Lunes o martes |
| Ambos | Reunión de avance | Miércoles |

---

## 9. Anexo — Estado medido de la base

Cifras verificadas contra la base de producción el 19 de agosto de 2026. Sirven para dimensionar el trabajo de limpieza acordado en el punto 3.

### Volumen y alcance

- **32.983 oportunidades** registradas en el CRM, con datos que van desde **2016 hasta 2026**.
- Con el corte acordado del 01-01-2025 quedan **16.343 registros vigentes** (11.145 del año 2025 y 5.198 de 2026). Los **16.640 restantes** pasan a histórico.

### Origen de los registros

| Origen | Registros | Con cliente identificado | Con orden de venta vinculada |
| --- | --- | --- | --- |
| Compras online | 24.967 | 6.566 (26 %) | 0 |
| Licitaciones | 7.333 | 7.158 (97,6 %) | 560 |
| Registros antiguos sin clasificar | 683 | 0 | 0 |

**El flujo de licitaciones es el que está sano**: casi la totalidad tiene el cliente correctamente identificado y ya existe vínculo con la orden de venta real.

**El flujo de compras online es el que falta cruzar**: sólo uno de cada cuatro registros tiene el cliente identificado, y ninguno tiene vínculo con la orden de venta. Esto se debe a que en la base de origen no existe un campo que una la compra online con la orden que se generó a partir de ella. Es un punto a resolver dentro de la depuración.

### El campo ejecutiva

Es el campo más dañado, y confirma con números lo conversado en la reunión:

| Cómo está escrito en la base | Registros |
| --- | --- |
| *(sin ejecutiva asignada)* | 17.342 |
| Cinthia Palacios | 5.653 |
| Anny | 3.774 |
| Cinthia | 1.982 |
| Anny Torrealba | 1.690 |
| Anacruz | 724 |
| PAULINA CHINCHON | 492 |
| tanyap | 478 |
| Ana Milena Cruz | 394 |
| jonathanm | 149 |
| felipec | 141 |
| Katherine Polanco Puente | 54 |

Se observan **tres personas escritas de dos formas distintas cada una** — Cinthia, Anny y Ana Milena —, dos usuarios que no pertenecen al equipo comercial, y un **52,6 % de los registros sin ejecutiva asignada**.

Ningún registro tiene todavía un vendedor del sistema vinculado. La asignación por código acordada en el punto 3 es precisamente lo que resuelve este problema de raíz: unifica cada persona bajo un identificador único y hace que la cartera sea heredable.

### Gestión registrada

No existe todavía ninguna gestión comercial registrada en el CRM nuevo. **Toda la información actual proviene de la migración, no del uso del sistema.** Esto significa que la limpieza no destruye trabajo previo: se está partiendo desde cero en la capa de gestión, con el histórico como referencia.

---

*Minuta elaborada por Hazlo Mejor. Cualquier corrección o precisión sobre lo aquí registrado puede responderse por correo antes de la próxima reunión.*
