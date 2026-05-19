import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SAMPLE_LIMIT = 5
const MAX_SAMPLE_LIMIT = 50

const severityRank = {
  info: 0,
  warn: 1,
  critical: 2,
}

const q = (sql) => sql.replace(/\s+/g, ' ').trim()

const normalizedRut = (column) => `regexp_replace(upper(trim(${column})), '[^0-9K]', '', 'g')`
const normalizedText = (column) => `upper(trim(${column}))`

const duplicateNormalized = ({ table, column, normalizer, where = `${column} IS NOT NULL AND trim(${column}) <> ''` }) => {
  const key = normalizer(column)
  return {
    countSql: q(`
      SELECT count(*)::int AS count
      FROM (
        SELECT ${key} AS normalized_value
        FROM ${table}
        WHERE ${where}
        GROUP BY ${key}
        HAVING count(*) > 1
      ) dup
    `),
    sampleSql: (limit) => q(`
      SELECT ${key} AS normalized_value, count(*)::int AS rows, array_agg(id ORDER BY id) AS ids
      FROM ${table}
      WHERE ${where}
      GROUP BY ${key}
      HAVING count(*) > 1
      ORDER BY rows DESC, normalized_value
      LIMIT ${limit}
    `),
  }
}

const orphan = ({ child, childAlias = 'c', childColumn, parent, parentAlias = 'p', parentColumn = 'id', extraWhere = '' }) => {
  const where = [
    `${childAlias}.${childColumn} IS NOT NULL`,
    `NOT EXISTS (SELECT 1 FROM ${parent} ${parentAlias} WHERE ${parentAlias}.${parentColumn} = ${childAlias}.${childColumn})`,
    extraWhere,
  ].filter(Boolean).join(' AND ')

  return {
    countSql: q(`SELECT count(*)::int AS count FROM ${child} ${childAlias} WHERE ${where}`),
    sampleSql: (limit) => q(`
      SELECT ${childAlias}.id, ${childAlias}.${childColumn} AS missing_ref
      FROM ${child} ${childAlias}
      WHERE ${where}
      ORDER BY ${childAlias}.id
      LIMIT ${limit}
    `),
  }
}

const countWhere = ({ table, where, fields = 'id' }) => ({
  countSql: q(`SELECT count(*)::int AS count FROM ${table} WHERE ${where}`),
  sampleSql: (limit) => q(`SELECT ${fields} FROM ${table} WHERE ${where} ORDER BY id LIMIT ${limit}`),
})

const dateAnomaly = ({ items, minDate = '2000-01-01', maxFutureInterval = '1 year' }) => {
  const union = items.map(({ table, column }) => q(`
    SELECT '${table}' AS table_name, '${column}' AS column_name, id, ${column} AS value
    FROM ${table}
    WHERE ${column} IS NOT NULL
      AND (${column} < TIMESTAMP '${minDate}' OR ${column} > now() + INTERVAL '${maxFutureInterval}')
  `)).join(' UNION ALL ')

  return {
    countSql: q(`SELECT count(*)::int AS count FROM (${union}) anomalies`),
    sampleSql: (limit) => q(`
      SELECT table_name, column_name, id, value
      FROM (${union}) anomalies
      ORDER BY value, table_name, column_name, id
      LIMIT ${limit}
    `),
  }
}

