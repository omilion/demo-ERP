# Entrega funcional — Plastimar ERP / SisGestión 3.0

**Corte de entrega:** `main` en commit `14cbc1a` (08-sep-2026)  
**Repositorio:** `D:\plastimar-erp-v2`  
**Propósito:** entregar una vista funcional y verificable del alcance presente en `main`. No sustituye las pruebas operativas de marcha blanca ni certifica respuestas de servicios externos.

## 1. Alcance y criterio de lectura

El ERP integra el ciclo comercial, producción, bodega, despacho, caja, cobranzas, DTE, RRHH, reportes, administración e IA. Las rutas de interfaz están protegidas por rol/permisos y los endpoints requieren autenticación/RBAC.

Los módulos descritos como **implementados** tienen pantalla, rutas de API y modelos de datos en `main`. Los puntos marcados como **requieren configuración o validación externa** dependen de datos operativos, certificados, CAF, conectividad SII o credenciales; no deben declararse operativos sólo porque la pantalla exista.

| Evidencia | Ubicación principal |
|---|---|
| Rutas y guardias de la interfaz | `frontend/src/router.jsx` |
| Menú por rol | `frontend/src/components/TopBar.jsx` |
| API y bootstrap | `backend/src/app.js`, `backend/src/routes/` |
| Modelo de datos | `backend/prisma/schema.prisma` |
| Pruebas de integración | `backend/test/` |
| Manuales incorporados en la app | `docs/marcha-blanca/` y `backend/src/routes/ai/docs/marcha-blanca/` |

## 2. Roles y acceso

Los perfiles base activos son `admin`, `vendedor`, `coordinador_comercial`, `bodeguero`, `cajero`, `taller`, `taller_operario`, `rrhh` y `solo_lectura`. El acceso efectivo combina rol base, sucursal y permisos extra por módulo/acción. `admin` conserva acceso total; las rutas de negocio se validan también en el backend.

| Rol | Uso principal |
|---|---|
| Administración | Usuarios, configuración, reglas, auditoría, integridad, IA y visión transversal. |
| Ventas / coordinación comercial | Clientes, CRM, cotizaciones, licitaciones, ventas y seguimiento comercial. |
| Bodega | Inventario, ingresos, picking, packing, compras, importaciones y apoyo a despacho. |
| Taller / operario | ODT, asignación, avance, consumos, materiales, calidad y bitácora; el operario tiene alcance restringido. |
| Caja | Turnos, pagos, movimientos, cierres y cobranza según asignación. |
| RRHH | Trabajadores, documentos, asistencia y datos laborales. |
| Sólo lectura | Consulta de las áreas habilitadas sin escritura. |

## 3. Funcionalidad entregada por módulo

### 3.1 Dashboard, ayuda, notificaciones y feedback

- Dashboard general y tablero operativo por rol, con accesos a la cola de trabajo.
- Campana de notificaciones y eventos interárea: taller, bodega, descuentos, facturación y producción.
- Ayuda rápida contextual desde la barra superior con `F1`, centro de ayuda y manuales por rol dentro de `/ayuda`.
- Widget de marcha blanca y panel administrativo de feedback: clasificación **Falla / Falta / Mejora**, datos de contexto, severidad/impacto y seguimiento de la observación.
- Copiloto IA y alertas operativas IA disponibles desde el menú de Ayuda, sujeto a permisos y configuración del proveedor.

**Rutas:** `/dashboard`, `/dashboard/operativo`, `/ayuda`, `/admin/feedback`, `/asistente`, `/asistente/alertas`.  
**Evidencia:** `frontend/src/pages/dashboard/`, `frontend/src/pages/ayuda/`, `frontend/src/pages/admin/PilotFeedbackPage.jsx`, `backend/test/pilot-feedback.test.js`, `backend/test/dashboard-por-rol.test.js`.

### 3.2 Ventas, matriz comercial y clientes

- Creación, edición, consulta e impresión de ventas.
- Tipos guiados desde el menú: Venta Sala/Mostrador, Convenio Marco, Trato Directo, Marketplace y Venta Web.
- Matriz de ventas con estados, filtros operativos, detalle y número interno (`nInterno`) visible en cabecera y detalle.
- Ítems, cargos de transporte, descuentos, historial de despacho y trazabilidad del flujo de la orden.
- Cliente canónico por RUT, sucursales, contactos, dirección/comuna y ficha de cliente.
- Protección contra duplicidades y normalización de estados cubierta por pruebas de ventas.

