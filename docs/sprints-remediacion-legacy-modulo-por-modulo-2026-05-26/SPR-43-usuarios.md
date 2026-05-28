# SPR-43-usuarios - usuarios

Prioridad: **P2 - completar equivalencia**
Dominio: **AdministraciÃ³n / Finanzas / Seguridad**
Subagente especialista asignado: **Subagente AdministraciÃ³n-Finanzas-Seguridad**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el mÃ³dulo `usuarios` comparando cada funciÃ³n legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- AuditorÃ­a base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/usuarios.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-43-usuarios.md`
- Evidencia legacy principal:
  - `usuarios\acepta_eliminar.php`
  - `usuarios\actualizar.php`
  - `usuarios\consultar_rut_existe.php`
  - `usuarios\consultar_usuario_existe.php`
  - `usuarios\eliminar.php`
  - `usuarios\guardar.php`
  - `usuarios\guardar_permiso.php`
  - `usuarios\index.php`
  - `usuarios\lista.php`
  - `usuarios\mensaje_actualizado.php`
  - `usuarios\mensaje_eliminado.php`
  - `usuarios\mensaje_guardado.php`

## CÃ³mo se mostraba en legacy

- Tablas/columnas detectadas: Cod Vendedor, Eliminar, Escribir, Estado, Modulo, Nivel, Nombre, Password, Submodulo, Sucursal, Usuario.
- Campos/formularios detectados: CÃ³digo Vendedor:, Estado:, Nivel:, Nombre:, Password:, Permite hacer descuentos :, Rut: (EJ: 12456754-8), Rut: (EJ: 14234567-9), Sucursal:, Usuario: (EJ: codigotec).
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button"> Acepto, &times;, <?= $rut ?>, <?=$rut?>, <?php echo $codigo_vendedor; ?>, <?php echo $id; ?>, <?php echo $login_usuario; ?>, <?php echo $nombre; ?>, <?php echo $password; ?>, <?php echo $row['id']; ?>, Actualizar datos, Cancelar operaciÃ³n, Crear Nuevo usuario, Crear nuevo, No Acepto.
- BÃºsquedas/filtros detectados: "rut" : rut, "rut": rut, $("#resultado_rut"), $numero = $matches[1];, $result1=$mysqli->query("SELECT * FROM usuarios_sistema WHERE rut='$rut'");, $result1=$mysqli->query("UPDATE usuarios_sistema SET login_usuario='$usuario',id_nivel_usuario='$nivel', id_sucursal_usuario='$sucursal', nombre_usuario='$nombr, $result2=$mysqli->query("INSERT INTO usuarios_sistema(login_usuario,nombre_usuario,id_nivel_usuario,id_sucursal_usuario,password_usuario,estado_usuario,codigo_v, $rut = $row['rut'];, $rut = str_replace(', $rut = trim($rut);.

NavegaciÃ³n legacy detectada:
- `menu.php?pag=usuarios/acepta_eliminar&id=<?php echo $registro['id_usuario'];?>`
- `menu.php?pag=usuarios/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=usuarios/index`
- `menu.php?pag=usuarios/modificar&id=<?php echo $registro['id_usuario'];?>`
- `menu.php?pag=usuarios/nuevo`

## CÃ³mo se muestra hoy

- `backend/src/routes/accesos`
- `backend/src/routes/usuarios`
- `backend/src/routes/usuarios-web/index.js`
- `backend/src/routes/usuarios/index.js`
- `frontend/src/api/usuarios.js`
- `frontend/src/pages/usuarios`
- `frontend/src/pages/usuarios/UsuariosPage.jsx`

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del mÃ³dulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegaciÃ³n y accesos directos.
- BÃºsquedas, filtros simples, filtros mÃºltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditorÃ­a.

## Brechas iniciales

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las bÃºsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparaciÃ³n

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existÃ­an en legacy y falten hoy.
4. Replicar bÃºsquedas/filtros legacy, incluyendo accesos por botÃ³n cuando el usuario los use.
5. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
6. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptaciÃ³n

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explÃ­cito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operaciÃ³n diaria.
- Las acciones crÃ­ticas tienen permisos, validaciones, mensajes de error y auditorÃ­a.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe mÃ³dulos relacionados.

## Seguridad, datos y permisos

- Validar permisos estrictos para caja, cobranza, usuarios, gastos y reportes financieros.
- Registrar auditorÃ­a de montos, medios de pago, documentos, anulaciones y cambios de usuario.
- Proteger datos personales de clientes/proveedores y evitar exportaciones no autorizadas.

## Checklist de validaciÃ³n final

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios minimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integracion cuando hubo logica de datos.
- [x] Probar flujo feliz, errores, permisos y estados borde con suite automatizada.
- [x] Registrar evidencia: archivos modificados, comandos de prueba y resultado.
- [x] Validacion final del lead: aprobado localmente.

## Resultado de ejecucion

- Implementacion realizada: usuarios ahora muestra y edita los campos legacy clave: usuario/email, nivel, sucursal, codigo vendedor, RUT, estado y permiso de descuentos. Se agrego busqueda/filtros, baja logica con permiso `usuarios:delete`, validacion de RUT/codigo vendedor duplicado, validacion de rol/sucursal, permisos extra saneados por modulo y revocacion de sesiones al cambiar password/rol/desactivar.
- Archivos modificados: `backend/src/routes/usuarios/index.js`, `frontend/src/pages/usuarios/UsuariosPage.jsx`, `frontend/src/api/usuarios.js`, `frontend/src/api/locations.js`, `backend/test/usuarios.test.js`.
- Pruebas ejecutadas: `npm.cmd test -- categorias-bodega-taller.test.js categorias.test.js usuarios.test.js` OK 12/12; `npm.cmd run test:ci` OK 126/126; `npm.cmd run test:full` OK 437/437; frontend `npm.cmd run lint` OK; frontend `npm.cmd run build` OK.
- Riesgos residuales: password no se muestra ni se exporta por seguridad; los submodulos legacy quedan consolidados como permisos `read/write/delete` por modulo funcional.
- Validacion del lead: aprobado localmente con revision multiagente backend/frontend.
- Decision final: cerrado.
