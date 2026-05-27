# SPR-34-proveedores - proveedores

Prioridad: **P1 - critico funcional**
Dominio: **Bodega / Inventario / Proveedores**
Subagentes revisores: **Sagan + Peirce**
Estado: **Aprobado localmente con doble revision multiagente**
Deploy: **No deployado**

## Objetivo

Revisar y reparar el modulo legacy `proveedores` comparando campos, busquedas, formularios, exportaciones, eliminacion, permisos y efectos en pagos/stock contra la plataforma nueva.

## Evidencia legacy revisada

- `proveedores/index.php`
- `proveedores/lista.php`
- `proveedores/nuevo.php`
- `proveedores/guardar.php`
- `proveedores/modificar.php`
- `proveedores/actualizar.php`
- `proveedores/acepta_eliminar.php`
- `proveedores/eliminar.php`
- `proveedores/buscar_nombre.php`
- `proveedores/buscar_rut.php`
- `proveedores/pasa_get.php`
- `proveedores/consultar_nombre_existe.php`
- `proveedores/lista_excel.php`
- `proveedores/lista_excel2.php`
- `proveedores/lista_pdf.php`

## Como se mostraba en legacy

| Area | Legacy |
|---|---|
| Pantalla principal | Botones Crear nuevo, busqueda por RUT y busqueda por Nombre. |
| Tabla | Acciones eliminar/modificar, Cod Proveedor, Nombre, Rut, Razon Social, Giro, E-Mail, Telefonos, Direccion, Region, Comuna, % Sala, %C.Marco, %Licitacion. |
| Crear | Rut, Nombre, Razon Social, Giro, E-Mail, Fono, Direccion, Region, Comuna y % venta sala. El codigo proveedor se asignaba como maximo + 1. |
| Modificar | Campos completos, incluyendo codigo proveedor, % venta sala, % convenio marco y % licitacion. |
| Validaciones | RUT por plugin, nombre minimo 4 caracteres y consulta AJAX de nombre duplicado. |
| Eliminar | Confirmacion "Acepto / No Acepto"; legacy hacia delete fisico. |
| Exportaciones | Excel y PDF de proveedores con columnas operativas. |

## Como queda hoy

| Funcion legacy | Estado nuevo | Detalle |
|---|---|---|
| Tabla de proveedores | **Corregido SPR-34** | UI muestra codigo, proveedor/razon/RUT, giro, email, telefono, margenes y region. |
| Campos de formulario | **Corregido SPR-34** | Formulario nuevo exige campos legacy requeridos; backend valida tambien en create/update. |
| Codigo proveedor automatico | **Corregido SPR-34** | Si no viene codigo, backend asigna maximo + 1 bajo advisory lock transaccional. |
| Busqueda por Nombre | **Resuelto** | Modo dedicado `Nombre`; backend acepta `nombre`. |
| Busqueda por RUT | **Resuelto** | Modo dedicado `RUT`; backend acepta `rut`. |
| Busqueda por Codigo proveedor | **Corregido SPR-34** | Modo dedicado `Codigo`; backend acepta `codigoProveedor` y busqueda general numerica. |
| Export Excel | **Corregido SPR-34** | CSV compatible Excel desde `/reportes/export/proveedores`, activo-only, filtrable y con columnas legacy completas. |
| PDF | **Reemplazo operativo** | Boton `PDF/Imprimir` usa impresion del navegador para guardar PDF. |
| Eliminar proveedor | **Corregido SPR-34** | Soft-delete con confirmacion UI y permiso `proveedores:delete`; no se elimina fisicamente. |
| Permisos | **Corregido SPR-34** | Ficha/CRUD proveedor usa `proveedores:*`; lectura tipo catalogo queda sanitizada sin margenes. |
| RUT duplicado legacy | **Corregido SPR-34** | Backend valida RUT modulo 11, guarda canonico y bloquea duplicados por RUT normalizado, incluso si legacy venia sin puntos. |
| Codigo duplicado | **Corregido SPR-34** | Create/update validan duplicados bajo lock; fallback code-only solo aplica si el codigo es unico entre proveedores activos. |
| Pagos por ficha | **Corregido SPR-34** | Ficha lista pagos por `proveedorId` y pagos legacy code-only seguros; normaliza code-only al editar. |
| Duplicados de pagos | **Corregido SPR-34** | Rutas por ficha y ruta principal usan locks/chequeos compatibles, `nDoc` y documento case-insensitive. |
| Anulacion de pagos | **Corregido SPR-34** | `PUT` por ficha no permite `estado=Anulado`; exige accion formal de anulacion/reversa. |
| Proveedor inactivo | **Corregido SPR-34** | Pagos por ficha y ruta principal rechazan proveedor inexistente/inactivo. |

