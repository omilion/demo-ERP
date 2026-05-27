# SPR-23-fonts - fonts

Prioridad: **P3 - soporte tecnico**  
Dominio: **Soporte / Assets / Infraestructura**  
Subagentes especialistas: **Hubble + Rawls**  
Estado: **Aprobado sin cambios de codigo**

## Objetivo

Revisar la carpeta legacy `fonts` y confirmar si contiene funcionalidad, pantallas, permisos, exportaciones o assets que deban migrarse a la plataforma nueva.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/fonts.md`
- Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\fonts`
- Referencias legacy:
  - `C:\Users\flipe\Downloads\sisgestion\sisgestion\css\bootstrap.css`
  - `C:\Users\flipe\Downloads\sisgestion\sisgestion\menu.php`
  - `C:\Users\flipe\Downloads\sisgestion\sisgestion\index.php`
- Referencias plataforma nueva:
  - `frontend/package.json`
  - `frontend/src/components/shared/index.jsx`

## Como se mostraba en legacy

- `fonts` no era un modulo operativo ni una pantalla.
- La carpeta contiene solamente los assets de Glyphicons de Bootstrap 3:
  - `glyphicons-halflings-regular.eot`
  - `glyphicons-halflings-regular.svg`
  - `glyphicons-halflings-regular.ttf`
  - `glyphicons-halflings-regular.woff`
  - `glyphicons-halflings-regular.woff2`
- Bootstrap 3 los cargaba mediante `@font-face` desde `css/bootstrap.css`.
- Las pantallas PHP legacy los usaban como iconos visuales con clases `glyphicon`, por ejemplo en botones de editar, borrar, agregar, volver o buscar.
- No hay CRUD, formularios, filtros, reportes, exportaciones, permisos ni reglas de negocio dentro de esta carpeta.

## Como se muestra hoy

- La plataforma nueva no usa Bootstrap 3 ni Glyphicons.
- `frontend/package.json` no declara dependencia de Glyphicons, Bootstrap 3, `lucide-react` ni `react-icons`.
- El reemplazo actual es el componente compartido `Icon` con SVG inline en `frontend/src/components/shared/index.jsx`.
- Ese enfoque cubre la necesidad funcional real: mostrar affordances visuales en botones y acciones sin depender de una fuente web legacy.

## Brechas revisadas

| Item | Resultado |
| --- | --- |
| Pantallas legacy propias | No aplica. No existen PHP ni vistas dentro de `fonts`. |
| Funcionalidad de negocio | No aplica. Solo assets visuales. |
| Uso transversal legacy | Confirmado: las pantallas PHP usaban clases `glyphicon` por Bootstrap 3. |
| Equivalente nuevo | Confirmado: iconos SVG inline mediante componente compartido `Icon`. |
| Migracion requerida | No. Migrar Glyphicons importaria deuda tecnica sin aportar funcionalidad. |
| Riesgo por descarte | Bajo. El nuevo frontend no referencia esos archivos. |

## Decision de reparacion

No se implementan cambios. La migracion correcta es **no portar `fonts`**, porque su unica funcion era soportar iconos de Bootstrap 3 en el sistema legacy. La plataforma nueva ya resuelve ese mismo uso con SVG inline, que es mas mantenible, no depende de archivos de fuente y evita arrastrar Bootstrap 3.

## Validacion realizada

- Revision estatica de la carpeta legacy: solo contiene archivos `glyphicons-halflings-regular.*`.
- Busqueda de referencias legacy: `glyphicon` aparece en multiples pantallas PHP, siempre como clase visual.
- Revision de dependencias nuevas: no hay dependencia a Glyphicons ni Bootstrap 3.
- Revision de UI nueva: `Icon` esta centralizado en `frontend/src/components/shared/index.jsx`.
- Revision por subagentes:
  - Hubble: aprobado sin P0/P1.
  - Rawls: aprobado sin P0/P1.

## Pruebas

- No se ejecutaron pruebas automatizadas porque no hubo cambios de runtime.
- Validacion suficiente para este sprint: auditoria estatica de assets y dependencias.

## Riesgos residuales

- Si en el futuro se importa una pantalla legacy tal cual, sus clases `glyphicon` no tendran icono. Esa ruta no es parte del scope aprobado: las pantallas nuevas deben usar el componente `Icon`.

## Checklist de validacion final

- [x] Revisar carpeta legacy y anotar comportamiento exacto.
- [x] Revisar dependencia legacy real en Bootstrap/Glyphicons.
- [x] Revisar pantalla/API nueva equivalente cuando aplica.
- [x] Confirmar que no hay logica de datos, permisos, exports ni filtros.
- [x] Confirmar que no se requiere migracion de assets.
- [x] Registrar evidencia y decision.
- [x] Validacion final del lead.

## Resultado de ejecucion

- Implementacion realizada: No aplica; descarte tecnico aprobado.
- Archivos modificados: solo documentacion del sprint y auditoria.
- Pruebas ejecutadas: revision estatica; no hubo cambios de codigo.
- Riesgos residuales: bajo, documentado.
- Validacion del lead: aprobado.
- Decision final: **SPR-23 aprobado sin cambios de codigo.**
