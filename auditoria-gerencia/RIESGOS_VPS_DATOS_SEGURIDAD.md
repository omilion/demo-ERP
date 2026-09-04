# Riesgos de datos, rendimiento y seguridad en VPS

## Semáforo ejecutivo

| Riesgo | Severidad | Evidencia | Impacto |
|---|---|---|---|
| Disco raíz al 97% | **Crítico** | 50 GB, 46 GB usados, ~1,6 GB libres | Caída de PostgreSQL, logs, despliegues y corrupción operativa |
| Ventas potencialmente duplicadas | **Crítico** | Licitaciones adjudicadas se suman aunque estén convertidas en orden | Decisiones comerciales/financieras distorsionadas |
| Exposición amplia de remuneraciones | **Crítico** | RRHH usa `rrhh:read`; cuentas `solo_lectura` poseen ese permiso; el modelo devuelve `sueldoLiquido` | Brecha de confidencialidad y laboral |
| Agregación sobre tablas vivas | **Alto** | Sin réplica, vistas materializadas ni caché servidor | Contención con caja, taller y bodega |
| Filtros temporales con sequential scan | **Alto** | `EXPLAIN` en órdenes, CxC, caja, licitaciones y ODT | Latencia creciente y CPU elevada |
| Exportación síncrona en proceso API | **Alto** | ExcelJS reconstruye reportes y buffer en request | Bloqueo/event-loop, RAM y mala concurrencia |
| CxC semánticamente incorrecta | **Crítico** | Emisión en rango + valor total pendiente | Caja proyectada y riesgo de cobranza falsos |
| ODT vencida siempre optimista | **Alto** | 5.772/5.772 ODT sin fecha compromiso | Gerencia no ve atrasos reales |
| Sin cifrado en reposo verificable | **Alto** | volumen ext4 simple; no LUKS visible | Exposición ante acceso a disco/snapshot |
| Token de acceso en `localStorage` | **Alto** | persistencia Zustand | Un XSS puede extraer el token |

## Arquitectura de consulta

La reportería calcula agregados en Node después de cargar grandes conjuntos con relaciones. El endpoint de ventas carga órdenes e ítems/cargos, pedidos web y licitaciones/ítems, y repite el proceso para el período comparativo. Esto desplaza trabajo que PostgreSQL podría agregar eficientemente hacia memoria y CPU del API.

La pantalla además consulta endpoints generales como fallback. `/ventas`, aunque pagina la respuesta, ejecuta una carga estadística amplia no acotada y luego consulta pagos, multas y notas. El costo real no corresponde a “solo 100 filas”.

No se detectaron:

- vistas materializadas;
- réplica de lectura;
- caché Redis/servidor para reportes;
- cola de trabajos para exportación;
- `pg_stat_statements` para controlar regresiones;
- índices temporales suficientes en las tablas consultadas.

## Capacidad del VPS

- RAM: 1,9 GiB total, ~714 MiB usados, ~1,2 GiB disponibles; swap de 2 GiB con ~257 MiB usados.
- API principal: ~283 MB RSS; proceso candidato: ~72 MB RSS.
- PM2 principal: 30 reinicios y 41 minutos de uptime en la observación. Los logs mostraron fallas recientes de dependencias durante despliegue; no se concluye que exista un crash-loop actual.
- PostgreSQL: base ~544 MB, 8 conexiones, `shared_buffers=128MB`, `work_mem=4MB`, máximo 100 conexiones.
- Tablas clave sin `ANALYZE`/autoanalyze registrado; las estimaciones del planificador no son confiables.

Con solo 2 GB y el disco casi lleno, el principal peligro no es el tamaño actual de la base sino la concurrencia: varias sesiones gerenciales, exportaciones, Node, PostgreSQL y procesos operativos compiten en el mismo host.

## Integridad y trazabilidad

### Ventas

El KPI no es ingreso contable. Combina reservas/órdenes, comercio web y adjudicación pública. Una licitación convertida puede reaparecer como orden. Debe definirse un hecho único y una regla de deduplicación.

### Cobranza

De 3.993 registros, 3.687 no tienen `valorFactura`, 92 no tienen fecha y 106 están pendientes. El cálculo actual no reconstruye saldo insoluto. El período YTD devolvió cero documentos porque la cartera histórica viva quedó fuera de la fecha de emisión seleccionada.

### Operaciones

El filtro inicial de ODT se ignora; se toma todo hasta la fecha final. El vencimiento se calcula contra la hora actual aun cuando se explora un período histórico. Sin fechas comprometidas, el semáforo entrega falso verde.

### Inventario

El stock crítico es actual, mientras los movimientos obedecen al rango. Una consulta histórica mezcla dos cortes distintos. No hay inventario valorizado ni reconstrucción “as of”.

## Seguridad y roles

- El permiso que abre Gerencia es genérico (`reportes:read`), no un rol directivo certificado.
- Vendedores pueden alcanzar reportería de sucursal, no solo su panel/cartera.
- Cuentas de solo lectura activas tienen acceso transversal, incluido RRHH.
- La lista/detalle de trabajadores incluye remuneración líquida y liquidaciones bajo el mismo permiso de lectura general.
- Existe un único usuario de base para la aplicación; no hay rol analítico read-only aislado.
- PostgreSQL tiene SSL habilitado, pero no se observó cifrado del volumen ni cifrado de campo para remuneraciones/costos confidenciales.

Se requiere separar permisos por **dominio, acción, alcance y sensibilidad de campo**: por ejemplo `rrhh.persona.read`, `rrhh.remuneracion.read`, `finanzas.margen.read`, con scope propio/sucursal/global.

