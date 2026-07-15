// Construcción del elemento <Documento> de un DTE según los schemas del SII
// (DTE_v10.xsd para facturas/guías/notas, BOLETA_v11.xsd para boletas).
// El orden de los elementos es una secuencia estricta del schema: no reordenar.

import { tag, tags, formatMonto, formatQty, formatDate, formatTimestamp } from './xmlUtil.js';
import { buildTed } from './ted.js';

export const SII_NS = 'http://www.sii.cl/SiiDte';

export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  34: 'Factura No Afecta o Exenta Electrónica',
  39: 'Boleta Electrónica',
  41: 'Boleta No Afecta o Exenta Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica'
};

// Guía de despacho (DTE 52): IndTraslado y TipoDespacho son obligatorios segun
// el SII y no tienen default seguro (el motivo del traslado lo define quien emite).
export const IND_TRASLADO = {
  1: 'Operación constituye venta',
  2: 'Ventas por efectuar',
  3: 'Consignaciones',
  4: 'Entrega gratuita',
  5: 'Traslados internos',
  6: 'Otros traslados no venta',
  7: 'Guía de devolución',
  8: 'Traslado para exportación',
  9: 'Venta para exportación'
};

export const TIPO_DESPACHO = {
  1: 'Despacho por cuenta del receptor',
  2: 'Despacho por cuenta del emisor a instalaciones del cliente',
  3: 'Despacho por cuenta del emisor a otras instalaciones'
};

export const IVA_RATE = 19;

export const isBoleta = (tipoDte) => tipoDte === 39 || tipoDte === 41;
const siiText = (value, maxLength) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return maxLength ? text.slice(0, maxLength) : text;
};

// Calcula totales a partir de los ítems. Ítems con exento=true suman a MntExe;
// el resto a MntNeto con IVA 19%.
export const computeTotales = (items, tipoDte) => {
  let neto = 0;
  let exento = 0;
  for (const item of items) {
    const monto = Math.round((Number(item.cantidad) || 1) * (Number(item.precio) || 0))
      - Math.round(Number(item.descuentoMonto) || 0);
    if (item.exento) exento += monto;
    else neto += monto;
  }
  // Documentos exentos (34/41) no pueden declarar IVA: todo va a MntExe.
  if (tipoDte === 34 || tipoDte === 41) {
    exento += neto;
    neto = 0;
  }
  const iva = neto > 0 ? Math.round(neto * IVA_RATE / 100) : 0;
  return {
    neto: neto > 0 ? neto : null,
    exento: exento > 0 ? exento : null,
    tasaIva: neto > 0 ? IVA_RATE : null,
    iva: neto > 0 ? iva : null,
    total: neto + exento + iva
  };
};

const buildIdDoc = (doc, boleta) => {
  const extra = doc.extra || {};
  if (boleta) {
    return tag('IdDoc', tags([
      ['TipoDTE', doc.tipoDte],
      ['Folio', doc.folio],
      ['FchEmis', doc.fechaEmision],
      // 3 = boletas de venta y servicios
      ['IndServicio', extra.indServ ?? 3],
      ['PeriodoDesde', extra.periodoDesde],
      ['PeriodoHasta', extra.periodoHasta],
      ['FchVenc', extra.fechaVencimiento]
    ]), null, { raw: true });
  }
  return tag('IdDoc', tags([
    ['TipoDTE', doc.tipoDte],
    ['Folio', doc.folio],
    ['FchEmis', doc.fechaEmision],
    // Guía de despacho: TipoDespacho va antes de IndTraslado (orden de schema)
    ['TipoDespacho', doc.tipoDte === 52 ? extra.tipoDespacho : null],
    ['IndTraslado', doc.tipoDte === 52 ? extra.indTraslado : null],
    ['FmaPago', extra.formaPago],
    ['FchVenc', extra.fechaVencimiento]
  ]), null, { raw: true });
};

const buildEmisor = (empresa, boleta) => {
  if (boleta) {
    return tag('Emisor', tags([
      ['RUTEmisor', empresa.rut],
      ['RznSocEmisor', empresa.razonSocial],
      ['GiroEmisor', empresa.giro],
      ['DirOrigen', empresa.direccion],
      ['CmnaOrigen', empresa.comuna],
      ['CiudadOrigen', empresa.ciudad]
    ]), null, { raw: true });
  }
  return tag('Emisor', tags([
    ['RUTEmisor', empresa.rut],
    ['RznSoc', empresa.razonSocial],
    ['GiroEmis', empresa.giro],
    ['Acteco', empresa.acteco],
    ['DirOrigen', empresa.direccion],
    ['CmnaOrigen', empresa.comuna],
    ['CiudadOrigen', empresa.ciudad]
  ]), null, { raw: true });
};

