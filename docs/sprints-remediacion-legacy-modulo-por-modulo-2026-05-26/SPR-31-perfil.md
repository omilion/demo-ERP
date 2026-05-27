# SPR-31 - perfil

Prioridad: **P2 - completar equivalencia**
Dominio: **Administracion / Configuracion / Seguridad**
Estado: **Aprobado localmente**
Deploy: **No deployado**

## Objetivo

Reparar la equivalencia del modulo legacy `perfil`, que en realidad administraba razones sociales de la empresa (`perfil_sistema`), no perfiles de usuario.

## Evidencia legacy revisada

- `perfil/acepta_eliminar.php`
- `perfil/actualizar.php`
- `perfil/consultar_nombre_existe.php`
- `perfil/eliminar.php`
- `perfil/guardar.php`
- `perfil/index.php`
- `perfil/lista.php`
- `perfil/modificar.php`
- `perfil/nuevo.php`

## Como funcionaba en legacy

- Listaba multiples razones sociales Plastimar.
- Columnas: Cod Plastimar, Nombre, Rut, Razon Social, Giro, E-Mail, Telefonos, Direccion, Region, Comuna.
- Permitía crear, modificar y eliminar registros.
- `codigo_empresa` se autogeneraba tomando el mayor codigo y sumando 1.
- Validaba nombre duplicado y largo minimo de 4 caracteres.
- Validaba RUT chileno en el formulario.
- Eliminacion tenia pantalla de confirmacion.

## Que queda implementado ahora

- `Config > Empresa` ahora administra multiples razones sociales.
- La tabla muestra los campos legacy clave.
- El formulario permite crear/modificar/eliminar.
- `codigoEmpresa` se expone en API y UI.
- Si no se informa `codigoEmpresa`, backend genera el siguiente codigo.
- Backend valida RUT chileno, nombre minimo, email y codigo positivo.
- Backend bloquea duplicados por nombre y por codigo.
- Lectura/listado/creacion/edicion/eliminacion quedan restringidos con `config.*` y `allowExtra:false`, por lo que solo admin efectivo opera el modulo.

## Archivos modificados

- `backend/src/routes/config/index.js`
- `backend/test/config-empresa.test.js`
- `frontend/src/api/config.js`
- `frontend/src/pages/config/ConfigPage.jsx`

## Validacion ejecutada

- `DATABASE_URL=... npm.cmd exec vitest run config-empresa.test.js --reporter=dot`
  - Resultado: **1 archivo / 4 tests OK**
- `DATABASE_URL=... npm.cmd exec vitest run config-empresa.test.js rbac.test.js --reporter=dot`
  - Resultado: **2 archivos / 23 tests OK**
- `DATABASE_URL=... npm.cmd run test:full -- --reporter=dot`
  - Resultado: **44 archivos / 389 tests OK**
- `npm.cmd exec prisma validate`
  - Resultado: **OK**
- `npm.cmd run lint` en frontend
  - Resultado: **OK**
- `npm.cmd run build` en frontend
  - Resultado: **OK**, con warning conocido de chunk mayor a 500 kB.
- Revision multiagente:
  - Sagan: aprobacion estatica final, sin P0/P1.
  - Peirce: aprobacion estatica final, sin P0/P1.

## Decision del lead

**Aprobado para continuar al siguiente sprint.**

Riesgo residual: no fue deployado a produccion desde esta ejecucion.
