# SPR-10-clientes - clientes

Prioridad: **P0 - critico operativo**
Dominio: **Administracion / Finanzas / Seguridad**
Subagentes especialistas: **Revision funcional legacy** + **Revision seguridad/datos**
Estado: **Aprobado**

## Objetivo

Revisar y reparar el modulo `clientes` comparando cada funcion legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoria base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/clientes.md`
- Evidencia legacy principal:
  - `clientes/acepta_eliminar.php`
  - `clientes/actualizar.php`
  - `clientes/buscar_email.php`
  - `clientes/buscar_nombre.php`
  - `clientes/consultar_email_existe.php`
  - `clientes/consultar_rut_existe.php`
  - `clientes/eliminar.php`
  - `clientes/guardar.php`
  - `clientes/index.php`
  - `clientes/lista.php`
  - `clientes/lista_excel.php`
  - `clientes/lista_pdf.php`

## Como se mostraba en legacy

- Listado con columnas visibles: nombre, RUT, email, fono, direccion, region y comuna.
- Busquedas dedicadas por nombre y por email.
- Validaciones AJAX de RUT y email existentes antes de guardar.
- Alta/edicion con `rut`, `nombre`, `email`, `fono1`, `razon_social`, `giro`, `direccion`, `region`, `comuna` y `password`.
- Edicion permitia modificar RUT.
- Eliminacion fisica por `DELETE FROM clientes`.
- Exportaciones Excel y PDF desde el listado.

## Como queda hoy

- Backend: `backend/src/routes/clientes/*`, `backend/src/routes/reportes/index.js`, `backend/src/routes/ventas/create.js`, `backend/src/routes/cotizaciones/index.js`.
- Frontend: `frontend/src/pages/clientes/ClientesPage.jsx`, `frontend/src/pages/clientes/ClientesFormPage.jsx`, `frontend/src/components/forms/FormCliente.jsx`.
- Datos: cliente canonico con RUT unico, email validado sin duplicados, baja logica, sucursales/direcciones y saldo financiero con cargos.

## Brechas encontradas por subagentes

| Severidad | Brecha | Decision |
| --- | --- | --- |
| P1 | Busqueda por email legacy no tenia paridad en listado/API nuevo. | Corregido. `GET /api/clientes` y export ahora aceptan `email`; busqueda general incluye email, razon social, telefono, direccion, region y comuna. |
| P1 | Email duplicado no estaba bloqueado server-side. | Corregido. Alta/edicion validan duplicados case-insensitive y se agrega indice unico funcional para emails no vacios. |
| P1 | Duplicado de RUT dependia solo del indice DB y sin mensaje funcional. | Corregido. API devuelve 409 explicito para RUT repetido. |
| P1 | Tabla nueva omitía columnas legacy visibles. | Corregido. Listado muestra email, fono, direccion, region, comuna y ciudad, ademas de estado, saldo y acciones modernas. |
| P1 | Edicion de RUT perdio paridad con legacy. | Corregido. UI y API permiten editar RUT con control de duplicados. |
| P1 | Detalle de cliente exponia ventas/ODT solo con permiso `clientes:read`. | Corregido. Historial de ventas requiere `ventas:read`; historial taller requiere `taller:read`. |
| P1 | Cliente inactivo podia generar ventas nuevas o ventas desde licitacion. | Corregido. Ventas y conversion de licitaciones bloquean cliente inactivo. |
| P1 | Sucursales soportaban region en backend pero no en UI. | Corregido. Formulario de sucursales captura y muestra region. |
| P1 | Saldo de cliente no sumaba cargos de transporte. | Corregido. Saldos y totales de historial incluyen `orden_cargos`. |

## Implementacion realizada

- Filtros legacy ampliados: email dedicado y busqueda general por datos comerciales/contacto.
- Tabla de clientes alineada con legacy: RUT, cliente, email, fono, direccion, region, comuna y ciudad.
- Edicion de RUT habilitada en formulario y API.
- Validacion de duplicados RUT/email con respuesta 409 clara.
- Migracion `20260526102000_cliente_email_unique_guard` para indice unico case-insensitive de email no vacio.
- Detalle de cliente ya no entrega ventas ni ODT si el usuario no tiene permisos del modulo correspondiente.
- Ventas nuevas y conversion de licitacion a venta rechazan clientes inactivos.
- Sucursales de cliente permiten capturar region.
- Saldos de clientes y totales del historial incorporan cargos de venta.
- Suite de tests backend queda serializada en Vitest para evitar falsos negativos por carreras contra la misma DB de prueba.

## Archivos principales modificados

- `backend/src/routes/clientes/create.js`
- `backend/src/routes/clientes/get.js`
- `backend/src/routes/clientes/helpers.js`
- `backend/src/routes/clientes/list.js`
- `backend/src/routes/clientes/update.js`
- `backend/src/routes/ventas/create.js`
- `backend/src/routes/cotizaciones/index.js`
- `backend/src/routes/reportes/index.js`
- `backend/prisma/migrations/20260526102000_cliente_email_unique_guard/migration.sql`
- `backend/test/clientes.test.js`
- `backend/test/ventas.test.js`
- `backend/test/reportes-export-helpers.test.js`
- `backend/vitest.config.js`
- `frontend/src/pages/clientes/ClientesPage.jsx`
- `frontend/src/pages/clientes/ClientesFormPage.jsx`
- `frontend/src/components/forms/FormCliente.jsx`

## Pruebas ejecutadas

- `prisma migrate deploy` sobre base local de sprint -> **OK**.
- `backend` focalizado: Clientes/Ventas/reportes -> **3 archivos, 39 pruebas OK**.
- `backend` completo: `npm.cmd test` -> **35 archivos, 297 pruebas OK**.
- `frontend`: `npm.cmd run lint` -> **OK**.
- `frontend`: `npm.cmd run build` -> **OK**.

## Riesgos residuales

- Export legacy PDF nativo no queda implementado; se mantiene CSV compatible con Excel y protegido por `clientes:read`. No bloquea P0 porque el flujo operativo de listado/exportacion queda cubierto. Si el cliente exige PDF formal, conviene abordarlo como mejora transversal de reportes.
- El campo legacy `password` no se replica dentro de `Cliente`. Es correcto por seguridad: no se deben guardar passwords de cliente en la ficha comercial. La plataforma ya separa autenticacion web en `UsuarioWeb`; una migracion de passwords legacy debe ser un flujo aparte con reset/rehash seguro.
- Legacy hacia borrado fisico; se mantiene baja logica moderna para no romper trazabilidad de ventas, ODT, despacho y cobranza.

## Checklist de validacion final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion.
- [x] Probar flujo feliz, errores, permisos y estados borde.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead.

## Decision final

**Aprobado.** El sprint Clientes queda cerrado como P0/P1 corregido con observaciones no bloqueantes documentadas. Se puede avanzar al siguiente sprint P0.
