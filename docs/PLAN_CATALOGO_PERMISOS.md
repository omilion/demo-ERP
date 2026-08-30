# Catálogo de permisos por función

Propuesta para revisión. Nace de mapear los **412 endpoints** del backend y contrastar el permiso que cada uno exige contra el trabajo real que declararon las diez personas en el levantamiento.

No toca código todavía: es el diseño a acordar antes de modificar el middleware.

---

## 1. Qué se corrigió ya

El catálogo de módulos delegables no correspondía con lo que el código exige, en ambas direcciones. Corregido en `54057ab`:

- **Seis módulos que el código exigía y no eran asignables** — `facturacion`, `costeo`, `usuarios`, `config`, `admin`, `ai`. Quedaban reservados al admin sin que nadie lo hubiera decidido.
- **Seis permisos muertos** — `cotizaciones`, `ordenes-compra`, `pagos-proveedores`, `telas`, `bodega-taller`, `crm`. Cero usos reales; se podían asignar y no hacían nada.

Verificado sobre una copia de producción con las cuentas del levantamiento: la encargada de facturación entra a facturación y despacho, no puede crear ventas ni entrar a taller.

---

## 2. El problema que queda

El permiso hoy es **módulo × nivel**, con sólo tres niveles: `read`, `write`, `delete`. Eso es demasiado grueso, porque dentro de un módulo conviven operaciones de áreas distintas.

El caso más claro está en `ventas`:

| Operación | Quién la hace realmente | Hoy exige |
| --- | --- | --- |
| `POST /` crear venta | Vendedor | `ventas:write` |
| `PUT /:id` editar venta | Vendedor | `ventas:write` |
| `POST /:id/cargos` cargos adicionales | Vendedor o Finanzas | `ventas:write` |
| **`PUT /items/:id/entregados`** marcar entregado | **Bodega** | `ventas:write` |
| **`POST /:id/forzar-taller`** | **Coordinador de taller** | `ventas:write` |
| `POST /:id/anular` | Supervisión | `ventas:delete` |
| `POST /:id/activar` reactivar | Supervisión | `ventas:delete` |

Para que **Diego Ávila** marque una entrega desde bodega hay que darle `ventas:write`, lo que además lo habilita a **crear y editar ventas**. Y para que **Dyan Cortés** empuje una orden a taller, lo mismo.

El mismo patrón se repite en `taller`, donde `write` cubre por igual registrar un avance —lo que hace una cortadora— y cerrar o anular una OT —lo que hace una supervisora.

---

## 3. Propuesta

Extender a **módulo × función × nivel**, conservando el modelo actual:

```json
{
  "ventas": ["read"],
  "ventas.entregas": ["write"],
  "facturacion.emitir": ["write"]
}
```

**Regla de resolución:** si existe un permiso a nivel de función, manda. Si no, cae al permiso del módulo. Así **ningún permiso vigente se rompe**: quien hoy tiene `ventas: ["read","write"]` sigue pudiendo todo.

### Catálogo propuesto

Sale de agrupar los endpoints reales por la operación de negocio que representan.

**ventas** (46 endpoints)

| Función | Cubre | Quién |
| --- | --- | --- |
| `ventas` | listar y ver | todos los del área |
| `ventas.crear` | `POST /` | Vendedor |
| `ventas.editar` | `PUT /:id`, cargos | Vendedor |
| `ventas.entregas` | `PUT /items/:id/entregados` | **Bodega** |
| `ventas.taller` | `POST /:id/forzar-taller` | **Coordinador de taller** |
| `ventas.anular` | `anular`, `activar`, `DELETE` | Supervisión |
| `ventas.descuentos` | aplicar descuento | ya existe como `descuentos` |

**taller** (51 endpoints)

