# Cruce PDF original vs estado actual - 2026-05-23

Fuente original:

- `C:\Users\flipe\Downloads\Sisgestion 3.0 - ERP PLASTIMAR Abril 2026 HAZLOMEJOR.pdf`
- PDF de 15 paginas, creado el 2026-04-21.

Estado usado para el cruce:

- Repo actual `plastimar`.
- QA local de Fase 3 Operaciones cerrado el 2026-05-23.
- Produccion previa disponible en `https://vps.plastimar.cl`.
- Nuevo deploy/smoke productivo: pendiente de GitHub Actions despues del push a `main`.

## Nota de nomenclatura

La "Fase 3" del PDF no es la misma "fase 3" que se acaba de implementar en el sprint tecnico.

En el PDF:

- Fase 1: Fundacion.
- Fase 2: Modulos Core.
- Fase 3: Operaciones: Produccion, Despacho/Logistica y RRHH.
- Fase 4: Inteligencia: RAG, scraper MercadoPublico y alertas.
- Fase 5: Reportes, backup e integracion SII.
- Fase 6: QA, migracion, capacitacion y despliegue.
- Fase 7: sitio web high performance.

En el sprint reciente:

- "Fase 3" fue cerrar el flujo tecnico de ventas con productos reales: editar items, persistirlos, imprimir correctamente y desplegar.

## Cruce por modulos del PDF

| Modulo PDF | Estado actual | Evidencia actual | Pendiente real |
|---|---:|---|---|
| Gestion de Productos | Parcial alto | `productos`, catalogo, imagenes, galeria, precios, activo/inactivo, imports, movimientos, smoke productos list/detail OK | Validaciones preventivas completas, mas reglas de codigos/categorias/proveedor, UX avanzada de saneamiento |
| Gestion de Inventario / Bodega | Parcial alto | stock, stock critico, movimientos, ingreso mixto por factura, bodega taller, telas, smoke stock critico OK | Transferencias entre bodegas/sucursales, inventario ciclico, valorizacion FIFO/promedio |
| Gestion de Compras | Parcial | proveedores, pagos proveedores, ordenes de compra online, stock-ingresos | OC proveedor completa, recepcion integrada end-to-end, historial de precios de compra mas robusto |
| Gestion Comercial / Ventas | Parcial alto | ventas CRUD, matriz ventas, cotizaciones/licitaciones, multas, cargos, impresion, cliente/sucursal, items reales persistidos, smoke ventas detail/list OK | Facturacion SII/DTE, documentos tributarios, reglas contables finales, mejor UX para ventas con entregas |
| Gestion de Produccion | Parcial alto | ODT, pasar a taller, bitacora manual y automatica, responsables operativos desde RRHH, carga por operario, materiales/consumos, talleres normalizados, smoke ODT detail/bitacora OK | App movil operario, tiempos avanzados por tarea, Kanban formal, capacidad/costos por taller |
| Despacho / Logistica | Parcial alto | despachos, guias, relacion con orden/ODT, filtros por ODT/comuna/cliente/estado, sincronizacion parcial/entregada con venta, smoke despachos/guias OK | Packing por linea, seguimiento logistico completo, tracking transportista, tiempos de despacho |
| Administracion Sistema | Parcial alto | usuarios, roles/permisos RBAC, accesos, auditoria, integridad, config, historico, smoke auditoria/integridad OK | 2FA, sesiones configurables completas, backup visible en UI |
| Reportes y Control Gestion | Parcial alto | dashboard, reportes gerenciales ventas/cobranza/stock/licitaciones/operaciones, smoke reportes OK | Export Excel/PDF formal, comparativas avanzadas, alertas configurables |
| CRM / Clientes | Parcial | clientes canonicos, sucursales, CRM comercial, historial por cliente en modulos | contactos multiples completos, comunicaciones, segmentacion automatica, limite/condicion de credito |
| RRHH | Parcial | modulo RRHH, trabajadores, contratos/liquidaciones/asistencias/jornadas segun rutas y smoke trabajadores OK | asistencia operativa completa, flujos de aprobacion, reportes laborales finales |
| IA / RAG | Falta | No hay modulo RAG productivo en repo actual | embeddings, pgvector, consultas lenguaje natural, reportes narrativos, analisis predictivo |
| Scraper MercadoPublico + Alertas | Falta | Hay licitaciones internas/reportes, pero no scraper automatico MercadoPublico | Playwright scraper, clasificacion IA, alertas email/in-app, panel oportunidades monitoreadas |
| Sitio web high performance | Parcial | catalogo publico, usuarios web, banners, productos web | sitio corporativo/SEO/GEO completo, sincronizacion publica final |

