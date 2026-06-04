# Baseline modulos legacy vs plataforma actual

Fecha de corte: 2026-05-28

Objetivo: dejar documentado el estado por modulo antes de hacer nuevas modificaciones funcionales. Este documento no abre cambios; congela la comparacion base para decidir despues que se ajusta, que ya esta resuelto, que es mejora del ERP nuevo y que queda fuera de alcance.

## Fuentes

- Capturas legacy: [legacy-screenshots.md](./legacy-screenshots.md)
- Capturas legacy PNG: [screenshots](./screenshots)
- Capturas plataforma actual: [current-screenshots.md](./current-screenshots.md)
- Capturas plataforma actual PNG: [current-screenshots](./current-screenshots)
- Matriz marcada legacy vs actual: [matriz-trazabilidad-legacy-actual-2026-05-28.md](./matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Mapa funcional previo: [../mapa-modulos-funciones-erp-viejo-vs-nuevo-2026-05-19.md](../mapa-modulos-funciones-erp-viejo-vs-nuevo-2026-05-19.md)
- Estado de sprints legacy: [../estado-sprints-remediacion-legacy-2026-05-27.md](../estado-sprints-remediacion-legacy-2026-05-27.md)
- Rutas actuales frontend: `frontend/src/router.jsx`
- Menu actual: `frontend/src/components/TopBar.jsx`
- Rutas backend actuales: `backend/src/app.js`

## Leyenda

| Estado | Significado |
|---|---|
| Cubierto | Existe equivalente actual operativo. |
| Mejorado | Existe equivalente actual y agrega control, trazabilidad, seguridad o UX superior al legacy. |
| Parcial / validar | Existe base actual, pero requiere comparacion visual/usuario antes de tocar codigo. |
| Extra nuevo | No existia como modulo fuerte en legacy y es valor agregado del ERP nuevo. |
| Reemplazo tecnico | No corresponde a pantalla de usuario; fue reemplazado por arquitectura moderna. |

## Regla de trabajo

Antes de modificar un modulo, se debe revisar su fila en este baseline, abrir la captura legacy correspondiente, abrir la vista actual equivalente y registrar la decision: mantener, ajustar, mejorar o descartar por fuera de scope.

## Resumen ejecutivo

- Legacy ejecutado localmente y documentado: 114 capturas.
- Plataforma actual documentada localmente: 47 capturas.
- Trazabilidad punto a punto: 114 pantallas legacy marcadas contra ubicacion actual, estado y brecha candidata.
- Sprints legacy documentados: 48.
- Estado de sprints al 2026-05-27: 48 cerrados, aprobados o aprobados localmente.
- La plataforma actual no es una copia pantalla a pantalla: consolida modulos, normaliza datos y agrega RBAC, auditoria, integridad, trazabilidad y exportaciones.
- La comparacion para cliente debe separar claramente "lo mismo", "lo mismo pero mejorado", "reemplazo equivalente" y "extra nuevo".

## Modulos funcionales

| Modulo / ambito | Evidencia legacy | Equivalente actual | Estado base | Extras y mejoras actuales que no deben perderse | Dudas / brechas antes de modificar |
|---|---|---|---|---|---|
| Acceso / login | [00-login.png](./screenshots/00-login.png) | `/login`, `/api/auth` | Mejorado | Autenticacion por token ERP, roles actuales, cierre de sesion controlado. | No documentar credenciales legacy; el dump trae claves en texto plano. |
| Home / menu principal | [01-menu-principal.png](./screenshots/01-menu-principal.png) | `/dashboard`, `TopBar` | Mejorado | Dashboard con KPIs, alertas de stock, ventas no pagadas, pendientes de entrega, accesos por permiso. | Capturar pantallas actuales por rol antes de discutir cambios de menu. |
| Perfil Plastimar / empresa | [02-perfil-plastimar.png](./screenshots/02-perfil-plastimar.png) | `/config` tabs Empresa y Firmas Email | Mejorado | Multiples razones sociales, firmas email, configuracion centralizada. | Validar si cliente espera ver "Perfil Plastimar" como nombre de menu o basta Configuracion. |
| Usuarios | [03-editar-usuarios.png](./screenshots/03-editar-usuarios.png) | `/usuarios`, `/api/usuarios`, `/accesos` | Mejorado | RBAC por roles/permisos, historial de accesos, auditoria backend. | Comparar campos visibles legacy vs formulario actual antes de ajustar columnas. |
| Categorias y subcategorias bodega | [04](./screenshots/04-editar-categorias.png), [05](./screenshots/05-editar-sub-categorias.png) | `/config` tabs Categorias Bodega, backend `/api/categorias` | Cubierto | Categorias con subcategorias relacionadas y uso directo en filtros de bodega. | Validar si el cliente necesita accesos separados como en legacy. |
| Categorias y subcategorias bodega taller | [06](./screenshots/06-editar-categorias-bodega-taller.png), [07](./screenshots/07-editar-sub-categorias-bodega-taller.png) | `/config` tab Categorias Bodega Taller, `/api/categorias-bodega-taller` | Cubierto | Se separa catalogo taller del inventario de venta. | Validar nombre visible y permisos esperados para usuarios de taller/bodega. |
| Proveedores | [08-editar-proveedores.png](./screenshots/08-editar-proveedores.png) | `/proveedores`, `/api/proveedores` | Mejorado | Export CSV, impresion/PDF, pagos proveedor asociados, control de anulacion. | Confirmar si todos los campos legacy de proveedor aparecen en la ficha actual. |
| Cargo transporte | [09-editar-carga-por-transporte.png](./screenshots/09-editar-carga-por-transporte.png) | `/config` tab Cargo transporte, `/api/cargo-transporte` | Cubierto | Desactivacion conserva historial, export CSV, validacion de duplicados. | Validar que formula/uso en ventas coincide con operacion real del cliente. |
| Descuentos ventas y Convenio Marco | [10](./screenshots/10-editar-desc-para-ventas.png), [11](./screenshots/11-editar-desc-convenio-marco.png) | `/descuentos`, `/api/descuentos` | Cubierto | Control por permisos, reglas centralizadas, separacion de descuentos comerciales. | Confirmar si el cliente distingue visualmente descuentos generales vs marco. |
| Gastos | [12-editar-nombres-gastos.png](./screenshots/12-editar-nombres-gastos.png) | `/config` tab Gastos, `/api/gastos` | Cubierto | Eliminacion logica para no romper historial de caja, export CSV. | Validar nombres y estados usados historicamente por caja. |
| Caja | [13](./screenshots/13-movimientos-hoy.png) a [21](./screenshots/21-boletas.png) | `/caja`, `/caja/nuevo`, `/api/caja` | Mejorado | Turnos de caja, apertura/cierre, conteo, historico, export CSV, anular/reactivar movimientos segun permiso. | Comparar filtros legacy: fecha, documento, numero interno, tipo venta. |
| Venta directa / venta sala | [22](./screenshots/22-nueva-venta.png) a [24](./screenshots/24-buscar-por-fechas.png) | `/ventas`, `/ventas/nueva`, `/matriz-ventas` | Mejorado | Venta unificada, impresion, filtros, no pagadas, pendiente entrega, exportacion. | Validar si el usuario espera el nombre "Venta sala" separado o acepta tipo dentro de Ventas. |
| Venta web / OC online | [25](./screenshots/25-buscar-por-numero-de-venta.png) a [27](./screenshots/27-buscar-por-fechas.png) | `/ordenes-compra`, `/matriz-ventas`, `/ventas?filtro=web` | Mejorado | OC online como entidad propia, detalle de OC, matriz unificada, estado trazable. | Revisar flujo completo web -> venta -> despacho con usuario clave. |
| Licitaciones cotizadas | [28](./screenshots/28-nueva-cotizacion-de-licitacion.png) a [32](./screenshots/32-buscar-licitaciones-por-estados-y-fechas.png) | `/licitaciones`, `/reportes/licitaciones` | Mejorado | Cotizacion, detalle, ficha tecnica/economica, crear venta desde licitacion, export CSV. | Validar estados legacy vs estados nuevos antes de cambiar etiquetas. |
| Convenio Marco | [33](./screenshots/33-nueva-venta-convenio-marco.png) a [35](./screenshots/35-buscar-por-fechas.png) | `/ventas` tipo Convenio Marco, `/matriz-ventas` tab Convenio marco | Cubierto | Tipo de venta normalizado, OC/ref obligatoria para Convenio Marco, matriz consolidada. | Puede requerir acceso visible separado si el cliente lo usa como modulo diario. |
| Mantencion precios | [36](./screenshots/36-listado-completo-productos.png) a [41](./screenshots/41-busqueda-por-proveedor.png) | `/bodega`, `/bodega/:id/editar`, historial precio | Mejorado | Historial de precios, importacion masiva con validacion, export productos. | Confirmar si el cliente diferencia "Precios" de "Bodega" en su operacion diaria. |
| Consulta precios | [113-consulta-precios.png](./screenshots/113-consulta-precios.png) | `/consulta-precios` | Cubierto | Consulta separada del mantenimiento, orientada a uso rapido sin editar inventario. | Capturar vista actual para validar rapidez de uso en meson/sala. |
| Bodega inventario productos | [53](./screenshots/53-mantencion-productos.png) a [65](./screenshots/65-sin-proveedor.png) | `/bodega`, `/bodega/nuevo`, `/stock-ingresos`, `/api/productos` | Mejorado | Filtros por web/categoria/subcategoria/proveedor/ID Marco, columnas de stock y web, doble click/row action, import CSV/XLSX con dry-run, movimientos de stock, historial precios. | Baseline clave para cliente: comparar columna por columna y filtro por filtro antes de nuevos ajustes. |
| Bodega taller | [66](./screenshots/66-mantencion-productos.png) a [78](./screenshots/78-sin-proveedor.png) | `/bodega-taller`, `/api/bodega-taller` | Mejorado | Materiales de taller separados, filtros por categoria/subcategoria/proveedor/codigos, export, modal de alta/edicion. | Validar si faltan filtros legacy de stock critico/repetidos/faltantes en UI actual. |
| Clientes | [50](./screenshots/50-todo-el-listado.png) a [52](./screenshots/52-buscar-por-e-mail.png) | `/clientes`, `/crm`, `/api/clientes` | Mejorado | Cliente canonico, sucursales, historial comercial/operativo, CRM. | Comparar campos legacy del cliente y reglas de duplicados RUT/email. |
| Cobranza proveedor | [42](./screenshots/42-menu-cobranza.png) a [49](./screenshots/49-boletas-no-pagadas.png) | `/pagos-proveedores`, `/proveedores`, `/cobranza` | Mejorado | Separacion entre cobrar ventas y pagar proveedores, detalle de documento, anulacion con motivo, bloqueo si stock aplicado. | Aclarar en documento cliente que legacy mezclaba cobranza/proveedor; nuevo lo separa. |
| Facturas bodega / ingreso mercaderia | [104](./screenshots/104-menu-ingreso-mercaderia.png) a [109](./screenshots/109-proveedor-entre-fechas.png) | `/stock-ingresos`, `/pagos-proveedores` | Mejorado | Ingreso conectado a proveedor, pago y stock; aplicar stock controlado; reversa/anulacion con restricciones. | Validar terminologia: cliente puede seguir diciendo "facturas bodega". |
| Matriz ventas | [110](./screenshots/110-matriz-ventas.png) a [112](./screenshots/112-ventas-pendientes-entrega.png) | `/matriz-ventas` | Mejorado | Matriz consolidada por venta sala, web, convenio, licitaciones; KPIs; export por formato; links a venta/licitacion. | Revisar columnas exactas que el cliente usa para seguimiento diario. |
| Taller matriz / ODT | [79](./screenshots/79-ot-prioridad-alta.png) a [83](./screenshots/83-busqueda-taller-entre-fechas.png) | `/taller`, `/taller/nueva`, `/api/odts` | Mejorado | ODT como entidad principal, estados, prioridad, cierre/reapertura/anulacion con motivo, bitacora dentro de ODT, export. | Comparar busquedas legacy por N OT, fechas y taller; cuidar que no se pierda velocidad operativa. |
| Taller Espumas | [84](./screenshots/84-ot-prioridad-alta.png) a [87](./screenshots/87-busqueda-fechas.png) | `/taller` filtro tipo Espumas | Cubierto | Talleres normalizados y filtrables; mismo flujo ODT. | Validar si necesitan link directo "Taller Espumas" en menu. |
| Taller Confecciones | [90](./screenshots/90-ot-prioridad-alta.png) a [93](./screenshots/93-busqueda-fechas.png) | `/taller` filtro tipo Confecciones, `/telas` | Mejorado | Inventario telas, materiales por ODT, estados por item/taller. | Validar flujo de telas contra captura legacy [89](./screenshots/89-inventario-telas.png). |
| Taller Madera / Externo | [94](./screenshots/94-ot-prioridad-alta.png) a [97](./screenshots/97-busqueda-fechas.png) | `/taller` filtro tipo Madera/Externo | Cubierto | Misma ODT con tipo normalizado y trazabilidad compartida. | Confirmar nomenclatura: legacy usa "externo" y menu dice "Madera". |
| Pasar a Taller | Legacy carpeta `pasar_taller`; sin captura menu directa | `/pasar-taller` | Mejorado | Envio de items a talleres, notificacion, eliminacion controlada, relacion con ODT. | Documentar flujo completo con captura actual antes de cambiarlo. |
| Bitacora taller | [98](./screenshots/98-nueva-bitacora.png) a [100](./screenshots/100-buscar-por-operario-entre-fechas.png) | `/bitacora-taller` y bitacora en ODT | Mejorado | Relacion opcional/ideal con ODT, filtros, export CSV, permisos de editar/eliminar. | Decidir si ODT debe ser obligatoria o seguir permitiendo bitacora diaria libre. |
| Historial materiales | [101](./screenshots/101-buscar-por-fechas.png) a [103](./screenshots/103-buscar-taller-entre-fechas.png) | `/historial-materiales`, consumos en ODT | Mejorado | Historial con ODT, taller, export, consumo desde bodega taller. | Validar si todos los tipos de movimiento legacy tienen equivalente. |
| Inventario telas | [89-inventario-telas.png](./screenshots/89-inventario-telas.png) | `/telas`, `/telas/:id` | Mejorado | Tela como entidad consultable con detalle, integrada al dominio taller. | Capturar vista actual y compararla con los campos legacy de telas. |
| Despachos | Legacy carpeta `despacho`; no aparece en capturas menu admin | `/despachos`, `/api/despachos` | Mejorado | Matriz despacho, registros, guias, export por vista, links a venta/ODT. | Revisar con legacy por archivo/codigo porque no quedo captura menu directa. |
| Reporteria gerencial | No existia como modulo fuerte legacy | `/reportes/gerenciales`, `/api/reportes` | Extra nuevo | Reportes consolidados para gestion; evita depender de busquedas manuales por modulo. | No tratar como deuda legacy; es mejora actual. |
| RRHH | No aparece como modulo fuerte legacy revisado | `/rrhh`, `/api/rrhh` | Extra nuevo | Trabajadores, contratos, liquidaciones, anticipos, licencias, vacaciones, EPP, asistencias, jornadas, libros. | Fuera de comparacion legacy salvo que cliente pida alcance nuevo. |
| Integridad, saneamiento, auditoria e historico | No existia como control formal legacy | `/admin/integridad`, `/admin/saneamiento-legacy`, `/admin/auditoria`, `/admin/historico` | Extra nuevo | Controles de datos huerfanos, auditoria de actividad, historico, saneamiento legacy. | No eliminar ni esconder sin decision; sostiene seguridad y migracion. |
| Accesos | Legacy tabla `accesos`, sin modulo visible fuerte | `/accesos`, `/api/accesos` | Mejorado | Vista admin de accesos y actividad, separada de usuarios. | Validar retencion y filtros si cliente pide auditoria operativa. |

## Modulos legacy tecnicos o de soporte

| Modulo legacy | Equivalente actual / decision | Estado base | Nota |
|---|---|---|---|
| `autocompleta_nombre_material` | Autocomplete en consumo de materiales y bodega taller | Reemplazo tecnico | No requiere pantalla propia si el autocomplete actual responde al flujo de ODT/materiales. |
| `clase_excel` | Utilidades modernas CSV/XLSX y export backend | Reemplazo tecnico | Legacy dependia de libreria PHP; actual usa parser/export controlado. |
| `cron_job` | Jobs/validaciones backend, reportes y tests operativos | Parcial / validar | Verificar si habia cron productivo especifico que el cliente espere. |
| `css`, `js`, `font`, `fonts`, `img`, `lib`, `vendor` | React/Vite, componentes compartidos, assets actuales | Reemplazo tecnico | No son modulos de usuario; se documentan para no confundirlos con deuda funcional. |
| `phpmailer` | Firmas email/configuracion; eventual servicio email moderno | Reemplazo tecnico | Solo reabrir si hay envio transaccional pendiente real. |
| `web`, `usuarios-web`, `banners` | OC online / venta web, rutas `usuarios-web`, `banners` | Parcial / validar | Requiere comparacion especifica si el cliente pide portal publico/web. |
| `word_textarea` | Formularios React/Textarea y documentos/imprimir | Reemplazo tecnico | No replicar como dependencia legacy si no hay necesidad funcional. |

## Extras actuales transversales

Estos puntos son mejoras de plataforma nueva y deben preservarse durante cualquier ajuste visual:

- RBAC por modulo/permisos, no solo ocultar botones.
- Auditoria y accesos administrativos.
- Integridad de datos y saneamiento legacy.
- Cliente canonico y producto canonico.
- ODT como eje productivo para taller, materiales, bitacora y despacho.
- Historial de precios y movimientos de stock.
- Importaciones con validacion previa/dry-run cuando aplica.
- Exportaciones CSV centralizadas.
- Dashboard con KPIs y alertas operativas.
- Navegacion moderna de tablas extensas, ancho completo y teclado cuando aplica.

## Siguiente paso antes de tocar codigo

1. Revisar la matriz marcada: [matriz-trazabilidad-legacy-actual-2026-05-28.md](./matriz-trazabilidad-legacy-actual-2026-05-28.md).
2. Confirmar con el cliente las filas `Parcial / validar` y `No visible actual`.
3. Convertir solo las brechas confirmadas en criterios de aceptacion.
4. Solo despues abrir sprint de correccion por modulo.

## Anexo - capturas actuales

- Indice actual: [current-screenshots.md](./current-screenshots.md)
- Carpeta de capturas actuales: [current-screenshots](./current-screenshots)
- Manifest tecnico: [current-manifest.json](./current-manifest.json)
- Matriz marcada: [matriz-trazabilidad-legacy-actual-2026-05-28.md](./matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Total capturado: 47/47 vistas actuales, sin warnings.
- Contexto de captura: usuario administrador local, frontend `http://127.0.0.1:6187`, API `http://127.0.0.1:3001`, base local de integracion.

Estas capturas son la contraparte visual actual para comparar contra las 114 capturas legacy ya anexadas. Incluyen login, dashboard, rutas principales, formularios base sin ID y pestanas de Configuracion que reemplazan pantallas administrativas del ERP anterior.
