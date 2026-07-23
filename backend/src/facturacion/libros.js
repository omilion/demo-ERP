// Libros electrónicos IECV (LibroCompraVenta, LibroGuia) y RCOF (ConsumoFolios)
// para el proceso de certificación SII. Mismo patrón de firma que EnvioDTE:
// el elemento con ID se declara con los namespaces, se firma con xml-crypto y
// la Signature va como hermano dentro del elemento raíz.
// Portado de HM ERP (D:\analytics\backend\src\facturacion\libros.js) a ESM.

import { XML_DECL, tag, tags, formatMonto, formatTimestamp, rutDv } from './xmlUtil.js';
import { signXml } from './firma.js';

const SII_NS = 'http://www.sii.cl/SiiDte';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';

const wrapLibro = ({ rootTag, schema, innerXml, innerId, cert }) => {
  const signature = signXml(innerXml, `#${innerId}`, cert, { transformAlgorithm: C14N_ALGORITHM });
  return `${XML_DECL}\n<${rootTag} xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" `
    + `xsi:schemaLocation="${SII_NS} ${schema}" version="1.0">\n`
    + innerXml + '\n'
    + signature + '\n'
    + `</${rootTag}>`;
};

const caratulaLibro = ({ empresa, rutEnvia, periodo, tipoOperacion, folioNotificacion }) => tag('Caratula', tags([
  ['RutEmisorLibro', empresa.rut],
  ['RutEnvia', rutEnvia],
  ['PeriodoTributario', periodo],
  ['FchResol', empresa.fchResol],
  ['NroResol', String(empresa.nroResol ?? 0)],
  ['TipoOperacion', tipoOperacion],
  // Certificación: libro ESPECIAL con el número de atención como FolioNotificacion
  ['TipoLibro', 'ESPECIAL'],
  ['TipoEnvio', 'TOTAL'],
  ['FolioNotificacion', folioNotificacion]
]), null, { raw: true });

// --- Libro de ventas / compras (LibroCV_v10.xsd) ---
// detalles: [{ tpoDoc, folio, fecha, rut, razonSocial, exento, neto, ivaNoRec, total, anulado }]
export const buildLibroCompraVenta = ({ empresa, cert, rutEnvia, periodo, tipoOperacion, folioNotificacion, detalles, timestamp = new Date() }) => {
  if (!detalles.length) throw new Error(`No hay documentos para el libro de ${tipoOperacion.toLowerCase()}.`);

  const porTipo = new Map();
  for (const det of detalles) {
    if (!porTipo.has(det.tpoDoc)) {
      porTipo.set(det.tpoDoc, { docs: 0, anulados: 0, exento: 0, neto: 0, iva: 0, ivaNoRec: 0, total: 0 });
    }
    const acc = porTipo.get(det.tpoDoc);
    acc.docs += 1;
    if (det.anulado) { acc.anulados += 1; continue; }
    acc.exento += det.exento || 0;
    acc.neto += det.neto || 0;
    acc.ivaNoRec += det.ivaNoRec || 0;
    // En ventas el IVA proviene del DTE; en compras se puede deducir desde
    // total - neto - exento cuando no viene informado separadamente.
    acc.iva += det.iva ?? Math.max(0, (det.total || 0) - (det.exento || 0) - (det.neto || 0));
    acc.total += det.total || 0;
  }

  const resumen = tag('ResumenPeriodo', Array.from(porTipo.entries()).map(([tpoDoc, acc]) =>
    tag('TotalesPeriodo', tags([
      ['TpoDoc', tpoDoc],
      ['TotDoc', acc.docs],
      ['TotAnulado', acc.anulados > 0 ? acc.anulados : null],
      // TotMntExe, TotMntNeto y TotMntIVA son obligatorios en el schema aunque sean 0
      ['TotMntExe', formatMonto(acc.exento)],
      ['TotMntNeto', formatMonto(acc.neto)],
      ['TotMntIVA', formatMonto(acc.iva)]
    ]) + (acc.ivaNoRec > 0
      ? tag('TotIVANoRec', tags([['CodIVANoRec', 1], ['TotOpIVANoRec', acc.docs], ['TotMntIVANoRec', formatMonto(acc.ivaNoRec)]]), null, { raw: true })
      : '')
      + tags([['TotMntTotal', formatMonto(acc.total)]]), null, { raw: true })
  ).join('\n'), null, { raw: true });

  const detalleXml = detalles.map(det => tag('Detalle', tags([
    ['TpoDoc', det.tpoDoc],
    ['NroDoc', det.folio],
    ['Anulado', det.anulado ? 'A' : null],
    ['FchDoc', det.fecha],
    ['RUTDoc', det.rut],
    ['RznSoc', det.razonSocial],
    ['MntExe', det.exento > 0 ? formatMonto(det.exento) : null],
    ['MntNeto', det.neto > 0 ? formatMonto(det.neto) : null]
  ]) + (det.ivaNoRec > 0
    ? tag('IVANoRec', tags([['CodIVANoRec', 1], ['MntIVANoRec', formatMonto(det.ivaNoRec)]]), null, { raw: true })
    : '')
    + tags([['MntTotal', formatMonto(det.total)]]), null, { raw: true })
  ).join('\n');

  const id = 'PlastimarLibro';
  const inner = `<EnvioLibro xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" ID="${id}">\n`
    + caratulaLibro({ empresa, rutEnvia, periodo, tipoOperacion, folioNotificacion }) + '\n'
    + resumen + '\n'
    + detalleXml + '\n'
    + tag('TmstFirma', formatTimestamp(timestamp)) + '\n'
    + '</EnvioLibro>';

  return wrapLibro({ rootTag: 'LibroCompraVenta', schema: 'LibroCV_v10.xsd', innerXml: inner, innerId: id, cert });
};

