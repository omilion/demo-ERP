# 02 - Home / menu principal: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con validacion pendiente por rol y sucursal**.

## Fuentes revisadas

- Baseline general: [baseline-modulos-legacy-vs-actual-2026-05-28.md](../baseline-modulos-legacy-vs-actual-2026-05-28.md)
- Matriz de trazabilidad: [matriz-trazabilidad-legacy-actual-2026-05-28.md](../matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Captura legacy: [01-menu-principal.png](../screenshots/01-menu-principal.png)
- Captura actual: [01-dashboard-panel-principal.png](../current-screenshots/01-dashboard-panel-principal.png)
- Frontend actual: `frontend/src/components/TopBar.jsx`, `frontend/src/components/Shell.jsx`, `frontend/src/pages/dashboard/DashboardPage.jsx`, `frontend/src/api/dashboard.js`, `frontend/src/utils/permissions.js`
- Backend actual: `backend/src/routes/dashboard/stats.js`, `backend/src/app.js`, `backend/src/middleware/rbac.js`

## Resumen ejecutivo

El menu principal legacy era una pantalla inicial con barra superior, menu horizontal desplegable y botones grandes de operacion. Mezclaba accesos administrativos, ventas, bodega, caja, talleres, cobranza, indicadores de stock y OTs pendientes en una sola vista. La plataforma actual reemplaza esa entrada por dos piezas: `TopBar` para navegacion permanente por permisos y `/dashboard` para KPIs y accesos operativos.

La funcion principal esta cubierta y mejorada. El cambio no es una copia visual del menu antiguo: consolida accesos, separa modulos, muestra indicadores accionables y oculta rutas segun permisos. No conviene restaurar la pantalla legacy como estaba. Lo que si se debe validar con usuarios reales es si cada rol ve los accesos diarios esperados y si la sucursal/identidad visible cumple la operacion.

## Vista antigua

La captura legacy [01-menu-principal.png](../screenshots/01-menu-principal.png) muestra:

| Elemento legacy | Observacion |
|---|---|
| Barra superior morada | Muestra `Cerrar Sesion`, usuario, nivel, sucursal y fecha. |
| Warning tecnico visible | Aparece `Warning: unlink(error_log)...`; es ruido tecnico expuesto al usuario. |
| Menu horizontal verde | Agrupa Configuracion, Caja, Venta sala, Venta Web, Licitaciones, Convenio Marco, Mant. precios, Cobranza, Clientes, Bodega, Talleres e Ingreso mercaderia. |
| Bloque `ELIJA UNA OPERACION` | Botones grandes para accesos rapidos. |
| Alertas operativas | Stock critico bodega, stock critico taller, OT pendientes/prioritarias por taller. |
| Talleres separados | Espumas, Confecciones y Madera aparecen como accesos separados. |
| Identidad/sucursal siempre visible | Usuario, nivel y sucursal aparecen directamente en la cabecera. |

## Vista actual

La captura actual [01-dashboard-panel-principal.png](../current-screenshots/01-dashboard-panel-principal.png) muestra:

| Elemento actual | Evidencia |
|---|---|
| `TopBar` persistente | `Shell.jsx` renderiza `TopBar` sobre todas las rutas protegidas. |
| Navegacion por grupos | `TopBar.jsx` agrupa Ventas, Bodega, Taller, Caja, Clientes, RRHH y Admin. |
| Filtrado por permisos | `canUseNavItem` filtra cada item por rol, modulo o permiso. |
| Dashboard operativo | `DashboardPage.jsx` muestra KPIs, tarjetas por area y acciones rapidas. |
| KPIs superiores | Ventas no pagadas, pendientes de entrega, cotizaciones web, ODTs, stock critico, CRM y cobranza. |
| Datos vivos | `useDashboardStats` consulta `/api/dashboard/stats` con refetch periodico. |
| Backend autenticado | `/api/dashboard/stats` requiere `fastify.authenticate`. |
| Accesos por modulo | Las tarjetas llevan a ventas, matriz, bodega, taller, caja, clientes, administracion y reportes. |
| Usuario y rol | TopBar muestra avatar/nombre; el menu de usuario incluye rol y cierre de sesion. |

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Entrada despues de login | `menu.php` con menu principal. | `/dashboard` dentro de `Shell`. | Cubierto y mejorado. |
| Navegacion principal | Menu horizontal fijo con muchos items visibles. | `TopBar` por grupos y permisos. | Mejorado; no copiar pantalla a pantalla. |
| Accesos rapidos | Botones grandes bajo `ELIJA UNA OPERACION`. | Tarjetas, KPIs y `ActionRow` clicables. | Cubierto y mejorado. |
| Indicadores de stock | Stock critico bodega inventario y taller. | KPIs y filas de stock critico/sin stock, mas productos sin codigo/categoria/proveedor. | Mejorado. |
| Indicadores de taller | OT pendientes/prioritarias por taller. | ODTs activas, urgentes, barras por Espumas/Confecciones/Madera y accesos a ODT/bitacora/materiales. | Mejorado. |
| Ventas | Venta sala, Venta Web, Convenio Marco y Matriz Ventas separados. | Grupo Ventas, dashboard de ventas, OC Online, matriz, licitaciones y reportes. | Consolidado y mejorado. |
| Bodega | Bodega Productos, Bodega Taller, Mant. precios e Ingreso mercaderia separados. | Grupo Bodega, tarjetas de Inventario/Bodega Taller, stock ingresos, consulta precios, proveedores y despachos. | Consolidado y mejorado. |
| Caja / cobranza | Menu Caja y Cobranza dentro del menu principal. | Grupo Caja mas tarjeta Cobranza & Pagos Proveedores. | Cubierto; nuevo separa mejor clientes/proveedores. |
| Administracion | Configuracion dentro del menu general. | Grupo Admin con Usuarios, Accesos, Configuracion, Integridad, Saneamiento, Auditoria e Historico. | Mejorado. |
| Usuario/sucursal | Usuario, nivel y sucursal visibles en cabecera legacy. | Usuario/rol en menu de usuario; dashboard muestra fecha y `Sucursal 5 Oriente`. | Parcial / validar por rol y sucursal. |
| Errores tecnicos | Warning PHP visible en pantalla. | No hay warning tecnico visible en captura actual. | Legacy obsoleto; no conservar. |

## Mejoras nuevas que no se deben perder

- Navegacion filtrada por permisos reales, no solo menu visible para todos.
- Dashboard con KPIs operativos, no solo botones de acceso.
- Indicadores accionables: cada KPI lleva al filtro o modulo correspondiente.
- Separacion clara entre Ventas, Bodega, Taller, Caja, Clientes, RRHH y Admin.
- Reporteria gerencial y reportes de licitaciones visibles como valor nuevo.
- Alertas de calidad de datos de producto: sin codigo barra, sin codigo interno, sin categoria y sin proveedor.
- CRM y RRHH incorporados como modulos nuevos.
- Administracion moderna con accesos, auditoria, integridad, saneamiento legacy e historico.
- Refresco periodico del dashboard (`refetchInterval`) para mantener cifras actualizadas.
- Chat/ayuda flotante visible desde `Shell` mediante `AiChat`, como extra actual.

## Faltantes o brechas candidatas

| Brecha candidata | Evidencia | Impacto | Recomendacion |
|---|---|---|---|
| Capturas por rol no documentadas aun | El baseline pide capturar pantallas actuales por rol antes de discutir cambios de menu. La captura actual es con administrador local. | Un vendedor, bodeguero, cajero o taller podria no ver un acceso diario esperado. | Validar `/dashboard` y `TopBar` con roles `vendedor`, `bodeguero`, `cajero`, `taller`, `rrhh` y `solo_lectura`. |
| Sucursal visible/hardcodeada | `DashboardPage.jsx` muestra `Sucursal 5 Oriente` en el subtitulo. | Si el usuario pertenece a otra sucursal, la cabecera podria mostrar una sucursal incorrecta o poco confiable. | Usar sucursal del usuario/configuracion o confirmar que el ERP operara solo con esa sucursal. |
| Usuario/nivel menos explicito que legacy | Legacy mostraba `Usuario`, `Nivel` y `Sucursal` directamente; actual lo deja en avatar/menu y dashboard. | Usuarios acostumbrados al encabezado antiguo pueden pedir mayor visibilidad de identidad/sucursal. | Validar si basta con el menu de usuario o si se requiere mostrar sucursal/rol en TopBar. |
| Accesos directos por taller | Legacy tenia accesos separados a Taller Espumas, Confecciones y Madera. Actual usa grupo Taller, dashboard y filtros por tipo. | Si cada taller opera entrando siempre por su boton propio, puede sentirse menos directo. | Validar con jefes de taller si necesitan links directos o si basta con filtros/tablas actuales. |
| Convenio Marco como acceso principal | Legacy tenia `Venta Convenio Marco` como item visible. Actual lo consolida dentro de Ventas/Matriz. | Usuarios comerciales podrian esperar un acceso separado si es flujo diario. | Validar junto al modulo de Convenio Marco antes de agregar un item nuevo. |
| Notificacion visual sin flujo revisado | TopBar muestra campana con indicador, pero en el codigo revisado no se ve accion asociada. | Puede parecer una funcionalidad activa sin destino. | Confirmar si notificaciones estan fuera de alcance o documentarlas como placeholder visual. |

## Detalles legacy que ya no tienen sentido conservar

- El warning PHP visible en la cabecera: es un defecto tecnico, no una funcionalidad.
- Menu sobrecargado con todos los accesos visibles: el filtrado por permisos actual es mas seguro y usable.
- Botones grandes duplicando opciones del menu: el dashboard actual ya combina accesos con estado operativo.
- Separar cada busqueda o taller como pantalla inicial independiente si el flujo actual lo resuelve con filtros.
- Mantener nombres antiguos solo por forma, cuando el ERP nuevo ya usa nombres mas claros como `OC Online / Venta Web`, `ODTs`, `Pagos Proveedores` o `Matriz Ventas`.

## Decision del modulo

El modulo **Home / menu principal** queda documentado como **cubierto y mejorado**. La recomendacion es preservar `TopBar` + `/dashboard` como reemplazo del menu legacy, no reconstruir `menu.php`.

Antes de cualquier ajuste visual, se debe validar con usuarios reales por rol si faltan accesos directos especificos. Las brechas mas importantes no son de cobertura general, sino de visibilidad por rol, sucursal correcta y nombres de accesos diarios.

## Siguiente modulo sugerido

Continuar con **03 - Perfil Plastimar / empresa**, porque es el siguiente modulo del baseline y permite revisar la reubicacion de `Perfil Plastimar` hacia `/config` en las pestanas Empresa y Firmas Email.
