# SPR-06-cargo-transporte - cargo_transporte

Prioridad: **P2 - completar equivalencia**
Dominio: **Administración / Finanzas / Seguridad**
Subagente especialista asignado: **Subagente Administración-Finanzas-Seguridad**
Estado: **Aprobado localmente - cerrado el 2026-05-27**

## Objetivo

Revisar y reparar el módulo `cargo_transporte` comparando cada función legacy contra la plataforma nueva, sin omitir campos, filtros, acciones, exportaciones, estados ni permisos.

## Insumos

- Auditoría base: `docs/auditoria-legacy-vs-nuevo-modulos-2026-05-26/cargo-transporte.md`
- Sprint: `docs/sprints-remediacion-legacy-modulo-por-modulo-2026-05-26/SPR-06-cargo-transporte.md`
- Evidencia legacy principal:
  - `cargo_transporte\acepta_eliminar.php`
  - `cargo_transporte\actualizar.php`
  - `cargo_transporte\consultar_nombre_existe.php`
  - `cargo_transporte\eliminar.php`
  - `cargo_transporte\guardar.php`
  - `cargo_transporte\index.php`
  - `cargo_transporte\lista.php`
  - `cargo_transporte\lista_excel.php`
  - `cargo_transporte\lista_pdf.php`
  - `cargo_transporte\mensaje_actualizado.php`
  - `cargo_transporte\mensaje_eliminado.php`
  - `cargo_transporte\mensaje_guardado.php`

## Cómo se mostraba en legacy

- Tablas/columnas detectadas: Nombre Zona, Valor en % aplicado a la Venta.
- Campos/formularios detectados: Nombre:, Valor %, Valor %:.
- Botones/acciones detectadas: " class="btn btn-lg btn-danger btn-block" role="button">Acepto, &times;, ')" role="button" class="btn btn-danger btn-sm"> PDF, <?php echo $id; ?>, <?php echo $nombre; ?>, <?php echo $valor; ?>, Actualizar datos, Cancelar operación, Crear Nuevo, Crear nuevo, Exportar a Excel, No Acepto.
- Exportaciones/masivos detectados: $mpdf = new \Mpdf\Mpdf(['orientation' => 'L']); // Establece la orientación en landscape (horizontal), $mpdf->AddPage();, $mpdf->AliasNbPages();, $mpdf->Cell(10,6, $numero,1,0,'C',1);, $mpdf->Cell(10,6,'',1,0,'C',1);, $mpdf->Cell(60,6, $valor,1,1,'C',1);, $mpdf->Cell(60,6,'Valor en % aplicado a la Venta',1,1,'C',1);, $mpdf->Cell(80,10, 'Sucursal:', $mpdf->Cell(80,10,$salida, $mpdf->Cell(80,6, $nombre,1,0,'L',1);.
- Búsquedas/filtros detectados: $mpdf->Cell(10,6, $numero,1,0,'C',1);, $numero=$numero + 1;, $numero=0;, // APLICO FILTROS A LOS ENCABEZADOS, // Alias para el número total de páginas, //$pdf->fila($numero,$nombre,$valor);.

Navegación legacy detectada:
- `menu.php?pag=cargo_transporte/acepta_eliminar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=cargo_transporte/eliminar&id=<?php echo $id;?>`
- `menu.php?pag=cargo_transporte/index`
- `menu.php?pag=cargo_transporte/modificar&id=<?php echo $registro['id'];?>`
- `menu.php?pag=cargo_transporte/nuevo`

## Cómo se muestra hoy

- `backend/src/routes/cargo-transporte`
- `backend/src/routes/cargo-transporte/index.js`
- `backend/src/routes/ventas/cargos.js`
- `frontend/src/api/cargoTransporte.js`

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
5. Replicar exportaciones Excel/PDF legacy o justificar reemplazo.
6. Registrar extras de la plataforma nueva que reemplazan o mejoran flujos legacy.
7. Validar con datos reales y usuario clave antes de marcar como cerrado.

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

- [x] Revisar archivo legacy y anotar comportamiento exacto.
- [x] Revisar pantalla/API nueva equivalente.
- [x] Implementar brechas con cambios mínimos y trazables.
- [x] Agregar o actualizar pruebas unitarias/integración cuando haya lógica de datos.
- [x] Probar manualmente flujo feliz, errores, permisos y estados borde.
- [x] Registrar evidencia: archivos modificados, capturas si aplica, comandos de prueba y resultado.
- [x] Validación final del lead: aprobar, aprobar con observaciones o rechazar.

## Resultado de ejecución

- Implementación realizada: se agregaron validaciones de nombre, duplicado y porcentaje 0-100; exportación CSV; desactivación segura en vez de eliminación física; UI con porcentaje, validación local y botón de exportación.
- Archivos modificados: `backend/src/routes/cargo-transporte/index.js`, `frontend/src/api/cargoTransporte.js`, `frontend/src/pages/config/ConfigPage.jsx`, `frontend/src/components/forms/index.jsx`, `backend/test/cargo-transporte.test.js`.
- Pruebas ejecutadas: `node --check` en ruta y test nuevo; `frontend: npm.cmd run lint` OK; `frontend: npm.cmd run build` OK; `backend: npm.cmd test -- cargo-transporte.test.js cobranza-cliente.test.js ordenes-compra-web.test.js web-public.test.js` OK, 4 archivos, 9 tests.
- Riesgos residuales: sin riesgos bloqueantes detectados en el set dirigido.
- Validación del lead: aprobado localmente con revisión backend/frontend y cobertura nueva.
- Decisión final: cerrado.