// --- Libro de guías (LibroGuia_v10.xsd) ---
// guias: [{ folio, fecha, indTraslado, rut, razonSocial, total, anulada, facturada: {tpoDocRef, folioRef, fechaRef} }]
export const buildLibroGuias = ({ empresa, cert, rutEnvia, periodo, folioNotificacion, guias, timestamp = new Date() }) => {
  if (!guias.length) throw new Error('No hay guías para el libro.');

  const anuladas = guias.filter(g => g.anulada).length;
  const ventas = guias.filter(g => !g.anulada && Number(g.indTraslado) === 1);
  const totalVentas = ventas.reduce((sum, g) => sum + (g.total || 0), 0);

  const resumen = tag('ResumenPeriodo', tags([
    ['TotFolAnulado', 0],
    ['TotGuiaAnulada', anuladas],
    ['TotGuiaVenta', ventas.length],
    ['TotMntGuiaVta', formatMonto(totalVentas)]
  ]), null, { raw: true });

  const detalleXml = guias.map(guia => tag('Detalle', tags([
    ['Folio', guia.folio],
    // Anulado es entero en LibroGuia: 1 = guía anulada
    ['Anulado', guia.anulada ? 1 : null],
    ['TpoOper', guia.indTraslado],
    ['FchDoc', guia.fecha],
    ['RUTDoc', guia.rut],
    ['RznSoc', guia.razonSocial],
    ['MntTotal', formatMonto(guia.total || 0)],
    ['TpoDocRef', guia.facturada ? guia.facturada.tpoDocRef : null],
    ['FolioDocRef', guia.facturada ? guia.facturada.folioRef : null],
    ['FchDocRef', guia.facturada ? guia.facturada.fechaRef : null]
  ]), null, { raw: true })).join('\n');

  const id = 'PlastimarLibroGuia';
  const inner = `<EnvioLibro xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" ID="${id}">\n`
    + tag('Caratula', tags([
      ['RutEmisorLibro', empresa.rut],
      ['RutEnvia', rutEnvia],
      ['PeriodoTributario', periodo],
      ['FchResol', empresa.fchResol],
      ['NroResol', String(empresa.nroResol ?? 0)],
      ['TipoLibro', 'ESPECIAL'],
      ['TipoEnvio', 'TOTAL'],
      ['FolioNotificacion', folioNotificacion]
    ]), null, { raw: true }) + '\n'
    + resumen + '\n'
    + detalleXml + '\n'
    + tag('TmstFirma', formatTimestamp(timestamp)) + '\n'
    + '</EnvioLibro>';

  return wrapLibro({ rootTag: 'LibroGuia', schema: 'LibroGuia_v10.xsd', innerXml: inner, innerId: id, cert });
};

