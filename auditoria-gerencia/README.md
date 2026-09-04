# Auditoría de cierre — Gerencia, Dirección y Analítica

**Sistema:** Plastimar ERP 3.0  
**Fecha de corte:** 2026-09-01  
**Entorno:** producción, VPS `38.7.216.244`  
**Veredicto ejecutivo:** **ROJO — no apto todavía como fuente financiera/directiva única.**

## Conclusión

La pantalla existente es una **reportería operativa-comercial**, no una capa de Business Intelligence financiera. Puede orientar seguimiento diario, pero no sustenta decisiones sobre margen, EBITDA, flujo proyectado, rentabilidad de taller ni valorización de inventario.

Las razones determinantes son:

1. **“Ventas período” mezcla tres hechos distintos:** órdenes, pedidos web y montos adjudicados de licitaciones. Hay 2.390 licitaciones enlazadas a una orden y 2.383 de ellas conservan monto adjudicado, por lo que existe riesgo estructural de doble conteo.
2. **Cobranza no representa saldo por cobrar a una fecha:** filtra por fecha de emisión y suma el valor completo de documentos pendientes; no reconstruye abonos, notas de crédito ni saldo insoluto.
3. **No existe analítica financiera real:** faltan ingresos facturados/reconocidos, costo vendido validado, margen bruto/neto, EBITDA, flujo proyectado, inventario valorizado/rotación y ocupación rentable del taller.
4. **Los agregados no poseen linaje completo:** no siempre se puede reconciliar el total con los documentos que lo forman.
5. **El VPS está expuesto:** disco raíz al 97%, 2 GB de RAM, sin vistas materializadas, caché analítica, réplica de lectura ni índices temporales suficientes. La consulta de ventas tardó 2,6 s en servidor y la exportación 3,1 s.
6. **El control de acceso es demasiado amplio:** cuentas operativas y de solo lectura pueden alcanzar datos transversales; RRHH expone remuneraciones bajo un permiso genérico de lectura.

## Alcance y método

Se verificaron:

- rutas y componentes de frontend;
- endpoints, cálculos, filtros y exportación del backend;
- permisos y alcance por rol;
- PostgreSQL y recursos del VPS mediante consultas de solo lectura;
- respuestas y tiempos reales de endpoints productivos;
- consistencia de muestras agregadas.

La inspección visual en navegador **no pudo ejecutarse**: el controlador integrado falló antes de abrir una pestaña (`Node runtime`, error de ruta del sistema). Por rigor, este expediente no atribuye resultados de DOM, FPS, tablet ni capturas que no fueron observados. La auditoría de UX distingue claramente lo confirmado por código/API de lo que requiere una sesión visual posterior.

> Corrección de evidencia: una lectura preliminar indicó `total=null`. Fue un error del parser de PowerShell provocado por claves de clientes que solo difieren en mayúsculas/minúsculas. El JSON real informó **$5.688.730.599 y 7.374 operaciones**. El defecto real es la normalización inconsistente de clientes, no un total nulo.

## Documentos del expediente

- [MATRIZ_CONTROL_GERENCIAL.md](MATRIZ_CONTROL_GERENCIAL.md): definición, origen, actualización, permiso y drill-down de cada KPI.
- [AUDITORIA_UX_UI_NAVEGADOR.md](AUDITORIA_UX_UI_NAVEGADOR.md): arquitectura de información, filtros, interacción, exportación y brecha de prueba visual.
- [RIESGOS_VPS_DATOS_SEGURIDAD.md](RIESGOS_VPS_DATOS_SEGURIDAD.md): consultas, saturación, integridad y confidencialidad.
- [PLAN_REMEDIACION_PRIORIZADO.md](PLAN_REMEDIACION_PRIORIZADO.md): acciones P0–P2 y criterios de aceptación.
- [EVIDENCIA_PRODUCCION_2026-09-01.md](EVIDENCIA_PRODUCCION_2026-09-01.md): mediciones y hechos reproducibles.
- [evidencia/DIAGNOSTICO_VPS_GERENCIA.sql](evidencia/DIAGNOSTICO_VPS_GERENCIA.sql): consultas SQL de solo lectura usadas en el diagnóstico.

## Fuente técnica principal

- Frontend: `frontend/src/pages/reportes-gerenciales/ReportesGerencialesPage.jsx`, `frontend/src/api/reportesGerenciales.js`, `frontend/src/pages/dashboard/DashboardPage.jsx`.
- Backend: `backend/src/routes/reportes/index.js`, `backend/src/routes/dashboard/stats.js` y rutas de usuarios/RRHH.
- Producción: API, PM2, sistema operativo y PostgreSQL del VPS.

