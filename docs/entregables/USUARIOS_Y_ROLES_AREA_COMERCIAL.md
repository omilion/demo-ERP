# Usuarios y roles del área comercial

Documento de trabajo para dejar operativos los usuarios del área comercial. Cada ficha traduce el rol descrito por Plastimar a lo que el sistema efectivamente otorga.

---

## 1. Punto de partida: la cartera ya está vinculada

No hay que crear los usuarios desde cero. El sistema ya tiene una cuenta por cada ejecutiva histórica, con su **código de cartera** asignado y **28.793 oportunidades vinculadas** a esas cuentas.

Las cinco personas de la estructura entregada ya existen:

| Persona | Cuenta actual | Código de cartera | RUT | Cartera vinculada |
| --- | --- | --- | --- | --- |
| Cinthia Palacios | `legacy.cinthia@plastimar.cl` | 1092 | 14601844-0 | 16.963 |
| Anny Torrealba | `legacy.anny@plastimar.cl` | 1058 | 26305866-6 | 9.113 |
| Paulina Chinchón | `legacy.paulina.chinchon@plastimar.cl` | 1199 | 17160697-7 | 532 |
| Jonathan Martínez | `legacy.jonathanm@plastimar.cl` | 1223 | 17080473-2 | 171 |
| Laura Navarro | `legacy.laura@plastimar.cl` | 1006 | *(falta)* | 73 |

Esto resuelve de entrada el problema de nombres duplicados que se conversó en la reunión: "Cinthia Palacios" y "Cinthia" ya apuntan a la misma cuenta, igual que "Anny Torrealba" y "Anny", o "PAULINA CHINCHON" y "PAULINAC".

**Lo que falta no es crear cuentas, sino convertirlas en cuentas reales de trabajo:** ponerles el correo corporativo, ajustar el rol de Gerencia y Coordinación, y completar el RUT de Laura. La cartera y el código se conservan tal cual, que es justamente la regla acordada: el código pertenece a la cartera, no a la persona.

---

## 2. Cómo funcionan los permisos en el sistema

Cada usuario tiene **tres cosas** que definen lo que puede hacer.

**a) Un rol.** Define el paquete base de módulos. Los disponibles son `admin`, `vendedor`, `bodeguero`, `cajero`, `taller`, `rrhh` y `solo_lectura`. Para el área comercial sólo aplican `admin` y `vendedor`.

El rol `vendedor` trae de fábrica:

| Módulo | Permiso |
| --- | --- |
| Ventas | leer y escribir |
| Cotizaciones | leer y escribir |
| Licitaciones | leer y escribir |
| Clientes | leer y escribir |
| Catálogo de productos | sólo leer |
| Despachos | sólo leer |
| Taller | sólo leer |
| Reportes | sólo leer |

**b) Permisos extra.** Se pueden sumar módulos puntuales por encima del rol, con permiso de lectura, escritura o borrado. Los módulos asignables son: ventas, cotizaciones, licitaciones, clientes, bodega, catálogo, despacho, taller, caja, cobranza, RRHH, reportes, proveedores, descuentos, órdenes de compra, pagos a proveedores, telas, bodega taller y CRM.

**c) Un código de vendedor.** Es el identificador de la cartera. Si la persona deja la empresa, su reemplazo recibe el mismo código y hereda los pendientes con todo el historial.

Existe además un permiso aparte, **autorizar descuentos**, que se activa por usuario.

### Un punto que requiere decisión

El sistema decide la visibilidad del CRM así: **el rol `admin` ve todas las oportunidades de todos; cualquier otro rol ve únicamente las suyas.** No hay un estado intermedio.

Eso significa que el requerimiento *"Gerencia Comercial y Coordinación Comercial pueden visualizar y gestionar transversalmente la información de todos los ejecutivos"* sólo se puede cumplir hoy dándoles rol `admin` — que además del área comercial les abre RRHH, caja, facturación, administración de usuarios y control de accesos.

Los permisos extra **no resuelven esto**: sirven para sumar módulos, pero no para ampliar el alcance de la cartera dentro del CRM.

Hay dos caminos:

- **Opción A — usar `admin` ahora.** Funciona de inmediato, sin desarrollo. Laura y Paulina quedan con acceso total al sistema, incluyendo áreas ajenas a lo comercial.
- **Opción B — crear un rol de supervisión comercial.** Ve y gestiona el CRM completo del equipo, pero sin RRHH, caja, facturación ni administración. Requiere desarrollo; es la que recomendamos, porque es la que refleja realmente lo que Plastimar describió.

Las fichas siguientes asumen la Opción A para no bloquear la puesta en marcha. Si se aprueba la Opción B, sólo cambia el rol de Laura y Paulina.

---

## 3. Fichas por usuario

### Laura Navarro — Gerencia Comercial

