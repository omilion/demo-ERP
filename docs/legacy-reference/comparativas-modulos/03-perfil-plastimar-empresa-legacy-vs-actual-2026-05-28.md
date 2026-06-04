# 03 - Perfil Plastimar / empresa: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, reubicado en Configuracion**.

## Fuentes revisadas

- Baseline general: [baseline-modulos-legacy-vs-actual-2026-05-28.md](../baseline-modulos-legacy-vs-actual-2026-05-28.md)
- Matriz de trazabilidad: [matriz-trazabilidad-legacy-actual-2026-05-28.md](../matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Captura legacy: [02-perfil-plastimar.png](../screenshots/02-perfil-plastimar.png)
- Capturas actuales: [38-configuracion-empresa.png](../current-screenshots/38-configuracion-empresa.png), [39-configuracion-firmas-email.png](../current-screenshots/39-configuracion-firmas-email.png)
- Frontend actual: `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/api/config.js`
- Backend actual: `backend/src/routes/config/index.js`, `backend/prisma/schema.prisma`

## Resumen ejecutivo

El modulo legacy **Perfil Plastimar** administraba razones sociales de Plastimar desde una pantalla propia, con boton `Crear nuevo` y una tabla de datos de empresa. La plataforma actual reubica esa funcion en `/config`, pestana **Empresa**, y separa las firmas de correo en la pestana **Firmas Email**.

La funcion antigua esta cubierta y ampliada. El ERP nuevo conserva los campos principales de empresa, agrega validaciones, multiples razones sociales, codigo Plastimar, logo URL, texto pie y firmas email. No conviene restaurar los warnings PHP ni una pantalla separada solo por nombre. La unica duda funcional es si el cliente necesita que el menu siga diciendo "Perfil Plastimar" o si basta con **Configuracion > Empresa**.

## Vista antigua

La captura legacy [02-perfil-plastimar.png](../screenshots/02-perfil-plastimar.png) muestra:

| Elemento legacy | Observacion |
|---|---|
| Ruta `menu.php?pag=perfil/index` | Pantalla propia para perfil/razones sociales. |
| Titulo `Razones Sociales Plastimar` | Nombre visible del modulo. |
| Boton `Crear nuevo` | Permite crear otra razon social. |
| Tabla de empresas | Columnas visibles: Cod Plastimar, Nombre, Rut, Razon Social, Giro, E-Mail, Telefonos, Direccion, Region, Comuna. |
| Acciones por fila | Se ven botones de accion al inicio de la tabla, probablemente editar/eliminar. |
| Warnings PHP | Aparecen errores `include` y `desconecta.php` directamente en pantalla. |

## Vista actual

La plataforma actual divide el modulo en dos pestanas:

| Pestana actual | Evidencia | Funcion |
|---|---|---|
| `/config` > Empresa | [38-configuracion-empresa.png](../current-screenshots/38-configuracion-empresa.png) | Administra razones sociales Plastimar. |
| `/config` > Firmas Email | [39-configuracion-firmas-email.png](../current-screenshots/39-configuracion-firmas-email.png) | Administra firmas de correo por alias/email/firma/foto. |

En **Empresa**, la vista actual muestra listado a la izquierda y formulario de edicion a la derecha. Campos visibles:

| Campo actual | Relacion con legacy |
|---|---|
| Cod Plastimar | Cubierto. |
| Nombre | Cubierto. |
| RUT | Cubierto, con validacion de RUT en frontend y backend. |
| Razon Social | Cubierto. |
| Giro | Cubierto. |
| E-Mail | Cubierto, con validacion basica de email. |
| Fono | Cubierto como equivalente de Telefonos. |
| Direccion | Cubierto. |
| Region | Cubierto. |
| Comuna | Cubierto. |
| Logo URL | Nuevo. |
| Texto pie | Nuevo. |

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Ubicacion | Pantalla propia `Perfil Plastimar`. | `/config`, pestana Empresa. | Reubicado y mejorado. |
| Razones sociales | Tabla `Razones Sociales Plastimar`. | Tabla `Razones sociales Plastimar` con contador de registros. | Cubierto. |
| Crear nuevo | Boton `Crear nuevo`. | Boton `Crear nuevo` y formulario `Crear razon social`. | Cubierto. |
| Editar empresa | Acciones por fila en tabla legacy. | Seleccion de fila y panel `Modificar`. | Cubierto y mas claro. |
| Eliminar empresa | Accion visible en fila legacy. | Boton `Eliminar` en panel actual, protegido por permiso `config.delete`. | Cubierto; validar politica de borrado. |
| Campos base | Cod, Nombre, RUT, Razon Social, Giro, Email, Telefonos, Direccion, Region, Comuna. | Los mismos campos mas Logo URL y Texto pie. | Mejorado. |
| Validacion | No visible en captura; legacy muestra errores tecnicos. | RUT, email, nombre minimo, codigo positivo y duplicados. | Mejorado. |
| Firmas email | No aparece como tabla directa en captura de perfil. | Pestana propia Firmas Email con Alias, Email, Firma y Foto URL. | Extra nuevo / reubicado desde soporte email. |
| Permisos | No se evidencia RBAC moderno en captura. | `/config` solo admin; endpoints usan `rbac('config', ...)`. | Mejorado. |
| Errores tecnicos | Warnings PHP visibles. | No se observan warnings en UI actual. | Legacy obsoleto; no conservar. |

## Mejoras nuevas que no se deben perder

- Configuracion centralizada por pestanas, evitando pantallas administrativas dispersas.
- Multiples razones sociales con codigo Plastimar ordenado.
- Validacion de RUT chileno en frontend y backend.
- Validacion de email y nombre minimo.
- Control de duplicados por nombre y codigoEmpresa.
- Campos nuevos `logoUrl` y `textoPie`, utiles para documentos/impresiones.
- Firmas email separadas en entidad propia (`config.firmas_email`).
- Permisos backend por `config.read`, `config.write` y `config.delete`.
- Cache e invalidacion con React Query al crear/editar/eliminar.

## Faltantes o brechas candidatas

| Brecha candidata | Evidencia | Impacto | Recomendacion |
|---|---|---|---|
| Nombre de menu distinto | Legacy mostraba `Perfil Plastimar`; actual lo ubica bajo `Configuracion > Empresa`. | El cliente podria no encontrarlo si espera el nombre antiguo. | Validar si se requiere alias visible "Perfil Plastimar" en menu o ayuda, sin duplicar pantalla. |
| Datos de captura actual son de QA | La captura actual muestra valores `QA Perfil debug...`, no datos reales Plastimar. | Para presentacion a cliente puede verse como dato ficticio. | Antes de demo, cargar/mostrar datos reales o indicar que la captura es de ambiente local. |
| Politica de eliminacion de empresa | Backend `DELETE /config/empresas/:id` elimina el registro. | Si una razon social ya fue usada en documentos, el borrado fisico podria ser riesgoso. | Validar integridad historica; si aplica, preferir desactivar en vez de borrar. |
| Edicion de firmas email desde UI | API tiene `PUT /firmas/:id`, pero la UI revisada muestra alta y eliminacion, no formulario de edicion por fila. | Si una firma cambia, podria requerir borrar y recrear. | Confirmar si cliente necesita editar firmas existentes desde la interfaz. |
| Foto URL en tabla de firmas | El formulario permite `Foto URL`, pero la tabla visible lista Alias, Email y Firma. | Puede ser dificil validar visualmente la foto configurada. | Evaluar mostrar foto/URL si el cliente usa firmas con imagen. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings `include`/`desconecta.php` visibles: son errores tecnicos, no parte del flujo.
- Pantalla independiente solo para perfil si `/config` ya concentra administracion.
- Dependencia legacy de archivos PHP de conexion/desconexion para mostrar datos.
- Mantener el nombre antiguo si genera confusion con la nueva estructura; mejor usar alias o breadcrumb si el cliente lo necesita.

## Decision del modulo

El modulo **Perfil Plastimar / empresa** queda documentado como **cubierto, reubicado y mejorado**. Las columnas legacy principales estan cubiertas en **Configuracion > Empresa** y las firmas email quedan separadas como mejora.

Antes de tocar codigo, solo se recomienda validar nomenclatura con el cliente y decidir si la eliminacion de razones sociales debe pasar a baja logica para proteger historial documental.

## Siguiente modulo sugerido

Continuar con **04 - Usuarios**, comparando `Editar Usuarios` legacy contra `/usuarios`, `/accesos`, RBAC y auditoria actual.
