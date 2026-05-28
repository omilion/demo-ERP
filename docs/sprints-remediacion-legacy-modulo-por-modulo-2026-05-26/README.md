# Sprints de remediación legacy módulo por módulo

Fecha: 26-05-2026

Objetivo: transformar la auditoría legacy vs plataforma nueva en sprints ejecutables. Cada sprint tiene subagente especialista, funciones a revisar, plan de reparación, criterios de aceptación, seguridad y validación final del lead.

## Modelo de trabajo

1. Subagente especialista revisa legacy y plataforma nueva del módulo.
2. Subagente propone/implementa reparación con evidencia.
3. Validación final revisa código, datos, permisos, pruebas y experiencia de usuario.
4. El sprint queda Aprobado, Aprobado con observaciones o Rechazado.

## Hallazgos de subagentes

Los hallazgos consolidados de los subagentes especialistas están en [SUBAGENTES-HALLAZGOS.md](./SUBAGENTES-HALLAZGOS.md).

## Estado de cierre

Al 2026-05-27 los 48 SPR del paquete legacy quedaron cerrados, aprobados o aprobados localmente. El ultimo bloque fue SPR-06, SPR-09, SPR-11, SPR-44, SPR-46, SPR-47 y SPR-48; los sprints funcionales se implementaron y los sprints tecnicos sin pantalla se cerraron por reemplazo moderno documentado.

Prioridades transversales:

- Los sprints P0 no pueden cerrarse sin permisos finos, auditoría, validación de datos reales y pruebas de efectos secundarios.
- Venta-documentos-pagos-anulación-stock debe tratarse como paquete transaccional.
- Bodega/precios/importaciones/facturas de bodega requieren preview, validación por fila, rollback o lote auditable.
- Taller/despacho debe preservar trazabilidad venta -> ODT -> taller -> materiales -> despacho.
- Caja/cobranza/usuarios/perfil empresa requieren bloqueo en UI y API, no solo ocultar botones.

## Sprints

