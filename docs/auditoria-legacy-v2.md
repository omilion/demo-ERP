# Auditoría Legacy PHP → ERP v2

**Fecha:** 2026-05-14
**Legacy:** `D:\downloads\backup-plastimar.cl-4-27-2026\public_html\sisgestion\`
**DB legacy:** `D:\downloads\plastim2_plastimar2014.sql` (+ historial dumps)
**v2:** `C:\Users\reich\plastimar-erp-v2\`

Estados: ✅ portado completo · ◐ parcial · ❌ falta

---

## Matriz de módulos

| # | Legacy module | v2 equivalente | Estado | Gap principal |
|---|---|---|---|---|
| 1 | autocompleta_nombre_material | (helper) | ❌ | Endpoint AJAX autocomplete bodega-taller |
| 2 | bitacora_taller | `/api/bitacora-taller` + `BitacoraTallerPage` | ◐ | Falta filtro operario+fechas, búsqueda taller |
| 3 | bodega | `/api/productos` + `BodegaPage` | ◐ | Falta fotos, descripción web, importadores Excel, exports |
| 4 | bodega_taller | `/api/bodega-taller` + `BodegaTallerPage` | ✅ | OK |
| 5 | caja | `/api/caja` + `CajaPage` | ◐ | Falta exports Excel/PDF |
| 6 | cargo_transporte | `/api/cargo-transporte` | ✅ | OK |
| 7 | categorias | `/api/categorias` (con subcategorias anidadas) | ✅ | OK |
| 8 | categorias_bodega_taller | (no separado) | ❌ | Endpoint propio + UI |
| 9 | clientes | `/api/clientes` + `ClientesPage` | ◐ | Falta exports |
| 10 | cobranza (pagos proveedor) | `/api/pagos-proveedores` | ✅ | OK (renombrado) |
| 11 | cobranza_cliente | `/api/cobranza` (histórico) | ◐ | Falta registro nuevo de cobro + vista por cliente |
| 12 | consulta_precios | (no existe) | ❌ | Página read-only multi-criterio |
| 13 | convenio_marco | `Orden.tipo='convenio_marco'` | ◐ | Falta UI aplicación descuentos_marco |
| 14 | cotizar_licitacion | `/api/cotizaciones` + `LicitacionDetallePage` | ✅ | OK |
| 15 | cron_job | (no existe) | ❌ | Job alerta stock crítico |
| 16 | descuentos_marco | `/api/descuentos` tipo=marco | ✅ | OK |
| 17 | descuentos_porc | `/api/descuentos` tipo=porc | ✅ | OK |
| 18 | despacho | `/api/despachos` + `DespachosPage` | ◐ | Faltan búsquedas completas (NC/ND/idLicitacion/tipoVenta) + exports |
| 19 | facturas_bodega | `/api/pagos-proveedores` + `DetalleFacturaProveedor` | ◐ | Falta endpoint POST detalles |
| 20 | gastos | `/api/gastos` | ✅ | OK |
| 21 | licitacion_venta | `Orden.tipo='licitacion'` + `Multa` | ◐ | Falta UI aplicación multas |
| 22 | matriz_ventas | `/api/matriz-ventas` | ◐ | Faltan filtros (OC/ODT/guía/NC/ND/idLicitacion/rutCliente) |
| 23 | pasar_taller | `/api/pasar-taller` + `PasarTallerPage` | ✅ | OK |
| 24 | perfil | `EmpresaConfig` singular | ◐ | Legacy multi-razón social → v2 una sola |
| 25 | precios | (parte de productos) | ❌ | Edición masiva precios + búsqueda multi-criterio |
| 26 | proveedores | `/api/proveedores` + `ProveedoresPage` | ◐ | Falta exports |
| 27 | reportes_licitaciones | (no existe) | ❌ | Dashboard cotizaciones por estado/cliente/fechas |
| 28 | subcategorias | (anidado en categorias) | ✅ | OK |
| 29 | subcategorias_bodega_taller | (no existe) | ❌ | Endpoint + UI |
| 30 | taller | `/api/odts` + `TallerPage` | ✅ | OK |
| 31 | taller_confecciones | (no separado) | ❌ | Vista filtrada por taller tipo=confecciones |
| 32 | taller_espumas | (no separado) | ❌ | Vista filtrada por taller tipo=espumas |
| 33 | taller_externo | (no separado) | ❌ | Vista filtrada por taller tipo=externo |
| 34 | taller_historial_materiales | `/api/historial-materiales` + page | ◐ | Faltan filtros operario+taller |
| 35 | usuarios | `User` model + RBAC roles | ◐ | Faltan permisos granulares por módulo (legacy `modulos_sub`) |
| 36 | venta_directa | `Orden.tipo='directa'` | ◐ | UI completa en `VentasFormPage` — verificar cargo_transporte + descuentos |
| 37 | venta_web | `Orden.tipo='web'` + `OrdenCompraOnline` | ◐ | Flujo separado — verificar integración |
| 38 | web | (no existe) | ❌ | Gestión usuarios web + banners tienda |

---

## Gaps detallados a aplicar

### Tier 1 — Quick wins (módulos completos faltantes pequeños)

#### G1. Producto: fotos + descripción web + precio web
Legacy: tablas `fotos_chicas`, `fotos_grandes`. v2 solo tiene `visibleWeb`.
- Schema: `fotoUrl`, `fotoUrlGrande`, `descripcionWeb`, `precioWeb` en `Producto`
- Backend: aceptar campos en POST/PUT productos
- Frontend: campos en `BodegaFormPage`

#### G2. Reportes Licitaciones (dashboard)
- Endpoint: `GET /api/cotizaciones/reportes` con filtros (fecha, rutCliente, idLicitacion, estado)
- Página: `ReportesLicitacionesPage`
- Ruta: `/reportes/licitaciones`

#### G3. Consulta Precios (read-only)
- Endpoint: `GET /api/productos?` ya existe — añadir filtros codigo_barra + id_marco
- Página: `ConsultaPreciosPage` (read-only, búsqueda multi-criterio)
- Ruta: `/consulta-precios`

#### G4. Vistas filtradas Talleres (confecciones/espumas/externo)
- `Taller` model ya soporta múltiples talleres
- Frontend: tabs en `TallerPage` o `/taller/confecciones`, `/taller/espumas`, `/taller/externo` con filtro por `taller`

#### G5. Categorías + Subcategorías Bodega Taller separadas
- Endpoint: `GET/POST/PUT/DELETE /api/categorias-bodega-taller` y `/api/subcategorias-bodega-taller`
- `BodegaTallerPage`: selector con datos reales

#### G6. Cron stock crítico
- Script: `backend/src/jobs/stockCritico.mjs`
- Schedule: node-cron diario 8am
- Email a admin con productos stock < stockCritico

#### G7. Autocomplete AJAX bodega-taller
- Endpoint: `GET /api/bodega-taller/autocomplete?q=` (devuelve nombres únicos)

### Tier 2 — Medium

#### G8. Cobranza Cliente (registrar cobros)
- Endpoint: `POST /api/cobranza-historico` (insert)
- Hook + UI en `CobranzaPage` (tab "Registrar cobro")

#### G9. Búsquedas avanzadas Matriz Ventas + Despachos
- Filtros: nInterno, oc, odt, nGuia, nc, nd, idLicitacion, rutCliente, tipoVenta, fechas
- Endpoints actualizados + UI filtros

#### G10. Importadores Excel (productos)
- Endpoint: `POST /api/productos/import` (multipart .xlsx)
- 3 tipos: precios, stock, inventario completo
- UI en `BodegaPage`: botón "Importar Excel"

#### G11. Exports Excel/PDF (utility)
- Helper compartido: `backend/src/lib/exporters.js` usando `exceljs` + `pdfkit`
- Endpoints `?format=xlsx` o `?format=pdf` en list endpoints clave

#### G12. Multas en venta licitación
- UI en `VentasFormPage` cuando `tipo=licitacion`: tab Multas (CRUD)
- Endpoint: `/api/ventas/:id/multas`

#### G13. Permisos granulares por módulo
- Schema: `UserPermiso { userId, modulo, puedeVer, puedeEditar, puedeEliminar }`
- Endpoint: `/api/usuarios/:id/permisos`
- UI en `AccesosPage` o nueva `UsuariosPage`

#### G14. Gestión usuarios web + banners
- Schema: `UsuarioWeb`, `Banner`
- Endpoints: `/api/web/usuarios`, `/api/web/banners`
- Página: `WebPage` (admin only)

#### G15. Endpoint POST factura proveedor con detalles
- Endpoint: `POST /api/pagos-proveedores/:id/detalles` (item por item)
- UI en `PagoProveedorDetallePage`: agregar items

### Tier 3 — Pulido

#### G16. Filtros faltantes bitácora + historial materiales
- Búsqueda por operario + fechas + taller

#### G17. Exports en módulos restantes
- clientes, proveedores, cajja, ventas (Excel/PDF)

#### G18. Verificar flujo convenio_marco y venta_web end-to-end
- Probar creación venta tipo=convenio_marco aplicando descuento marco
- Probar venta tipo=web sincronizada con OrdenCompraOnline

---

## Plan de ejecución

Implementación commit-por-commit en orden Tier 1 → Tier 2 → Tier 3.

Cada commit:
- Schema (si aplica) + migration
- Backend routes + tests
- Frontend hooks + página/UI
- Sin Co-Authored-By Claude
