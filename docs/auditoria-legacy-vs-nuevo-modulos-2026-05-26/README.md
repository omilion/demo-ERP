# Auditoría legacy vs plataforma nueva - índice módulo por módulo

Fecha: 26-05-2026

Fuente legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion`

Objetivo: comprobar módulo por módulo qué existía en el ERP legacy, cómo se muestra hoy en la plataforma nueva, qué falta replicar y qué extras trae el sistema nuevo.

## Cobertura

- Módulos/carpetas legacy auditadas: 48.
- Documentos generados: 48 Markdown individuales.
- La auditoría incluye módulos funcionales y carpetas de soporte para no omitir nada del legacy.

## Matriz de módulos

| Módulo legacy | Documento | Archivos PHP | Estado inicial | Equivalente nuevo detectado | Señales legacy |
|---|---|---:|---|---|---|
| `autocompleta_nombre_material` | [autocompleta-nombre-material.md](./autocompleta-nombre-material.md) | 1 | Parcial por verificar | `backend/src/routes/odts`, `backend/src/routes/telas`, `frontend/src/pages/taller`, +1 | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `bitacora_taller` | [bitacora-taller.md](./bitacora-taller.md) | 15 | Parcial por verificar | `backend/src/routes/bitacora-taller`, `backend/src/routes/bitacora-taller/index.js`, `backend/src/routes/odts/bitacora.js`, +2 | campos 4, acciones 13, columnas 4, exports 16, búsquedas 6 |
| `bodega` | [bodega.md](./bodega.md) | 50 | Parcial por verificar | `backend/src/routes/bodega-taller/index.js`, `backend/src/routes/categorias-bodega-taller/index.js`, `backend/src/routes/productos`, +7 | campos 26, acciones 36, columnas 21, exports 128, búsquedas 42 |
| `bodega_taller` | [bodega-taller.md](./bodega-taller.md) | 22 | Parcial por verificar | `backend/src/routes/bodega-taller`, `backend/src/routes/bodega-taller/index.js`, `backend/src/routes/categorias-bodega-taller/index.js`, +3 | campos 11, acciones 15, columnas 9, exports 60, búsquedas 25 |
| `caja` | [caja.md](./caja.md) | 34 | Parcial por verificar | `backend/src/routes/caja`, `backend/src/routes/caja/historico.js`, `backend/src/routes/caja/index.js`, +6 | campos 16, acciones 35, columnas 34, exports 98, búsquedas 36 |
| `cargo_transporte` | [cargo-transporte.md](./cargo-transporte.md) | 14 | Parcial por verificar | `backend/src/routes/cargo-transporte`, `backend/src/routes/cargo-transporte/index.js`, `backend/src/routes/ventas/cargos.js`, +1 | campos 3, acciones 13, columnas 3, exports 49, búsquedas 6 |
| `categorias` | [categorias.md](./categorias.md) | 12 | Parcial por verificar | `backend/src/routes/categorias`, `backend/src/routes/categorias-bodega-taller/index.js`, `backend/src/routes/categorias/index.js`, +2 | campos 5, acciones 11, columnas 4, exports 0, búsquedas 0 |
| `categorias_bodega_taller` | [categorias-bodega-taller.md](./categorias-bodega-taller.md) | 12 | Parcial por verificar | `backend/src/routes/categorias-bodega-taller`, `backend/src/routes/categorias-bodega-taller/index.js`, `frontend/src/api/categoriasBodegaTaller.js` | campos 2, acciones 10, columnas 1, exports 0, búsquedas 0 |
| `clase_excel` | [clase-excel.md](./clase-excel.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `clientes` | [clientes.md](./clientes.md) | 19 | Parcial por verificar | `backend/src/routes/clientes`, `backend/src/routes/clientes/create.js`, `backend/src/routes/clientes/get.js`, +9 | campos 11, acciones 23, columnas 8, exports 57, búsquedas 96 |
| `cobranza` | [cobranza.md](./cobranza.md) | 24 | Parcial por verificar | `backend/src/routes/cobranza`, `backend/src/routes/cobranza/index.js`, `frontend/src/api/cobranzaHistorico.js`, +2 | campos 29, acciones 46, columnas 27, exports 62, búsquedas 66 |
| `cobranza_cliente` | [cobranza-cliente.md](./cobranza-cliente.md) | 8 | Parcial por verificar | `backend/src/routes/clientes`, `backend/src/routes/cobranza`, `frontend/src/pages/cobranza` | campos 5, acciones 25, columnas 22, exports 13, búsquedas 53 |
| `consulta_precios` | [consulta-precios.md](./consulta-precios.md) | 9 | Parcial por verificar | `backend/src/routes/productos/autocomplete.js`, `frontend/src/api/productos.js`, `frontend/src/pages/consulta-precios`, +1 | campos 3, acciones 9, columnas 14, exports 0, búsquedas 15 |
| `convenio_marco` | [convenio-marco.md](./convenio-marco.md) | 54 | Parcial por verificar | `backend/src/routes/cotizaciones`, `backend/src/routes/ordenes-compra`, `frontend/src/pages/licitaciones`, +1 | campos 39, acciones 77, columnas 93, exports 7, búsquedas 182 |
| `cotizar_licitacion` | [cotizar-licitacion.md](./cotizar-licitacion.md) | 44 | Parcial por verificar | `backend/src/routes/cotizaciones`, `frontend/src/pages/licitaciones` | campos 27, acciones 51, columnas 47, exports 2, búsquedas 103 |
| `cron_job` | [cron-job.md](./cron-job.md) | 1 | Parcial por verificar | `backend/src/routes/admin`, `backend/src/routes/reportes` | campos 0, acciones 0, columnas 14, exports 0, búsquedas 2 |
| `css` | [css.md](./css.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `descuentos_marco` | [descuentos-marco.md](./descuentos-marco.md) | 11 | Parcial por verificar | `backend/src/routes/descuentos`, `frontend/src/pages/descuentos` | campos 2, acciones 10, columnas 2, exports 0, búsquedas 0 |
| `descuentos_porc` | [descuentos-porc.md](./descuentos-porc.md) | 11 | Parcial por verificar | `backend/src/routes/descuentos`, `frontend/src/pages/descuentos` | campos 2, acciones 10, columnas 2, exports 0, búsquedas 0 |
| `despacho` | [despacho.md](./despacho.md) | 31 | Parcial por verificar | `backend/src/routes/despachos`, `backend/src/routes/despachos/index.js`, `frontend/src/api/despachos.js`, +2 | campos 11, acciones 55, columnas 43, exports 83, búsquedas 162 |
| `facturas_bodega` | [facturas-bodega.md](./facturas-bodega.md) | 38 | Parcial por verificar | `backend/src/routes/pagos-proveedores`, `backend/src/routes/stock-ingresos`, `frontend/src/pages/pagos-proveedores`, +1 | campos 22, acciones 39, columnas 23, exports 65, búsquedas 43 |
| `font` | [font.md](./font.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `fonts` | [fonts.md](./fonts.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `gastos` | [gastos.md](./gastos.md) | 14 | Parcial por verificar | `backend/src/routes/gastos`, `backend/src/routes/gastos/index.js`, `frontend/src/api/gastos.js` | campos 1, acciones 12, columnas 1, exports 45, búsquedas 5 |
| `img` | [img.md](./img.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `js` | [js.md](./js.md) | 0 | Soporte técnico | `backend/src/routes/accesos/index.js`, `backend/src/routes/admin/index.js`, `backend/src/routes/auth/index.js`, +153 | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `lib` | [lib.md](./lib.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `licitacion_venta` | [licitacion-venta.md](./licitacion-venta.md) | 50 | Parcial por verificar | `backend/src/routes/cotizaciones`, `backend/src/routes/ventas`, `frontend/src/pages/licitaciones`, +1 | campos 36, acciones 70, columnas 105, exports 7, búsquedas 158 |
| `matriz_ventas` | [matriz-ventas.md](./matriz-ventas.md) | 31 | Parcial por verificar | `backend/src/routes/matriz-ventas`, `backend/src/routes/matriz-ventas/index.js`, `backend/src/routes/ventas`, +3 | campos 3, acciones 40, columnas 31, exports 83, búsquedas 123 |
| `pasar_taller` | [pasar-taller.md](./pasar-taller.md) | 9 | Parcial por verificar | `backend/src/routes/pasar-taller`, `backend/src/routes/pasar-taller/index.js`, `frontend/src/pages/pasar-taller`, +1 | campos 2, acciones 4, columnas 14, exports 0, búsquedas 27 |
| `perfil` | [perfil.md](./perfil.md) | 12 | Parcial por verificar | `backend/src/routes/auth`, `backend/src/routes/usuarios`, `frontend/src/components/TopBar.jsx` | campos 10, acciones 19, columnas 10, exports 0, búsquedas 12 |
| `phpmailer` | [phpmailer.md](./phpmailer.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `precios` | [precios.md](./precios.md) | 17 | Parcial por verificar | `backend/src/routes/productos`, `backend/src/routes/reportes`, `frontend/src/pages/consulta-precios`, +1 | campos 12, acciones 12, columnas 12, exports 63, búsquedas 22 |
| `proveedores` | [proveedores.md](./proveedores.md) | 18 | Parcial por verificar | `backend/src/routes/pagos-proveedores/index.js`, `backend/src/routes/proveedores`, `backend/src/routes/proveedores/index.js`, +6 | campos 13, acciones 27, columnas 13, exports 75, búsquedas 37 |
| `reportes_licitaciones` | [reportes-licitaciones.md](./reportes-licitaciones.md) | 15 | Parcial por verificar | `backend/src/routes/reportes`, `frontend/src/pages/reportes-licitaciones`, `frontend/src/pages/reportes-licitaciones/ReportesLicitacionesPage.jsx` | campos 3, acciones 21, columnas 19, exports 66, búsquedas 64 |
| `subcategorias` | [subcategorias.md](./subcategorias.md) | 11 | Parcial por verificar | `backend/src/routes/categorias`, `frontend/src/api/categorias.js` | campos 4, acciones 10, columnas 2, exports 0, búsquedas 0 |
| `subcategorias_bodega_taller` | [subcategorias-bodega-taller.md](./subcategorias-bodega-taller.md) | 11 | Parcial por verificar | `backend/src/routes/categorias-bodega-taller`, `frontend/src/api/categoriasBodegaTaller.js` | campos 4, acciones 10, columnas 2, exports 0, búsquedas 0 |
| `taller` | [taller.md](./taller.md) | 20 | Parcial por verificar | `backend/src/routes/bitacora-taller/index.js`, `backend/src/routes/bodega-taller/index.js`, `backend/src/routes/categorias-bodega-taller/index.js`, +12 | campos 3, acciones 27, columnas 50, exports 18, búsquedas 47 |
| `taller_confecciones` | [taller-confecciones.md](./taller-confecciones.md) | 22 | Parcial por verificar | `backend/src/routes/odts`, `frontend/src/pages/taller` | campos 7, acciones 27, columnas 58, exports 0, búsquedas 61 |
| `taller_espumas` | [taller-espumas.md](./taller-espumas.md) | 20 | Parcial por verificar | `backend/src/routes/odts`, `frontend/src/pages/taller` | campos 2, acciones 24, columnas 55, exports 0, búsquedas 51 |
| `taller_externo` | [taller-externo.md](./taller-externo.md) | 20 | Parcial por verificar | `backend/src/routes/odts`, `frontend/src/pages/taller` | campos 2, acciones 24, columnas 56, exports 0, búsquedas 51 |
| `taller_historial_materiales` | [taller-historial-materiales.md](./taller-historial-materiales.md) | 15 | Parcial por verificar | `backend/src/routes/historial-materiales`, `frontend/src/pages/historial-materiales` | campos 7, acciones 19, columnas 18, exports 24, búsquedas 9 |
| `usuarios` | [usuarios.md](./usuarios.md) | 15 | Parcial por verificar | `backend/src/routes/accesos`, `backend/src/routes/usuarios`, `backend/src/routes/usuarios-web/index.js`, +4 | campos 10, acciones 16, columnas 14, exports 0, búsquedas 35 |
| `vendor` | [vendor.md](./vendor.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |
| `venta_directa` | [venta-directa.md](./venta-directa.md) | 100 | Parcial por verificar | `backend/src/routes/caja`, `backend/src/routes/ventas`, `frontend/src/pages/ventas` | campos 49, acciones 123, columnas 117, exports 7, búsquedas 221 |
| `venta_web` | [venta-web.md](./venta-web.md) | 81 | Parcial por verificar | `backend/src/routes/ordenes-compra`, `backend/src/routes/productos/publicWeb.js`, `frontend/src/pages/ordenes-compra` | campos 47, acciones 99, columnas 100, exports 7, búsquedas 220 |
| `web` | [web.md](./web.md) | 17 | Parcial por verificar | `backend/src/routes/banners`, `backend/src/routes/productos/publicWeb.js`, `backend/src/routes/usuarios-web`, +1 | campos 9, acciones 16, columnas 13, exports 1, búsquedas 33 |
| `word_textarea` | [word-textarea.md](./word-textarea.md) | 0 | Soporte técnico | Sin equivalente directo | campos 0, acciones 0, columnas 0, exports 0, búsquedas 0 |

## Extras visibles en plataforma nueva

Estos módulos/rutas nuevas no aparecen como carpeta legacy equivalente directa o están mucho más formalizados en la plataforma nueva:
- `dashboard`
- `crm`
- `rrhh`
- `admin/integridad`
- `admin/auditoria`
- `admin/historico`
- `admin/saneamiento-legacy`
- `reportes/gerenciales`
- `accesos`

## Próximo uso del informe

1. Revisar primero módulos críticos de operación: bodega, facturas_bodega, matriz_ventas, venta_directa, despacho, caja, clientes, proveedores, taller y licitaciones.
2. Convertir cada brecha en ticket o tarea técnica con criterio de aceptación.
3. Validar contra usuario del cliente usando datos reales o capturas legacy.
4. Marcar como cerrado solo cuando exista equivalencia funcional, reemplazo acordado o descarte explícito.
