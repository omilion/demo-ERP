# Revisión externa de CRM histórico — Plastimar

## Objetivo

Separar la operación comercial vigente de la información CRM histórica y recuperar sólo los contactos y oportunidades que Plastimar considere útiles.

El archivo `CRM_historico_revision_hasta_2025.xlsx` contiene los registros con fecha anterior al **01-01-2026**. Es una copia de trabajo externa: no modifica el ERP ni elimina datos.

## Qué debe hacer el equipo revisor

1. Abrir la hoja **CRM histórico** y leer primero la hoja **Instrucciones**.
2. No borrar filas, cambiar nombres de hojas, encabezados ni el campo **ID CRM**.
3. Completar **Decisión dueños** en cada registro:
   - **Mantener activo**: hay una oportunidad o contacto vigente que debe volver al CRM.
   - **Fusionar**: es un duplicado; indicar el **ID CRM maestro** que se conservará.
   - **Ganado**: venta concretada.
   - **Perdido**: oportunidad cerrada sin venta; indicar motivo.
   - **Archivar**: historial útil, sin gestión activa.
   - **Descartar**: prueba, error o duplicado sin información rescatable.
4. Corregir datos sólo en las columnas amarillas. Las columnas grises son una referencia del origen.
5. Para cada registro marcado **Mantener activo**, completar como mínimo datos de identificación, vendedor responsable, próxima acción y fecha de próxima acción.
6. Guardar el archivo con el mismo nombre y enviarlo de regreso.

## Qué haremos cuando el archivo vuelva

1. Revisaremos formato, columnas obligatorias, RUT, correos, teléfonos y valores de listas.
2. Validaremos las fusiones para evitar referencias a un ID inexistente o a otro registro descartado.
3. Entregaremos un resumen previo: registros a importar, archivar, descartar, fusionar, ganados y perdidos. No se cargará nada aún en esta etapa.
4. Con la aprobación de Plastimar, importaremos sólo los registros validados como **Mantener activo**, las decisiones de cierre y las fusiones aprobadas.
5. Conservaremos el archivo original y un reporte de importación para trazabilidad.

## Regla de operación desde 2026

Mientras se revisa el histórico, el CRM operativo trabajará con registros desde el **01-01-2026**. Los registros anteriores no se eliminan; simplemente quedan fuera de la operación diaria hasta que el resultado de la revisión sea validado e importado.

