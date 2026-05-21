# Sprint 3 - Roles, permisos y auditoria sensible - 2026-05-21

## Objetivo

Impedir acciones sensibles fuera de rol y dejar trazabilidad auditable en cambios operativos criticos.

## Cambios principales

- RBAC backend reforzado para operaciones `delete` y superficies admin estrictas.
- Acciones sensibles de ventas, caja, despachos, productos y stock ahora requieren permisos fuertes.
- `usuarios`, `config` y `admin` usan RBAC estricto sin permisos extra delegables.
- Auditoria registra mutaciones sensibles con actor, ruta, entidad, id, accion y payload redactado.
- UI oculta acciones no permitidas en ventas, matriz, bodega, stock ingresos y pagos/proveedores.
- Frontend y backend quedan alineados: `bodeguero` no tiene `bodega.delete`; `solo_lectura` puede leer proveedores.

## Permisos sensibles cerrados

- Borrar/anular/reactivar ventas: `ventas.delete`.
- Borrar cargos de venta: `ventas.delete`.
- Borrar movimientos de caja: `caja.delete`.
- Borrar despachos/guias: `despacho.delete`.
- Borrar productos: `catalogo.delete`.
- Importar stock masivo y ajustes manuales de stock: `bodega.delete`.
- Admin, usuarios y configuracion: solo rol `admin`, sin delegacion por permisos extra.

## Validacion

- `npm.cmd test -- rbac audit-plugin stock-ingresos-apply despachos-traceability caja-traceability pagos-proveedores-stock`: 52 tests OK.
- `npm.cmd exec vitest run src/utils/permissions.test.js`: 3 tests OK.
- `npm.cmd exec prisma validate`: OK.
- `npm.cmd run build` frontend: OK, bundle `assets/index-Dz-6mzxN.js`.
- `git diff --check`: OK, solo warnings CRLF locales.
- Browser smoke local en `http://127.0.0.1:5186/login`: carga login, inputs email/password y boton `Ingresar`, sin errores de consola.

## Riesgos residuales

- `npm run lint` global mantiene deuda previa fuera del alcance del sprint.
- La revision UI multirol completa depende de usuarios/credenciales productivas o seed local con roles reales; la matriz de permisos queda cubierta por tests backend/frontend.
