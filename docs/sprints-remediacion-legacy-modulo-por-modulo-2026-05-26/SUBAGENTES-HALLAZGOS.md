# Hallazgos de subagentes especialistas

Fecha: 26-05-2026

Este anexo consolida los hallazgos de los subagentes especialistas usados para convertir la auditoría legacy en sprints ejecutables. Ningún sprint debe cerrarse sin revisar estas prioridades.

## Bodega / Inventario

Subagente: Bodega-Inventario.

Prioridades críticas:

- Maestro de productos: Foto, Código Interno, ID Marco, Código Barra, Mostrar Web, Nombre, Categoría, Subcategoría, Descuento, Precio Costo, Precio Marco, Stock, Stock Crítico, Estado Inventario y Proveedor.
- Búsquedas operativas: nombre sin tildes, código interno, código barra, ID Marco, categoría, proveedor, web y stock crítico.
- Acciones masivas: Importar Inventario, Masivo Stock, Masivo Precios, Masivo Web, descarga/importación Excel.
- Facturas/boletas de bodega: documento proveedor, detalle por código interno, suma de stock y modificación de costo.
- Consulta de precios: foto, código, categorías, stock, precios normales/convenio/licitación y descuentos.
- Bodega taller: sucursal, unidad, stock crítico, categorías, proveedor y exportaciones.

Riesgos principales:

- Sobrescritura masiva de precios/stock sin rollback.
- Exposición de costos o márgenes a roles no autorizados.
- Duplicidad de SKU/código barra/proveedor.
- Cambios de stock/precio/proveedor sin auditoría.
- SQL legacy interpolado no debe replicarse; las búsquedas/importaciones deben sanitizarse.

## Comercial / Ventas

Subagente: Comercial-Ventas.

Prioridades críticas:

- Ciclo completo de venta por canal: sala, web, convenio marco y licitación.
- Documentos comerciales/tributarios: boleta, factura, NC, ND, documentos Laura/Plast/Inter Plast cuando aplique.
- Pagos, abonos, vouchers, saldo, cuotas y medios de pago.
- Anulación/reactivación controlada con reversas de stock, caja, documentos y entregas.
- Cotización de licitación a venta sin duplicar adjudicados ni perder OC.
- Convenio Marco con ID Marco, OC única, descuento específico y cargo transporte.
- Matriz ventas operacional: Ventas Hoy, N° interno, ID licitación, OC, ODT, guía, NC, ND, fechas, cliente, tipo venta y exportaciones.

Riesgos principales:

- Pérdida de trazabilidad de `n_interno` entre ventas, caja, productos, despacho, taller y reportes.
- NC/ND, facturas o boletas desacopladas de caja o venta.
- Anulación mal modelada que duplique stock o borre deuda.
- Descuentos sin permisos ni auditoría.
- Exportaciones con datos financieros/personales fuera de rol.

Prioridad recomendada:

1. Venta-documentos-pagos-anulación-stock como paquete transaccional.
2. Matriz/reportes/exportaciones.
3. UX y equivalencias menores.

## Operaciones / Taller / Despacho

Subagente: Operaciones-Taller-Despacho.

Prioridades críticas:

- Paso formal de venta a taller/ODT con taller por producto, cantidad, prioridad, observación y origen.
- Ficha de taller por ODT, imprimible/exportable, con productos separados por taller.
- Estados por producto y estado general OT, incluyendo acción controlada para terminar todos cuando aplique.
- Consumo, devolución e ingreso de materiales de taller con historial.
- Bitácora diaria de taller por operario y rango de fechas.
- Despacho operativo con matriz compacta, pagos, facturación, guías, documentos, región/comuna y exportaciones.
- Autocompletado de materiales/telas con control de sucursal y productos activos.
- Bodega taller como dependencia directa del flujo.

Riesgos principales:

- Pérdida de trazabilidad venta -> ODT -> taller -> materiales -> despacho.
- Duplicación de ODT o cantidades infladas.
- Cierre prematuro de producción o despacho de productos no terminados.
- Stock de bodega taller inconsistente.
- Mezcla de sucursales.
- Observaciones/bitácoras sin sanitización.

## Administración / Finanzas / Seguridad

Subagente: Administración-Finanzas-Seguridad.

Prioridades críticas:

- Caja: ingresos, egresos, cierre, resumen, activar/anular/eliminar documentos y búsquedas por fecha/documento/n interno/tipo venta.
- Cobranza proveedor: documentos, estados pagada/no pagada, fechas, NC asociada, filtros y exportaciones.
- Cobranza cliente: documentos, estado pago, documento interno y acceso directo a ventas por canal.
- Usuarios: nivel, sucursal, estado, permisos por módulo/submódulo, código vendedor y permiso de descuentos.
- Perfil empresa: RUT, razón social, giro, dirección, región/comuna y código Plastimar.
- Clientes/proveedores: RUT, datos tributarios, validación de duplicados y bloqueo si están referenciados.
- Cargo transporte, descuentos, gastos, cron de stock crítico y dependencias de correos/reportes.

Riesgos principales:

- Acciones destructivas sin trazabilidad suficiente.
- Permisos financieros demasiado amplios.
- Cambios de documentos contables sin reconciliar caja, cobranza, ventas, stock, NC/ND y reportes.
- Manejo inseguro de contraseñas o exposición de hash/clave.
- Datos tributarios inconsistentes.
- Importaciones masivas sin preview, rollback ni lote auditable.
- Jobs sin logs, reintentos o destinatarios configurables.

## Regla de cierre

Un sprint solo puede aprobarse cuando:

- Existe equivalencia funcional con legacy, reemplazo aprobado o descarte explícito.
- Hay pruebas o validación manual con datos reales.
- Los permisos se validan en UI y API.
- Hay auditoría para cambios críticos.
- Se documenta cómo se corrigió, qué archivos cambiaron, qué pruebas pasaron y qué riesgo residual queda.