| # | Sprint | Módulo | Dominio | Subagente | Prioridad | Documento |
|---:|---|---|---|---|---|---|
| 1 | `SPR-01-autocompleta-nombre-material` | `autocompleta-nombre-material` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P2 - completar equivalencia | [SPR-01-autocompleta-nombre-material.md](./SPR-01-autocompleta-nombre-material.md) |
| 2 | `SPR-02-bitacora-taller` | `bitacora-taller` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P1 - crítico funcional | [SPR-02-bitacora-taller.md](./SPR-02-bitacora-taller.md) |
| 3 | `SPR-03-bodega-taller` | `bodega-taller` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-03-bodega-taller.md](./SPR-03-bodega-taller.md) |
| 4 | `SPR-04-bodega` | `bodega` | Bodega / Inventario | Subagente Bodega-Inventario | P0 - crítico operativo | [SPR-04-bodega.md](./SPR-04-bodega.md) |
| 5 | `SPR-05-caja` | `caja` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P0 - crítico operativo | [SPR-05-caja.md](./SPR-05-caja.md) |
| 6 | `SPR-06-cargo-transporte` | `cargo-transporte` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-06-cargo-transporte.md](./SPR-06-cargo-transporte.md) |
| 7 | `SPR-07-categorias-bodega-taller` | `categorias-bodega-taller` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-07-categorias-bodega-taller.md](./SPR-07-categorias-bodega-taller.md) |
| 8 | `SPR-08-categorias` | `categorias` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-08-categorias.md](./SPR-08-categorias.md) |
| 9 | `SPR-09-clase-excel` | `clase-excel` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-09-clase-excel.md](./SPR-09-clase-excel.md) |
| 10 | `SPR-10-clientes` | `clientes` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P0 - crítico operativo | [SPR-10-clientes.md](./SPR-10-clientes.md) |
| 11 | `SPR-11-cobranza-cliente` | `cobranza-cliente` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-11-cobranza-cliente.md](./SPR-11-cobranza-cliente.md) |
| 12 | `SPR-12-cobranza` | `cobranza` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P1 - crítico funcional | [SPR-12-cobranza.md](./SPR-12-cobranza.md) |
| 13 | `SPR-13-consulta-precios` | `consulta-precios` | Bodega / Inventario | Subagente Bodega-Inventario | P1 - crítico funcional | [SPR-13-consulta-precios.md](./SPR-13-consulta-precios.md) |
| 14 | `SPR-14-convenio-marco` | `convenio-marco` | Comercial / Ventas | Subagente Comercial-Ventas | P1 - crítico funcional | [SPR-14-convenio-marco.md](./SPR-14-convenio-marco.md) |
| 15 | `SPR-15-cotizar-licitacion` | `cotizar-licitacion` | Comercial / Ventas | Subagente Comercial-Ventas | P1 - crítico funcional | [SPR-15-cotizar-licitacion.md](./SPR-15-cotizar-licitacion.md) |
| 16 | `SPR-16-cron-job` | `cron-job` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-16-cron-job.md](./SPR-16-cron-job.md) |
| 17 | `SPR-17-css` | `css` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-17-css.md](./SPR-17-css.md) |
| 18 | `SPR-18-descuentos-marco` | `descuentos-marco` | Comercial / Ventas | Subagente Comercial-Ventas | P2 - completar equivalencia | [SPR-18-descuentos-marco.md](./SPR-18-descuentos-marco.md) |
| 19 | `SPR-19-descuentos-porc` | `descuentos-porc` | Comercial / Ventas | Subagente Comercial-Ventas | P2 - completar equivalencia | [SPR-19-descuentos-porc.md](./SPR-19-descuentos-porc.md) |
| 20 | `SPR-20-despacho` | `despacho` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P0 - crítico operativo | [SPR-20-despacho.md](./SPR-20-despacho.md) |
| 21 | `SPR-21-facturas-bodega` | `facturas-bodega` | Bodega / Inventario | Subagente Bodega-Inventario | P0 - crítico operativo | [SPR-21-facturas-bodega.md](./SPR-21-facturas-bodega.md) |
| 22 | `SPR-22-font` | `font` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-22-font.md](./SPR-22-font.md) |
| 23 | `SPR-23-fonts` | `fonts` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-23-fonts.md](./SPR-23-fonts.md) |
| 24 | `SPR-24-gastos` | `gastos` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-24-gastos.md](./SPR-24-gastos.md) |
| 25 | `SPR-25-img` | `img` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-25-img.md](./SPR-25-img.md) |
| 26 | `SPR-26-js` | `js` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-26-js.md](./SPR-26-js.md) |
| 27 | `SPR-27-lib` | `lib` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-27-lib.md](./SPR-27-lib.md) |
| 28 | `SPR-28-licitacion-venta` | `licitacion-venta` | Comercial / Ventas | Subagente Comercial-Ventas | P1 - crítico funcional | [SPR-28-licitacion-venta.md](./SPR-28-licitacion-venta.md) |
| 29 | `SPR-29-matriz-ventas` | `matriz-ventas` | Comercial / Ventas | Subagente Comercial-Ventas | P0 - crítico operativo | [SPR-29-matriz-ventas.md](./SPR-29-matriz-ventas.md) |
| 30 | `SPR-30-pasar-taller` | `pasar-taller` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P1 - crítico funcional | [SPR-30-pasar-taller.md](./SPR-30-pasar-taller.md) |
| 31 | `SPR-31-perfil` | `perfil` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-31-perfil.md](./SPR-31-perfil.md) |
| 32 | `SPR-32-phpmailer` | `phpmailer` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-32-phpmailer.md](./SPR-32-phpmailer.md) |
| 33 | `SPR-33-precios` | `precios` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-33-precios.md](./SPR-33-precios.md) |
| 34 | `SPR-34-proveedores` | `proveedores` | Bodega / Inventario | Subagente Bodega-Inventario | P1 - crítico funcional | [SPR-34-proveedores.md](./SPR-34-proveedores.md) |
| 35 | `SPR-35-reportes-licitaciones` | `reportes-licitaciones` | Comercial / Ventas | Subagente Comercial-Ventas | P2 - completar equivalencia | [SPR-35-reportes-licitaciones.md](./SPR-35-reportes-licitaciones.md) |
| 36 | `SPR-36-subcategorias-bodega-taller` | `subcategorias-bodega-taller` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-36-subcategorias-bodega-taller.md](./SPR-36-subcategorias-bodega-taller.md) |
| 37 | `SPR-37-subcategorias` | `subcategorias` | Bodega / Inventario | Subagente Bodega-Inventario | P2 - completar equivalencia | [SPR-37-subcategorias.md](./SPR-37-subcategorias.md) |
| 38 | `SPR-38-taller-confecciones` | `taller-confecciones` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P2 - completar equivalencia | [SPR-38-taller-confecciones.md](./SPR-38-taller-confecciones.md) |
| 39 | `SPR-39-taller-espumas` | `taller-espumas` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P2 - completar equivalencia | [SPR-39-taller-espumas.md](./SPR-39-taller-espumas.md) |
| 40 | `SPR-40-taller-externo` | `taller-externo` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P2 - completar equivalencia | [SPR-40-taller-externo.md](./SPR-40-taller-externo.md) |
| 41 | `SPR-41-taller-historial-materiales` | `taller-historial-materiales` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P2 - completar equivalencia | [SPR-41-taller-historial-materiales.md](./SPR-41-taller-historial-materiales.md) |
| 42 | `SPR-42-taller` | `taller` | Operaciones / Taller / Despacho | Subagente Operaciones-Taller-Despacho | P1 - crítico funcional | [SPR-42-taller.md](./SPR-42-taller.md) |
| 43 | `SPR-43-usuarios` | `usuarios` | Administración / Finanzas / Seguridad | Subagente Administración-Finanzas-Seguridad | P2 - completar equivalencia | [SPR-43-usuarios.md](./SPR-43-usuarios.md) |
| 44 | `SPR-44-vendor` | `vendor` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-44-vendor.md](./SPR-44-vendor.md) |
| 45 | `SPR-45-venta-directa` | `venta-directa` | Comercial / Ventas | Subagente Comercial-Ventas | P0 - crítico operativo | [SPR-45-venta-directa.md](./SPR-45-venta-directa.md) |
| 46 | `SPR-46-venta-web` | `venta-web` | Comercial / Ventas | Subagente Comercial-Ventas | P1 - crítico funcional | [SPR-46-venta-web.md](./SPR-46-venta-web.md) |
| 47 | `SPR-47-web` | `web` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-47-web.md](./SPR-47-web.md) |
| 48 | `SPR-48-word-textarea` | `word-textarea` | Soporte / Assets / Infraestructura | Subagente Soporte-Legacy | P3 - soporte técnico | [SPR-48-word-textarea.md](./SPR-48-word-textarea.md) |

## Validación final obligatoria

- Ningún sprint se marca cerrado solo porque compila.
- Debe existir evidencia de equivalencia funcional legacy o justificación aprobada del reemplazo.
- Debe revisarse seguridad, permisos, auditoría, datos reales y efectos secundarios.
- Debe registrarse cómo se corrigió y qué pruebas lo respaldan.
