# Auditoría legacy vs nuevo - categorias_bodega_taller

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\categorias_bodega_taller`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: Nombre.
- Campos/formularios detectados: Nombre Categoria:, Nombre:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, <?php echo $id; ?>, <?php echo $nombre; ?>, Actualizar ahora, Cancelar operación, Crear Nuevo, Crear nuevo, No Acepto.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/categorias-bodega-taller`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `frontend/src/api/categoriasBodegaTaller.js`

## Brechas a revisar

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las búsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparación

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existían en legacy y falten hoy.
4. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
5. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Evidencia legacy revisada

- `categorias_bodega_taller\acepta_eliminar.php`
- `categorias_bodega_taller\actualizar.php`
- `categorias_bodega_taller\consultar_nombre_existe.php`
- `categorias_bodega_taller\eliminar.php`
- `categorias_bodega_taller\guardar.php`
- `categorias_bodega_taller\index.php`
- `categorias_bodega_taller\lista.php`
- `categorias_bodega_taller\mensaje_actualizado.php`
- `categorias_bodega_taller\mensaje_eliminado.php`
- `categorias_bodega_taller\mensaje_guardado.php`
- `categorias_bodega_taller\modificar.php`
- `categorias_bodega_taller\nuevo.php`

## Navegación legacy detectada

- `menu.php?pag=categorias_bodega_taller/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=categorias_bodega_taller/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=categorias_bodega_taller/index`
- `menu.php?pag=categorias_bodega_taller/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=categorias_bodega_taller/nuevo`
