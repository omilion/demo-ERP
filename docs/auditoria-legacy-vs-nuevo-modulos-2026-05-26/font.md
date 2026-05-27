# Auditoria legacy vs nuevo - font

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\font`

Estado final: **Aprobado sin migracion**

## Como funcionaba en legacy

- Carpeta tecnica de FPDF.
- Contiene metricas de fuentes base: Courier, Helvetica, Symbol, Times y ZapfDingbats.
- Contiene utilidad `makefont` y mapas de encoding.
- No contiene pantallas ni flujo operativo propio.

## Como queda en la plataforma nueva

- No hay equivalente directo porque la plataforma nueva no usa FPDF.
- La UI usa fuentes web/CSS.
- Las exportaciones actuales se resuelven por modulo con CSV backend o impresion del navegador.

## Decision

No migrar `font` como modulo. Si un reporte futuro requiere PDF exacto al legacy, se abordara dentro del modulo que genera ese reporte.

## Validacion

- Revision local de archivos legacy: OK.
- Revision multiagente: aprobado sin P0/P1.
- Pruebas: no aplican, sin cambios de codigo.
