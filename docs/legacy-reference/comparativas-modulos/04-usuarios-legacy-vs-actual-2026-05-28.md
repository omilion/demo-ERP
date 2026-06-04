# 04 - Usuarios: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con comparacion legacy limitada por captura incompleta**.

## Fuentes revisadas

- Baseline general: [baseline-modulos-legacy-vs-actual-2026-05-28.md](../baseline-modulos-legacy-vs-actual-2026-05-28.md)
- Matriz de trazabilidad: [matriz-trazabilidad-legacy-actual-2026-05-28.md](../matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Captura legacy: [03-editar-usuarios.png](../screenshots/03-editar-usuarios.png)
- Capturas actuales: [31-admin-usuarios.png](../current-screenshots/31-admin-usuarios.png), [32-admin-accesos.png](../current-screenshots/32-admin-accesos.png)
- Frontend actual: `frontend/src/pages/usuarios/UsuariosPage.jsx`, `frontend/src/api/usuarios.js`, `frontend/src/pages/accesos/AccesosPage.jsx`, `frontend/src/api/accesos.js`
- Backend actual: `backend/src/routes/usuarios/index.js`, `backend/src/routes/accesos/index.js`, `backend/prisma/schema.prisma`, `backend/src/middleware/rbac.js`

## Resumen ejecutivo

El modulo legacy **Usuarios** muestra una pantalla propia con boton `Crear nuevo`, pero la captura no alcanza a mostrar la tabla o formulario porque aparecen errores PHP de inclusion/conexion. Por eso no es posible confirmar todos los campos legacy visibles solo desde la evidencia visual actual.

La plataforma nueva cubre y mejora la administracion de usuarios en `/usuarios`: lista usuarios, filtra por busqueda/nivel/estado, muestra KPIs, permite crear, editar, dar de baja, asignar sucursal, codigo vendedor, permiso de descuentos y permisos extra por modulo. Ademas separa el historial en `/accesos`, aunque la captura actual muestra 0 eventos y el flujo de login revisado no confirma escritura real de eventos de acceso.

## Vista antigua

La captura legacy [03-editar-usuarios.png](../screenshots/03-editar-usuarios.png) muestra:

| Elemento legacy | Observacion |
|---|---|
| Ruta `menu.php?pag=usuarios/index` | Pantalla propia para editar usuarios. |
| Titulo `Usuarios` | Nombre directo del modulo. |
| Boton `Crear nuevo` | Permite crear usuarios. |
| Tabla/formulario | No visible por errores PHP en la captura. |
| Warnings PHP | Aparecen errores `include` y `desconecta.php` directamente en pantalla. |

Limitacion: esta captura no permite comparar columna por columna del legacy porque la tabla no cargo visualmente. Cualquier ajuste de campos debe validarse contra codigo/dump legacy o una captura corregida.

## Vista actual

La captura actual [31-admin-usuarios.png](../current-screenshots/31-admin-usuarios.png) muestra:

| Elemento actual | Evidencia |
|---|---|
| Ruta `/usuarios` | Modulo Admin > Usuarios. |
| KPIs | Total, Activos, Admins, Con permisos extra. |
| Busqueda | Busca usuario, RUT, vendedor o sucursal. |
| Filtros | Todos los niveles y todos los estados. |
| Tabla | Nombre, Usuario/Email, Nivel, Sucursal, Cod Vendedor, RUT, Descuentos, Permisos, Estado y acciones. |
| Acciones | Editar y Baja; evita dar de baja al usuario actual desde UI. |
| Modal de datos | Nombre, nivel, password, RUT, codigo vendedor, sucursal, estado y permiso descuentos. |
| Modal de permisos extra | Permisos granulares por modulo y accion `read/write/delete`. |

La captura [32-admin-accesos.png](../current-screenshots/32-admin-accesos.png) muestra `/accesos` como vista separada para historial:

| Elemento actual | Evidencia |
|---|---|
| Total eventos | KPI de historico login. |
| Tabs | Todos, ERP, Ventas. |
| Busqueda | Usuario o accion. |
| Tabla | Fecha, Usuario, Origen, Accion, IP, User-Agent. |
| Paginacion | Anterior/Siguiente con limite backend de 200. |

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Modulo usuarios | Pantalla `Usuarios` con `Crear nuevo`. | `/usuarios` con listado, filtros, KPIs y modales. | Cubierto y mejorado. |
| Crear usuario | Boton visible en legacy. | Boton `Nuevo Usuario`, email/password/nombre/rol requeridos. | Cubierto. |
| Editar usuario | Pantalla legacy se llama `Editar Usuarios`, pero tabla no carga. | Accion `Editar`, doble click de fila y modal por tabs. | Cubierto. |
| Eliminar/baja | No se confirma comportamiento legacy. | `Baja` desactiva usuario y elimina sesiones. | Mejorado; protege historial. |
| Roles/niveles | Legacy muestra `Nivel: ADMINISTRADOR` en cabecera. | Roles normalizados: admin, vendedor, bodeguero, cajero, taller, rrhh, solo_lectura. | Mejorado; requiere validar equivalencias legacy. |
| Sucursal | Legacy muestra sucursal en cabecera. | Usuario tiene `sucursalId` y nombre de sucursal en tabla/formulario. | Mejorado. |
| Cod vendedor | No visible en captura legacy por error. | Campo y columna `Cod Vendedor`, unico en backend. | Cubierto como dato operativo. |
| RUT | No visible en captura legacy por error. | Campo y columna RUT, unico en backend si se informa. | Cubierto. |
| Descuentos | Legacy tenia permiso descuento segun migracion/baseline. | `permisoDescuentos` visible en tabla y formulario. | Cubierto. |
| Permisos granulares | No se evidencia en captura legacy. | Permisos extra por modulo y accion. | Extra nuevo que debe preservarse. |
| Historial accesos | Legacy tenia tabla `accesos`, sin modulo visible fuerte. | `/accesos` separado para auditoria. | Mejorado, pero validar escritura de eventos. |
| Seguridad contrasenas | Legacy no debe documentar claves en texto plano. | Backend usa `bcrypt.hash` y `bcrypt.compare`. | Mejorado. |
| Errores tecnicos | Warnings PHP visibles. | No se observan warnings en actual. | Legacy obsoleto; no conservar. |

## Mejoras nuevas que no se deben perder

- Hash de password con `bcrypt`, sin exponer claves legacy.
- Baja logica de usuarios, no eliminacion fisica.
- Invalidacion de sesiones al cambiar password, rol o desactivar usuario.
- Proteccion para no desactivar/degradar el propio admin.
- Proteccion para mantener al menos un admin activo.
- Validacion de duplicados por email, RUT y codigo vendedor.
- Sucursal validada contra sucursales activas.
- Permisos extra por modulo y accion, ademas del rol base.
- Filtros por texto, nivel y estado.
- KPIs administrativos para total, activos, admins y permisos extra.
- Historial de accesos separado en `/accesos`.

## Faltantes o brechas candidatas

| Brecha candidata | Evidencia | Impacto | Recomendacion |
|---|---|---|---|
| Comparacion de campos legacy incompleta | La captura legacy no muestra columnas por warnings PHP. | No se puede asegurar si algun campo legacy especifico falta. | Revisar codigo/dump legacy de `usuarios` o recapturar con conexion corregida antes de ajustar columnas. |
| Escritura real de accesos | `/accesos` existe, pero la captura muestra 0 eventos; en el modulo login se detecto que `POST /api/auth/login` no confirma escritura en `auth.accesos`. | Auditoria de login puede estar incompleta. | Si el cliente usa historial de acceso, agregar registro de login exitoso/fallido sin guardar password. |
| Email no editable desde modal | En edicion, `Usuario / Email` aparece deshabilitado. | Si se requiere corregir un email existente, no hay accion visible. | Validar politica: mantener email inmutable por seguridad o permitir cambio controlado con invalidacion de sesiones. |
| Permisos extra no asignables al crear | El alta crea datos base; permisos extra se editan luego. | Puede requerir dos pasos para crear usuario con permisos granulares. | Aceptable si el flujo operativo lo permite; si no, agregar tab de permisos en creacion. |
| Permisos extra y navegacion frontend | El login actual no devuelve `permisosExtra` dentro de `data.user`, aunque el token si los incluye. | Un usuario con permisos extra puede no ver opciones en `TopBar` hasta rehidratacion/correccion. | Resolver junto con modulo Acceso/Login si se usan permisos extra en produccion. |
| Mapeo de niveles legacy | Legacy usa etiqueta `ADMINISTRADOR`; actual usa roles normalizados. | Puede haber confusion en documentacion o capacitacion. | Preparar equivalencia de roles legacy a roles nuevos. |

## Detalles legacy que ya no tienen sentido conservar

- Warnings PHP de conexion/desconexion visibles.
- Documentar o reutilizar claves legacy en texto plano.
- Eliminar usuarios fisicamente si ya participaron en ventas, caja, bodega o taller.
- Administrar acceso solo por "nivel" general cuando el ERP actual permite rol + permisos por modulo.
- Mezclar historial de accesos dentro de la edicion de usuarios; la separacion `/usuarios` y `/accesos` es mas clara.

## Decision del modulo

El modulo **Usuarios** queda documentado como **cubierto y mejorado**. La administracion actual es mas segura y completa que la evidencia legacy disponible.

Antes de tocar codigo, se debe resolver una pregunta: si el cliente necesita comparar campos exactos del usuario legacy, hay que revisar el codigo/dump o conseguir una captura sin errores. La brecha tecnica mas importante ya identificada es la escritura real de eventos para `/accesos`.

## Siguiente modulo sugerido

Continuar con **05 - Categorias y subcategorias bodega**, comparando las pantallas legacy `Editar Categorias` y `Editar Sub-Categorias` contra `/config` > `Cat. Bodega`.
