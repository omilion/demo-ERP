# 01 - Acceso / login: legacy vs actual

Fecha de comparacion: 2026-05-28

Estado del modulo: **Mejorado, con brechas candidatas de auditoria y sincronizacion de permisos**.

## Fuentes revisadas

- Baseline general: [baseline-modulos-legacy-vs-actual-2026-05-28.md](../baseline-modulos-legacy-vs-actual-2026-05-28.md)
- Matriz de trazabilidad: [matriz-trazabilidad-legacy-actual-2026-05-28.md](../matriz-trazabilidad-legacy-actual-2026-05-28.md)
- Captura legacy: [00-login.png](../screenshots/00-login.png)
- Captura actual: [00-acceso-login-actual.png](../current-screenshots/00-acceso-login-actual.png)
- Frontend actual: `frontend/src/pages/login/LoginPage.jsx`, `frontend/src/store/auth.js`, `frontend/src/api/client.js`, `frontend/src/components/ProtectedRoute.jsx`, `frontend/src/components/TopBar.jsx`
- Backend actual: `backend/src/routes/auth/login.js`, `backend/src/routes/auth/refresh.js`, `backend/src/routes/auth/logout.js`, `backend/src/app.js`, `backend/src/plugins/jwt.js`, `backend/src/middleware/rbac.js`, `backend/prisma/schema.prisma`

## Resumen ejecutivo

El login legacy existia como una pantalla simple en `/`, con usuario, password y boton de entrada. La plataforma actual lo reemplaza por `/login`, usa email y contrasena, autentica contra backend moderno, emite token ERP, crea sesion con refresh token en cookie `httpOnly`, protege rutas por rol/permisos y permite cierre de sesion controlado.

La funcionalidad base esta cubierta y el modulo actual es superior al legacy. No conviene recuperar el diseno visual anterior ni el modelo de credenciales legacy. Si se decide corregir algo, las brechas candidatas son operativas: registrar eventos reales de login en `auth.accesos` y asegurar que los permisos extra del usuario queden disponibles tambien para la navegacion del frontend.

## Vista antigua

La captura legacy [00-login.png](../screenshots/00-login.png) muestra:

| Elemento legacy | Observacion |
|---|---|
| Ruta `/` | Entrada directa al ERP antiguo. |
| Marca Plastimar | Logo visible con texto "Sistema Gestion Integral". |
| Campo `Usuario ?` | Login por usuario generico, no por email normalizado. |
| Campo `Password` | Contrasena simple desde formulario. |
| Boton `Entrar` | Accion unica de ingreso. |
| Fondo fotografico | Imagen decorativa de ninos, propia del estilo anterior. |

El documento legacy indica expresamente que las credenciales antiguas no se deben documentar porque el dump contiene claves en texto plano.

## Vista actual

La captura actual [00-acceso-login-actual.png](../current-screenshots/00-acceso-login-actual.png) muestra:

| Elemento actual | Evidencia |
|---|---|
| Ruta `/login` | Declarada en `frontend/src/router.jsx`. |
| Marca `Plastimar` / `Sisgestion 3.0` | Presentacion sobria y consistente con el ERP nuevo. |
| Campo `Email` | `LoginPage.jsx` exige input `type=email` y `autoComplete=email`. |
| Campo `Contrasena` | `LoginPage.jsx` usa `type=password` y `autoComplete=current-password`. |
| Error de credenciales | Mensaje de error con `role=alert` si el backend rechaza login. |
| Estado de carga | Boton cambia a estado `Ingresando...` y queda deshabilitado. |
| Redireccion post-login | Al autenticar, guarda usuario/token y navega a `/dashboard`. |

## Comparacion funcional