| Función | Cubre | Quién |
| --- | --- | --- |
| `taller` | ver OT, kanban, materiales | todo el taller |
| `taller.avance` | avances, bitácora, consumos | **Cortadora, operario** |
| `taller.gestion` | crear y editar OT, asignar | **Supervisora** |
| `taller.cerrar` | `cerrar`, `anular` | **Supervisora** |
| `taller.materiales` | consumos y bodega de taller | Encargado de espuma |

**facturacion** (24 endpoints)

| Función | Cubre | Quién |
| --- | --- | --- |
| `facturacion` | ver documentos | Finanzas, Gerencia |
| `facturacion.emitir` | `emitir`, `enviar` | **Encargada de facturación** |
| `facturacion.anular` | notas de crédito, anulación | Supervisión |
| `facturacion.folios` | CAF, ajuste de folios | Administración |

**despacho** (18 endpoints)

| Función | Cubre | Quién |
| --- | --- | --- |
| `despacho` | ver despachos, matriz, tracking | Bodega, Ventas |
| `despacho.packing` | armar el packing | **Bodega** |
| `despacho.guias` | emitir y editar guías | **Encargado de despacho** |

**bodega** (35 endpoints)

| Función | Cubre | Quién |
| --- | --- | --- |
| `bodega` | ver stock, movimientos | Bodega, Taller, Ventas |
| `bodega.movimientos` | registrar entradas y salidas | **Encargado de inventario** |
| `bodega.ajustes` | ajustes y mermas | Supervisión |
| `bodega.compras` | OC a proveedores, sugerencias | **Coordinador** |

`config`, `usuarios`, `admin` y `ai` se dejan **a nivel de módulo**: son de administración y no conviene fragmentarlos.

---

## 4. Cómo quedarían las diez personas

| Persona | Rol | Permisos por función |
| --- | --- | --- |
| Laura Navarro | `admin` | — |
| Diego Espinoza | `admin` | — |
| Marcela Lacourt | `cajero` | `rrhh`, `cobranza` |
| Daniela Reyes | `bodeguero` | `facturacion.emitir`, `despacho.guias` |
| Dyan Cortés | `bodeguero` | `taller.gestion`, `ventas.taller`, `bodega.compras` |
| Diego Ávila | `bodeguero` | `bodega.movimientos`, **`ventas.entregas`** |
| Zalma Lobos | `taller` | `taller.gestion`, `taller.cerrar` |
| Jenifer Breidenbach | **`taller_operario`** | **`taller.avance`** únicamente |
| Mercedes Rodríguez | **`taller_operario`** | **`taller.avance`** únicamente |
| Sebastián Mella | `taller` | `taller.materiales`, `bodega.movimientos`, `despacho` |

Lo que esto cambia en concreto: **Diego Ávila puede marcar entregas sin poder crear ventas**, y **Jenifer y Mercedes registran su avance sin poder cerrar ni anular una OT**. Hoy ninguna de las dos cosas es posible.

---

## 5. Un hallazgo aparte: 74 endpoints sin control de módulo

Del mapeo de los 412 endpoints:

| Guardia | Endpoints |
| --- | --- |
| Con módulo y nivel | 327 |
| **Sólo exige estar logueado** | **74** |
| Públicos por diseño | 11 |

Los 11 públicos son legítimos: login, refresh, banners, catálogo web, uploads y registro web.

Los **74 que sólo exigen sesión iniciada** merecen revisión aparte: cualquier usuario autenticado los alcanza, sea cortadora o gerente. No los revisé uno por uno; es un trabajo posterior a este catálogo, pero conviene dejarlo anotado.

---

## 6. Orden sugerido

1. **Acordar el catálogo de funciones** de este documento con Plastimar. Es la parte que requiere criterio de negocio.
2. **Extender el middleware `rbac`** para resolver `modulo.funcion` con caída al módulo. Cambio acotado y retrocompatible.
3. **Etiquetar los endpoints** con su función, empezando por `ventas` y `taller`, que son los dos casos con dolor real.
4. **Ampliar la pantalla de Accesos** para mostrar las funciones dentro de cada módulo.
5. **Revisar los 74 endpoints** que sólo exigen login.