**Rutas:** `/ventas`, `/ventas/nueva`, `/ventas/:id`, `/clientes`, `/clientes/:id`.  
**Evidencia:** `backend/src/routes/ventas/`, `backend/src/routes/clientes/`, `backend/test/ventas.test.js`, `backend/test/matriz-ventas.test.js`, `backend/test/clientes.test.js`.

### 3.3 CRM, cotizaciones, licitaciones y compras online

- Embudo CRM, gestiones, asignaciones, historial de estado y recordatorios comerciales.
- Creación de cotización simple, licitación y Compra Ágil desde CRM.
- Versiones de cotización, adjudicación total/parcial y conversión al flujo comercial según condición.
- Banner de orden ganada con enlace directo a la venta relacionada.
- Órdenes de compra online, ítems y soporte de importación/control comercial.

**Rutas:** `/crm`, `/crm/:id/gestion`, `/crm/nueva/cotizacion-simple`, `/crm/nueva/licitacion`, `/crm/nueva/compra-agil`, `/licitaciones/:id`, `/ordenes-compra`.  
**Evidencia:** `backend/src/routes/crm/`, `backend/test/crm-commercial.test.js`, `backend/test/crm-cotizaciones-flujo.test.js`, `backend/test/cotizaciones-flow.test.js`, `backend/test/ordenes-compra-web.test.js`.

### 3.4 Catálogo, inventario, proveedores y abastecimiento

- Catálogo de productos con categorías/subcategorías, fotos, búsqueda/autocompletado, importación y edición controlada.
- Ubicación física, stock, historial/Kardex, movimientos de bodega y reportes de movimientos anormales.
- Ingreso manual de mercadería, importaciones en tránsito y recepción asociada a compras.
- Paneles separados de Picking y Packing para preparar pedidos de venta.
- Proveedores, asociación producto-proveedor, costos, precios por canal, consulta de precios y antecedentes de pago.
- Órdenes de compra a proveedores, ítems, métricas, pagos y aplicación de stock trazable.
- Bodega de taller, telas, lotes, movimientos y materiales para producción.

**Rutas:** `/bodega`, `/bodega/picking`, `/bodega/packing`, `/stock-ingresos`, `/importaciones`, `/ordenes-compra-proveedores`, `/proveedores`, `/pagos-proveedores`, `/consulta-precios`, `/bodega-taller`, `/telas`.  
**Evidencia:** `backend/src/routes/productos/`, `backend/src/routes/proveedores/`, `backend/test/productos.test.js`, `backend/test/productos-proveedores.test.js`, `backend/test/ubicaciones-routes.test.js`, `backend/test/stock-ingresos-apply.test.js`, `backend/test/ordenes-compra-proveedores.test.js`, `backend/test/pagos-proveedores-stock.test.js`.

**Regla relevante:** el stock se modifica mediante movimientos y no por edición directa de producto. La fórmula de precios por canal existe, pero su resultado depende de que proveedores, costos y porcentajes estén cargados y vigentes.

### 3.5 Taller, producción y costeo

- Órdenes de Taller (ODT): creación, listado, detalle, edición, cierre, anulación y control de transiciones.
- Kanban, carga por operario, productividad, centros de costo y asignación de responsables.
- Vista especializada de Taller de Corte; las demás áreas se controlan desde ODT/filtros y sus estaciones.
- Terminal de operario para avances acotados al trabajo asignado.
- Ítems/etapas de ODT, recepción entre etapas, evidencias, bitácora y excepciones.
- Registro de materiales, consumos, mermas e historial de material por ODT.
- Pasar a Taller: la navegación histórica se redirige al flujo actual de excepciones/derivación; no se mantiene como pantalla independiente.
- Catálogo de materiales/telas, bodega de taller y recetas/costeo: editor de recetas, importador Excel MK, procesos, snapshots y aplicación de costeo.

**Rutas:** `/taller`, `/taller/:id`, `/taller-operario`, `/taller-corte`, `/bitacora-taller`, `/historial-materiales`, `/excepciones-taller`, `/costeo`.  
**Evidencia:** `backend/src/routes/odts/`, modelos `taller.Odt`, `taller.OdtItem`, `taller.TallerMaterial`, `taller.BitacoraTaller`, `taller.ProductoReceta` en `backend/prisma/schema.prisma`; pruebas `odts.test.js`, `odt-transiciones.test.js`, `odt-consumos.test.js`, `taller-avance-concurrencia.test.js`, `costeo-*.test.js`.

**Control operacional:** una venta transitoria puede requerir ODT; no se debe asumir que todo quiebre de stock la crea. El responsable valida pendientes, cantidades, etapa y liberación de calidad.

### 3.6 Despachos, despacho aislado y guía DTE 52

