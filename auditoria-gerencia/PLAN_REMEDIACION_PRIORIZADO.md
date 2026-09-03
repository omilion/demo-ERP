# Plan de remediación priorizado

## Ejecución registrada — 2026-09-02

Esta tabla distingue expresamente el código preparado de un cierre real en el VPS. Ningún elemento queda certificado por estar solamente en una rama.

| Frente | Estado en la rama `area-e-permisos-taller` | Falta para cerrar |
|---|---|---|
| Nombre y límites del panel | Hecho: el panel se llama **Actividad comercial y operativa** y advierte cuando suma licitaciones sin adjudicar. | Desplegar y validar la lectura con Comercial y Finanzas. |
| Doble conteo licitación→orden | Hecho: se excluye la licitación cuya orden vinculada ya está en el mismo resultado; hay prueba de regresión. | Definir si las licitaciones no adjudicadas pertenecen al indicador y reconciliar contra la fuente oficial. |
| Remuneraciones y costeo | Hecho: se exige `rrhh.remuneracion` para planillas y se ocultan costos/remuneraciones de ODT sin permiso; hay pruebas negativas. | Desplegar y revisar la matriz final de roles con RRHH. |
| Filtros de fecha e índices | Hecho: existe la migración de índices temporales y el panel incorpora Mes, Trimestre, YTD y L12M. | Ejecutar migración y `ANALYZE` en una ventana controlada; medir p95 y planes reales en el VPS. |
| Carga inicial del panel | Hecho: una API versionada entrega los agregados autorizados en un único corte; listados detallados se cargan al abrir su pestaña. Se muestra la hora de la última lectura. | Medir sesión real en producción y, si no cumple presupuesto, agregar caché/rollups. |
| Drill-down y exportación | Hecho: KPI y rankings llevan a la pestaña/listado filtrado; CSV/XLSX reutilizan el mismo resumen y no incluyen una sección sin permiso. | Completar trazabilidad financiera factura→pago/NC y mover exportaciones pesadas a cola. |
| Disco, alertas y backups | Sin cambio de aplicación. | Infraestructura debe configurar capacidad, alertas 75/85/90% y prueba de restauración. |
| CxC a fecha de corte | Sin cambio: el modelo vigente no recompone saldo insoluto por factura. | Finanzas debe validar fuente y reglas de pagos, notas de crédito y saldos; luego Backend implementa el hecho financiero. |
| Fechas comprometidas ODT | Sin cambio masivo de datos. | Taller/Datos debe completar y validar la cobertura antes de usar vencimientos como KPI directivo. |

**Pruebas de esta ejecución:** `npm run build` de frontend y 33 pruebas focalizadas de reportes, deduplicación, permisos, RRHH y costeo aprobadas el 2026-09-02. El despliegue queda deliberadamente fuera de este hito.

**Próximo hito técnico:** desplegar los commits P0 ya preparados y medir los presupuestos P1 en producción antes de iniciar caché, rollups o exportaciones en cola.

## P0 — contener riesgo y corregir verdad de negocio

| Acción | Dueño sugerido | Criterio de aceptación |
|---|---|---|
| Liberar capacidad del disco y fijar alertas | Infraestructura | >20% libre; alerta a 75/85/90%; política de logs/backups probada |
| Renombrar temporalmente el panel como “Actividad comercial y operativa” | Producto | No usa “ingreso”, “margen” o “financiero” sin certificación |
| Definir contrato de cada KPI | Finanzas + Comercial + Producto | Fórmula, fuente, corte, exclusiones, dueño y prueba de conciliación aprobados |
| Eliminar doble conteo licitación→orden | Backend/Datos | Cada negocio tiene identificador canónico; test de conversión y reconciliación |
| Reconstruir CxC “as of” por saldo insoluto | Finanzas/Backend | Factura − pagos aplicados − NC; total cuadra con cartera oficial |
| Separar permisos sensibles | Seguridad/RRHH | Solo roles autorizados ven remuneraciones; vendedores ven cartera propia; pruebas negativas |
| Corregir fechas comprometidas de ODT | Taller/Datos | Cobertura >98%; vencidos se validan contra muestra manual |
| Ejecutar mantenimiento controlado e índices concurrentes | DBA | `ANALYZE`; planes indexados; sin bloqueo transaccional significativo |

No se deben crear índices ni depurar disco a ciegas en horario productivo. Deben ensayarse, respaldarse y monitorearse.

## P1 — construir una capa gerencial confiable

1. Mover agregaciones a SQL y crear tablas de hechos/rollups o vistas materializadas incrementales.
2. Agregar caché servidor por métrica, rango, sucursal y scope, con invalidación y sello de frescura.
3. Consolidar las 12 solicitudes en una API gerencial versionada o cargas progresivas por prioridad.
4. Implementar drill-down auditable: KPI → dimensión → documento → transacción, conservando filtros.
5. Crear hechos financieros desde Facturación y snapshots de costo; no derivar margen desde precios actuales.
6. Implementar exportaciones en cola, con estado, descarga posterior, límites y auditoría.
7. Incorporar presets Mes/Trimestre/YTD/L12M, sucursal, comparativo y presupuesto.
8. Mostrar estados “cargando”, “sin datos”, “degradado” y “no conciliado”; nunca ceros placeholder.

### Criterios de rendimiento P1

- primera información útil p95 <1,5 s;
- filtros calientes p95 <700 ms;
- ninguna query gerencial p95 >1 s en PostgreSQL;
- ninguna tarea del hilo principal >50 ms atribuible al dashboard;
- exportación no bloquea el request ni el proceso API;
- prueba concurrente sin degradar p95 de caja/taller/bodega más de 10%.

## P2 — BI y dirección madura

- presupuesto, forecast y escenarios;
- EBITDA y puente de margen certificado;
- flujo de caja de 13 semanas;
- inventario valorizado, rotación, obsolescencia y capital inmovilizado;
- ocupación, eficiencia y rentabilidad de taller;
- alertas de anomalías con causa, impacto y responsable;
- réplica de lectura o almacén analítico cuando carga/concurrencia lo justifiquen;
- observabilidad con `pg_stat_statements`, APM, trazas de exportación y presupuesto de queries.

## Puerta de certificación

El panel solo debe declararse “Gerencial/Financiero certificado” cuando:

1. Finanzas reconcilie ingresos, CxC y caja contra fuentes oficiales.
2. Cada KPI tenga drill-down completo y definición visible.
3. Las pruebas de roles demuestren mínima exposición.
4. La carga concurrente cumpla los presupuestos sin afectar operación.
5. La sesión visual en producción apruebe escritorio, tablet, accesibilidad, filtros y exportación.
