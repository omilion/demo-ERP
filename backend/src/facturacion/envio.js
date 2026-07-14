// Sobres de envío al SII: EnvioDTE (facturas, notas, guías) y EnvioBOLETA.
// El DTE individual se firma standalone y luego se incrusta en el SetDTE,
// que a su vez se firma completo (mismo enfoque que LibreDTE).

import { XML_DECL, tag, tags, formatTimestamp } from './xmlUtil.js';
import { signXml } from './firma.js';
import { isBoleta, SII_NS } from './documento.js';

export const RUT_SII = '60803000-K';
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const stripInheritedSiiNamespaces = (xml) => xml
  .replaceAll(`<DTE xmlns="${SII_NS}" `, '<DTE ')
  .replaceAll(`<Documento xmlns="${SII_NS}" `, '<Documento ');

export const buildDte = (documentoXml, cert) => {
  const canonicalDocumento = documentoXml.replace('<Documento ', `<Documento xmlns="${SII_NS}" `);
  const signature = signXml(canonicalDocumento, `#${documentoXml.match(/ID="([^"]+)"/)[1]}`, cert, {
    transformAlgorithm: C14N_ALGORITHM
  });
  return `<DTE xmlns="${SII_NS}" version="1.0">${canonicalDocumento}${signature}</DTE>`;
};

export const buildEnvio = ({ dtes, empresa, cert, rutEnvia, timestamp = new Date() }) => {
  if (!dtes.length) throw new Error('No hay documentos para enviar.');
  const boletas = dtes.every(d => isBoleta(d.tipoDte));
  const mixto = !boletas && dtes.some(d => isBoleta(d.tipoDte));
  if (mixto) throw new Error('Las boletas se envían en un sobre separado del resto de los DTE.');

  const subtotales = new Map();
  for (const dte of dtes) {
    subtotales.set(dte.tipoDte, (subtotales.get(dte.tipoDte) || 0) + 1);
  }

  const caratulaCampos = [
    ['RutEmisor', empresa.rut],
    ['RutEnvia', rutEnvia],
    ['RutReceptor', RUT_SII],
    ['FchResol', empresa.fchResol],
    ['NroResol', String(empresa.nroResol ?? 0)],
    ['TmstFirmaEnv', formatTimestamp(timestamp)]
  ];
  const caratula = tag('Caratula', tags(caratulaCampos) + Array.from(subtotales.entries()).map(([tipo, cantidad]) =>
    tag('SubTotDTE', tags([['TpoDTE', tipo], ['NroDTE', cantidad]]), null, { raw: true })
  ).join(''), { version: '1.0' }, { raw: true });

  const setId = 'SetDoc';
  const setDte = `<SetDTE xmlns="${SII_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ID="${setId}">${caratula}${dtes.map(d => d.dteXml).join('')}</SetDTE>`;
  const canonicalSetDte = stripInheritedSiiNamespaces(setDte);
  const signature = signXml(canonicalSetDte, `#${setId}`, cert, {
    transformAlgorithm: C14N_ALGORITHM,
    namespaces: 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
  });

  const rootTag = boletas ? 'EnvioBOLETA' : 'EnvioDTE';
  const schema = boletas ? 'EnvioBOLETA_v11.xsd' : 'EnvioDTE_v10.xsd';
  const envio = `${XML_DECL}\n<${rootTag} xmlns="${SII_NS}" `
    + 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
    + `xsi:schemaLocation="http://www.sii.cl/SiiDte ${schema}" version="1.0">`
    + setDte
    + signature
    + `</${rootTag}>`;

  return { xml: envio, esBoleta: boletas };
};
