# Auditoria legacy vs nuevo - fonts

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\fonts`  
Estado final: **Aprobado sin migracion**

## Como se mostraba / funcionaba en legacy

- No era una pantalla ni un modulo operativo.
- La carpeta contenia solamente los archivos de fuente de Glyphicons usados por Bootstrap 3:
  - `glyphicons-halflings-regular.eot`
  - `glyphicons-halflings-regular.svg`
  - `glyphicons-halflings-regular.ttf`
  - `glyphicons-halflings-regular.woff`
  - `glyphicons-halflings-regular.woff2`
- `css/bootstrap.css` declaraba el `@font-face` y las pantallas PHP usaban clases `glyphicon`.
- El uso era visual: iconos en botones, inputs y acciones. No habia datos, validaciones, permisos, reportes ni reglas de negocio en esta carpeta.

## Como se muestra hoy en la plataforma nueva

- La plataforma nueva no depende de Bootstrap 3 ni de Glyphicons.
- No existen referencias nuevas a `glyphicons-halflings-regular.*`.
- Los iconos de acciones se resuelven con el componente compartido `Icon` y SVG inline en `frontend/src/components/shared/index.jsx`.

## Comparacion

| Aspecto | Legacy | Plataforma nueva | Estado |
| --- | --- | --- | --- |
| Iconos visuales | Glyphicons via font web de Bootstrap 3 | SVG inline con componente `Icon` | Cubierto |
| Pantalla propia | No tiene | No requiere | Cubierto |
| CRUD / datos | No tiene | No requiere | Cubierto |
| Permisos | No tiene | No requiere | Cubierto |
| Exportaciones | No tiene | No requiere | Cubierto |
| Dependencia tecnica | Bootstrap 3 + font files | React + SVG inline | Reemplazado |

## Brechas

No quedan brechas funcionales. La carpeta `fonts` no debe migrarse como asset propio porque solo soportaba una libreria visual legacy ya reemplazada.

## Decision

No portar `fonts` a la plataforma nueva. La equivalencia funcional queda cubierta por el sistema de iconos SVG actual. Cualquier pantalla nueva o migrada debe usar el componente `Icon`, no clases `glyphicon`.

## Evidencia revisada

- Carpeta legacy `fonts`: solo archivos `glyphicons-halflings-regular.*`.
- `css/bootstrap.css`: declara `@font-face` para Glyphicons.
- Pantallas PHP legacy: referencias `glyphicon` como clases visuales.
- `frontend/package.json`: sin dependencia Bootstrap 3/Glyphicons.
- `frontend/src/components/shared/index.jsx`: componente `Icon` con SVG inline.

## Resultado

Sprint asociado: `SPR-23-fonts`  
Resultado: **aprobado sin cambios de codigo**  
Validacion: Hubble y Rawls aprobaron sin P0/P1.
