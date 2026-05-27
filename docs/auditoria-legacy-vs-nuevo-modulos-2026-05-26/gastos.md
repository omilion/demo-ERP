# Auditoria legacy vs nuevo - gastos

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\gastos`  
Estado final: **Aprobado**

## Como se mostraba / funcionaba en legacy

- Catalogo simple de titulos de gastos.
- Tabla principal ordenada por `nombre`.
- Columna visible: `Nombre`.
- Acciones:
  - Crear nuevo.
  - Modificar.
  - Eliminar con pantalla de confirmacion.
  - Exportar a Excel.
  - Exportar a PDF.
- Validaciones:
  - `nombre` obligatorio.
  - Minimo 2 caracteres.
  - Consulta AJAX para evitar duplicado.
- Uso operativo:
  - Caja usaba el nombre del gasto al registrar egresos y lo dejaba visible/exportable como parte de la operacion.

## Como se muestra hoy en la plataforma nueva

- Configuracion > Gastos administra el catalogo.
- Caja usa el gasto como categoria estructurada (`gastoTipoId`) para egresos.
- El nombre del gasto se muestra en turno actual, historico y export de caja.
- El historico de caja permite buscar por nombre de gasto.
- Export del catalogo disponible como CSV compatible Excel.

## Comparacion

| Aspecto | Legacy | Plataforma nueva | Estado |
| --- | --- | --- | --- |
| Listado | Tabla ordenada por nombre | Tabla en Configuracion > Gastos | Cubierto |
| Crear | Nombre obligatorio, AJAX duplicado | Nombre trim, minimo 2, duplicado case-insensitive | Cubierto |
| Editar | Campo Nombre | Edicion inline con validacion | Cubierto |
| Eliminar | Borrado fisico con confirmacion | Borra si no tiene uso; desactiva si tiene movimientos de caja | Mejorado |
| Excel/PDF | Excel y PDF | CSV compatible Excel | Reemplazo aprobado |
| Uso en caja | Nombre incorporado en operacion | Relacion estructurada y nombre visible/exportable | Mejorado |
| Permisos | Usuario activo legacy | Mutaciones solo admin; lectura para caja | Mejorado |

## Brechas cerradas

- Validacion de nombre y duplicados.
- Exportacion del catalogo.
- Eliminacion segura sin romper historial.
- Visibilidad de categoria de gasto en Caja.
- Busqueda y exportacion por nombre de gasto en Caja.

## Evidencia legacy revisada

- `gastos/acepta_eliminar.php`
- `gastos/actualizar.php`
- `gastos/consultar_nombre_existe.php`
- `gastos/eliminar.php`
- `gastos/guardar.php`
- `gastos/index.php`
- `gastos/lista.php`
- `gastos/lista_excel.php`
- `gastos/lista_pdf.php`
- `gastos/mensaje_actualizado.php`
- `gastos/mensaje_eliminado.php`
- `gastos/mensaje_guardado.php`
- `gastos/modificar.php`
- `gastos/nuevo.php`
- `caja/egreso/insertar.php`
- `caja/lista.php`
- `caja/lista_excel.php`

## Resultado

Sprint asociado: `SPR-24-gastos`  
Resultado: **aprobado con cambios de codigo**  
Validacion: Hubble y Rawls aprobaron sin P0/P1.  
Pruebas: 46 tests focalizados OK, `test:ci` 107 tests OK, lint OK, build OK.
