# SPR-26-js - js

Prioridad: **P3 - soporte tecnico**  
Dominio: **Soporte / Assets / Infraestructura**  
Subagentes especialistas: **Hubble + Rawls**  
Estado: **Aprobado sin cambios de codigo**

## Objetivo

Revisar la carpeta legacy `js` y confirmar si contiene logica funcional que deba migrarse o si corresponde descartarla como vendor antiguo.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/js.md`
- Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\js`
- Archivos legacy:
  - `bootstrap.js`
  - `bootstrap.min.js`
  - `docs.min.js`
  - `ie-emulation-modes-warning.js`
  - `ie10-viewport-bug-workaround.js`
  - `jquery.min.js`
  - `npm.js`
- Plataforma nueva:
  - `frontend/package.json`
  - `frontend/index.html`
  - `frontend/src/main.jsx`
  - `frontend/src/api/client.js`

## Como se mostraba en legacy

- No existia pantalla propia `js`.
- La carpeta era soporte tecnico del frontend PHP:
  - jQuery 1.9.1.
  - Bootstrap 3.3.6.
  - Scripts de documentacion/demo de Bootstrap.
  - Workarounds IE antiguos.
- Legacy los cargaba para modales, dropdowns, AJAX jQuery, tabs y estilos Bootstrap.

## Como se muestra hoy

- La plataforma nueva usa React, Vite, React Router, TanStack Query, Axios y Zustand.
- No hay dependencia nueva a jQuery ni Bootstrap.
- No hay imports runtime de `jquery`, `bootstrap`, scripts IE ni `ajax.js`.
- Las interacciones legacy se reemplazan por componentes React y llamadas API tipadas por modulo.

## Decision

No migrar `legacy/js`. Copiar jQuery/Bootstrap 3 agregaria deuda tecnica y no aporta funcionalidad faltante.

## Separacion importante

La carpeta `js/` no debe confundirse con scripts fuera de la carpeta:

- `C:\Users\flipe\Downloads\sisgestion\sisgestion\ajax.js`
  - Contiene logica funcional legacy para ventas, bodega, licitaciones, convenio marco, venta web, carga de listados y operaciones AJAX.
  - No pertenece a SPR-26.
  - Sus brechas se revisan dentro de cada sprint funcional.
- `C:\Users\flipe\Downloads\sisgestion\sisgestion\sisgestion.js`
  - Contiene helpers de telas y modales Bootstrap.
  - Debe considerarse en sprints de telas/taller si aplica.
- Scripts inline en archivos PHP:
  - Deben revisarse dentro del modulo respectivo, no como migracion global de `js`.

## Brechas revisadas

| Item | Resultado |
| --- | --- |
| Pantallas propias | No aplica. |
| Logica de negocio en `js/` | No existe. |
| Dependencia runtime nueva | No hay jQuery/Bootstrap. |
| Modales/dropdowns Bootstrap | Reemplazados por componentes React. |
| AJAX global de jQuery | Esta en `ajax.js` raiz, fuera de este sprint. |
| Workarounds IE | Obsoletos, no migrar. |

## Validacion

- Revision estatica de `legacy/js`.
- Revision de dependencias nuevas en `frontend/package.json`.
- Busqueda en `frontend/src` sin referencias a jQuery/Bootstrap runtime.
- Revision por subagentes:
  - Hubble: aprobado sin P0/P1.
  - Rawls: aprobado sin P0/P1.

## Pruebas

- No se ejecutaron pruebas automatizadas porque no hubo cambios de runtime.
- Validacion suficiente: auditoria estatica de vendor legacy y dependencias nuevas.

## Riesgos residuales

- Si aparece una brecha heredada desde `ajax.js` o desde scripts inline PHP, debe corregirse en el sprint del modulo afectado. No se debe resolver copiando jQuery/Bootstrap globalmente.

## Checklist de validacion final

- [x] Inventariar archivos legacy.
- [x] Confirmar que son vendor/soporte.
- [x] Revisar dependencias nuevas.
- [x] Confirmar ausencia de jQuery/Bootstrap runtime.
- [x] Distinguir `js/` de `ajax.js` raiz.
- [x] Obtener validacion final de subagentes.

## Resultado de ejecucion

- Implementacion realizada: No aplica.
- Archivos modificados: documentacion del sprint y auditoria.
- Pruebas ejecutadas: revision estatica.
- Riesgos residuales: bajos y documentados.
- Validacion del lead: aprobado.
- Decision final: **SPR-26 aprobado sin cambios de codigo.**
