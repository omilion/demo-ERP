# Auditoría legacy vs nuevo - categorias

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\categorias`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Tablas/columnas detectadas: % Descuento, Mostrar en web, Nombre.
- Campos/formularios detectados: % Descuento:, Desea mostrar esta categoria en la web:, Mostrar en la Web?:, Nombre Categoria:, Nombre:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, <?php echo $id; ?>, <?php echo $nombre; ?>, <?php echo $porc_desc; ?>, Actualizar ahora, Cancelar operación, Crear Nuevo, Crear nuevo, No Acepto.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/categorias`
- `backend/src/routes/categorias-bodega-taller/index.js`
- `backend/src/routes/categorias/index.js`
- `frontend/src/api/categorias.js`
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

- `categorias\acepta_eliminar.php`
- `categorias\actualizar.php`
- `categorias\consultar_nombre_existe.php`
- `categorias\eliminar.php`
- `categorias\guardar.php`
- `categorias\index.php`
- `categorias\lista.php`
- `categorias\mensaje_actualizado.php`
- `categorias\mensaje_eliminado.php`
- `categorias\mensaje_guardado.php`
- `categorias\modificar.php`
- `categorias\nuevo.php`

## Navegación legacy detectada

- `menu.php?pag=categorias/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=categorias/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=categorias/index`
- `menu.php?pag=categorias/modificar&id=<?php echo $registro['id']?>`
- `menu.php?pag=categorias/nuevo`
