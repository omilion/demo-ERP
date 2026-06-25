# Usuarios

## Qué es
Administración de los usuarios del sistema: crear cuentas, asignar roles y permisos.

## Dónde está
Ruta: Menú **Admin → Usuarios** (`/usuarios`). Solo accesible para administradores.

## Cómo hago lo principal

### Crear o editar un usuario
1. Entra a **Usuarios**.
2. Crea uno nuevo con su email, nombre, rol y (si es vendedor) su código de vendedor.
3. Define el rol, que determina a qué módulos accede.

## Campos importantes
- **Rol:** admin, vendedor, bodeguero, cajero, taller, rrhh, solo_lectura. Cada rol ve solo los módulos que le corresponden.
- **Código de vendedor:** identifica al vendedor para comisiones y asignación de ventas.

## Preguntas frecuentes
- **¿Por qué un usuario no ve cierto módulo?** Porque su rol no tiene permiso sobre ese módulo. Se ajusta editando su rol o permisos.
- **¿Quién puede crear usuarios?** Solo administradores.