## Implementacion realizada

- Backend proveedores:
  - Nuevo helper de normalizacion/validacion de proveedores.
  - Validacion de RUT chileno, email, campos requeridos, codigo y porcentajes.
  - Duplicados de nombre, RUT normalizado y codigo proveedor.
  - Advisory lock para create/update del maestro.
  - CRUD movido a permisos `proveedores`.
  - Ficha de pagos compatible con pagos legacy code-only sin mezclar pagos de otro proveedor.
- Backend pagos proveedores:
  - Resolucion de proveedor activo/univoco.
  - Duplicate-check por documento/proveedor/codigo con comparacion case-insensitive.
- Reportes:
  - Export proveedores activo-only, filtrable y con columnas legacy.
- Frontend:
  - Ruta/menu de proveedores bajo permiso `proveedores`.
  - Busqueda por Todos, Nombre, RUT y Codigo.
  - Export CSV y PDF/Imprimir.
  - Validaciones de formulario y confirmacion para eliminar pagos.

## Pruebas ejecutadas

| Comando | Resultado |
|---|---|
| `npm.cmd exec vitest run test/proveedores.test.js --reporter=dot` | OK, 14/14 tests. |
| `npm.cmd exec vitest run test/proveedores.test.js test/pagos-proveedores-stock.test.js test/cobranza-pagos-proveedores.test.js --reporter=dot` | OK, 22/22 tests. |
| `npm.cmd run test:full -- --reporter=dot` en backend | OK, 45/45 archivos, 413/413 tests. |
| `npm.cmd run lint` en frontend | OK. |
| `npm.cmd run build` en frontend | OK. |

## Riesgos residuales

- No deployado: falta publicar en ambiente real.
- El PDF exacto server-side de legacy no se implementa; queda reemplazado por imprimir/guardar PDF desde navegador.
- Si produccion ya tiene codigos proveedor duplicados activos, el sistema evita usar fallback code-only ambiguo; esos casos deben limpiarse en saneamiento de datos para recuperar visibilidad historica por codigo.

## Checklist de validacion final

- [x] Revisar archivos legacy principales.
- [x] Comparar campos, filtros, columnas y acciones.
- [x] Corregir permisos del maestro proveedor.
- [x] Corregir busquedas nombre/RUT/codigo.
- [x] Corregir exportacion proveedores.
- [x] Corregir validaciones y duplicados.
- [x] Corregir pagos por ficha y pagos legacy code-only.
- [x] Agregar pruebas backend.
- [x] Validar backend completo.
- [x] Validar frontend lint/build.
- [x] Recibir aprobacion final de subagentes.
- [x] Validacion final del lead local.

## Resultado de ejecucion

- Implementacion realizada: **Si**.
- Archivos modificados principales:
  - `backend/src/routes/proveedores/index.js`
  - `backend/src/routes/proveedores/helpers.js`
  - `backend/src/routes/pagos-proveedores/index.js`
  - `backend/src/routes/reportes/index.js`
  - `backend/test/proveedores.test.js`
  - `backend/test/cobranza-pagos-proveedores.test.js`
  - `backend/test/pagos-proveedores-stock.test.js`
  - `frontend/src/pages/proveedores/ProveedoresPage.jsx`
  - `frontend/src/router.jsx`
  - `frontend/src/components/TopBar.jsx`
- Pruebas ejecutadas: **OK**.
- Revision multiagente: **Sagan y Peirce aprobaron sin P0/P1 restantes**.
- Validacion del lead: **Aprobado localmente**.
- Decision final: **SPR-34 aprobado localmente. Continuar con SPR-35.**
