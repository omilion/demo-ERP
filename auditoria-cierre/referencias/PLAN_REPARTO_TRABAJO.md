# Reparto de trabajo sin pisarnos

Acuerdo de trabajo entre las dos personas que están desarrollando sobre este repo. Nace de un problema real: en la última jornada **27 archivos fueron tocados por ambos**, hubo cambios sin commitear durante horas y cambios de rama que arrastraron el trabajo del otro.

---

## 1. Qué pasó realmente

Los archivos que ambos editamos, ordenados por conflicto:

| Archivo | Por qué es peligroso |
| --- | --- |
| `backend/prisma/schema.prisma` | Toda migración pasa por acá. Dos migraciones simultáneas chocan por timestamp y por orden de aplicación |
| `frontend/src/utils/permissions.js` · `backend/src/middleware/rbac.js` | Los dos definen el mismo modelo de permisos en dos lugares |
| `backend/src/routes/usuarios/index.js` | Catálogo de módulos y roles |
| `frontend/src/components/TopBar.jsx` | Menú: cada módulo nuevo agrega una línea |
| `backend/src/routes/clientes/*` · `crm/index.js` · `ventas/create.js` · `ventas/update.js` | Rutas grandes donde cabe trabajo de varias áreas |
| `frontend/src/pages/crm/CrmPage.jsx` · `ClientesFormPage.jsx` | Pantallas grandes con secciones independientes |

Los incidentes concretos que hubo:

- Una rama nueva (`feat/ficha-ventas-unificada`) creada mientras el otro trabajaba, que se llevó commits a un lugar inesperado.
- Trabajo sin commitear en `ClientesPage.jsx` durante horas, que obligó a editar el trabajo en curso del otro para poder avanzar.
- Dos versiones en paralelo de la ficha de cliente: un panel lateral y una página nueva, que resolvían lo mismo.

---

## 2. Regla de oro

**El reparto es por área vertical, no por capa.**

Nada de "uno hace backend y otro frontend": una funcionalidad toca modelo, ruta y pantalla, y partirla por capa garantiza que ambos abran los mismos archivos. Cada quien toma un área completa, de la base a la UI.

---

## 3. Áreas y dueño

| Área | Incluye | Archivos propios |
| --- | --- | --- |
| **A · Ventas y CRM** | CU-01 a CU-06, Trato Directo, grafías de tipo, adjudicación parcial | `routes/ventas/*`, `routes/crm/*`, `pages/ventas/*`, `pages/crm/*` |
| **B · Bodega y despacho** | Inventario disponible/reservado/dañado, ubicaciones, tablero, packing, guías | `routes/productos`, `stock-ingresos`, `despachos`, `pages/bodega/*`, `pages/despachos/*` |
| **C · Talleres** | Corte, confección, espuma: avance, consumo, evidencia, merma | `routes/odts/*`, `taller-corte`, `bitacora-taller`, `pages/taller*` |
| **D · Finanzas** | Facturación, cobranza, alertas de pago, conciliación | `routes/facturacion/*`, `cobranza`, `caja`, `pages/facturacion/*` |
| **E · Permisos y RRHH** | Catálogo de funciones, `rbac`, usuarios, vínculo RRHH | `middleware/rbac.js`, `utils/permissions.js`, `routes/usuarios`, `routes/rrhh` |

Nadie toca el área del otro sin avisar. Si un cambio en A necesita algo de E, se pide; no se hace de paso.

---

## 4. Los transversales: un dueño único, a la vez

Dos trabajos atraviesan **todas** las áreas y no se pueden repartir:

- **Flujo único de estados de venta** — aparece como brecha en gerencia, cobranza, bodega, despacho y los tres talleres.
- **Motor de alertas con escalamiento** — igual.

Regla: **se hacen de a uno, con un solo dueño, y mientras está en curso el resto no toca estados ni notificaciones.** Son cambios que reescriben la misma columna desde diez lugares.

---

## 5. Protocolo para los archivos compartidos

Hay archivos que ningún reparto evita. Para esos:

**`schema.prisma` y migraciones**