- Matriz y cola operativa de despachos, consolidado de taller y exportación de registros.
- Preparación desde ventas confirmadas con soporte de productos de inventario, transitorios de taller, ventas mixtas y parciales.
- Despacho aislado sin crear artificialmente una venta.
- Picking y packing por orden de venta, bultos y eventos de packing.
- Programación de salida, responsable, transporte, incidencias y tracking secuencial.
- Guía de despacho: borrador, validación, edición, impresión, exportación, emisión y envío SII desde la guía DTE 52.
- Trazabilidad orden → picking/packing → despacho → guía → tracking.

**Rutas:** `/despachos`, `/despachos/nuevo`, `/despachos/ordenes/:ordenId/picking`, `/despachos/ordenes/:ordenId/packing`, `/despachos/:id/tracking`, `/despachos/guias/nueva`.  
**Evidencia:** `backend/src/routes/despachos/`, modelos `bodega.Despacho`, `bodega.GuiaDespacho`, `bodega.DespachoTrackingEvento`, `bodega.PackingBulto`; pruebas `despachos-flujo-integral.test.js`, `despachos-traceability.test.js`, `notificaciones-bodega-facturacion.test.js`.

**Requiere validación externa:** emitir/enviar una guía al SII exige empresa, certificado, CAF disponible y ambiente SII correctamente configurados.

### 3.7 Caja, pagos, cobranza y tesorería

- Apertura de turno, movimientos, registro de ingresos/egresos y cierre/arqueo de caja.
- Pagos/abonos vinculados a ventas y documentos, con trazabilidad de usuario y sucursal.
- Cuentas por cobrar: cartera, histórico por cliente, filtros por sucursal, gestiones, compromisos de pago y alertas.
- Importación de cartola, conciliación y descarte trazable de movimientos bancarios.
- Gestión de pagos a proveedores y control de stock/IVA asociado donde corresponde.

**Rutas:** `/caja`, `/caja/nuevo`, `/cobranza`, `/pagos-proveedores`.  
**Evidencia:** `backend/src/routes/caja/`, `backend/src/routes/cobranza/`, modelos `caja.Turno`, `caja.MovimientoCaja`, `ventas.CobranzaHistorico`, `ventas.CobranzaGestion`; pruebas `caja-traceability.test.js`, `cobranza-cliente.test.js`, `cobranza-gestion.test.js`, `cobranza-pagos-proveedores.test.js`.

### 3.8 Facturación electrónica y documentos tributarios

- Configuración de empresa fiscal, certificado y CAF; administración y ajuste autorizado de folios.
- Borradores, emisión, firma, envío, reenvío, consulta de estado, XML, HTML/PDF e historial de documentos emitidos.
- Documentos habituales: Factura afecta 33, exenta 34, Boleta 39/41, Guía 52, Nota de Crédito 61 y Nota de Débito 56; además de pantallas para factura de compra, liquidación y exportación.
- Documentos recibidos: listado, detalle, representación, PDF/XML y sincronización.
- Trazabilidad de excepciones y vínculo venta → guía → documento tributario.
- Motor DTE con firma, CAF, TED/PDF417, receptor, validaciones y cliente SII.

**Rutas:** `/facturacion/documentos`, `/facturacion/recibidos`, `/facturacion/emitir`, `/facturacion/factura-compra`, `/facturacion/liquidacion`, `/facturacion/exportacion`, `/facturacion/configuracion`.  
**Evidencia:** `backend/src/routes/facturacion/index.js`, `backend/src/facturacion/`, modelos `facturacion.FactDocumento`, `facturacion.FactCaf`, `facturacion.FactDocumentoRecibido`; pruebas `facturacion-*.test.js`.

**Límite operativo Plastimar:** el sistema aplica un límite interno de 20 líneas por documento. Si se supera, el responsable debe dividir y reconciliar los documentos; no es una afirmación de límite general del SII.

### 3.9 RRHH

- Fichas de trabajador, contratos, documentos, cargos, cuentas disponibles, registros y cumplimiento previsional.
- Asistencia, jornadas, días/tipos de día, horas extra, licencias, vacaciones, anticipos, liquidaciones y libro de remuneraciones.
- EPP, hoja de vida, subcontratos, certificados, vacunas y antecedentes laborales.
- Panel operativo y resumen de RRHH con permisos por módulo.

**Rutas:** `/rrhh`, `/rrhh/nuevo`, `/rrhh/:id`.  
**Evidencia:** `backend/src/routes/rrhh/`, modelos `rrhh.Trabajador` a `rrhh.Vacuna` en `backend/prisma/schema.prisma`; pruebas `rrhh.test.js`, `rrhh-ficha-trabajador.test.js`, `rrhh-remuneracion-confidencial.test.js`.

