# SPR-22-font - font

Prioridad: **P3 - soporte tecnico**  
Dominio: **Soporte / Assets / Infraestructura**  
Estado: **Aprobado sin cambios de codigo**  
Decision final: **No migrar como modulo funcional**

## Objetivo

Revisar la carpeta legacy `font` y confirmar si corresponde a una pantalla/flujo operativo o a un asset tecnico usado por librerias legacy.

## Evidencia legacy revisada

- `font/courier.php`
- `font/helvetica.php`
- `font/helveticab.php`
- `font/helveticabi.php`
- `font/helveticai.php`
- `font/symbol.php`
- `font/times.php`
- `font/timesb.php`
- `font/timesbi.php`
- `font/timesi.php`
- `font/zapfdingbats.php`
- `font/makefont/makefont.php`
- mapas `font/makefont/*.map`
- `fpdf.php`

## Resultado de auditoria

- No hay pantallas PHP, CRUD, formularios, filtros, permisos, importaciones ni exportaciones propias en `font`.
- La carpeta contiene definiciones de metricas de FPDF (`$fpdf_charwidths`) y la herramienta legacy `MakeFont`.
- FPDF legacy cargaba esas definiciones desde `FPDF_FONTPATH` / `dirname(__FILE__).'/font/'`.
- No se detecto dependencia equivalente en la plataforma nueva: no se usa FPDF en backend/frontend.
- La plataforma nueva usa fuentes web/CSS y exportaciones CSV/print del navegador segun cada modulo.

## Implementacion

No se hicieron cambios de codigo. La migracion de esta carpeta no corresponde porque no representa funcionalidad de negocio.

## Validacion

- Revision local de dependencias legacy: **OK**.
- Revision multiagente independiente: **aprobada, sin P0/P1**.
- Pruebas automatizadas: **no aplican**, porque no hubo cambio de codigo ni flujo funcional.

## Riesgos residuales

- Si en el futuro se exige replicar PDF pixel-perfect de algun reporte legacy, se debe resolver dentro del sprint del modulo que genera ese PDF, no en `font`.

## Decision final

**Aprobado sin cambios.** `font` queda documentado como asset legacy FPDF no migrable a la plataforma nueva.
