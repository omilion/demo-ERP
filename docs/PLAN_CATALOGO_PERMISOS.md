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
| Jenifer Breidenbach | `taller` | **`taller.avance`** únicamente |
| Mercedes Rodríguez | `taller` | **`taller.avance`** únicamente |
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
