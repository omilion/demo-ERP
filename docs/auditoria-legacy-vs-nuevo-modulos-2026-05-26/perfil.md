# Auditoria legacy vs nuevo - perfil

Legacy: `C:\Users\flipe\Downloads\sisgestion\sisgestion\perfil`

Estado actual: **Aprobado localmente**
Deploy: **No deployado**

## Aclaracion funcional

El modulo legacy `perfil` no era perfil de usuario. Era el maestro de razones sociales de Plastimar (`perfil_sistema`).

## Como se mostraba / funcionaba en legacy

- Lista de razones sociales.
- Campos: Cod Plastimar, Nombre, Rut, Razon Social, Giro, E-Mail, Telefonos, Direccion, Region, Comuna.
- Crear nuevo registro.
- Modificar registro existente.
- Eliminar con confirmacion.
- Validacion de nombre duplicado.
- Validacion de RUT chileno.
- Autogeneracion de `codigo_empresa`.

## Como se muestra hoy en la plataforma nueva

- Pantalla: `frontend/src/pages/config/ConfigPage.jsx`, tab `Empresa`.
- API: `backend/src/routes/config/index.js`.
- Modelo: `EmpresaConfig`.

## Equivalencia legacy cubierta

- Lista multi-razon social: **cubierto**.
- Crear: **cubierto**.
- Modificar: **cubierto**.
- Eliminar: **cubierto** con permiso `config.delete`.
- Cod Plastimar / `codigo_empresa`: **cubierto** como `codigoEmpresa`.
- Nombre, RUT, razon social, giro, email, telefono, direccion, region y comuna: **cubierto**.
- Validacion de RUT: **cubierto** en backend y ayuda UX en frontend.
- Duplicado de nombre: **cubierto**.
- Duplicado de codigo: **cubierto**.
- Seguridad admin-only: **mejorado** frente al legacy.

## Evidencia de validacion

- Suite SPR-31: **4/4 OK**.
- Suite SPR-31 + RBAC: **23/23 OK**.
- Suite backend completa: **389/389 OK**.
- Prisma validate: **OK**.
- Frontend lint/build: **OK**.
- Revision multiagente final: **sin P0/P1 pendientes**.

## Decision

Modulo **aprobado localmente** para continuar al siguiente sprint.

No queda deployado a produccion desde esta ejecucion.
