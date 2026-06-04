# 09 - Descuentos ventas y Convenio Marco: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Cubierto, consolidado en Descuentos**.

## Fuentes revisadas

- Capturas legacy: [10-editar-desc-para-ventas.png](../screenshots/10-editar-desc-para-ventas.png), [11-editar-desc-convenio-marco.png](../screenshots/11-editar-desc-convenio-marco.png)
- Captura actual: [33-admin-descuentos.png](../current-screenshots/33-admin-descuentos.png)
- Frontend actual: `frontend/src/pages/descuentos/DescuentosPage.jsx`, `frontend/src/api/descuentos.js`
- Backend actual: `backend/src/routes/descuentos/index.js`, `backend/src/routes/ventas/descuentos-permissions.js`

## Resumen ejecutivo

Legacy tenia dos pantallas separadas: `% Descuentos para ventas` y `% Descuentos Convenio Marco`. El ERP actual las consolida en `/descuentos`, manteniendo dos bloques visibles: **Descuentos normales** y **Descuentos Convenio Marco**.

La cobertura funcional esta resuelta y la separacion comercial se conserva dentro de una sola vista. La mejora importante es el control de permisos: solo usuarios autorizados pueden administrar descuentos.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Descuentos venta normal | Pantalla propia. | Bloque `Descuentos normales`. | Cubierto. |
| Descuentos Convenio Marco | Pantalla propia. | Bloque `Descuentos Convenio Marco`. | Cubierto. |
| Crear descuento | Boton `Crear nuevo`. | Campo + boton `Crear`. | Cubierto. |
| Validacion | No visible por warnings. | Valor 0-100; normales enteros; marco admite decimal. | Mejorado. |
| Duplicados | No visible. | Bloquea valor duplicado activo. | Mejorado. |
| Permisos | No visible. | Requiere permiso de descuentos o autorizacion equivalente. | Mejorado. |
| Eliminacion | No visible. | Baja logica (`activo=false`). | Mejorado. |

## Mejoras nuevas que no se deben perder

- Una vista central con separacion clara entre descuentos normales y Convenio Marco.
- Validacion numerica por tipo de descuento.
- Bloqueo de duplicados.
- Baja logica para no romper historial.
- Control por permiso de usuario (`permisoDescuentos`) y RBAC.
- Uso directo desde el flujo de ventas.

## Faltantes o brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Capturas legacy no muestran lista | No permite comparar valores/columnas historicas. | Validar datos migrados si el cliente reclama valores faltantes. |
| Distincion visual | El cliente podria esperar dos accesos de menu separados. | Mantener consolidado salvo que el uso diario requiera acceso directo. |
| Reglas comerciales | Puede haber restricciones no visibles por tipo de cliente/venta. | Revisar con usuario comercial antes de modificar calculos. |

## Detalles legacy que ya no tienen sentido conservar

- Dos pantallas separadas para listas pequenas si una vista las distingue bien.
- Warnings PHP visibles.
- Administracion de descuentos sin permiso granular.

## Decision del modulo

Modulo **cubierto**. Mantener `/descuentos` como administracion central y validar solo reglas comerciales especificas.

