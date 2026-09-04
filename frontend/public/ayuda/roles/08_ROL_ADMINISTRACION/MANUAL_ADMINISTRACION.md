---
documento: DOC-08
titulo: Manual operativo de Administración
version: MB-1.1
fecha_revision: 2026-09-04
audiencia: Administración y soporte autorizado
uso: Marcha Blanca
---

# DOC-08: Manual operativo de Administración

## 1. Principio de mínimo acceso

Asigna el rol más cercano a la función real y agrega sólo los permisos excepcionales necesarios. Los permisos extra son **aditivos**: sirven para otorgar capacidades que el rol base no tiene; no quitan permisos heredados. Si un rol concede demasiado acceso, cambia el rol en vez de intentar “restarle” capacidades.

## 2. Crear un usuario

1. Abre **Admin → Usuarios → Nuevo usuario**.
2. Ingresa usuario/email válido, nombre, rol y sucursal. Completa RUT, cargo y código de vendedor si corresponden.
3. Para perfiles comerciales, revisa descuento permitido, capacidad de aprobar descuentos y tipos de venta autorizados.
4. Define una contraseña inicial de al menos la longitud exigida por la pantalla y confírmala.
5. Revisa la **Matriz de acceso efectivo** antes de guardar.
6. Entrega la credencial por un canal seguro. El sistema no debe documentarse como si forzara siempre el cambio en primer ingreso; exige el cambio por procedimiento interno si aplica.

El formulario muestra un correo `@plastimar.cl` como ejemplo, pero la validación técnica vigente acepta un email válido. La política de dominio debe aplicarse administrativamente hasta que exista una regla automática.

## 3. Roles base vigentes

Entre los perfiles disponibles se encuentran administración, ventas/coordinación comercial, bodega, taller, operario de taller, caja, RRHH y sólo lectura. Facturación y otras funciones pueden depender de permisos/módulos efectivos. Confirma siempre la matriz mostrada en la ficha, no sólo el nombre del rol.

## 4. Editar permisos y contraseña

- Registra el motivo de cualquier elevación excepcional.
- Evita permisos amplios “por si acaso”.
- Prueba el acceso con el usuario o mediante una validación controlada; no solicites su contraseña.
- Al cambiar una contraseña, el sistema puede cerrar sesiones activas. Avisa al usuario.
- Revisa periódicamente usuarios con permisos extra y elimina los que ya no se justifican.

## 5. Baja o cambio de función

1. Verifica identidad y autorización.
2. Usa **Baja/Inactivo**; no borres registros históricos.
3. Confirma que la cuenta no pueda ingresar.
4. Si sólo cambia de cargo, ajusta rol, sucursal, atribuciones comerciales y permisos extra.
5. Conserva responsable, fecha y motivo de la modificación.

## 6. Marcha Blanca y datos

- Revisa Feedback por severidad, módulo, antigüedad y repetición.
- Evita descargar o distribuir capturas con RUT, nombres, precios o datos operativos fuera del grupo autorizado.
- Antes de indexar documentación en RAG, confirma versión, propietario y ausencia de datos personales innecesarios.
- Nunca adjuntes claves, tokens, certificado digital, CAF ni secretos técnicos a un ticket.
- Los controles de integridad deben ejecutarse sólo desde funciones visibles/autorizadas; no prometas una pantalla `Admin → Integridad` si no está disponible para tu versión.

## 7. Checklist semanal

- Usuarios activos corresponden a personal vigente.
- Roles y sucursales son correctos.
- Permisos extra conservan justificación.
- No hay cuentas compartidas.
- Tickets bloqueantes/altos tienen responsable y estado.
- Cambios funcionales relevantes actualizaron manuales y base RAG.

## 8. Criterio de cierre

La prueba se aprueba cuando el usuario accede sólo a lo esperado, las sesiones responden al cambio de contraseña/baja y la modificación queda trazable sin perder historial.
