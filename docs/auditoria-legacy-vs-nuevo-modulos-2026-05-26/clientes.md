# Auditoría legacy vs nuevo - clientes

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\clientes`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- Legacy debe compararse con clientes, sucursales, RUT, razón social, dirección, región/comuna/ciudad y búsquedas.
- Plan: contrastar campos obligatorios legacy con cliente canónico nuevo y sucursales.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/clientes`
- `backend/src/routes/clientes/create.js`
- `backend/src/routes/clientes/get.js`
- `backend/src/routes/clientes/helpers.js`
- `backend/src/routes/clientes/index.js`
- `backend/src/routes/clientes/list.js`
- `backend/src/routes/clientes/sucursales.js`
- `backend/src/routes/clientes/update.js`
- `frontend/src/api/clientes.js`
- `frontend/src/pages/clientes`
- `frontend/src/pages/clientes/ClientesFormPage.jsx`
- `frontend/src/pages/clientes/ClientesPage.jsx`

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
4. Replicar búsquedas/filtros legacy, incluyendo accesos por botón cuando el usuario los use.
5. Replicar exportaciones Excel/PDF legacy o justificar reemplazo.
6. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
7. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Evidencia legacy revisada

- `clientes\acepta_eliminar.php`
- `clientes\actualizar.php`
- `clientes\buscar_email.php`
- `clientes\buscar_nombre.php`
- `clientes\consultar_email_existe.php`
- `clientes\consultar_rut_existe.php`
- `clientes\eliminar.php`
- `clientes\guardar.php`
- `clientes\index.php`
- `clientes\lista.php`
- `clientes\lista_excel.php`
- `clientes\lista_pdf.php`
- `clientes\mensaje_actualizado.php`
- `clientes\mensaje_eliminado.php`
- `clientes\mensaje_guardado.php`
- `clientes\modificar.php`
- `clientes\nuevo.php`
- `clientes\pasa_get.php`
- `clientes\pregunta_elimina.php`

## Navegación legacy detectada

- `menu.php?pag=clientes/acepta_eliminar&id=<?php echo $registro['id']?>`
- `menu.php?pag=clientes/buscar_email`
- `menu.php?pag=clientes/buscar_nombre`
- `menu.php?pag=clientes/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=clientes/index`
- `menu.php?pag=clientes/modificar&id=<?php echo $registro['id']?>`
