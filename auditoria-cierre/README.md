# Auditoría de cierre — Talleres Plastimar

**Fecha de corte:** 1 de septiembre de 2026  
**Alcance:** Taller de Corte, Taller de Confección, Taller de Espuma y sus integraciones con Ventas, Bodega, Costeo, Despacho, Usuarios y RRHH.  
**Base técnica revisada:** `main` / `3024f38fc96f7d6f6818661c7e39a1ee1deea8fd`.  
**Ambiente verificado:** base de datos de producción del VPS Plastimar, mediante consultas de solo lectura.

## Conclusión

El módulo tiene una base funcional considerable y recibió mejoras reales: ODT internas con centro de costo, devolución de trabajos, estados por etapa, rechazo con motivo, registro de avances de Corte, evidencias, recetas de costeo y trazabilidad de espuma por lote/calidad/merma.

Sin embargo, **no puede considerarse cerrado como flujo operativo obligatorio**. En producción, al momento del corte:

- 5.772 ODT existentes provienen de ventas; no hay ODT internas utilizadas.
- 28.414 etapas de taller no tienen responsable asignado.
- No hay avances estructurados ni evidencias.
- No hay consumos de materiales ni movimientos de Bodega Taller.
- Bodega Taller tiene 70 materiales activos en total; los 4 asociados a Espumas no tienen densidad, espesor ni formato.
- No hay lotes de espuma.
- Existen 2.554 recetas y 4.104 materiales de receta, pero no hay snapshots de costo.

Por tanto, la situación correcta es: **implementación parcial avanzada, datos maestros incompletos y adopción operacional no demostrada**.

## Cómo leer esta carpeta

1. [Resumen ejecutivo](RESUMEN_EJECUTIVO_TALLER_2026-09-01.md): decisión, riesgos y prioridades.
2. [Auditoría completa](AUDITORIA_TALLER_COMPLETA_2026-09-01.md): análisis funcional, técnico, de datos e integraciones.
3. [Matriz requisito → fuente → estado](MATRIZ_REQUISITOS_FUENTES_ESTADO.md): trazabilidad exacta hacia cada encuesta original.
4. [Mapa de roles, flujos e integraciones](MAPA_ROLES_FLUJOS_INTEGRACIONES.md): quién ve, escribe, cambia y qué activa cada acción.
5. [Evidencia de producción](EVIDENCIA_PRODUCCION_2026-09-01.md): cifras verificadas y límites de la revisión.
6. [Auditoría UI/UX](AUDITORIA_UI_UX_TALLER.md): evaluación por rol y pantalla.
7. [Plan de cierre priorizado](PLAN_CIERRE_PRIORIZADO.md): acciones y criterios de aceptación.
8. [Índice de fuentes](INDICE_FUENTES.md): documentos originales y antecedentes incluidos.
9. [Consultas reproducibles](evidencia/CONSULTAS_PRODUCCION_TALLER.sql): SQL de auditoría, sin datos sensibles.

## Estructura documental

- `fuentes-originales/`: encuestas y consolidado originales entregados por Plastimar.
- `referencias/`: planes, revisiones anteriores y auditoría técnica de Sebastián.
- `evidencia/`: consultas y capturas históricas disponibles.

## Regla de interpretación

En todos los documentos se separan tres niveles:

- **Implementado:** existe en el código revisado.
- **Configurado/cargado:** existe dato maestro o configuración en producción.
- **Usado:** hay registros operativos reales que prueban que el proceso se ejecuta.

Que una función esté implementada no significa que esté configurada ni adoptada.