Los pasos 2 y 3 se pueden hacer módulo por módulo sin romper nada: mientras un endpoint no esté etiquetado, sigue resolviendo por su módulo como hoy.

---

## 7. Verificación

Cada paso debería demostrarse con las cuentas reales sobre la copia local de producción, como se hizo con el catálogo de módulos:

- Diego Ávila marca una entrega y **falla** al crear una venta.
- Jenifer registra un avance y **falla** al cerrar la OT.
- Daniela emite un DTE y **falla** al ajustar folios.
- Un permiso antiguo a nivel de módulo sigue funcionando igual que antes.

---

## 8. Corrección al implementarlo (28-08-2026)

Al construir el mecanismo apareció un error de este mismo documento, y conviene dejarlo escrito porque cambia el catálogo de roles.

**Los permisos extra son aditivos: amplían lo que da el rol, nunca lo recortan.** Es deliberado — si una función suelta pudiera restar, asignar un permiso dejaría a alguien con menos acceso del que ya tenía, y de forma silenciosa.

La consecuencia es que **para acotar a alguien dentro de un módulo, su rol no puede otorgar ese módulo en bloque**. Y el rol `taller` otorga `taller: [read, write]`, así que cualquier función cae al permiso del módulo:

| Con rol `taller` | Resultado |
|---|---|
| `taller.avance` write | permitido |
| `taller.cerrar` write | **permitido** — cae al módulo |
| `taller.gestion` write | **permitido** — cae al módulo |

O sea: la tabla de arriba, que decía que Jenifer y Mercedes tendrían `taller.avance` únicamente, **no era alcanzable**. Con ese rol podían cerrar y anular OT por más funciones que se les acotaran.

Se agrega el rol **`taller_operario`** — `taller: [read]` más `taller.avance: [read, write]` — que sí lo consigue. Es aditivo: ningún usuario existente cambia de rol.

El caso de bodega no tenía este problema y funciona tal como estaba escrito: `bodeguero` da `ventas: [read]`, de modo que `ventas.entregas` amplía sin abrir el módulo. **Diego Ávila marca entregas y sigue sin poder crear ventas.**

### El catálogo de funciones es cerrado

El middleware resuelve cualquier `modulo.funcion`, pero la asignación valida contra una lista fija. Si se aceptara cualquier texto después del punto, un typo como `ventas.entergas` crearía un permiso asignable que no hace nada — exactamente el defecto de los seis módulos fantasma eliminados en `54057ab`.

### Endpoints ya etiquetados

| Endpoint | Antes | Ahora | Quién |
|---|---|---|---|
| `PUT /ventas/items/:id/entregados` | `ventas:write` | `ventas.entregas` | Bodega |
| `POST /ventas/:id/forzar-taller` | `ventas:write` | `ventas.taller` | Coordinación de taller |
| `POST /odts/:id/bitacora` | `taller:write` | `taller.avance` | Operario |
| `POST /odts/:id/consumos` | `taller:write` | `taller.avance` | Operario |
| `PUT/PATCH .../estado` y masivo | `taller:write` | `taller.avance` | Operario |
| `POST /odts` · `PUT /odts/:id` | `taller:write` | `taller.gestion` | Supervisora |
| `DELETE /odts/:id/bitacora/:entryId` | `taller:delete` | `taller.gestion` | Supervisión |
| `POST /odts/:id/cerrar` | `taller:write` | `taller.cerrar` | Supervisora |
| `POST /odts/:id/anular` · `DELETE /odts/:id` | `taller:delete` | `taller.cerrar` | Supervisión |
| `DELETE /odts/:id/materiales/:id` | `taller:delete` | `taller.materiales` | Encargado de materiales |

Hasta que un endpoint se etiquete, resuelve por su módulo como siempre.