| | |
| --- | --- |
| Cuenta | `legacy.laura@plastimar.cl` → cambiar a correo corporativo |
| Rol actual | `vendedor` → **cambiar a `admin`** |
| Código de cartera | 1006 (73 oportunidades históricas) |
| Autoriza descuentos | Sí |
| Pendiente | Falta el RUT |

**Qué puede hacer.** Visualiza y gestiona la totalidad del área comercial sin restricción de cartera: el pipeline completo del CRM con las oportunidades de todas las ejecutivas, la Matriz de Ventas, las cotizaciones de licitación, el Convenio Marco y las órdenes de compra online. Accede a la Reportería Gerencial, al reporte de Comisiones y a los Reportes de Licitaciones, que son las vistas donde se consolidan los resultados del equipo. Puede reasignar oportunidades entre ejecutivas y autorizar descuentos fuera de regla.

**Qué debería revisar periódicamente.** Los tableros por ejecutiva, la tasa de conversión del equipo y los tiempos de respuesta, que son los indicadores comprometidos para el cierre de mes.

**Advertencia.** Con rol `admin` también accede a RRHH, caja, cobranza, facturación electrónica, creación de usuarios y control de accesos. Si eso no es deseable, corresponde la Opción B.

---

### Paulina Chinchón — Coordinadora Comercial

| | |
| --- | --- |
| Cuenta | `legacy.paulina.chinchon@plastimar.cl` → cambiar a correo corporativo |
| Rol actual | `vendedor` → **cambiar a `admin`** |
| Código de cartera | 1199 (532 oportunidades) |
| Autoriza descuentos | Sí |

**Qué puede hacer.** Es el perfil operativo del área: además de ver todo el pipeline como Gerencia, es quien **distribuye el trabajo**. Según lo conversado en la reunión, dirige las licitaciones y compras ágiles hacia la ejecutiva que corresponda según su experiencia, quedando registro de cada asignación. Trabaja el CRM día a día, crea oportunidades en los tres canales —cotización web, licitación y cotización simple—, hace seguimiento y cierra ventas.

Mantiene además su cartera propia de 532 oportunidades.

**Qué debería revisar periódicamente.** El estado *"Por clasificar"* del CRM, que es donde caen las oportunidades sin responsable, y el balance de carga entre ejecutivas.

---

### Anny Torrealba — Ejecutiva Mercado Público

| | |
| --- | --- |
| Cuenta | `legacy.anny@plastimar.cl` → cambiar a correo corporativo |
| Rol | `vendedor` — se mantiene |
| Código de cartera | 1058 (9.113 oportunidades) |
| Autoriza descuentos | No |
| Permisos extra | Ninguno adicional |

**Qué puede hacer.** Ve y gestiona **únicamente su propia cartera** en el CRM. Su foco es Mercado Público: trabaja el módulo de Licitaciones —cotizaciones de licitación, bases, plazos, ítems y adjudicación— y las compras ágiles. Puede crear y editar sus cotizaciones, registrar gestiones, fijar prioridad y fecha de próximo contacto, y cerrar sus oportunidades como ganadas o perdidas. Cuando marca una como ganada, la venta entra automáticamente a Matriz de Ventas y se encadena el resto del flujo.

Consulta el catálogo de productos y el estado de taller y despacho de sus propias ventas, en modo lectura.

**Qué no puede hacer.** Ver la cartera de otras ejecutivas, autorizar descuentos fuera de regla, ni acceder a bodega, caja, cobranza, facturación o RRHH.

---

### Cinthia Palacios — Ejecutiva Mercado Público y Privados

| | |
| --- | --- |
| Cuenta | `legacy.cinthia@plastimar.cl` → cambiar a correo corporativo |
| Rol | `vendedor` — se mantiene |
| Código de cartera | 1092 (16.963 oportunidades) |
| Autoriza descuentos | No |
| Permisos extra sugeridos | Órdenes de compra online, con escritura |

**Qué puede hacer.** Ve y gestiona **únicamente su propia cartera**. Atiende dos frentes: Mercado Público, con el mismo flujo de licitaciones que Anny, y clientes privados, donde el énfasis está en el **seguimiento comercial** de oportunidades y clientes.

Es quien recibe hoy las **cotizaciones que entran por la web**, que llegan al módulo de OC Online y se procesan como Venta Web. Por eso se sugiere darle escritura sobre órdenes de compra online, que el rol `vendedor` no trae por defecto. Conviene mantener la distinción que se aclaró en la reunión: las **ventas** web automáticas no se asignan a nadie, porque no las gestiona un vendedor; sólo las **cotizaciones** web requieren seguimiento y responsable.

Trabaja intensamente la ficha de gestión: registrar la acción realizada, planificar el próximo contacto, mantener actualizado el estado, y dejar documentado qué se hizo y cuándo.

Su cartera de 16.963 oportunidades es la más grande del equipo por amplio margen — la mitad de todo el CRM. Conviene tenerlo presente al planificar la limpieza: es la persona con más trabajo por delante.