### 3.10 Gerencia, reportes, descuentos y comisiones

- Reportería gerencial, filtros y exportaciones de soporte.
- Reporte de comisiones y administración de reglas: porcentaje fijo o escala, prioridad, vigencia y tramos.
- Reglas de descuento, topes/solicitudes y flujos de aprobación.
- Reporte de movimientos anormales para control de bodega.
- Consulta de precios/costos como apoyo a evaluación comercial.

**Rutas:** `/reportes/gerenciales`, `/reportes/comisiones`, `/reportes/movimientos-anormales`, `/admin/comisiones`, `/descuentos`.  
**Evidencia:** `backend/src/routes/reportes/`, `backend/src/routes/admin/comisiones.js`, modelos `ventas.ComisionRegla`, `ventas.ComisionReglaTramo`, `ventas.DescuentoRegla`, `ventas.DescuentoSolicitud`; pruebas `reportes-gerenciales.test.js`, `comisiones.test.js`, `comisiones-reportes.test.js`, `descuentos-reglas-flujo.test.js`.

**Decisión que debe mantenerse explícita:** la escala de comisión debe ser definida por gerencia como escalón o marginal. El motor actual aplica el tramo que contiene el monto al total de la venta; ese comportamiento debe estar rotulado y validado por la política comercial.

### 3.11 Administración, seguridad e integridad

- Gestión de usuarios, rol, sucursal, estado, contraseña, permisos extra y matriz de acceso efectivo.
- Configuración global y de empresa, reglas de descuento, excepciones y bitácora/auditoría.
- Integridad de datos, saneamiento legacy e histórico administrativo desde rutas protegidas de administrador.
- Revocación de sesión mediante versión de autenticación cuando se modifican credenciales/permisos críticos.
- Auditoría de acciones y trazabilidad técnica de usuario en operaciones sensibles.

**Rutas:** `/usuarios`, `/config`, `/admin/integridad`, `/admin/auditoria`, `/admin/historico`, `/admin/saneamiento-legacy`, `/admin/excepciones`, `/admin/ia-balance`.  
**Evidencia:** `backend/src/routes/admin/`, `backend/src/middleware/rbac.js`, modelos `auth.User`, `auth.Session`, `auth.AuditLog`, `config.EmpresaConfig`; pruebas `usuarios.test.js`, `rbac.test.js`, `rbac-permisos-funcion.test.js`, `permisos-front-back-coinciden.test.js`, `audit-plugin.test.js`.

### 3.12 Asistente IA y control de consumo

- Chat de consulta/documentación con conversaciones y mensajes persistentes.
- Herramientas de consulta por dominio y protección de datos según rol/permisos.
- Alertas/insights operativos y panel administrativo de balance/consumo de IA.
- Manuales de marcha blanca sincronizados al backend y al frontend para acceso contextual.

**Rutas:** `/asistente`, `/asistente/alertas`, `/admin/ia-balance`.  
**Evidencia:** `backend/src/routes/ai/`, `backend/src/routes/ai/tools/`, `backend/test/ai-assistant.test.js`, `ai-gemini-provider.test.js`, `ai-gemini-routing.test.js`, `ai-permisos-dominio.test.js`, `ai-limits.test.js`.

**Requiere configuración externa:** proveedor/modelo y clave de IA válidos. La ausencia de credenciales debe mostrarse como condición de integración, no como error de datos de negocio.

### 3.13 Web pública e integraciones

- Endpoints de catálogo visible, precios web y órdenes online para la tienda pública.
- Carga de fotos/documentos bajo control de rutas y almacenamiento configurado.
- Importaciones y herramientas de transición de legacy disponibles como procesos controlados; no implican escritura hacia el sistema legacy.

**Evidencia:** `backend/src/routes/productos/publicWeb.js`, `backend/test/web-public.test.js`, `backend/test/uploads.test.js`, documentación y scripts de legacy en `docs/` y `backend/scripts/`.

## 4. Flujo integrado que entrega el sistema

1. Ventas/CRM crea cotización, licitación o venta y conserva cliente, ítems, canal y número interno.
2. El producto disponible pasa a Picking/Packing; el producto transitorio se deriva y controla mediante ODT/etapas de Taller.
3. Taller registra planificación, responsable, avances, materiales, calidad y liberación de lo fabricado.
4. Bodega prepara parcial o total, programa salida y Despacho registra tracking/incidencias.
5. Se prepara la guía DTE 52 cuando corresponde; Facturación gestiona emisión, envío y respuesta SII.
6. Caja/Cobranza registra pagos, turnos, saldos, gestión de mora y conciliación.
7. Reportes, auditoría, notificaciones y roles entregan seguimiento transversal.