## Cruce por fases del PDF

| Fase PDF | Estado actual | Lectura |
|---|---:|---|
| Fase 1 Fundacion | Parcial alto | App React + API Fastify + PostgreSQL + JWT + RBAC + CI/CD + deploy productivo. Difiere del stack propuesto: PDF hablaba de FastAPI/Python, pero se implemento Fastify/Node. |
| Fase 2 Modulos Core | Parcial alto | Productos, bodega, compras parciales, ventas, clientes y CRM existen. Falta cerrar compras como flujo proveedor/recepcion completo y algunas reglas preventivas. |
| Fase 3 Operaciones | Parcial alto | Produccion/ODT, despacho y RRHH existen con responsables, bitacora automatica, consumo trazable, carga por operario y filtros logisticos. Faltan app movil operario, Kanban formal, packing y seguimiento logistico avanzado. |
| Fase 4 Inteligencia | Falta | No hay RAG ni scraper MercadoPublico automatico. |
| Fase 5 Reportes & Integracion | Parcial | Reportes gerenciales existen y pasaron smoke; falta SII/DTE, backup administrable y exports formales Excel/PDF. |
| Fase 6 QA & Despliegue | Parcial alto | Produccion viva, deploy con backup/smoke, smoke funcional 29/29 OK. Falta paquete formal de capacitacion/manuales y QA manual firmado. |
| Fase 7 Web high performance | Parcial | Hay base de catalogo publico y assets web; falta sitio final de alto rendimiento/SEO/GEO conectado al ERP. |

## Lo que ya supera o corrige el PDF

- Auditoria e integridad de datos estan mas presentes que en el alcance funcional basico.
- Saneamiento legacy y trazabilidad de migracion estan documentados.
- Deploy productivo ya tiene smoke funcional, no solo health.
- El modelo cliente/sucursal y producto canonico ya corrige deuda del ERP viejo.
- Ventas ya soporta items reales en creacion y edicion, con impresion compatible legacy.

## Brechas principales para alinear contra el PDF

1. SII/DTE: facturas, boletas, notas de credito, estados SII y libro de ventas/compras.
2. IA/RAG: consultas en lenguaje natural, embeddings, reportes narrativos.
3. Scraper MercadoPublico: monitoreo automatico, clasificacion IA y alertas.
4. Produccion avanzada: tiempos por operario, app movil, Kanban, carga de trabajo.
5. Logistica avanzada: packing, seguimiento, ordenamiento territorial y tiempos.
6. Inventario avanzado: transferencias, conteo ciclico, valorizacion.
7. Exportables formales: Excel/PDF para reportes de gestion.
8. Manual/capacitacion/aceptacion formal de QA.

## Prioridad sugerida desde este cruce

Si seguimos estrictamente el PDF, el siguiente bloque logico no es mas ventas, sino cerrar Fase 3 del PDF:

1. Produccion/ODT operativa completa.
2. Despacho/logistica trazable.
3. RRHH operativo basico usable.

Luego pasar a Fase 4:

1. Scraper MercadoPublico.
2. Alertas.
3. RAG/IA.