**Qué no puede hacer.** Ver la cartera de otras ejecutivas, ni autorizar descuentos fuera de regla.

---

### Jonathan Martínez — Ejecutivo de Prospección y Mercado Público

| | |
| --- | --- |
| Cuenta | `legacy.jonathanm@plastimar.cl` → cambiar a correo corporativo |
| Rol | `vendedor` — se mantiene |
| Código de cartera | 1223 (171 oportunidades) |
| Autoriza descuentos | No |
| Permisos extra | Ninguno adicional |

**Qué puede hacer.** Ve y gestiona **únicamente su propia cartera**. Su perfil combina dos cosas: las gestiones de Mercado Público, con el mismo flujo de licitaciones del resto, y la **prospección**, que es el canal nuevo del sistema.

Para la prospección usa la **cotización simple**: le permite cotizar a un prospecto que él mismo salió a buscar, sin tener que registrarlo todavía como cliente formal, y aun así hacerle seguimiento dentro del CRM. Es un flujo que en el sistema anterior no existía. Cuando el prospecto se concreta, la cotización se cierra como ganada y ahí sí se crea el cliente y la venta real.

El rol `vendedor` ya incluye escritura sobre Clientes, que es lo que necesita para formalizar al prospecto en ese momento.

**Qué no puede hacer.** Ver la cartera de otras ejecutivas, ni autorizar descuentos fuera de regla.

---

## 4. Resumen de los cambios a aplicar

| Persona | Cuenta a convertir | Rol | Cambios |
| --- | --- | --- | --- |
| Laura Navarro | `legacy.laura@` | `vendedor` → `admin` | Correo corporativo · RUT · descuentos |
| Paulina Chinchón | `legacy.paulina.chinchon@` | `vendedor` → `admin` | Correo corporativo · descuentos |
| Anny Torrealba | `legacy.anny@` | `vendedor` | Correo corporativo |
| Cinthia Palacios | `legacy.cinthia@` | `vendedor` | Correo corporativo · OC Online escritura |
| Jonathan Martínez | `legacy.jonathanm@` | `vendedor` | Correo corporativo |

En los cinco casos se **conserva** el código de cartera y la cartera vinculada. Sólo cambian los datos de identidad y los permisos.

---

## 5. Las otras cuentas del sistema

Hay **85 usuarios** en total, de los cuales **65 son cuentas legacy** creadas para preservar la trazabilidad histórica. De esas:

- **14 tienen cartera vinculada** (28.793 oportunidades entre todas).
- **51 no tienen ninguna** y sólo existen como referencia histórica.

De las 14 con cartera, cinco son las del equipo actual. Las otras nueve corresponden a personas que no están en la estructura entregada:

| Cuenta | Código | Oportunidades | Observación |
| --- | --- | --- | --- |
| Ana Milena Cruz | 1211 | 1.123 | Figura como Ejecutiva de Ventas **activa** en RRHH |
| Tanya Peña Munizaga | 1203 | 503 | Figura como **inactiva** en RRHH |
| Felipe Chávez | 1219 | 158 | — |
| Katherine Polanco Puente | 1212 | 54 | No figura en RRHH |
| SALOMEG | *(sin código)* | 47 | Sin identificar |
| DIEGO | 1085 | 34 | Presumiblemente Diego, contraparte de Plastimar |
| Carolina Valencia Pinochet | 1213 | 9 | Figura en RRHH como Diseño y Marketing |
| Daniela Reyes | 1176 | 7 | — |
| David Salgado Informático | 1168 | 6 | Perfil no comercial |

Son **1.941 oportunidades sin dueño en la nueva estructura**. Aplicando la regla acordada, cada uno de esos códigos debería traspasarse a la persona que asume esa cartera, o cerrarse si ya no corresponde.

Quedan además **5.141 oportunidades sin ninguna cuenta asociada**, que son las que no traían ejecutiva en el sistema de origen.

---

## 6. Qué se necesita de Plastimar

1. **Correo corporativo** de las cinco personas, para reemplazar los `legacy.*`.
2. **RUT de Laura Navarro**, que es el único que falta.
3. **Decisión sobre el rol de Laura y Paulina**: Opción A (`admin` ahora) u Opción B (rol de supervisión comercial, con desarrollo).
4. **Destino de las 1.941 oportunidades** de personas fuera del equipo. El caso más relevante es **Ana Milena Cruz con 1.123**, que figura como ejecutiva activa en RRHH pero no aparece en la estructura entregada: conviene aclarar si sigue en el área o si su cartera se reparte.
5. **Criterio para las 5.141 oportunidades sin ejecutiva**: si se reparten, si quedan a cargo de Coordinación Comercial, o si entran a revisión antes de asignarse.
6. **Contraseñas iniciales**: las cuentas legacy ya tienen una definida. Hay que decidir si se entregan credenciales nuevas o se fuerza un cambio en el primer ingreso.
