# Índice de fuentes incluidas

## Fuentes originales de Plastimar

| Archivo | Aporte a la auditoría |
|---|---|
| [Encuesta Taller de Corte](fuentes-originales/Encuesta_taller_de_corte_Plastimar.docx) | Trabajo de Jenifer/Mercedes, MK, medidas, colores, imagen, producción diaria, prioridad y traspaso a Confección |
| [Encuesta Taller de Confección](fuentes-originales/Encuesta_taller_de_confeccion_Plastimar.docx) | Flujo de Zalma, asignación, producción por operaria, autorización, prioridad y entrega a Despacho |
| [Encuesta Taller de Espuma](fuentes-originales/Encuesta_taller_de_espuma_Plastimar.docx) | Densidad, medidas, stock, consumos, merma, prioridad, sustitución y entrega |
| [Encuesta Bodega 1](fuentes-originales/Encuesta_bodega_1_Plastimar.docx) | Integración de materiales, movimientos y entrega/recepción |
| [Informe consolidado ERP](fuentes-originales/Informe_Consolidado_ERP_Plastimar_24-08-2026.docx) | Contexto transversal y problemas de integración |

## Revisiones y planes internos

| Archivo | Uso y vigencia |
|---|---|
| [09_taller_corte.md](referencias/09_taller_corte.md) | Línea base de Corte al 26 de agosto; parcialmente superada |
| [10_taller_confeccion.md](referencias/10_taller_confeccion.md) | Línea base de Confección al 26 de agosto; parcialmente superada |
| [11_taller_espuma.md](referencias/11_taller_espuma.md) | Línea base de Espuma al 26 de agosto; parcialmente superada |
| [00_datos_y_esfuerzo.md](referencias/00_datos_y_esfuerzo.md) | Metodología y datos compartidos por las revisiones de código del 26 de agosto |
| [PLAN_PENDIENTES_DESARROLLO_2026-08-31.md](referencias/PLAN_PENDIENTES_DESARROLLO_2026-08-31.md) | Reparto de ODT interna, devolución, densidad/lote/calidad/merma y dependencias |
| [PLAN_REPARTO_TRABAJO.md](referencias/PLAN_REPARTO_TRABAJO.md) | Propiedad de áreas y coordinación |
| [REPARTO_AREAS_SEBASTIAN.md](referencias/REPARTO_AREAS_SEBASTIAN.md) | Alcance detallado atribuido a Sebastián y dependencia de los planes posteriores |
| [PENDIENTES_SEBASTIAN_2026-08-31.md](referencias/PENDIENTES_SEBASTIAN_2026-08-31.md) | Pendientes atribuidos a Sebastián |
| [CIERRE_TRABAJO_SEBASTIAN_2026-08-30.md](referencias/CIERRE_TRABAJO_SEBASTIAN_2026-08-30.md) | Antecedente de cambios y verificación |
| [Auditoría técnica de Sebastián](referencias/AUDITORIA_TALLER_SEBASTIAN_2026-09-01.md) | Revisión estática/técnica y pruebas; se usa como evidencia secundaria, no como verificación de adopción productiva |

## Capturas históricas

Las imágenes de `evidencia/capturas-historicas/` documentan la interfaz disponible en la línea base anterior:

- ODT Taller;
- Nueva ODT;
- Pasar a Taller;
- Bodega Taller;
- Bitácora;
- Historial de materiales;
- Telas.

No deben interpretarse como capturas del despliegue exacto del 1 de septiembre.

## Fuentes de código principales

- `backend/prisma/schema.prisma`
- `backend/src/routes/odts/item-workflow.js`
- `backend/src/routes/odts/consumos.js`
- `backend/src/routes/odts/update.js`
- `backend/src/routes/taller-corte/index.js`
- `backend/src/routes/bodega-taller/index.js`
- `frontend/src/pages/taller/TallerPage.jsx`
- `frontend/src/pages/taller/TallerOperarioPage.jsx`
- `frontend/src/pages/taller/TallerFormPage.jsx`
- `frontend/src/utils/permissions.js`

## Evidencia productiva

- [EVIDENCIA_PRODUCCION_2026-09-01.md](EVIDENCIA_PRODUCCION_2026-09-01.md)
- [CONSULTAS_PRODUCCION_TALLER.sql](evidencia/CONSULTAS_PRODUCCION_TALLER.sql)