### Un hallazgo del etiquetado: nadie del taller puede anular una OT

El rol `taller` tiene `[read, write]` pero **no `delete`**. Como anular y eliminar una OT exigen `delete`, hoy **sólo un admin puede hacerlo** — la supervisora no. Verificado contra el árbol limpio: es anterior a este trabajo y quedó igual.

Es una decisión para Plastimar: si Zalma debe poder anular una OT, hay que darle `delete` sobre `taller.cerrar`. Ahora se puede hacer sin abrirle también el borrado de materiales, que antes venía en el mismo paquete.

### Qué falta

El mecanismo es retrocompatible: verificado que un permiso de módulo sigue habilitando todas sus funciones y que lo negado sigue negado. La pantalla de Accesos ya muestra las funciones bajo su módulo.

Queda **etiquetar `facturacion`, `despacho` y `bodega`** —los tres son del área de Sebastián, así que se coordina con él— y revisar los **74 endpoints que sólo exigen estar logueado**.

---

## 9. Revisión de los 74 endpoints "sólo login" (29-08-2026)

El hallazgo principal es que **la cifra estaba inflada**: la gran mayoría sí está protegida, con formas que el detector no reconocía.

### Lo que el detector no veía

| Forma | Ejemplo | Dónde |
|---|---|---|
| Constante izada por asignación directa | `const adminRead = fastify.rbac('admin','read')` | `admin/`, `reportes/comisiones` |
| Constante dentro del array | `preHandler: [authenticate, adminRead]` | mismo |
| Verificación de rol en el handler | `if (req.user?.role !== 'admin') return 403` | `banners`, `historico`, `accesos`, `cargo-transporte` |
| Permiso comprobado dentro | `if (!canApproveDescuento(user)) return 403` | `descuentos` |
| Permiso por función | `rbac('ventas.entregas','write')` | el etiquetado nuevo |

Casos que parecían graves y no lo eran: los 15 endpoints de `admin` —incluido borrar ítems—, aprobar descuentos, los reportes gerenciales de cobranza y caja, y las comisiones. **Todos con guardia.**

### El susto del asistente de IA

Expone 14 herramientas de negocio: `consultar_planillas` devuelve sueldos por trabajador, más comisiones, caja y RRHH. Ninguna recibe el usuario ni filtra por permisos, y las rutas sólo exigen estar logueado.

**No es una fuga.** El control está antes, en dos capas: un no-admin sólo recibe las definiciones de las herramientas de documentación y UI, y si intenta otra obtiene *"Herramienta no disponible para tu rol"*.

### Lo único real: el permiso `ai` no hacía nada

El comentario del módulo decía que el acceso se controlaba con `rbac('ai','read')`. **El código nunca lo aplicaba**: el control era un `role === 'admin'` fijo. Como `ai` sí es asignable desde la pantalla de Accesos, asignarlo no producía ningún efecto — un permiso que promete y no cumple, la misma clase de defecto que los seis módulos fantasma.

Corregido: ahora el permiso es el que manda. **Hoy no amplía el acceso a nadie** —sólo admin lo alcanza, por su comodín— pero asignarlo funciona.

### Los que legítimamente sólo exigen sesión

`locations` (regiones, comunas, sucursales) y `banners GET` son datos de referencia. `ai/conversaciones` está acotado por `userId` en cada consulta: cada quien ve sólo las suyas.

---

## 10. Lo que ve cada rol

Tres capas que antes no coincidían.

### El tablero de inicio

Mostraba lo mismo a todos: una cortadora veía el total vendido y las cuentas por pagar a proveedores. Acotaba por sucursal, no por permiso. Ahora cada bloque se entrega sólo a quien puede abrir ese módulo.

