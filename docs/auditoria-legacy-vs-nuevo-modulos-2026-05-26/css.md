# Auditoria legacy vs nuevo - css

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\css`

Estado final SPR-17: **Aprobado sin cambios de codigo**

## Naturaleza del modulo

`css` no es un modulo de negocio. Es un conjunto de assets visuales del ERP PHP anterior. No contiene pantallas, consultas, permisos, acciones, exportaciones ni efectos sobre datos.

## Inventario legacy

| Archivo | Descripcion | Decision |
|---|---|---|
| `bootstrap.css` | Bootstrap 3.3.6 sin minificar. | No migrar. |
| `bootstrap.min.css` | Bootstrap 3.3.6 minificado. | No migrar. |
| `bootstrap.css.map` | Source map de Bootstrap. | No migrar. |
| `bootstrap.min.css.map` | Source map de Bootstrap minificado. | No migrar. |
| `estilos_sitio.css` | Estilos propios del ERP PHP: fondo, navbar, paneles, footer, login, tablas responsive, switches, inputs. | Reemplazado por estilos React actuales. |
| `ie10-viewport-bug-workaround.css` | Hack de IE10/Windows 8, ademas el link estaba comentado. | Descartado. |

## Usos legacy observados

- `index.php`, `menu.php`, `login.php`, `login2.php` y `logout.php` cargaban `css/bootstrap.min.css` y `css/estilos_sitio.css`.
- `menu.php` e `index.php` tenian comentado el link al workaround de IE10.
- Algunos archivos de `despacho` usaban CSS externo de DataTables Bootstrap por CDN, no el directorio local `css`.

## Equivalente actual

| Concepto legacy | Nuevo |
|---|---|
| Bootstrap grid/panels/buttons/forms | Componentes React propios y estilos inline/tokens CSS. |
| Navbar custom verde | `TopBar` y tokens CSS. |
| Layout base | `Shell` + `frontend/src/styles/globals.css`. |
| Tablas responsive | `.table-wrap` en `globals.css` y componentes compartidos. |
| Paneles de colores | `Panel`, `KpiCard`, `Badge` y variantes propias. |
| Switch/input custom | Controles React propios segun cada modulo. |
| Inputs de totales `.input_totales` | No hay clase global equivalente; debe resolverse como variante de componente si un flujo financiero lo requiere. |
| Alertas Bootstrap `alert-*` | No se migra Bootstrap; conviene componente React compartido si se repite. |
| Boton `.arrowtop` | No replicado; opcional para reportes/listados largos. |

## Decision tecnica

No se debe copiar ni importar el CSS legacy. La nueva plataforma ya tiene un sistema visual propio y meter Bootstrap 3 globalmente podria introducir regresiones en formularios, tablas, botones y layout.

La equivalencia requerida para estos assets queda cubierta por reemplazo moderno, no por migracion literal.

Observacion del subagente: no hay P0, pero se recomienda que futuras reparaciones funcionales usen componentes compartidos para alertas, inputs de montos/totales y tablas responsive, evitando estilos sueltos por pantalla.

Observacion tecnica: Bootstrap 3 trae reglas globales de `html`, `body`, botones, tablas, formularios, navbar y modales; ademas referencia Glyphicons por `../fonts/...`. `estilos_sitio.css` referencia imagenes por `../img/...`. Migrarlo sin scope ni assets romperia el flujo Vite/React o generaria rutas 404.

## Validaciones

| Validacion | Resultado |
|---|---|
| Inventario de archivos en `legacy/css` | 6 archivos, todos assets visuales. |
| Busqueda de referencias legacy | `bootstrap.min.css` y `estilos_sitio.css` cargados por pantallas base. |
| Busqueda en frontend nuevo | No hay dependencia Bootstrap ni import de CSS legacy. |
| `npm.cmd run lint` en frontend | OK. |
| `npm.cmd run build` en frontend | OK; warning conocido de chunk grande. |

## Resultado

SPR-17 queda **aprobado**. No requiere cambio de codigo ni migracion de assets. Cualquier necesidad visual puntual de un modulo futuro debe resolverse con el sistema de estilos actual.
