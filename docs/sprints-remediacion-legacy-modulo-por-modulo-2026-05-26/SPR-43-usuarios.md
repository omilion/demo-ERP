# SPR-43-usuarios - usuarios

Prioridad: **P2 - completar equivalencia**
Dominio: **Administración / Finanzas / Seguridad**
Subagente especialista asignado: **Subagente Administración-Finanzas-Seguridad**
Estado: **Pendiente de ejecución**

## Objetivo

Revisar y reparar el módulo `usuarios` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/usuarios.md`
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

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Cod Vendedor, Eliminar, Escribir, Estado, Modulo, Nivel, Nombre, Password, Submodulo, Sucursal, Usuario.
- Campos/formularios detectados: Código Vendedor:, Estado:, Nivel:, Nombre:, Password:, Permite hacer descuentos :, Rut: (EJ: 12456754-8), Rut: (EJ: 14234567-9), Sucursal:, Usuario: (EJ: codigotec).
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button"> Acepto, &times;, <?= $rut ?>, <?=$rut?>, <?php echo $codigo_vendedor; ?>, <?php echo $id; ?>, <?php echo $login_usuario; ?>, <?php echo $nombre; ?>, <?php echo $password; ?>, <?php echo $row['id']; ?>, Actualizar datos, Cancelar operación, Crear Nuevo usuario, Crear nuevo, No Acepto.
- Búsquedas/filtros detectados: "rut" : rut, "rut": rut, $("#resultado_rut"), $numero = $matches[1];, $result1=$mysqli->query("SELECT * FROM usuarios_sistema WHERE rut='$rut'");, $result1=$mysqli->query("UPDATE usuarios_sistema SET login_usuario='$usuario',id_nivel_usuario='$nivel', id_sucursal_usuario='$sucursal', nombre_usuario='$nombr, $result2=$mysqli->query("INSERT INTO usuarios_sistema(login_usuario,nombre_usuario,id_nivel_usuario,id_sucursal_usuario,password_usuario,estado_usuario,codigo_v, $rut = $row['rut'];, $rut = str_replace(', $rut = trim($rut);.

Navegación legacy detectada:
- `menu.php?pag=usuarios/acepta_eliminar&id=<?php echo $registro['id_usuario'];?>`
- `menu.php?pag=usuarios/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=usuarios/index`
- `menu.php?pag=usuarios/modificar&id=<?php echo $registro['id_usuario'];?>`
- `menu.php?pag=usuarios/nuevo`

## Cómo se muestra hoy

- `backend/src/routes/accesos`
- `backend/src/routes/usuarios`
- `backend/src/routes/usuarios-web/index.js`
- `backend/src/routes/usuarios/index.js`
- `frontend/src/api/usuarios.js`
- `frontend/src/pages/usuarios`
- `frontend/src/pages/usuarios/UsuariosPage.jsx`

## Funciones a revisar por el subagente

- Pantallas principales y pantallas auxiliares del módulo legacy.
- Formularios, campos obligatorios, selects, autocompletados y validaciones.
- Tablas, columnas, orden, colores/estados visuales y densidad.
- Botones, acciones, doble click, navegación y accesos directos.
- Búsquedas, filtros simples, filtros múltiples y estado por defecto.
- Exportaciones Excel/PDF, importaciones masivas y plantillas.
- Efectos secundarios: stock, caja, ventas, documentos, taller, despacho, auditoría.

## Brechas iniciales

- Confirmar si todos los campos legacy visibles existen en la UI nueva.
- Confirmar si todas las búsquedas/filtros legacy existen o tienen reemplazo equivalente.
- Confirmar si las exportaciones Excel/PDF legacy existen con el mismo alcance.
- Confirmar si las acciones destructivas o de estado legacy tienen control de permisos y trazabilidad en el sistema nuevo.
- Registrar extras nuevos que mejoran el legacy y no deben perderse.

## Plan de reparación

1. Levantar checklist funcional desde archivos legacy principales.
2. Comparar contra pantalla/API nueva equivalente.
3. Agregar campos, columnas, filtros, botones y exportaciones que existían en legacy y falten hoy.
4. Replicar búsquedas/filtros legacy, incluyendo accesos por botón cuando el usuario los use.
5. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
6. Validar con datos reales y usuario clave antes de marcar como cerrado.

## Criterios de aceptación

- Cada pantalla o flujo legacy relevante tiene equivalente nuevo, reemplazo aprobado o descarte explícito documentado.
- La UI nueva muestra los campos/columnas/filtros legacy requeridos por operación diaria.
- Las acciones críticas tienen permisos, validaciones, mensajes de error y auditoría.
- Las exportaciones/importaciones legacy existentes quedan replicadas o reemplazadas por una alternativa acordada.
- La funcionalidad se valida con datos reales y no rompe módulos relacionados.

## Seguridad, datos y permisos

- Validar permisos estrictos para caja, cobranza, usuarios, gastos y reportes financieros.
- Registrar auditoría de montos, medios de pago, documentos, anulaciones y cambios de usuario.
- Proteger datos personales de clientes/proveedores y evitar exportaciones no autorizadas.

## Checklist de validación final

- [ ] Revisar archivo legacy y anotar comportamiento exacto.
- [ ] Revisar pantalla/API nueva equivalente.
- [ ] Implementar brechas con cambios mínimos y trazables.
- [ ] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [ ] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [ ] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [ ] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementación realizada: Pendiente.
- Archivos modificados: Pendiente.
- Pruebas ejecutadas: Pendiente.
- Riesgos residuales: Pendiente.
- Validación del lead: Pendiente.
- Decisión final: Pendiente.
