// Construcción del elemento <Documento> de un DTE según los schemas del SII
// (DTE_v10.xsd para facturas/guías/notas, BOLETA_v11.xsd para boletas).
// El orden de los elementos es una secuencia estricta del schema: no reordenar.

import { tag, tags, formatMonto, formatQty, formatDate, formatTimestamp, normalizeRut } from './xmlUtil.js';
import { buildTed } from './ted.js';

export const SII_NS = 'http://www.sii.cl/SiiDte';

export const TIPOS_DTE = {
  33: 'Factura Electrónica',
  34: 'Factura No Afecta o Exenta Electrónica',
  39: 'Boleta Electrónica',
  41: 'Boleta No Afecta o Exenta Electrónica',
  43: 'Liquidación Factura Electrónica',
  46: 'Factura de Compra Electrónica',
  52: 'Guía de Despacho Electrónica',
  56: 'Nota de Débito Electrónica',
  61: 'Nota de Crédito Electrónica',
  110: 'Factura de Exportación Electrónica',
  111: 'Nota de Crédito de Exportación Electrónica',
  112: 'Nota de Débito de Exportación Electrónica'
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
// Regla operativa de Plastimar: cada DTE se limita a 20 lineas para que la
// preparacion, revision y trazabilidad del documento sigan siendo manejables.
export const MAX_DTE_DETAIL_LINES = 20;
export const MAX_DTE_COMMISSION_LINES = 20;

export const assertDteLineLimits = (doc = {}) => {
  const detailLines = Number(doc.tipoDte) === 43
    ? (Array.isArray(doc.detalles) ? doc.detalles.length : 0)
    : (Array.isArray(doc.items) ? doc.items.length : 0);
  if (detailLines > MAX_DTE_DETAIL_LINES) {
    throw new Error(`Máximo ${MAX_DTE_DETAIL_LINES} ítems por documento (límite operativo de Plastimar); tienes ${detailLines}. Divide en más de un documento.`);
  }
  const commissionLines = Array.isArray(doc.comisiones) ? doc.comisiones.length : 0;
  if (commissionLines > MAX_DTE_COMMISSION_LINES) {
    throw new Error(`Máximo ${MAX_DTE_COMMISSION_LINES} comisiones u otros cargos por documento (límite del SII); tienes ${commissionLines}.`);
  }
};

export const isBoleta = (tipoDte) => tipoDte === 39 || tipoDte === 41;
export const isExportacion = (tipoDte) => [110, 111, 112].includes(Number(tipoDte));
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

export const computeTotalesExportacion = (items = []) => {
  const exento = items.reduce((sum, item) => sum + Math.round((Number(item.cantidad) || 1) * (Number(item.precio) || 0)) - Math.round(Number(item.descuentoMonto) || 0), 0);
  return { neto: null, exento: exento || null, tasaIva: null, iva: null, total: exento };
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
  // empresa.rut se guarda con puntos (formato de display); el XML del SII
  // exige el RUT limpio (sin puntos), igual que RUTEmisor en el TED y en el
  // sobre EnvioDTE (ver ted.js/envio.js).
  const rutEmisor = normalizeRut(empresa.rut) || empresa.rut;
  if (boleta) {
    return tag('Emisor', tags([
      ['RUTEmisor', rutEmisor],
      ['RznSocEmisor', empresa.razonSocial],
      ['GiroEmisor', empresa.giro],
      ['DirOrigen', empresa.direccion],
      ['CmnaOrigen', empresa.comuna],
      ['CiudadOrigen', empresa.ciudad]
    ]), null, { raw: true });
  }
  return tag('Emisor', tags([
    ['RUTEmisor', rutEmisor],
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

// El Totales de Boleta (EnvioBOLETA_v11.xsd) NO tiene TasaIVA en su
// secuencia — solo Factura/Guia/NC/ND (DTE_v10.xsd) lo tienen. Mandarlo en
// una boleta rompe la validacion de TODO el bloque Totales: el validador
// del SII encuentra un tag que no reconoce ahi, pierde la secuencia y
// reporta "falta MntTotal" (aunque MntTotal si esta, mas abajo) — asi
// rechazo el SII boletas 6/7/8/16/17 el 2026-07-23/29 (LSX-00213).
const buildTotales = (totales, boleta) => tag('Totales', tags([
  ['MntNeto', totales.neto !== null ? formatMonto(totales.neto) : null],
  ['MntExe', totales.exento !== null ? formatMonto(totales.exento) : null],
  ...(boleta ? [] : [['TasaIVA', totales.tasaIva]]),
  ['IVA', totales.iva !== null ? formatMonto(totales.iva) : null],
  ['MntTotal', formatMonto(totales.total)]
]), null, { raw: true });

const buildDetalle = (items, tipoDte) => items.map((item, index) => {
  const cantidad = Number(item.cantidad) || 1;
  const precio = Number(item.precio) || 0;
  const bruto = Math.round(cantidad * precio);
  const descuento = Math.round(Number(item.descuentoMonto) || 0);
  const exentoEnDocAfecto = (item.exento && tipoDte !== 34 && tipoDte !== 41) || isExportacion(tipoDte);
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

const buildLiquidacionTotales = (totales = {}) => tag('Totales', tags([
  ['MntNeto', totales.neto !== null && totales.neto !== undefined ? formatMonto(totales.neto) : null],
  ['MntExe', totales.exento !== null && totales.exento !== undefined ? formatMonto(totales.exento) : null],
  ['TasaIVA', totales.tasaIva],
  ['IVA', totales.iva !== null && totales.iva !== undefined ? formatMonto(totales.iva) : null],
  ['IVAProp', totales.ivaProp !== null && totales.ivaProp !== undefined ? formatMonto(totales.ivaProp) : null],
  ['IVATerc', totales.ivaTerc !== null && totales.ivaTerc !== undefined ? formatMonto(totales.ivaTerc) : null],
  ['Comisiones', (totales.valComNeto !== undefined || totales.valComExe !== undefined || totales.valComIva !== undefined)
    ? tags([
      ['ValComNeto', totales.valComNeto !== undefined ? formatMonto(totales.valComNeto) : null],
      ['ValComExe', totales.valComExe !== undefined ? formatMonto(totales.valComExe) : null],
      ['ValComIVA', totales.valComIva !== undefined ? formatMonto(totales.valComIva) : null]
    ]) : null, null, { raw: true }],
  ['MntTotal', formatMonto(totales.total)]
]), null, { raw: true });

const buildLiquidacionDetalle = (detalles = []) => detalles.map((detalle, index) => tag('Detalle', tags([
  ['NroLinDet', index + 1],
  ['CdgItem', detalle.codigo ? tags([['TpoCodigo', detalle.tipoCodigo || 'INT1'], ['VlrCodigo', siiText(detalle.codigo, 35)]]) : null, null, { raw: true }],
  ['TpoDocLiq', detalle.tpoDocLiq],
  ['IndExe', detalle.exento ? 1 : null],
  ['NmbItem', siiText(detalle.nombre, 80)],
  ['DscItem', siiText(detalle.descripcion, 1000)],
  ['QtyItem', detalle.cantidad !== undefined ? formatQty(detalle.cantidad) : null],
  ['UnmdItem', siiText(detalle.unidad, 4)],
  ['PrcItem', detalle.precio !== undefined ? formatQty(detalle.precio) : null],
  ['MontoItem', formatMonto(detalle.monto)]
]), null, { raw: true })).join('');

const buildLiquidacionComisiones = (comisiones = []) => comisiones.map((comision, index) => tag('Comisiones', tags([
  ['NroLinCom', index + 1],
  ['TipoMovim', comision.tipoMovim],
  ['Glosa', siiText(comision.glosa, 60)],
  ['TasaComision', comision.tasaComision],
  ['ValComNeto', formatMonto(comision.valComNeto)],
  ['ValComExe', formatMonto(comision.valComExe)],
  ['ValComIVA', comision.valComIva !== undefined ? formatMonto(comision.valComIva) : null]
]), null, { raw: true })).join('');

// No hay UI para tipo 43: falta definir si Plastimar actúa como mandante o
// mandatario y el flujo comercial que origine la liquidación.
const buildLiquidacion = ({ empresa, receptor, doc, caf, timestamp }) => {
  const detalles = doc.detalles || [];
  if (!detalles.length) throw new Error('La liquidación no tiene detalles.');
  assertDteLineLimits(doc);
  if (!doc.totales || doc.totales.total === undefined) throw new Error('La liquidación requiere totales explícitos.');
  const fechaEmision = doc.fechaEmision || formatDate(timestamp);
  const id = `F${doc.folio}T43`;
  const extra = doc.extra || {};
  const liquidacionXml = `<Liquidacion ID="${id}">` + [
    tag('Encabezado', [
      tag('IdDoc', tags([['TipoDTE', 43], ['Folio', doc.folio], ['FchEmis', fechaEmision], ['FchVenc', extra.fechaVencimiento]]), null, { raw: true }),
      tag('Emisor', tags([
        ['RUTEmisor', normalizeRut(empresa.rut) || empresa.rut], ['RznSoc', empresa.razonSocial], ['GiroEmis', empresa.giro],
        ['Sucursal', extra.sucursal], ['Acteco', empresa.acteco], ['DirOrigen', empresa.direccion], ['CmnaOrigen', empresa.comuna], ['CiudadOrigen', empresa.ciudad],
        ['CdgVendedor', extra.codigoVendedor], ['RUTMandante', extra.rutMandante]
      ]), null, { raw: true }),
      tag('Receptor', tags([
        ['RUTRecep', receptor.rut], ['RznSocRecep', receptor.razonSocial], ['GiroRecep', siiText(receptor.giro, 40)], ['Contacto', receptor.contacto], ['CorreoRecep', receptor.email],
        ['DirRecep', receptor.direccion], ['CmnaRecep', receptor.comuna], ['CiudadRecep', receptor.ciudad]
      ]), null, { raw: true }),
      buildLiquidacionTotales(doc.totales)
    ].join(''), null, { raw: true }),
    buildLiquidacionDetalle(detalles),
    buildReferencias(doc.referencias, false),
    buildLiquidacionComisiones(doc.comisiones),
    buildTed({ rutEmisor: normalizeRut(empresa.rut) || empresa.rut, tipoDte: 43, folio: doc.folio, fechaEmision, rutReceptor: receptor.rut, razonReceptor: receptor.razonSocial, montoTotal: doc.totales.total, primerItem: detalles[0].nombre }, caf, timestamp),
    tag('TmstFirma', formatTimestamp(timestamp))
  ].join('') + '</Liquidacion>';
  return { id, documentoXml: liquidacionXml, totales: doc.totales, fechaEmision };
};

const buildDetalleExportacion = (items = []) => items.map((item, index) => {
  const cantidad = Number(item.cantidad) || 1;
  const precio = Number(item.precio) || 0;
  const descuento = Math.round(Number(item.descuentoMonto) || 0);
  const monto = item.monto !== undefined ? Number(item.monto) : Math.round(cantidad * precio) - descuento;
  return tag('Detalle', tags([
    ['NroLinDet', index + 1],
    ['CdgItem', item.codigo ? tags([['TpoCodigo', item.tipoCodigo || 'INT1'], ['VlrCodigo', siiText(item.codigo, 35)]]) : null, null, { raw: true }],
    ['IndExe', 1], ['NmbItem', siiText(item.nombre, 80)], ['QtyItem', formatQty(cantidad)], ['UnmdItem', siiText(item.unidad, 4)], ['PrcItem', formatQty(precio)],
    ['DescuentoPct', item.descuentoPct], ['DescuentoMonto', descuento > 0 ? formatMonto(descuento) : null], ['MontoItem', formatMonto(monto)]
  ]), null, { raw: true });
}).join('');

// No hay UI para exportación hasta que exista un flujo de negocio definido.
const buildExportacion = ({ empresa, receptor, doc, caf, timestamp }) => {
  const items = doc.items || [];
  if (!items.length) throw new Error('El documento de exportación no tiene ítems.');
  assertDteLineLimits(doc);
  const fechaEmision = doc.fechaEmision || formatDate(timestamp);
  const extra = doc.extra || {};
  const transporte = extra.transporte || {};
  const aduana = transporte.aduana || null;
  if (doc.tipoDte === 110 && !extra.fechaVencimiento) throw new Error('La factura de exportación requiere FchVenc.');
  if (aduana && (aduana.totBultos === undefined || !aduana.codPaisRecep)) throw new Error('Aduana requiere TotBultos y CodPaisRecep.');
  if ([111, 112].includes(doc.tipoDte) && !(doc.referencias || []).some(ref => String(ref.tipoDocRef) === '110' && [1, 3].includes(Number(ref.codRef)))) throw new Error('Las notas de exportación requieren referencia (CodRef 1 o 3) a una Factura de Exportación 110.');
  const totales = { ...computeTotalesExportacion(items), ...(doc.totales || {}) };
  const id = `F${doc.folio}T${doc.tipoDte}`;
  const aduanaXml = !aduana ? '' : (() => {
    const bultosXml = (aduana.tipoBultos || []).map(bulto => tag('TipoBultos', tags([
      ['CodTpoBultos', bulto.codTpoBultos], ['CantBultos', bulto.cantBultos], ['Marcas', bulto.marcas], ['IdContainer', bulto.idContainer], ['Sello', bulto.sello], ['EmisorSello', bulto.emisorSello]
    ]), null, { raw: true })).join('');
    return tag('Aduana', tags([
    ['CodModVenta', aduana.codModVenta], ['CodClauVenta', aduana.codClauVenta], ['TotClauVenta', aduana.totClauVenta !== undefined ? formatMonto(aduana.totClauVenta) : null], ['CodViaTransp', aduana.codViaTransp],
    ['NombreTransp', siiText(aduana.nombreTransp, 40)], ['RutCiaTransp', aduana.rutCiaTransp], ['NomCiaTransp', siiText(aduana.nomCiaTransp, 40)], ['IdAdicTransp', aduana.idAdicTransp], ['Booking', aduana.booking], ['Operador', aduana.operador],
    ['CodPtoEmbarque', aduana.codPtoEmbarque], ['IdAdicPtoEmb', aduana.idAdicPtoEmb], ['CodPtoDesemb', aduana.codPtoDesemb], ['IdAdicPtoDesemb', aduana.idAdicPtoDesemb],
    ['Tara', aduana.tara], ['CodUnidMedTara', aduana.codUnidMedTara], ['PesoBruto', aduana.pesoBruto], ['CodUnidPesoBruto', aduana.codUnidPesoBruto], ['PesoNeto', aduana.pesoNeto], ['CodUnidPesoNeto', aduana.codUnidPesoNeto],
    ['TotItems', aduana.totItems],
  ]) + bultosXml + tags([
    ['TotBultos', aduana.totBultos], ['MntFlete', aduana.mntFlete !== undefined ? formatMonto(aduana.mntFlete) : null], ['MntSeguro', aduana.mntSeguro !== undefined ? formatMonto(aduana.mntSeguro) : null], ['CodPaisRecep', aduana.codPaisRecep], ['CodPaisDestin', aduana.codPaisDestin]
  ]), null, { raw: true });
  })();
  const exportacionesXml = `<Exportaciones ID="${id}">` + [
    tag('Encabezado', [
      tag('IdDoc', tags([['TipoDTE', doc.tipoDte], ['Folio', doc.folio], ['FchEmis', fechaEmision], ['TipoDespacho', doc.tipoDte === 110 ? extra.tipoDespacho : null], ['FchVenc', extra.fechaVencimiento]]), null, { raw: true }),
      tag('Emisor', tags([['RUTEmisor', normalizeRut(empresa.rut) || empresa.rut], ['RznSoc', empresa.razonSocial], ['GiroEmis', empresa.giro], ['Telefono', empresa.telefono], ['CorreoEmisor', empresa.email], ['Acteco', empresa.acteco], ['DirOrigen', empresa.direccion], ['CmnaOrigen', empresa.comuna], ['CiudadOrigen', empresa.ciudad]]), null, { raw: true }),
      tag('Receptor', tags([['RUTRecep', receptor.rut], ['CdgIntRecep', receptor.codigoInterno], ['RznSocRecep', receptor.razonSocial], ['Extranjero', receptor.nacionalidad ? tag('Nacionalidad', receptor.nacionalidad) : null, null, { raw: true }], ['GiroRecep', receptor.giro], ['Contacto', receptor.contacto], ['CorreoRecep', receptor.email], ['DirRecep', receptor.direccion], ['CmnaRecep', receptor.comuna], ['CiudadRecep', receptor.ciudad]]), null, { raw: true }),
      (aduanaXml || transporte.dirDestino || transporte.comunaDestino || transporte.ciudadDestino) ? tag('Transporte', tags([['DirDest', transporte.dirDestino], ['CmnaDest', transporte.comunaDestino], ['CiudadDest', transporte.ciudadDestino]]) + aduanaXml, null, { raw: true }) : '',
      tag('Totales', tags([['TpoMoneda', extra.moneda], ['MntExe', totales.exento !== null ? formatMonto(totales.exento) : null], ['MntTotal', formatMonto(totales.total)]]), null, { raw: true }),
      extra.otraMoneda ? tag('OtraMoneda', tags([['TpoMoneda', extra.otraMoneda.tipoMoneda], ['TpoCambio', extra.otraMoneda.tipoCambio], ['MntExeOtrMnda', extra.otraMoneda.mntExe], ['MntTotOtrMnda', extra.otraMoneda.mntTotal]]), null, { raw: true }) : ''
    ].join(''), null, { raw: true }),
    buildDetalleExportacion(items), buildReferencias(doc.referencias, false),
    buildTed({ rutEmisor: normalizeRut(empresa.rut) || empresa.rut, tipoDte: doc.tipoDte, folio: doc.folio, fechaEmision, rutReceptor: receptor.rut, razonReceptor: receptor.razonSocial, montoTotal: totales.total, primerItem: items[0].nombre }, caf, timestamp), tag('TmstFirma', formatTimestamp(timestamp))
  ].join('') + '</Exportaciones>';
  return { id, documentoXml: exportacionesXml, totales, fechaEmision };
};

// Construye el <Documento> completo (sin firma XMLDSIG, con TED).
export const buildDocumento = ({ empresa, receptor, doc, caf, timestamp = new Date() }) => {
  if (doc.tipoDte === 43) return buildLiquidacion({ empresa, receptor, doc, caf, timestamp });
  if (isExportacion(doc.tipoDte)) return buildExportacion({ empresa, receptor, doc, caf, timestamp });
  const boleta = isBoleta(doc.tipoDte);
  // Boleta a consumidor final: el formulario permite emitir sin RUT/razon
  // social (el SII no lo exige y pedirlo de mas choca con la Ley de
  // Proteccion de Datos), pero el TED exige RR/RSR igual para todos los DTE.
  // Se usa el generico nacional 66666666-6 (mismo RUT que ya trae la data
  // legacy migrada para ventas de sala sin cliente identificado).
  if (boleta && !receptor?.rut) {
    receptor = { ...receptor, rut: '66666666-6', razonSocial: receptor?.razonSocial?.trim() || 'Consumidor Final' };
  }
  const items = doc.items || [];
  if (!items.length) throw new Error('El documento no tiene ítems.');
  assertDteLineLimits(doc);
  const totales = computeTotales(items, doc.tipoDte);
  const fechaEmision = doc.fechaEmision || formatDate(timestamp);
  const id = `F${doc.folio}T${doc.tipoDte}`;

  const ted = buildTed({
    rutEmisor: normalizeRut(empresa.rut) || empresa.rut,
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
      buildTotales(totales, boleta)
    ].join(''), null, { raw: true }),
    buildDetalle(items, doc.tipoDte),
    buildReferencias(doc.referencias, boleta),
    ted,
    tag('TmstFirma', formatTimestamp(timestamp))
  ].join('');

  const documentoXml = `<Documento ID="${id}">${body}</Documento>`;
  return { id, documentoXml, ted, totales, fechaEmision };
};