const buildReceptor = (receptor, boleta) => tag('Receptor', tags([
  ['RUTRecep', receptor.rut],
  ['RznSocRecep', receptor.razonSocial],
  ['GiroRecep', boleta ? null : siiText(receptor.giro, 40)],
  ['CorreoRecep', boleta ? null : receptor.email],
  ['DirRecep', receptor.direccion],
  ['CmnaRecep', receptor.comuna],
  ['CiudadRecep', receptor.ciudad]
]), null, { raw: true });

const buildTotales = (totales) => tag('Totales', tags([
  ['MntNeto', totales.neto !== null ? formatMonto(totales.neto) : null],
  ['MntExe', totales.exento !== null ? formatMonto(totales.exento) : null],
  ['TasaIVA', totales.tasaIva],
  ['IVA', totales.iva !== null ? formatMonto(totales.iva) : null],
  ['MntTotal', formatMonto(totales.total)]
]), null, { raw: true });

const buildDetalle = (items, tipoDte) => items.map((item, index) => {
  const cantidad = Number(item.cantidad) || 1;
  const precio = Number(item.precio) || 0;
  const bruto = Math.round(cantidad * precio);
  const descuento = Math.round(Number(item.descuentoMonto) || 0);
  const exentoEnDocAfecto = item.exento && tipoDte !== 34 && tipoDte !== 41;
  return tag('Detalle', tags([
    ['NroLinDet', index + 1],
    ['CdgItem', item.codigo ? tags([['TpoCodigo', 'INT1'], ['VlrCodigo', siiText(item.codigo, 35)]]) : null, null, { raw: true }],
    // IndExe=1 marca la línea como exenta (sólo válido en documentos afectos;
    // en 34/41 el documento completo es exento y el indicador no se informa)
    ['IndExe', exentoEnDocAfecto ? 1 : null],
    ['NmbItem', siiText(item.nombre, 80)],
    ['DscItem', siiText(item.descripcion, 1000)],
    ['QtyItem', formatQty(cantidad)],
    // UnmdItem tiene maxLength=4 en el schema del SII; recortar evita rechazos.
    ['UnmdItem', siiText(item.unidad, 4)],
    ['PrcItem', precio > 0 ? formatQty(precio) : null],
    ['DescuentoMonto', descuento > 0 ? formatMonto(descuento) : null],
    ['MontoItem', formatMonto(bruto - descuento)]
  ]), null, { raw: true });
}).join('');

const buildReferencias = (referencias, boleta) => (referencias || []).map((ref, index) => {
  if (boleta) {
    // Boletas (set de pruebas): <CodRef>SET</CodRef><RazonRef>CASO-1</RazonRef>
    return tag('Referencia', tags([
      ['NroLinRef', index + 1],
      ['CodRef', ref.tipoDocRef === 'SET' ? 'SET' : ref.codRef],
      ['RazonRef', ref.razon]
    ]), null, { raw: true });
  }
  return tag('Referencia', tags([
    ['NroLinRef', index + 1],
    ['TpoDocRef', ref.tipoDocRef],
    ['FolioRef', ref.folioRef],
    ['FchRef', ref.fechaRef],
    ['CodRef', ref.codRef],
    ['RazonRef', ref.razon]
  ]), null, { raw: true });
}).join('');

// Construye el <Documento> completo (sin firma XMLDSIG, con TED).
export const buildDocumento = ({ empresa, receptor, doc, caf, timestamp = new Date() }) => {
  const boleta = isBoleta(doc.tipoDte);
  const items = doc.items || [];
  if (!items.length) throw new Error('El documento no tiene ítems.');
  const totales = computeTotales(items, doc.tipoDte);
  const fechaEmision = doc.fechaEmision || formatDate(timestamp);
  const id = `F${doc.folio}T${doc.tipoDte}`;

  const ted = buildTed({
    rutEmisor: empresa.rut,
    tipoDte: doc.tipoDte,
    folio: doc.folio,
    fechaEmision,
    rutReceptor: receptor.rut,
    razonReceptor: receptor.razonSocial,
    montoTotal: totales.total,
    primerItem: items[0].nombre
  }, caf, timestamp);

  const body = [
    tag('Encabezado', [
      buildIdDoc({ ...doc, fechaEmision }, boleta),
      buildEmisor(empresa, boleta),
      buildReceptor(receptor, boleta),
      buildTotales(totales)
    ].join(''), null, { raw: true }),
    buildDetalle(items, doc.tipoDte),
    buildReferencias(doc.referencias, boleta),
    ted,
    tag('TmstFirma', formatTimestamp(timestamp))
  ].join('');

  const documentoXml = `<Documento ID="${id}">${body}</Documento>`;
  return { id, documentoXml, ted, totales, fechaEmision };
};
