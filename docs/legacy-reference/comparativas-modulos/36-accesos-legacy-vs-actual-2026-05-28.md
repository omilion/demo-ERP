# 36 - Accesos: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con escritura/retencion por validar**.

## Fuentes revisadas

- Baseline: legacy tenia tabla `accesos`, sin modulo visible fuerte.
- Captura actual: [32-admin-accesos.png](../current-screenshots/32-admin-accesos.png)
- Frontend actual: `frontend/src/pages/accesos/AccesosPage.jsx`, `frontend/src/api/accesos.js`
- Backend actual: `backend/src/routes/accesos/index.js`, `backend/prisma/schema.prisma`

## Resumen ejecutivo

Legacy tenia una tabla de accesos, pero no se documenta como modulo visible fuerte. El ERP actual agrega `/accesos` como vista admin con busqueda, tabs por origen, paginacion y columnas de fecha, usuario, origen, accion, IP y user-agent.

La mejora es clara, pero se debe validar que el sistema escriba eventos reales de login/acceso y definir retencion.

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Tabla accesos | Existia en legacy. | Modelo `auth.accesos`. | Cubierto. |
| Vista admin | No fuerte/visible. | `/accesos`. | Mejorado. |
| Filtro origen | No claro. | Todos, ERP, Ventas. | Mejorado. |
| Busqueda | No claro. | Usuario/accion. | Mejorado. |
| IP/User-Agent | No claro. | Columnas disponibles. | Mejorado. |

## Mejoras nuevas que no se deben perder

- Vista admin separada.
- Paginacion.
- Busqueda.
- Origen ERP/Ventas.
- IP y user-agent.
- Separacion respecto de Usuarios.

## Brechas candidatas

| Brecha | Impacto | Recomendacion |
|---|---|---|
| Escritura real de login | Captura actual muestra 0 eventos; login no confirmo escritura. | Agregar registro de login exitoso/fallido si cliente usa auditoria. |
| Filtros fecha/IP | Auditoria puede requerirlos. | Validar requerimientos. |
| Exportacion | Puede pedirse para auditoria. | Agregar solo si hay uso claro. |
| Retencion | Tabla puede crecer. | Definir politica. |

## Detalles legacy que ya no tienen sentido conservar

- Tabla oculta sin vista operativa.
- Historial sin filtros utiles.

## Decision del modulo

Modulo **mejorado**, pero requiere validar escritura efectiva y retencion de eventos.