// --- RCOF: Reporte de Consumo de Folios de boletas (ConsumoFolios_v10.xsd) ---
// resumenes: [{ tipoDocumento, exento, total, utilizados: [[ini,fin]...], anulados: [[ini,fin]...] }]
export const buildRcof = ({ empresa, cert, rutEnvia, fechaInicio, fechaFinal, secEnvio = 1, correlativo, resumenes, timestamp = new Date() }) => {
  if (!resumenes.length) throw new Error('No hay boletas para el reporte de consumo de folios.');

  const rangos = (nombre, lista) => (lista || []).map(([ini, fin]) =>
    tag(nombre, tags([['Inicial', ini], ['Final', fin]]), null, { raw: true })
  ).join('\n');

  const cuenta = (lista) => (lista || []).reduce((sum, [ini, fin]) => sum + (fin - ini + 1), 0);

  const resumenXml = resumenes.map(resumen => {
    const utilizados = cuenta(resumen.utilizados);
    const anulados = cuenta(resumen.anulados);
    return tag('Resumen', tags([
      ['TipoDocumento', resumen.tipoDocumento],
      ['MntExento', formatMonto(resumen.exento || 0)],
      ['MntTotal', formatMonto(resumen.total || 0)],
      ['FoliosEmitidos', utilizados + anulados],
      ['FoliosAnulados', anulados],
      ['FoliosUtilizados', utilizados]
    ]) + '\n' + rangos('RangoUtilizados', resumen.utilizados) + '\n' + rangos('RangoAnulados', resumen.anulados), null, { raw: true });
  }).join('\n');

  const id = 'PlastimarRcof';
  const inner = `<DocumentoConsumoFolios xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" ID="${id}">\n`
    + tag('Caratula', tags([
      ['RutEmisor', empresa.rut],
      ['RutEnvia', rutEnvia],
      ['FchResol', empresa.fchResol],
      ['NroResol', String(empresa.nroResol ?? 0)],
      ['FchInicio', fechaInicio],
      ['FchFinal', fechaFinal],
      ['Correlativo', correlativo ?? null],
      ['SecEnvio', secEnvio],
      ['TmstFirmaEnv', formatTimestamp(timestamp)]
    ]), { version: '1.0' }, { raw: true }) + '\n'
    + resumenXml + '\n'
    + '</DocumentoConsumoFolios>';

  return wrapLibro({ rootTag: 'ConsumoFolios', schema: 'ConsumoFolio_v10.xsd', innerXml: inner, innerId: id, cert });
};

// --- Datos del set de pruebas de Plastimar: libro de compras (atención 4964720) ---
// El set define documentos de proveedores ficticios con montos exactos dados
// por el SII; el RUT del proveedor es libre (debe ser válido). NO reusar
// valores de otra empresa/atención - son específicos por postulación.
const rutFicticio = (body) => `${body}-${rutDv(body)}`;

// Factura 781 es "CON IVA USO COMUN": el SII pide considerar un factor de
// proporcionalidad de 0.60 sobre el IVA (solo el 60% del IVA es recuperable,
// el resto va a ivaNoRec/costo). Factura de compra 9 es "RETENCION TOTAL DEL
// IVA": el comprador retiene el 100% del IVA (no hay IVA recuperable para
// Plastimar en esa línea, todo el 19% queda como ivaNoRec).
const iva19 = (neto) => Math.round(neto * 0.19);

export const COMPRAS_SET_PLASTIMAR = [
  { tpoDoc: 30, folio: 234, razonSocial: 'PROVEEDOR UNO LTDA', rutBody: 78885550, neto: 34117, ivaNoRec: iva19(34117) },
  { tpoDoc: 33, folio: 32, razonSocial: 'PROVEEDOR DOS SPA', rutBody: 76354771, exento: 9562, neto: 8512, ivaNoRec: iva19(8512) },
  { tpoDoc: 30, folio: 781, razonSocial: 'PROVEEDOR TRES SPA', rutBody: 76458364, neto: 29940, ivaNoRec: Math.round(iva19(29940) * 0.60) },
  { tpoDoc: 60, folio: 451, razonSocial: 'PROVEEDOR UNO LTDA', rutBody: 78885550, neto: 2803, ivaNoRec: iva19(2803) },
  { tpoDoc: 33, folio: 67, razonSocial: 'PROVEEDOR CUATRO EIRL', rutBody: 77123455, neto: 10872, ivaNoRec: iva19(10872) },
  // Factura de compra electrónica: Plastimar retiene el 100% del IVA, no es recuperable para este cálculo del libro.
  { tpoDoc: 46, folio: 9, razonSocial: 'PROVEEDOR CINCO EIRL', rutBody: 77987654, neto: 9999, ivaNoRec: 0 },
  { tpoDoc: 61, folio: 211, razonSocial: 'PROVEEDOR DOS SPA', rutBody: 76354771, neto: 6306, ivaNoRec: iva19(6306) }
].map(doc => ({
  tpoDoc: doc.tpoDoc,
  folio: doc.folio,
  rut: rutFicticio(doc.rutBody),
  razonSocial: doc.razonSocial,
  exento: doc.exento || 0,
  neto: doc.neto || 0,
  ivaNoRec: doc.ivaNoRec || 0,
  total: (doc.exento || 0) + (doc.neto || 0) + (doc.ivaNoRec || 0),
  fecha: null // se completa con el periodo al generar
}));