export const CHECKS = [
  {
    id: 'clientes.rut_duplicado_normalizado',
    area: 'clientes',
    severity: 'critical',
    description: 'Clientes con RUT duplicado al normalizar puntos, guion, espacios y case.',
    ...duplicateNormalized({ table: 'clientes.clientes', column: 'rut', normalizer: normalizedRut }),
  },
  {
    id: 'proveedores.rut_duplicado_normalizado',
    area: 'proveedores',
    severity: 'critical',
    description: 'Proveedores con RUT duplicado al normalizar puntos, guion, espacios y case.',
    ...duplicateNormalized({ table: 'catalogo.proveedores', column: 'rut', normalizer: normalizedRut }),
  },
  {
    id: 'usuarios.rut_duplicado_normalizado',
    area: 'auth',
    severity: 'warn',
    description: 'Usuarios con RUT duplicado normalizado.',
    ...duplicateNormalized({ table: 'auth.users', column: 'rut', normalizer: normalizedRut }),
  },
  {
    id: 'productos.codigo_interno_duplicado_normalizado',
    area: 'productos',
    severity: 'critical',
    description: 'Productos con codigo interno duplicado por espacios o diferencias de case.',
    ...duplicateNormalized({ table: 'catalogo.productos', column: 'codigo_interno', normalizer: normalizedText }),
  },
  {
    id: 'productos.codigo_barra_duplicado_normalizado',
    area: 'productos',
    severity: 'warn',
    description: 'Productos con codigo de barra duplicado normalizado.',
    ...duplicateNormalized({ table: 'catalogo.productos', column: 'codigo_barra', normalizer: normalizedText }),
  },
  {
    id: 'bodega_taller.codigo_interno_duplicado_normalizado',
    area: 'taller',
    severity: 'critical',
    description: 'Insumos de bodega taller con codigo interno duplicado por espacios o case.',
    ...duplicateNormalized({ table: 'taller.bodega_taller', column: 'codigo_interno', normalizer: normalizedText }),
  },
  {
    id: 'bodega_taller.codigo_barra_duplicado_normalizado',
    area: 'taller',
    severity: 'warn',
    description: 'Insumos de bodega taller con codigo de barra duplicado normalizado.',
    ...duplicateNormalized({ table: 'taller.bodega_taller', column: 'codigo_barra', normalizer: normalizedText }),
  },
  {
    id: 'productos.stock_negativo',
    area: 'productos',
    severity: 'critical',
    description: 'Productos con stock negativo.',
    ...countWhere({ table: 'catalogo.productos', where: 'stock < 0', fields: 'id, codigo_interno, nombre, stock' }),
  },
  {
    id: 'bodega_taller.stock_negativo',
    area: 'taller',
    severity: 'critical',
    description: 'Bodega taller con stock negativo.',
    ...countWhere({ table: 'taller.bodega_taller', where: 'stock < 0', fields: 'id, codigo_interno, nombre, stock' }),
  },
  {
    id: 'telas.stock_negativo',
    area: 'taller',
    severity: 'critical',
    description: 'Telas con stock negativo.',
    ...countWhere({ table: 'taller.telas', where: 'stock < 0', fields: 'id, codigo, nombre, stock' }),
  },
  {
    id: 'ordenes.cliente_id_nulo',
    area: 'ventas',
    severity: 'critical',
    description: 'Ordenes sin cliente canonico asociado.',
    ...countWhere({ table: 'ventas.ordenes', where: 'cliente_id IS NULL', fields: 'id, n_interno, rut_cliente, email_cliente, tipo, estado' }),
  },
  {
    id: 'ordenes.cliente_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Ordenes con cliente_id que no existe en clientes.',
    ...orphan({ child: 'ventas.ordenes', childColumn: 'cliente_id', parent: 'clientes.clientes' }),
  },
  {
    id: 'ordenes.user_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Ordenes con user_id que no existe en auth.users.',
    ...orphan({ child: 'ventas.ordenes', childColumn: 'user_id', parent: 'auth.users' }),
  },
  {
    id: 'ordenes.sucursal_id_huerfano',
    area: 'ventas',
    severity: 'warn',
    description: 'Ordenes con sucursal_id que no existe en auth.sucursales.',
    ...orphan({ child: 'ventas.ordenes', childColumn: 'sucursal_id', parent: 'auth.sucursales' }),
  },
  {
    id: 'orden_items.orden_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Items de orden con orden_id inexistente.',
    ...orphan({ child: 'ventas.orden_items', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'orden_items.producto_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Items de orden con producto_id inexistente.',
    ...orphan({ child: 'ventas.orden_items', childColumn: 'producto_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'orden_items.cantidades_invalidas',
    area: 'ventas',
    severity: 'critical',
    description: 'Items de orden con cantidad <= 0, entregados negativos o entregados mayor a cantidad.',
    ...countWhere({
      table: 'ventas.orden_items',
      where: 'cantidad <= 0 OR n_entregados < 0 OR n_entregados > cantidad',
      fields: 'id, orden_id, producto_id, cantidad, n_entregados',
    }),
  },
  {
    id: 'orden_cargos.orden_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Cargos de orden con orden_id inexistente.',
    ...orphan({ child: 'ventas.orden_cargos', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'cotizacion.orden_id_huerfano',
    area: 'ventas',
    severity: 'warn',
    description: 'Cotizaciones con orden_id inexistente.',
    ...orphan({ child: 'ventas.cotizacion_licitacion', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'cotizacion_items.cotizacion_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Items de cotizacion con cotizacion_id inexistente.',
    ...orphan({ child: 'ventas.cotizacion_licitacion_items', childColumn: 'cotizacion_id', parent: 'ventas.cotizacion_licitacion' }),
  },
  {
    id: 'cotizacion_items.codigo_interno_sin_producto',
    area: 'ventas',
    severity: 'warn',
    description: 'Items de cotizacion con codigo_interno que no existe en productos.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM ventas.cotizacion_licitacion_items i
      WHERE i.codigo_interno IS NOT NULL
        AND trim(i.codigo_interno) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM catalogo.productos p
          WHERE upper(trim(p.codigo_interno)) = upper(trim(i.codigo_interno))
        )
    `),
    sampleSql: (limit) => q(`
      SELECT i.id, i.cotizacion_id, i.codigo_interno, i.nombre
      FROM ventas.cotizacion_licitacion_items i
      WHERE i.codigo_interno IS NOT NULL
        AND trim(i.codigo_interno) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM catalogo.productos p
          WHERE upper(trim(p.codigo_interno)) = upper(trim(i.codigo_interno))
        )
      ORDER BY i.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'compra_online_items.orden_compra_id_huerfano',
    area: 'ventas',
    severity: 'critical',
    description: 'Items de compra online con orden_compra_id inexistente.',
    ...orphan({ child: 'ventas.orden_compra_online_items', childColumn: 'orden_compra_id', parent: 'ventas.orden_compra_online' }),
  },
  {
    id: 'compra_online.codigo_vendedor_huerfano',
    area: 'ventas',
    severity: 'warn',
    description: 'Compras online con codigo_vendedor sin usuario asociado.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM ventas.orden_compra_online o
      WHERE o.codigo_vendedor IS NOT NULL
        AND trim(o.codigo_vendedor) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.codigo_vendedor = o.codigo_vendedor
        )
    `),
    sampleSql: (limit) => q(`
      SELECT o.id, o.n_compra, o.codigo_vendedor
      FROM ventas.orden_compra_online o
      WHERE o.codigo_vendedor IS NOT NULL
        AND trim(o.codigo_vendedor) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM auth.users u
          WHERE u.codigo_vendedor = o.codigo_vendedor
        )
      ORDER BY o.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'caja.turnos_caja_id_huerfano',
    area: 'caja',
    severity: 'critical',
    description: 'Turnos con caja_id inexistente.',
    ...orphan({ child: 'caja.turnos', childColumn: 'caja_id', parent: 'caja.cajas' }),
  },
  {
    id: 'caja.turnos_user_id_huerfano',
    area: 'caja',
    severity: 'critical',
    description: 'Turnos con user_id inexistente.',
    ...orphan({ child: 'caja.turnos', childColumn: 'user_id', parent: 'auth.users' }),
  },
  {
    id: 'caja.movimientos_turno_id_huerfano',
    area: 'caja',
    severity: 'warn',
    description: 'Movimientos de caja con turno_id inexistente.',
    ...orphan({ child: 'caja.movimientos_caja', childColumn: 'turno_id', parent: 'caja.turnos' }),
  },
  {
    id: 'caja.movimientos_orden_id_huerfano',
    area: 'caja',
    severity: 'critical',
    description: 'Movimientos de caja con orden_id inexistente.',
    ...orphan({ child: 'caja.movimientos_caja', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'caja.movimientos_gasto_tipo_id_huerfano',
    area: 'caja',
    severity: 'warn',
    description: 'Movimientos de caja con gasto_tipo_id inexistente.',
    ...orphan({ child: 'caja.movimientos_caja', childColumn: 'gasto_tipo_id', parent: 'caja.gastos' }),
  },
  {
    id: 'caja.movimientos_origen_tipo_nulo',
    area: 'caja',
    severity: 'warn',
    description: 'Movimientos de caja sin origen_tipo auditable.',
    ...countWhere({
      table: 'caja.movimientos_caja',
      where: "origen_tipo IS NULL OR trim(origen_tipo) = ''",
      fields: 'id, turno_id, tipo, monto, medio_pago, orden_id, gasto_tipo_id, fecha',
    }),
  },
  {
    id: 'caja.ingresos_sin_orden_ni_documento',
    area: 'caja',
    severity: 'warn',
    description: 'Ingresos de caja sin orden, documento ni referencia suficiente.',
    ...countWhere({
      table: 'caja.movimientos_caja',
      where: `
        tipo = 'Ingreso'
        AND orden_id IS NULL
        AND COALESCE(NULLIF(trim(documento), ''), NULLIF(trim(n_doc), ''), NULLIF(trim(referencia), '')) IS NULL
        AND eliminado = false
      `,
      fields: 'id, turno_id, tipo, monto, medio_pago, documento, n_doc, referencia, fecha',
    }),
  },
  {
    id: 'caja.egresos_sin_gasto_ni_orden',
    area: 'caja',
    severity: 'warn',
    description: 'Egresos de caja sin categoria de gasto ni orden asociada.',
    ...countWhere({
      table: 'caja.movimientos_caja',
      where: "tipo = 'Egreso' AND gasto_tipo_id IS NULL AND orden_id IS NULL AND eliminado = false",
      fields: 'id, turno_id, monto, medio_pago, referencia, documento, n_doc, fecha',
    }),
  },
  {
    id: 'caja.movimientos_origen_orden_mismatch',
    area: 'caja',
    severity: 'critical',
    description: 'Movimientos de caja con origen orden distinto de orden_id.',
    ...countWhere({
      table: 'caja.movimientos_caja',
      where: "origen_tipo = 'orden' AND orden_id IS NOT NULL AND origen_id IS NOT NULL AND origen_id <> orden_id",
      fields: 'id, turno_id, orden_id, origen_tipo, origen_id, tipo, monto',
    }),
  },
  {
    id: 'caja.movimientos_origen_gasto_mismatch',
    area: 'caja',
    severity: 'critical',
    description: 'Movimientos de caja con origen gasto distinto de gasto_tipo_id.',
    ...countWhere({
      table: 'caja.movimientos_caja',
      where: "origen_tipo = 'gasto' AND gasto_tipo_id IS NOT NULL AND origen_id IS NOT NULL AND origen_id <> gasto_tipo_id",
      fields: 'id, turno_id, gasto_tipo_id, origen_tipo, origen_id, tipo, monto',
    }),
  },
  {
    id: 'caja.cierres_turno_id_huerfano',
    area: 'caja',
    severity: 'critical',
    description: 'Cierres de caja con turno_id inexistente.',
    ...orphan({ child: 'caja.cierres_caja', childColumn: 'turno_id', parent: 'caja.turnos' }),
  },
  {
    id: 'proveedores.pagos_proveedor_id_huerfano',
    area: 'proveedores',
    severity: 'warn',
    description: 'Pagos a proveedores con proveedor_id inexistente.',
    ...orphan({ child: 'catalogo.pagos_proveedores', childColumn: 'proveedor_id', parent: 'catalogo.proveedores' }),
  },
  {
    id: 'proveedores.detalle_pago_id_huerfano',
    area: 'proveedores',
    severity: 'critical',
    description: 'Detalles de factura proveedor con pago_id inexistente.',
    ...orphan({ child: 'catalogo.detalle_facturas_proveedor', childColumn: 'pago_id', parent: 'catalogo.pagos_proveedores' }),
  },
  {
    id: 'proveedores.detalle_codigo_interno_sin_producto',
    area: 'proveedores',
    severity: 'warn',
    description: 'Detalles de factura proveedor con codigo_interno que no existe en productos.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM catalogo.detalle_facturas_proveedor d
      WHERE d.codigo_interno IS NOT NULL
        AND trim(d.codigo_interno) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM catalogo.productos p
          WHERE upper(trim(p.codigo_interno)) = upper(trim(d.codigo_interno))
        )
    `),
    sampleSql: (limit) => q(`
      SELECT d.id, d.pago_id, d.codigo_interno, d.cantidad
      FROM catalogo.detalle_facturas_proveedor d
      WHERE d.codigo_interno IS NOT NULL
        AND trim(d.codigo_interno) <> ''
        AND NOT EXISTS (
          SELECT 1 FROM catalogo.productos p
          WHERE upper(trim(p.codigo_interno)) = upper(trim(d.codigo_interno))
        )
      ORDER BY d.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'proveedores.pagos_stock_aplicado_sin_movimiento_bodega',
    area: 'proveedores',
    severity: 'critical',
    description: 'Pagos proveedor marcados como stock aplicado sin movimientos de bodega vinculados.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM catalogo.pagos_proveedores p
      WHERE p.stock_aplicado_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM bodega.movimientos m
          WHERE m.pago_proveedor_id = p.id
             OR (m.origen_tipo = 'pago_proveedor' AND m.origen_id = p.id)
        )
    `),
    sampleSql: (limit) => q(`
      SELECT p.id, p.proveedor_id, p.codigo_proveedor, p.documento, p.n_doc, p.stock_aplicado_at
      FROM catalogo.pagos_proveedores p
      WHERE p.stock_aplicado_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM bodega.movimientos m
          WHERE m.pago_proveedor_id = p.id
             OR (m.origen_tipo = 'pago_proveedor' AND m.origen_id = p.id)
        )
      ORDER BY p.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'taller.odts_orden_id_nulo',
    area: 'taller',
    severity: 'critical',
    description: 'ODTs sin orden/trabajo comercial asociado.',
    ...countWhere({ table: 'taller.odts', where: 'orden_id IS NULL', fields: 'id, cliente_nombre, descripcion, estado, created_at' }),
  },
  {
    id: 'taller.odts_orden_id_huerfano',
    area: 'taller',
    severity: 'warn',
    description: 'ODTs con orden_id inexistente.',
    ...orphan({ child: 'taller.odts', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'taller.odt_items_odt_id_huerfano',
    area: 'taller',
    severity: 'critical',
    description: 'Items ODT con odt_id inexistente.',
    ...orphan({ child: 'taller.odt_items', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'taller.odt_items_sin_taller',
    area: 'taller',
    severity: 'critical',
    description: 'Items ODT sin asignacion a taller especifico.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM taller.odt_items i
      WHERE NOT EXISTS (
        SELECT 1 FROM taller.odt_item_talleres t
        WHERE t.odt_item_id = i.id
      )
    `),
    sampleSql: (limit) => q(`
      SELECT i.id, i.odt_id, i.producto_id, i.codigo_interno, i.nombre, i.cantidad, i.estado
      FROM taller.odt_items i
      WHERE NOT EXISTS (
        SELECT 1 FROM taller.odt_item_talleres t
        WHERE t.odt_item_id = i.id
      )
      ORDER BY i.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'taller.odt_items_producto_id_huerfano',
    area: 'taller',
    severity: 'critical',
    description: 'Items ODT con producto_id inexistente.',
    ...orphan({ child: 'taller.odt_items', childColumn: 'producto_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'taller.odt_items_cantidad_invalida',
    area: 'taller',
    severity: 'critical',
    description: 'Items ODT con cantidad <= 0.',
    ...countWhere({ table: 'taller.odt_items', where: 'cantidad <= 0', fields: 'id, odt_id, producto_id, cantidad' }),
  },
  {
    id: 'taller.odt_item_talleres_item_id_huerfano',
    area: 'taller',
    severity: 'critical',
    description: 'Estados taller por item con odt_item_id inexistente.',
    ...orphan({ child: 'taller.odt_item_talleres', childColumn: 'odt_item_id', parent: 'taller.odt_items' }),
  },
  {
    id: 'taller.odt_item_talleres_taller_id_huerfano',
    area: 'taller',
    severity: 'critical',
    description: 'Estados taller por item con taller_id inexistente.',
    ...orphan({ child: 'taller.odt_item_talleres', childColumn: 'taller_id', parent: 'taller.talleres' }),
  },
  {
    id: 'taller.bitacora_odt_id_nulo',
    area: 'taller',
    severity: 'warn',
    description: 'Bitacora taller sin ODT/trabajo asociado.',
    ...countWhere({ table: 'taller.bitacora_taller', where: 'odt_id IS NULL', fields: 'id, usuario, fecha, usuario_reporta, sucursal_id, texto' }),
  },
  {
    id: 'taller.bitacora_odt_id_huerfano',
    area: 'taller',
    severity: 'warn',
    description: 'Bitacora taller con odt_id inexistente.',
    ...orphan({ child: 'taller.bitacora_taller', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'taller.materiales_odt_id_nulo',
    area: 'taller',
    severity: 'warn',
    description: 'Materiales taller sin ODT/trabajo asociado.',
    ...countWhere({ table: 'taller.taller_materiales', where: 'odt_id IS NULL', fields: 'id, codigo_interno, nombre, cantidad, taller' }),
  },
  {
    id: 'taller.materiales_odt_id_huerfano',
    area: 'taller',
    severity: 'warn',
    description: 'Materiales taller con odt_id inexistente.',
    ...orphan({ child: 'taller.taller_materiales', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'taller.historial_materiales_odt_id_nulo',
    area: 'taller',
    severity: 'warn',
    description: 'Historial de materiales taller sin ODT/trabajo asociado.',
    ...countWhere({ table: 'taller.taller_historial_materiales', where: 'odt_id IS NULL', fields: 'id, codigo_interno, nombre, egreso, ingreso, usuario, fecha, taller' }),
  },
  {
    id: 'taller.historial_materiales_odt_id_huerfano',
    area: 'taller',
    severity: 'warn',
    description: 'Historial de materiales taller con odt_id inexistente.',
    ...orphan({ child: 'taller.taller_historial_materiales', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'despachos.despacho_orden_id_nulo',
    area: 'despachos',
    severity: 'warn',
    description: 'Despachos sin orden asociada.',
    ...countWhere({ table: 'bodega.despachos', where: 'orden_id IS NULL', fields: 'id, interno, fecha_interno, fecha_entrega, tipo_despacho, transporte' }),
  },
  {
    id: 'despachos.despacho_orden_id_huerfano',
    area: 'despachos',
    severity: 'warn',
    description: 'Despachos con orden_id inexistente.',
    ...orphan({ child: 'bodega.despachos', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'despachos.despacho_odt_id_huerfano',
    area: 'despachos',
    severity: 'critical',
    description: 'Despachos con odt_id inexistente.',
    ...orphan({ child: 'bodega.despachos', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'despachos.despacho_origen_tipo_nulo',
    area: 'despachos',
    severity: 'warn',
    description: 'Despachos sin origen_tipo auditable.',
    ...countWhere({
      table: 'bodega.despachos',
      where: "origen_tipo IS NULL OR trim(origen_tipo) = ''",
      fields: 'id, orden_id, odt_id, interno, fecha_entrega, tipo_despacho',
    }),
  },
  {
    id: 'despachos.despacho_interno_mismatch',
    area: 'despachos',
    severity: 'warn',
    description: 'Despachos con interno distinto del n_interno de la orden.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM bodega.despachos d
      JOIN ventas.ordenes o ON o.id = d.orden_id
      WHERE d.interno IS NOT NULL
        AND trim(d.interno) ~ '^[0-9]+$'
        AND o.n_interno IS NOT NULL
        AND trim(d.interno)::int <> o.n_interno
    `),
    sampleSql: (limit) => q(`
      SELECT d.id, d.orden_id, d.odt_id, d.interno, o.n_interno AS orden_n_interno
      FROM bodega.despachos d
      JOIN ventas.ordenes o ON o.id = d.orden_id
      WHERE d.interno IS NOT NULL
        AND trim(d.interno) ~ '^[0-9]+$'
        AND o.n_interno IS NOT NULL
        AND trim(d.interno)::int <> o.n_interno
      ORDER BY d.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'despachos.despacho_odt_orden_mismatch',
    area: 'despachos',
    severity: 'critical',
    description: 'Despachos con odt_id que pertenece a otra orden.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM bodega.despachos d
      JOIN taller.odts t ON t.id = d.odt_id
      WHERE d.orden_id IS NOT NULL
        AND t.orden_id IS NOT NULL
        AND d.orden_id <> t.orden_id
    `),
    sampleSql: (limit) => q(`
      SELECT d.id, d.orden_id, d.odt_id, t.orden_id AS odt_orden_id
      FROM bodega.despachos d
      JOIN taller.odts t ON t.id = d.odt_id
      WHERE d.orden_id IS NOT NULL
        AND t.orden_id IS NOT NULL
        AND d.orden_id <> t.orden_id
      ORDER BY d.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'despachos.guia_orden_id_nulo',
    area: 'despachos',
    severity: 'warn',
    description: 'Guias de despacho sin orden asociada.',
    ...countWhere({ table: 'bodega.guias_despachos', where: 'orden_id IS NULL', fields: 'id, n_interno, n_guia, fecha_guia, origen' }),
  },
  {
    id: 'despachos.guia_orden_id_huerfano',
    area: 'despachos',
    severity: 'warn',
    description: 'Guias de despacho con orden_id inexistente.',
    ...orphan({ child: 'bodega.guias_despachos', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'despachos.guia_odt_id_huerfano',
    area: 'despachos',
    severity: 'critical',
    description: 'Guias de despacho con odt_id inexistente.',
    ...orphan({ child: 'bodega.guias_despachos', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'despachos.guia_origen_tipo_nulo',
    area: 'despachos',
    severity: 'warn',
    description: 'Guias de despacho sin origen_tipo auditable.',
    ...countWhere({
      table: 'bodega.guias_despachos',
      where: "origen_tipo IS NULL OR trim(origen_tipo) = ''",
      fields: 'id, orden_id, odt_id, n_interno, n_guia, fecha_guia',
    }),
  },
  {
    id: 'despachos.guia_n_interno_mismatch',
    area: 'despachos',
    severity: 'warn',
    description: 'Guias con orden_id valido pero n_interno distinto al de la orden.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM bodega.guias_despachos g
      JOIN ventas.ordenes o ON o.id = g.orden_id
      WHERE g.n_interno IS NOT NULL
        AND o.n_interno IS NOT NULL
        AND g.n_interno <> o.n_interno
    `),
    sampleSql: (limit) => q(`
      SELECT g.id, g.orden_id, g.n_interno AS guia_n_interno, o.n_interno AS orden_n_interno
      FROM bodega.guias_despachos g
      JOIN ventas.ordenes o ON o.id = g.orden_id
      WHERE g.n_interno IS NOT NULL
        AND o.n_interno IS NOT NULL
        AND g.n_interno <> o.n_interno
      ORDER BY g.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'despachos.guia_odt_orden_mismatch',
    area: 'despachos',
    severity: 'critical',
    description: 'Guias con odt_id que pertenece a otra orden.',
    countSql: q(`
      SELECT count(*)::int AS count
      FROM bodega.guias_despachos g
      JOIN taller.odts t ON t.id = g.odt_id
      WHERE g.orden_id IS NOT NULL
        AND t.orden_id IS NOT NULL
        AND g.orden_id <> t.orden_id
    `),
    sampleSql: (limit) => q(`
      SELECT g.id, g.orden_id, g.odt_id, t.orden_id AS odt_orden_id, g.n_guia
      FROM bodega.guias_despachos g
      JOIN taller.odts t ON t.id = g.odt_id
      WHERE g.orden_id IS NOT NULL
        AND t.orden_id IS NOT NULL
        AND g.orden_id <> t.orden_id
      ORDER BY g.id
      LIMIT ${limit}
    `),
  },
  {
    id: 'bodega.movimientos_producto_id_huerfano',
    area: 'bodega',
    severity: 'critical',
    description: 'Movimientos de bodega con producto_id inexistente.',
    ...orphan({ child: 'bodega.movimientos', childColumn: 'producto_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'bodega.movimientos_user_id_huerfano',
    area: 'bodega',
    severity: 'warn',
    description: 'Movimientos de bodega con user_id inexistente.',
    ...orphan({ child: 'bodega.movimientos', childColumn: 'user_id', parent: 'auth.users' }),
  },
  {
    id: 'bodega.movimientos_origen_tipo_nulo',
    area: 'bodega',
    severity: 'warn',
    description: 'Movimientos de bodega sin origen_tipo auditable.',
    ...countWhere({
      table: 'bodega.movimientos',
      where: "origen_tipo IS NULL OR trim(origen_tipo) = ''",
      fields: 'id, producto_id, tipo, cantidad, motivo, created_at',
    }),
  },
  {
    id: 'bodega.movimientos_orden_id_huerfano',
    area: 'bodega',
    severity: 'critical',
    description: 'Movimientos de bodega con orden_id inexistente.',
    ...orphan({ child: 'bodega.movimientos', childColumn: 'orden_id', parent: 'ventas.ordenes' }),
  },
  {
    id: 'bodega.movimientos_odt_id_huerfano',
    area: 'bodega',
    severity: 'critical',
    description: 'Movimientos de bodega con odt_id inexistente.',
    ...orphan({ child: 'bodega.movimientos', childColumn: 'odt_id', parent: 'taller.odts' }),
  },
  {
    id: 'bodega.movimientos_pago_proveedor_id_huerfano',
    area: 'bodega',
    severity: 'critical',
    description: 'Movimientos de bodega con pago_proveedor_id inexistente.',
    ...orphan({ child: 'bodega.movimientos', childColumn: 'pago_proveedor_id', parent: 'catalogo.pagos_proveedores' }),
  },
  {
    id: 'bodega.movimientos_egreso_manual_sin_trabajo',
    area: 'bodega',
    severity: 'warn',
    description: 'Egresos manuales de bodega sin orden ni ODT asociada.',
    ...countWhere({
      table: 'bodega.movimientos',
      where: `
        tipo = 'egreso'
        AND orden_id IS NULL
        AND odt_id IS NULL
        AND COALESCE(NULLIF(trim(origen_tipo), ''), 'manual') = 'manual'
      `,
      fields: 'id, producto_id, cantidad, motivo, user_id, created_at',
    }),
  },
  {
    id: 'catalogo.producto_categoria_id_huerfano',
    area: 'productos',
    severity: 'warn',
    description: 'Productos con categoria_id inexistente.',
    ...orphan({ child: 'catalogo.productos', childColumn: 'categoria_id', parent: 'catalogo.categorias' }),
  },
  {
    id: 'catalogo.producto_subcategoria_id_huerfano',
    area: 'productos',
    severity: 'warn',
    description: 'Productos con subcategoria_id inexistente.',
    ...orphan({ child: 'catalogo.productos', childColumn: 'subcategoria_id', parent: 'catalogo.subcategorias' }),
  },
  {
    id: 'catalogo.subcategoria_categoria_id_huerfano',
    area: 'productos',
    severity: 'critical',
    description: 'Subcategorias con categoria_id inexistente.',
    ...orphan({ child: 'catalogo.subcategorias', childColumn: 'categoria_id', parent: 'catalogo.categorias' }),
  },
  {
    id: 'catalogo.relacion_producto_id_huerfano',
    area: 'productos',
    severity: 'critical',
    description: 'Relacion de productos con producto_id inexistente.',
    ...orphan({ child: 'catalogo.relacion_productos', childColumn: 'producto_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'catalogo.relacion_relacionado_id_huerfano',
    area: 'productos',
    severity: 'critical',
    description: 'Relacion de productos con relacionado_id inexistente.',
    ...orphan({ child: 'catalogo.relacion_productos', childColumn: 'relacionado_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'catalogo.precio_historial_producto_id_huerfano',
    area: 'productos',
    severity: 'warn',
    description: 'Historial de precios con producto_id inexistente.',
    ...orphan({ child: 'catalogo.precio_historial', childColumn: 'producto_id', parent: 'catalogo.productos' }),
  },
  {
    id: 'fechas.operacionales_anomalas',
    area: 'fechas',
    severity: 'warn',
    description: 'Fechas operacionales anteriores a 2000-01-01 o mas de 1 ano en el futuro.',
    ...dateAnomaly({
      items: [
        { table: 'ventas.ordenes', column: 'created_at' },
        { table: 'ventas.ordenes', column: 'fecha_estado_entrega' },
        { table: 'ventas.cotizacion_licitacion', column: 'fecha' },
        { table: 'ventas.cotizacion_licitacion', column: 'fecha_creacion' },
        { table: 'ventas.orden_compra_online', column: 'fecha_hora' },
        { table: 'caja.movimientos_caja', column: 'fecha' },
        { table: 'caja.movimientos_caja', column: 'created_at' },
        { table: 'catalogo.pagos_proveedores', column: 'fecha_doc' },
        { table: 'catalogo.pagos_proveedores', column: 'fecha_pago' },
        { table: 'catalogo.pagos_proveedores', column: 'fecha_vencimiento' },
        { table: 'taller.odts', column: 'fecha_ingreso' },
        { table: 'taller.odts', column: 'fecha_inicio' },
        { table: 'taller.odts', column: 'fecha_termino' },
        { table: 'taller.bitacora_taller', column: 'fecha' },
        { table: 'bodega.guias_despachos', column: 'fecha_guia' },
        { table: 'bodega.despachos', column: 'fecha_interno' },
        { table: 'bodega.despachos', column: 'fecha_entrega' },
      ],
    }),
  },
]

function readLocalEnv() {
  try {
    const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
    for (const line of env.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m && process.env[m[1].trim()] === undefined) {
        process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
      }
    }
  } catch {}
}

function toPlain(value) {
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toPlain)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]))
  }
  return value
}

function rowCount(row) {
  return Number(row?.count ?? row?.c ?? 0)
}

function sqlState(error) {
  return error?.code || error?.meta?.code || error?.cause?.code || 'UNKNOWN'
}

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    json: false,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    failOn: 'critical',
  }

  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg === '--no-fail') options.failOn = 'none'
    else if (arg.startsWith('--samples=')) {
      const raw = Number(arg.slice('--samples='.length))
      if (Number.isInteger(raw) && raw >= 0) {
        options.sampleLimit = Math.min(raw, MAX_SAMPLE_LIMIT)
      }
    } else if (arg.startsWith('--fail-on=')) {
      const value = arg.slice('--fail-on='.length)
      if (['critical', 'warn', 'info', 'none'].includes(value)) options.failOn = value
    }
  }

  return options
}

export async function runCheck(prisma, check, sampleLimit = DEFAULT_SAMPLE_LIMIT) {
  try {
    const countRows = await prisma.$queryRawUnsafe(check.countSql)
    const count = rowCount(countRows[0])
    const samples = count > 0 && sampleLimit > 0 && check.sampleSql
      ? (await prisma.$queryRawUnsafe(check.sampleSql(sampleLimit))).map(toPlain)
      : []

    return {
      id: check.id,
      area: check.area,
      severity: check.severity,
      description: check.description,
      count,
      status: 'ok',
      samples,
    }
  } catch (error) {
    return {
      id: check.id,
      area: check.area,
      severity: check.severity,
      description: check.description,
      count: null,
      status: 'error',
      error: `${sqlState(error)}: ${error.message}`,
      samples: [],
    }
  }
}

export async function runAudit(prisma, checks = CHECKS, options = {}) {
  const sampleLimit = options.sampleLimit ?? DEFAULT_SAMPLE_LIMIT
  const results = []
  for (const check of checks) {
    results.push(await runCheck(prisma, check, sampleLimit))
  }
  return results
}

export function summarizeResults(results) {
  const summary = {
    totalChecks: results.length,
    okChecks: 0,
    errorChecks: 0,
    findings: 0,
    bySeverity: { critical: 0, warn: 0, info: 0 },
    byArea: {},
  }

  for (const result of results) {
    if (result.status === 'error') {
      summary.errorChecks++
      continue
    }

    summary.okChecks++
    if (result.count > 0) {
      summary.findings += result.count
      summary.bySeverity[result.severity] += result.count
      summary.byArea[result.area] = (summary.byArea[result.area] || 0) + result.count
    }
  }

  return summary
}

export function getExitCode(results, failOn = 'critical') {
  if (results.some((result) => result.status === 'error')) return 2
  if (failOn === 'none') return 0

  const threshold = severityRank[failOn]
  const hasFindingAtThreshold = results.some((result) =>
    result.status === 'ok' &&
    result.count > 0 &&
    severityRank[result.severity] >= threshold
  )
  return hasFindingAtThreshold ? 1 : 0
}

export function formatTextReport(results) {
  const summary = summarizeResults(results)
  const lines = []
  lines.push('')
  lines.push('=== Plastimar ERP data integrity audit (dry-run) ===')
  lines.push('')
  lines.push(`Checks: ${summary.okChecks}/${summary.totalChecks} ok, ${summary.errorChecks} errors`)
  lines.push(`Findings: ${summary.findings} total | critical=${summary.bySeverity.critical} warn=${summary.bySeverity.warn} info=${summary.bySeverity.info}`)

  const areaSummary = Object.entries(summary.byArea)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([area, count]) => `${area}=${count}`)
    .join(' ')
  lines.push(`Areas: ${areaSummary || 'none'}`)

  const findings = results
    .filter((result) => result.status === 'ok' && result.count > 0)
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.count - a.count || a.id.localeCompare(b.id))

  if (findings.length > 0) {
    lines.push('')
    lines.push('Findings:')
    for (const result of findings) {
      lines.push(`- [${result.severity}] ${result.id}: ${result.count} - ${result.description}`)
      for (const sample of result.samples) {
        lines.push(`  sample ${JSON.stringify(sample)}`)
      }
    }
  }

  const errors = results.filter((result) => result.status === 'error')
  if (errors.length > 0) {
    lines.push('')
    lines.push('Execution errors:')
    for (const result of errors) {
      lines.push(`- ${result.id}: ${result.error}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

async function createPrisma() {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import('@prisma/client'),
    import('@prisma/adapter-pg'),
  ])
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

async function main() {
  const options = parseArgs()
  readLocalEnv()

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. Set it in the environment or backend/.env.')
    process.exit(2)
  }

  const prisma = await createPrisma()
  try {
    const results = await runAudit(prisma, CHECKS, options)
    if (options.json) {
      console.log(JSON.stringify({ summary: summarizeResults(results), results }, null, 2))
    } else {
      console.log(formatTextReport(results))
      console.log(`Exit policy: --fail-on=${options.failOn}. Use --no-fail for report-only runs.`)
    }
    process.exitCode = getExitCode(results, options.failOn)
  } finally {
    await prisma.$disconnect()
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exit(2)
  })
}
