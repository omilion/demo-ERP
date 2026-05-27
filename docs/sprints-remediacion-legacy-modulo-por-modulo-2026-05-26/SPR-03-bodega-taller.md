# SPR-03-bodega-taller - bodega_taller

Prioridad: **P2 - completar equivalencia**
Dominio: **Bodega / Inventario**
Subagente especialista asignado: **Subagente Bodega-Inventario**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `bodega_taller` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/bodega-taller.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-03-bodega-taller.md`
- Evidencia legacy principal:
  - `bodega_taller\acepta_eliminar.php`
  - `bodega_taller\actualizar.php`
  - `bodega_taller\buscar_categoria.php`
  - `bodega_taller\buscar_codigo_interno.php`
  - `bodega_taller\buscar_codigobarra.php`
  - `bodega_taller\buscar_nombre.php`
  - `bodega_taller\buscar_proveedor.php`
  - `bodega_taller\consultar_codigo_barra_existe.php`
  - `bodega_taller\consultar_codigo_interno_existe.php`
  - `bodega_taller\eliminar.php`
  - `bodega_taller\guardar.php`
  - `bodega_taller\index.php`

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Categoría, Cód Barra, Cód Interno, Nombre, Proveedor, Stock, Stock Crítico, Subcategoria, Unid. Medida.
- Campos/formularios detectados: Categoria:, Costo:, Código barra:, Código interno:, Nombre producto:, Proveedor:, Stock Crítico:, Stock:, Subategoria:, Subcategoria:, Unidad Medida:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, "> Código interno: Código barra: Unidad Medida: Unidad Mts Mts2 Litros Categoria: Subcategoria: Seleccione Stock Crítico, &codigo_barra= &codigo_interno= &nombre= &categoria= &subcategoria= &stock_critico= &barra_repetido= &interno_repetido=, &codigo_interno= &nombre= &categoria= &subcategoria= &stock_critico= &barra_repetido= &interno_repetido= &sin_codigo_bar, &times;, Buscar, Cancelar operación, Crear nuevo, Código barra, Código interno, Código interno: Código barra: Unidad Medida: Seleccione Unidad Mts Mts2 Litros Categoria: Seleccione Subategoria: Selecc, No Acepto, Nombre producto, Stock Crítico ( ).
- Exportaciones/masivos detectados: $mpdf = new \Mpdf\Mpdf(['orientation' => 'L']); // Establece la orientación en landscape (horizontal), $mpdf->AddPage();, $mpdf->AliasNbPages();, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $mpdf->Cell(10,6,'',1,0,'C',1);, $mpdf->Cell(15,6, $costo,1,1,'C',1);, $mpdf->Cell(15,6, $stock,1,0,'C',1);, $mpdf->Cell(15,6,'Costo',1,1,'C',1);, $mpdf->Cell(15,6,'Stock',1,0,'C',1);, $mpdf->Cell(20,6, utf8_decode($unidad_medida),1,0,'C',1);.
- Búsquedas/filtros detectados: $_pagi_sql = "SELECT * FROM bodega_taller where (nombre like '%$nombre%' or nombre like '%$buscar_sinacento%') and sucursal='$sucursal'";, $buscar_sinacento = eliminar_tildes($nombre);, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $numero=$numero + 1;, $numero=0;, $salida="Resultado busqueda proveedor ", $salida="Resultado búsqueda ", $salida="Resultado búsqueda Nombre ", $salida="Resultado búsqueda categoria ", $salida="Resultado búsqueda código de barra ".

Navegación legacy detectada:
- `menu.php?pag=bodega_taller/acepta_eliminar&id=<?php echo $registro['id']?>`
- `menu.php?pag=bodega_taller/buscar_codigo_interno`
- `menu.php?pag=bodega_taller/buscar_codigobarra`
- `menu.php?pag=bodega_taller/buscar_nombre`
- `menu.php?pag=bodega_taller/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=bodega_taller/index&stock_critico=si`
- `menu.php?pag=bodega_taller/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=bodega_taller/nuevo`

## Cómo se muestra hoy

- `backend/src/routes/bodega-taller`
- `backend/src/routes/bodega-taller/index.js`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `frontend/src/api/bodegaTaller.js`
- `frontend/src/pages/bodega-taller`
- `frontend/src/pages/bodega-taller/BodegaTallerPage.jsx`

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

- Implementación realizada: Pendiente.
- Archivos modificados: Pendiente.
- Pruebas ejecutadas: Pendiente.
- Riesgos residuales: Pendiente.
- Validación del lead: Pendiente.
- Decisión final: Pendiente.
