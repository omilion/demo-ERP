# SPR-17-css - css

Prioridad: **P3 - soporte tecnico**
Dominio: **Soporte / Assets / Infraestructura**
Subagentes revisores: **Soporte-Legacy + revision tecnica**
Estado: **Aprobado sin cambios de codigo**

## Objetivo

Revisar el directorio legacy `css` para confirmar si contenia funcionalidad que deba migrarse a la plataforma nueva, o si solo era una dependencia visual del ERP PHP anterior.

## Evidencia legacy revisada

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\bootstrap.css`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\bootstrap.css.map`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\bootstrap.min.css`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\bootstrap.min.css.map`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\estilos_sitio.css`
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\ie10-viewport-bug-workaround.css`

## Comportamiento legacy exacto

| Archivo legacy | Uso detectado | Funcion real |
|---|---|---|
| `bootstrap.css` / `bootstrap.min.css` | Referenciado por `index.php`, `menu.php`, `login.php`, `login2.php`, `logout.php`. | Framework visual Bootstrap 3.3.6 para grillas, paneles, botones, formularios, navbar, modales y tablas. |
| `bootstrap.css.map` / `bootstrap.min.css.map` | Soporte de debugging del navegador. | No afecta operacion de usuario final. |
| `estilos_sitio.css` | Referenciado por las mismas pantallas base. | Personalizacion visual: fondo con imagen, navbar verde, paneles de colores, footer, scroll horizontal de tablas, login, inputs grandes, switch, iconos dentro de inputs. |
| `ie10-viewport-bug-workaround.css` | El link estaba comentado en `index.php` y `menu.php`. | Hack antiguo para bug de viewport en IE10/Windows 8; no era flujo funcional. |

## Estado en la plataforma nueva

| Area | Estado actual | Decision |
|---|---|---|
| Framework visual | La app nueva usa React/Vite, CSS propio en `frontend/src/styles/globals.css`, variables CSS y estilos de componentes. | No importar Bootstrap 3. |
| Navbar / layout | La navegacion actual se implementa en componentes React (`TopBar`, `Shell`) con estilos propios. | Reemplazado. |
| Paneles, botones, tablas y formularios | Existen componentes propios compartidos y estilos inline controlados por tokens CSS. | Reemplazado. |
| Tabla responsive | `globals.css` incluye `.table-wrap` para overflow horizontal. | Cubierto. |
| Login/fondo legacy | La estetica de fondo e imagen del ERP PHP no es requisito funcional y no corresponde al rediseño actual. | No migrar. |
| IE10 viewport hack | Navegadores objetivo actuales no requieren ese hack. | Descartado. |
| CSS maps legacy | Solo debugging de Bootstrap legacy. | No migrar. |

## Brechas detectadas

| Severidad | Hallazgo | Decision |
|---|---|---|
| P0 | No se detecto funcionalidad de negocio en `css`. | Sin accion. |
| P1 | No se detecto dependencia actual del frontend nuevo hacia clases Bootstrap legacy (`btn-*`, `panel-*`, `glyphicon`, etc.). | Sin accion. |
| P2 | Algunos patrones visuales legacy existen como concepto: tabla responsive, navbar, paneles, inputs destacados. | Ya estan reemplazados por componentes/tokens actuales; no se clona estilo legacy. |
| P2 | Legacy tenia patrones concretos como `.input_totales`, `.inputcajasv`, `.alert-*`, `.arrowtop` y `.panel-heading-custom*`. | No se migran como CSS global; si un modulo los requiere, debe resolverse con componentes React compartidos. |

## Por que no se migra Bootstrap 3

- Bootstrap 3.3.6 es una dependencia antigua y global; importarla al frontend React actual podria colisionar con resets, tablas, botones y formularios.
- El CSS legacy depende de clases y markup PHP (`panel`, `navbar-default`, `glyphicon`, `col-md-*`) que no existen como contrato en la nueva app.
- Bootstrap legacy referencia assets implicitos (`../fonts/...`) y `estilos_sitio.css` referencia imagenes (`../img/fondo.jpg`, `../img/up.png`); copiarlos sin flujo Vite controlado generaria 404 o rutas rotas.
- Bootstrap tambien define reglas globales de `.modal`, `.modal-backdrop`, tablas, formularios y navbars que pueden romper componentes React actuales.
- La plataforma nueva ya compila su CSS propio y no necesita el runtime visual anterior.
- Migrarlo seria cosmetico y riesgoso; no agrega datos, permisos, validaciones ni acciones operativas.

## Validaciones ejecutadas

| Comando | Resultado |
|---|---|
| `rg -l "estilos_sitio.css" legacy -g "*.php" -g "*.html"` | 5 archivos base legacy referenciaban el CSS custom. |
| `rg -l "bootstrap(.min)?.css" legacy -g "*.php" -g "*.html"` | 8 referencias legacy, incluyendo DataTables Bootstrap en despacho. |
| `rg "bootstrap" frontend/src frontend/package.json` | Sin dependencia Bootstrap en frontend nuevo. |
| `npm.cmd run lint` en `frontend` | OK. |
| `npm.cmd run build` en `frontend` | OK, con warning conocido de chunk > 500 kB. |

## Riesgos residuales

- Si en un sprint funcional futuro se replica una pantalla legacy con una dependencia visual muy especifica, debe implementarse con componentes nuevos, no copiando `css/`.
- Conviene crear un componente compartido de alerta y una variante de input para montos/totales solo cuando un sprint funcional lo use de forma repetida.
- El boton legacy `.arrowtop` no se replica ahora; puede evaluarse para reportes muy largos si aparece una necesidad operativa real.
- La equivalencia visual exacta pixel a pixel del ERP PHP no entra en scope; el alcance es funcional y operativo.

## Checklist de validacion final

- [x] Revisar archivos CSS legacy y anotar comportamiento exacto.
- [x] Confirmar usos principales en pantallas legacy base.
- [x] Revisar equivalente nuevo en `frontend/src/styles/globals.css` y componentes React.
- [x] Confirmar que no existe dependencia Bootstrap nueva.
- [x] Ejecutar lint frontend.
- [x] Ejecutar build frontend.
- [x] Registrar evidencia y decision.
- [x] Validacion final del lead.

## Resultado de ejecucion

- Implementacion realizada: **No aplica; soporte visual legacy reemplazado por sistema de estilos nuevo**.
- Archivos modificados:
  - `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-17-css.md`
  - `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/css.md`
- Pruebas ejecutadas: **lint/build frontend OK**.
- Riesgos residuales: **Ninguno bloqueante**.
- Validacion del lead: **Aprobado**.
- Decision final: **SPR-17 aprobado. Continuar con SPR-18.**
