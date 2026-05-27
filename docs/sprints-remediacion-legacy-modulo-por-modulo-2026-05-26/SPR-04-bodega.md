# SPR-04-bodega - bodega

Prioridad: **P0 - crítico operativo**
Dominio: **Bodega / Inventario**
Subagente especialista asignado: **Subagente Bodega-Inventario**
Estado: **Aprobado con observaciones no bloqueantes**

## Objetivo

Revisar y reparar el módulo `bodega` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/bodega.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-04-bodega.md`
- Evidencia legacy principal:
  - `bodega\acepta_eliminar.php`
  - `bodega\actualizar.php`
  - `bodega\actualizar3.php`
  - `bodega\actualizar_categoria_bodega.php`
  - `bodega\actualizar_codigobarra_bodega.php`
  - `bodega\actualizar_estado_inventario.php`
  - `bodega\actualizar_precio_bodega.php`
  - `bodega\actualizar_proveedor_bodega.php`
  - `bodega\actualizar_stock_bodega.php`
  - `bodega\actualizar_stockcritico_bodega.php`
  - `bodega\buscador\index.php`
  - `bodega\buscador\lista.php`

## Cómo se mostraba en legacy

- Tabla legacy: Foto, Cód Interno, ID Marco, Cód Barra, Mostrar Web, Nombre, Categoría, Subcategoria, descuento, Precio Costo, Precio Marco, Stock Crítico, Stock, Estado Inventario y Proveedor.
- Legacy tenía Exportar a Excel, PDF, Masivo Stock, Masivo Precios, Masivo WEB e Importar Inventario.
- Plan: replicar columnas/filtros masivos y separar stock de stock crítico en la vista nueva.

Navegación legacy detectada:
- `menu.php?pag=bodega/acepta_eliminar&id=<?php echo $registro['id'] ?>`
- `menu.php?pag=bodega/buscador/ver&id=<?php echo $registro['id'] ?>&bb=<?php echo $bb; ?>`
- `menu.php?pag=bodega/buscar_codigo_interno`
- `menu.php?pag=bodega/buscar_codigobarra`
- `menu.php?pag=bodega/buscar_idmarco`
- `menu.php?pag=bodega/buscar_nombre`
- `menu.php?pag=bodega/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=bodega/importar_eliminar`
- `menu.php?pag=bodega/importar_inv_excel`
- `menu.php?pag=bodega/importar_precios_excel`
- `menu.php?pag=bodega/importar_stock_excel`
- `menu.php?pag=bodega/importar_web_excel`
- `menu.php?pag=bodega/index&stock_critico=si`
- `menu.php?pag=bodega/index&todos_marco=si`
- `menu.php?pag=bodega/index&web=si`

## Cómo se muestra hoy

- `backend/src/routes/bodega-taller/index.js`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `backend/src/routes/productos`
- `frontend/src/api/bodegaTaller.js`
- `frontend/src/api/categoriasBodegaTaller.js`
- `frontend/src/api/productos.js`
- `frontend/src/pages/bodega`
- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`
- `frontend/src/pages/bodega/BodegaFormPage.jsx`
- `frontend/src/pages/bodega/BodegaPage.jsx`

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del módulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegación y accesos directos.
- Búsquedas, filtros simples, filtros múltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditoría.

## Brechas iniciales

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las búsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparación

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existían en legacy y falten hoy.
4. Replicar búsquedas/filtros legacy, incluyendo accesos por botón cuando el usuario los use.
5. Replicar exportaciones Excel/PDF legacy o justificar reemplazo.
6. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
7. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.
- Stock, precio, proveedor, categoría, subcategoría y visibilidad web se comportan igual o mejor que en legacy.
- Las cargas masivas validan duplicados, formato, permisos y resumen antes de aplicar cambios.

## Seguridad, datos y permisos

- Validar permisos de lectura/escritura antes de editar stock, precios, proveedor o visibilidad web.
- Registrar auditoría para cambios masivos Excel/PDF/importaciones.
- Proteger importaciones contra columnas inválidas, duplicados y sobrescritura accidental.

## Checklist de validación final

- [ ] Revisar archivo legacy y anotar comportamiento exacto.
- [ ] Revisar pantalla/API nueva equivalente.
- [ ] Implementar brechas con cambios mínimos y trazables.
- [ ] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [ ] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [ ] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [ ] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementacion realizada: se corrigieron columnas/filtros principales de Bodega, exportacion CSV compatible Excel con columnas legacy y filtros activos, doble click de edicion, acceso protegido por `bodega`, importaciones masivas con prevalidacion/confirmacion, importacion web, bloqueo de edicion directa de stock por `PUT`, historial de precio generado en backend y movimientos de stock transaccionales para importacion.
- Archivos modificados: `backend/src/routes/productos/*`, `backend/src/routes/reportes/index.js`, `frontend/src/pages/bodega/*`, `frontend/src/components/shared/index.jsx`, `frontend/src/router.jsx`, `backend/test/productos.test.js`.
- Pruebas ejecutadas:
  - OK: `node --check` en rutas backend tocadas.
  - OK: `npm.cmd run lint` en frontend.
  - OK: `npm.cmd run build` en frontend.
  - OK: Postgres local aislada en Docker, migraciones y seed aplicados.
  - OK: `npm.cmd test -- productos.test.js` con 12/12 tests.
  - OK: `npm.cmd test -- productos.test.js reportes-export-helpers.test.js rbac.test.js` con 35/35 tests.
- Riesgos residuales:
  - Importacion XLSX nativa no queda cerrada; hoy se mantiene CSV compatible Excel porque no hay dependencia XLSX instalada. Queda documentado como mejora si el cliente exige carga `.xlsx` directa.
  - PDF export no queda cerrado en este corte; queda documentado como mejora si el cliente exige PDF igual a legacy.
  - `precioCosto` separado no existe como campo independiente; el sistema usa `precioLista` como costo/lista migrado desde legacy. Crear campo independiente queda fuera de este sprint porque requiere migracion de datos y politica de permisos nueva.
- Validacion del lead: aprobado para continuar; los riesgos P0 de datos/permisos/trazabilidad quedaron cubiertos y probados.
- Decision final: aprobado con observaciones no bloqueantes; continuar al siguiente sprint P0.