| Rol | Ventas | Taller | Bodega | Proveedores | Cobranza | Catálogo | RRHH |
|---|---|---|---|---|---|---|---|
| admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| vendedor | ✓ | ✓ | — | — | — | ✓ | — |
| bodeguero | ✓ | — | ✓ | ✓ | — | ✓ | — |
| cajero | ✓ | — | — | — | ✓ | — | — |
| taller · operario | — | ✓ | ✓ | — | — | ✓ | — |
| rrhh | — | — | — | — | — | — | ✓ |

No es sólo filtración: antes ofrecía tarjetas que al hacer clic llevaban a un 403.

### RRHH tenía el tablero vacío

Su rol no incluía ninguno de los módulos que el tablero mostraba. Se resolvió por los dos lados, porque cada uno arregla una mitad:

- **Bloque propio**: dotación activa por empresa, contratos por vencer en 30 días, licencias vigentes. Sólo conteos — la ficha de cada persona y los sueldos viven en su módulo.
- **`reportes: read`**: sin eso, aunque tuviera su bloque, no podría ver ningún reporte de su área.

### El resolvedor del frontend

Le faltaba resolver `modulo.funcion` y no conocía `taller_operario`. Sin eso el menú habría ofrecido pantallas que la API rechaza.

### Un test para que no vuelvan a divergir

Front y back declaran el mismo modelo en **dos archivos distintos**, y ya divergieron una vez: la pantalla de Accesos ofrecía `cotizaciones`, que el backend rechazaba con 400.

`permisos-front-back-coinciden.test.js` compara ambos resolvedores sobre **810 combinaciones** de rol × módulo × nivel, y otras tantas con permisos extra. Si alguien toca un lado y olvida el otro, falla.

---

## 11. Etiquetado completo (30-08-2026)

Se cierran los tres módulos que faltaban. Con esto, **todos los del catálogo tienen sus funciones separadas**.

### Facturación

| Endpoint | Antes | Ahora |
|---|---|---|
| `POST /documentos` · `PUT /documentos/:id` | `facturacion:write` | `facturacion.emitir` |
| `POST /documentos/:id/emitir` · `/enviar` · `/enviar-lote` | `facturacion:write` | `facturacion.emitir` |
| `DELETE /documentos/:id` | `facturacion:write` | `facturacion.anular` |
| `POST /cafs` · `DELETE /cafs/:id` | `facturacion:write` | `facturacion.folios` |

El efecto concreto: **Daniela emite y envía documentos, y ya no puede administrar CAF ni folios**. Antes venían en el mismo paquete.

`ajustar-folio` y `reanudar-certificacion` ya exigían `admin` con `allowExtra: false` — más estricto todavía — y se dejan como estaban.

### Despacho

`PUT /ordenes/:ordenId/packing` → `despacho.packing`; las tres de `/guias` → `despacho.guias`. Armar el packing es trabajo de bodega; emitir la guía, de despacho.

### Bodega

| Endpoint | Función |
|---|---|
| `POST /:id/movimientos` · `POST /importar/stock` | `bodega.movimientos` |
| `POST/PUT/DELETE /:id/proveedores` | `bodega.compras` |
| `POST /importar/precios` · `/web` · `/nuevo` | `bodega.compras` |

Las cargas masivas se separan según lo que muevan: la de stock es inventario, las de precios y catálogo son compras.

### Qué cambia y qué no

Nada de lo que hoy funciona deja de funcionar: los roles no declaran funciones, así que todo cae al módulo como antes. Lo que el etiquetado habilita es **acotar a alguien cuyo rol no otorgue el módulo entero** — verificado con un caso: un `taller_operario` con `bodega.movimientos` registra movimientos y no alcanza compras.

### Cobertura

| | Endpoints |
|---|---|
| Con permiso de módulo o función | 345 |
| Sólo exigen sesión iniciada | 65 |
| Públicos por diseño | 15 |

Los 65 se revisaron uno por uno (§9): la mayoría tiene guardia en formas que el detector no reconoce, y los que legítimamente sólo exigen sesión son datos de referencia o están acotados por `userId`.