Es el riesgo mayor, y hay evidencia directa: las últimas ocho migraciones están **alternadas** entre los dos, sin ninguna coordinación visible.

| Migración | Autor |
| --- | --- |
| `20260819003000_add_odt_legacy_n_interno` | Sebastián |
| `20260819110000_crm_licitacion_source` | Codex |
| `20260824120000_user_cargo` | Codex |
| `20260824180000_orden_cliente_relation` | Codex |
| `20260824200000_add_cliente_pais` | Sebastián |
| `20260826020000_descuentos_auditoria_aprobacion` | Codex |
| `20260826120000_add_role_coordinador_comercial` | Sebastián |

Funcionó por suerte, no por diseño: nadie tocó la misma tabla el mismo día. Reglas:

- Se avisa antes de crear una migración.
- El nombre lleva iniciales: `20260828_SR_add_campo` / `20260828_CX_add_campo`. Evita el choque de timestamp.
- Nunca se edita el modelo de otra área "de paso".
- Después de un `pull` que traiga migraciones ajenas, correr `prisma migrate dev` antes de seguir. Si no, tu próxima migración se genera contra un esquema desactualizado.

**`permissions.js` + `rbac.js` + `usuarios/index.js`**
- Son el área E. **Sólo su dueño los edita.**
- Están duplicados en front y back: cambiar uno sin el otro deja el sistema incoherente.

**`TopBar.jsx`**
- Sólo se agregan líneas al final del grupo que corresponda. No se reordena ni se reestructura sin avisar.

---

## 6. Disciplina de rama

Lo que causó más daño esta jornada.

1. **Cada uno en su rama**, nombrada por área: `area-a-ventas`, `area-e-permisos`.
2. **Nadie cambia la rama del árbol del otro.** Si necesitas otra rama, usa `git worktree`, que no toca el checkout ajeno.
3. **No dejar trabajo sin commitear al terminar la sesión.** Si quedó a medias, un commit `wip:` en tu rama. Trabajo sin commitear durante horas es la forma más rápida de que el otro lo pise o lo edite sin querer.
4. **Integrar a `main` seguido**, con ramas cortas. Una rama de tres días es un conflicto garantizado.
5. **Antes de empezar el día:** `git fetch && git log --oneline origin/main -5`. Saber qué cambió mientras no estabas.
6. **Borrar la rama al terminar.** Hoy hay **15 ramas** en el repo, casi todas muertas (`codex/main-*`, `fix/*`, `feat/*`). Un listado lleno de ramas viejas hace que nadie sepa cuál está viva.

---

## 7. Antes de tocar algo del otro

Pasa. Si es inevitable:

1. Avisar primero.
2. Cambio quirúrgico, no reescritura.
3. Commit propio y separado, que diga que toca área ajena.
4. No commitear el trabajo en curso del otro junto al tuyo.

---

## 8. Reparto propuesto de lo que viene

De los 59 requerimientos abiertos en la revisión de Christopher:

| Área | Prioridad inmediata |
| --- | --- |
| A · Ventas y CRM | Grafías de tipo, cliente opcional en boleta, Trato Directo, referencia de Marketplace |
| B · Bodega | Preparar la carga masiva de ubicaciones (34.732 productos sin asignar) |
| C · Talleres | Nada de código todavía: primero cargar recetas, que hoy son 0 |
| D · Finanzas | Definir el modelo de compromiso de pago, antes de las alertas 15/5/0 |
| E · Permisos | Cerrar el catálogo de funciones y extender `rbac` |

Y en paralelo, **lo que no es desarrollo** y hay que pedirle a Plastimar: cargar recetas, asignar ubicaciones, definir el flujo de estados, y las reglas de descuento con Paulina. Es lo que más brechas cierra por peso y no depende de nosotros.

---

## 9. Lo mínimo que hay que respetar

Si de todo este documento sólo sobrevive una parte, que sea ésta:

1. Cada uno en su rama; nadie cambia la rama del otro.
2. Nada sin commitear al terminar.
3. `schema.prisma` y los permisos tienen dueño único.
4. Los transversales van de a uno.