## 5. Cambios incluidos desde la entrega anterior

Entre `e93a50e` y `14cbc1a`, `main` incorporó o corrigió:

- Ayuda rápida contextual por vista y manuales sincronizados al sistema.
- Copiloto IA, routing/proveedor Gemini, documentación asistida e insights/alertas operativas.
- Banner de CRM para orden ganada y acceso directo a la venta.
- Correcciones de cobranza: alcance por sucursal y control del límite de parámetros en histórico.
- Visibilidad de número interno de venta en cabecera y detalle.

## 6. Validación y condiciones antes de usar en operación

| Verificación | Comando o acción |
|---|---|
| Dependencias backend | `cd backend; npm ci; npm run db:generate` |
| Migraciones locales | `npm run db:migrate:docker` |
| Base exclusiva de pruebas | `npm run db:migrate:test:docker` y `npm run db:seed:test:docker` |
| Pruebas de integración | `npm run test:docker` o subconjunto `npm run test:ci` |
| Compilación frontend | `cd frontend; npm ci; npm run build` |
| Inicio local | backend `npm run dev:docker`; frontend `npm run dev -- --host 127.0.0.1` |
| DTE real | revisar empresa, certificado, CAF, ambiente y respuesta SII antes de emitir |

Las pruebas existentes son de integración con PostgreSQL real aislado (`plastimar_test`) y cubren autorización, ventas, ODT, consumos, despacho, cobranza, caja, DTE, RRHH, IA, reportes e integridad. La ejecución de las pruebas debe hacerse contra `plastimar_test`, nunca contra producción.

## 7. Pendientes o dependencias que no se deben ocultar

- **Datos maestros:** precios derivados dependen de relaciones producto-proveedor, costo y porcentajes cargados; el motor no completa datos faltantes automáticamente.
- **DTE/SII:** la emisión productiva depende de CAF, certificado, configuración tributaria, conectividad y respuesta externa; un Track ID no equivale a aceptación.
- **Comisiones:** confirmar con gerencia si la escala es de escalón o marginal y alinear rotulación/política.
- **Costeo y Espuma:** recetas, materiales y procesos deben contar con cobertura verificable para cada producto fabricado; densidad, lote, calidad, consumo/merma física por ODT y trazabilidad de trabajador/tiempo siguen siendo controles a validar según proceso real.
- **Marcha blanca:** cada área debe documentar Falla/Falta/Mejora con evidencia y no sustituir los procedimientos físicos de conteo, calidad, firma/entrega o evidencia bancaria.
- **Local actual:** el backend y frontend levantan en localhost. Si una clave habitual devuelve `401`, revisar que se esté usando la base Docker y el usuario correcto; no resetear usuarios ni aplicar seeds sobre datos de trabajo sin respaldo/autorización.

## 8. Referencias de operación

- [Guía de inicio rápido](marcha-blanca/00_MAPA_DOCUMENTACION_Y_GUIA_INICIO/GUIA_INICIO_RAPIDO.md)
- [Manual de Ventas y Licitaciones](marcha-blanca/roles/02_ROL_VENTAS_Y_LICITACIONES/MANUAL_VENTAS.md)
- [Manual de Bodega](marcha-blanca/roles/03_ROL_BODEGA/MANUAL_BODEGA.md)
- [Manual de Despacho](marcha-blanca/roles/04_ROL_DESPACHO/MANUAL_DESPACHO.md)
- [Manual de Taller](marcha-blanca/roles/05_ROL_TALLER/MANUAL_TALLER.md)
- [Manual de Caja y Cobranza](marcha-blanca/roles/06_ROL_CAJA_Y_COBRANZA/MANUAL_CAJA_Y_COBRANZA.md)
- [Manual de Facturación DTE](marcha-blanca/roles/07_ROL_FACTURACION_DTE/MANUAL_FACTURACION_DTE.md)
- [Manual de Administración](marcha-blanca/roles/08_ROL_ADMINISTRACION/MANUAL_ADMINISTRACION.md)
- [Trazabilidad de requerimientos](../TRAZABILIDAD_PLASTIMAR.md)
- [Instrucción de revisión y deploy](INSTRUCCION_REVISION_COMMIT_DEPLOY.md)

---

**Entrega preparada contra el código de `main` en `14cbc1a`.** Cualquier commit posterior, dato cargado después de esta fecha o configuración externa no forma parte de esta evidencia hasta que se valide y se agregue al acta.
