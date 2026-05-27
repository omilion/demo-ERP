# Auditoria legacy vs nuevo - js

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\js`  
Estado final: **Aprobado sin migracion**

## Como se mostraba / funcionaba en legacy

La carpeta `js` era soporte/vendor del frontend PHP:

- `jquery.min.js`
- `bootstrap.js`
- `bootstrap.min.js`
- `docs.min.js`
- `ie-emulation-modes-warning.js`
- `ie10-viewport-bug-workaround.js`
- `npm.js`

No contiene pantallas ni reglas de negocio. Su funcion era habilitar Bootstrap 3, jQuery y compatibilidad antigua de navegador.

## Como se muestra hoy en la plataforma nueva

- React + Vite reemplazan el stack PHP/Bootstrap/jQuery.
- Axios centraliza llamadas HTTP en `frontend/src/api/client.js`.
- TanStack Query maneja cache/estado servidor.
- Los componentes React reemplazan modales, tabs, dropdowns y estados de carga.
- No se declara ni se importa jQuery/Bootstrap en el frontend nuevo.

## Comparacion

| Aspecto | Legacy | Plataforma nueva | Estado |
| --- | --- | --- | --- |
| Framework UI | Bootstrap 3 + jQuery | React + componentes propios | Reemplazado |
| AJAX | jQuery `$.ajax` | Axios + hooks API | Reemplazado |
| Modales | Bootstrap modal | Estado/componente React | Reemplazado |
| Workarounds IE | Scripts IE10/IE emulation | No aplica | Descartado |
| Logica de negocio | No existe en `js/` | No requiere migracion | Cubierto |

## Nota sobre scripts fuera de carpeta

`ajax.js` raiz y `sisgestion.js` raiz no pertenecen a la carpeta `js`.

- `ajax.js` contiene logica funcional por modulo y debe revisarse en cada sprint de modulo.
- `sisgestion.js` contiene helpers de telas/modales y debe revisarse en telas/taller cuando corresponda.
- Scripts inline PHP deben tratarse dentro de su modulo funcional.

## Decision

No migrar `legacy/js`. No instalar jQuery ni Bootstrap 3 en la plataforma nueva.

## Evidencia revisada

- Carpeta legacy `js`.
- `frontend/package.json`.
- `frontend/index.html`.
- `frontend/src/main.jsx`.
- `frontend/src/api/client.js`.
- Busqueda en `frontend/src` sin dependencias runtime jQuery/Bootstrap.

## Resultado

Sprint asociado: `SPR-26-js`  
Resultado: **aprobado sin cambios de codigo**  
Validacion: Hubble y Rawls aprobaron sin P0/P1.
