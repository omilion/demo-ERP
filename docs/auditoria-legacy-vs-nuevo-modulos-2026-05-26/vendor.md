# Auditoría legacy vs nuevo - vendor

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\vendor`

Estado inicial: **Soporte técnico**

Recomendación base: No requiere pantalla equivalente; mantener como dependencia/asset si alguna vista lo necesita.

## Cómo se mostraba / funcionaba en legacy

- No se detectaron pantallas PHP con etiquetas claras; revisar manualmente si contiene lógica de soporte.

## Cómo se muestra hoy en la plataforma nueva

- No se encontró equivalente directo por nombre o mapeo manual.

## Brechas a revisar

- Es módulo/asset de soporte. La brecha se evalúa por dependencia, no por pantalla.

## Plan de reparación

1. Inventariar dependencias usadas por pantallas legacy.
2. Eliminar solo cuando se confirme que no hay equivalencia funcional ni asset requerido.
3. Documentar reemplazo moderno si aplica.

## Evidencia legacy revisada

- No se encontraron archivos PHP en este módulo.
