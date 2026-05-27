# Auditoría legacy vs nuevo - autocompleta_nombre_material

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\autocompleta_nombre_material`

Estado inicial: **Parcial por verificar**

Recomendación base: Comparar campo por campo y cerrar brechas con pruebas funcionales.

## Cómo se mostraba / funcionaba en legacy

- No se detectaron pantallas PHP con etiquetas claras; revisar manualmente si contiene lógica de soporte.

## Cómo se muestra hoy en la plataforma nueva

- `backend/src/routes/odts`
- `backend/src/routes/telas`
- `frontend/src/pages/taller`
- `frontend/src/pages/telas`

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

- `autocompleta_nombre_material\nombre_autocompleta.php`