| Punto comparado | Legacy | Actual | Decision |
|---|---|---|---|
| Entrada al sistema | `/` con formulario PHP visualmente centrado. | `/login` en React, luego redireccion a `/dashboard`. | Cubierto y mejorado. |
| Identificador de usuario | Campo libre `Usuario ?`. | Email validado por frontend y backend. | Mejorado; no conviene volver al usuario generico. |
| Clave | Campo `Password`. | Campo contrasena, validacion backend con `bcrypt.compare`. | Mejorado. |
| Sesion | Modelo legacy no documentado en detalle; credenciales antiguas no deben exponerse. | Access token ERP, refresh token, tabla `auth.sessions`, cookie `httpOnly`. | Mejorado. |
| Seguridad de rutas | El legacy dependia de acceso/menu anterior. | `ProtectedRoute` valida sesion, roles, modulos y permisos; backend usa `authenticate` y `rbac`. | Mejorado. |
| Roles | No se evidencia control moderno por modulo en la captura. | Roles: `admin`, `vendedor`, `bodeguero`, `cajero`, `taller`, `rrhh`, `solo_lectura`. | Extra nuevo que debe preservarse. |
| Cierre de sesion | No visible en captura de login. | `TopBar` llama `/auth/logout`, borra refresh token y limpia estado local. | Mejorado. |
| Historial de acceso | Legacy tenia tabla `accesos` segun baseline, pero no como modulo fuerte visible. | Existe modelo `AccesoLog` y vista `/accesos`; no se confirma escritura desde login actual. | Brecha candidata. |
| Aspecto visual | Fondo fotografico y panel flotante. | Pantalla limpia, neutra y administrativa. | El estilo actual es mas adecuado para ERP. |

## Mejoras nuevas que no se deben perder

- Autenticacion backend con `bcrypt`, no claves legacy en texto plano.
- Token ERP con `scope`, `aud` y `tokenType`, separado de tokens web.
- Refresh token en cookie `httpOnly` y persistencia de sesiones en `auth.sessions`.
- Proteccion frontend por rutas, roles, modulos y permisos.
- Proteccion backend con `fastify.authenticate` y `fastify.rbac`.
- Redireccion segura a `/login` cuando no hay usuario autenticado.
- Logout controlado desde `TopBar`, limpiando sesion servidor/cliente.
- Separacion de auditoria administrativa en `/accesos` y `/admin/auditoria`.

## Faltantes o brechas candidatas

| Brecha candidata | Evidencia | Impacto | Recomendacion |
|---|---|---|---|
| Registro real de accesos al iniciar sesion | Existe `auth.AccesoLog` y ruta `/accesos`, pero `POST /api/auth/login` crea sesion y no registra evento en `auth.accesos`; `audit.js` omite `/api/auth/login`. | La pantalla `/accesos` puede quedar vacia o incompleta para auditoria operativa. | Confirmar con cliente si necesita bitacora de login exitoso/fallido. Si aplica, agregar escritura controlada sin guardar contrasenas. |
| Usuario devuelto al frontend sin permisos extra | `createErpAccessTokenPayload` incluye `permisoDescuentos` y `permisosExtra`, pero la respuesta `user` del login solo devuelve id, email, role, nombre y sucursalId. | Un usuario con permisos extra podria tener backend habilitado por token, pero navegacion/frontend no reflejar completamente esos permisos. | Incluir permisos extra seguros en `data.user` o hidratar usuario actual desde endpoint protegido. |
| Refresh no actualiza datos de usuario en frontend | `/auth/refresh` devuelve solo `accessToken`. | Si rol/permisos cambian durante una sesion, la UI puede conservar datos persistidos antiguos. | Evaluar si refresh debe devolver tambien usuario actualizado o forzar rehidratacion. |
| Hardening no legacy | No se ve rate limiting, bloqueo por intentos, MFA ni recuperacion de contrasena. | No es deuda contra legacy, pero puede ser requisito de seguridad futuro. | No bloquear comparativa; tratar como mejora de seguridad separada. |

## Detalles legacy que ya no tienen sentido conservar

- Fondo fotografico infantil: no aporta al trabajo diario del ERP y rompe la linea visual actual.
- Texto/campo `Usuario ?`: el email normalizado es mas claro para soporte, auditoria y recuperacion de cuentas.
- Replicar la ruta `/` como login principal: hoy `/` redirige al dashboard protegido y `/login` es la entrada explicita.
- Documentar o reutilizar credenciales legacy: el baseline ya advierte que las claves venian en texto plano.
- Volver a un login estilo PHP/session legacy: el modelo actual con JWT, refresh token, RBAC y sesiones es superior.

## Decision del modulo

El modulo **Acceso / login** queda documentado como **cubierto y mejorado**. No se detecta una funcion legacy de login que deba ser restaurada visualmente. Las unicas acciones recomendables son validar si el cliente necesita historial operativo de accesos y corregir la sincronizacion de permisos extra en la UI si esos permisos se usan en produccion.

## Siguiente modulo sugerido

Continuar con **02 - Home / menu principal**, porque depende directamente del resultado del login y permite comparar el antiguo menu principal contra `/dashboard` y `TopBar`.
