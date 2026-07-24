// Sobres de envío al SII: EnvioDTE (facturas, notas, guías) y EnvioBOLETA.
// El DTE individual se firma standalone y luego se incrusta en el SetDTE,
// que a su vez se firma completo (mismo enfoque que LibreDTE).

import { XML_DECL, tag, tags, formatTimestamp, normalizeRut } from './xmlUtil.js';
import { signXml } from './firma.js';
import { isBoleta, SII_NS } from './documento.js';

export const RUT_SII = '60803000-K';
const C14N_ALGORITHM = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance';
const stripInheritedSiiNamespaces = (xml) => xml
  .replaceAll(`<DTE xmlns="${SII_NS}" `, '<DTE ')
  .replaceAll(`<Documento xmlns="${SII_NS}" `, '<Documento ')
  .replaceAll(`<Liquidacion xmlns="${SII_NS}" `, '<Liquidacion ')
  .replaceAll(`<Exportaciones xmlns="${SII_NS}" `, '<Exportaciones ');

const addLineBreaksPreservingTed = (xml) => {
  const ted = xml.match(/<TED\b[\s\S]*?<\/TED>/)?.[0];
  if (!ted) return xml.replaceAll('><', '>\n<');
  const index = xml.indexOf(ted);
  const before = xml.slice(0, index).replaceAll('><', '>\n<');
  const after = xml.slice(index + ted.length).replaceAll('><', '>\n<');
  return `${before}\n${ted}\n${after}`;
};

export const buildDte = (documentoXml, cert) => {
  const rootTag = documentoXml.match(/^<([A-Za-z][A-Za-z0-9]*)\s/);
  if (!rootTag) throw new Error('DTE inválido: falta el elemento raíz firmado.');
  const formattedDocumento = addLineBreaksPreservingTed(documentoXml);
  // Documento/Liquidacion/Exportaciones hereda los namespaces desde DTE en
  // el XML oficial. Firmamos dentro de ese mismo contexto para que C14N vea
  // los namespaces heredados sin agregarlos al elemento tributario.
  const signingContext = `<DTE xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">\n`
    + `${formattedDocumento}\n</DTE>`;
  const signature = signXml(signingContext, `#${documentoXml.match(/ID="([^"]+)"/)[1]}`, cert, {
    transformAlgorithm: C14N_ALGORITHM
  });
  return `<DTE xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" version="1.0">\n`
    + `${formattedDocumento}\n${signature}\n</DTE>`;
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
    ['RutEmisor', normalizeRut(empresa.rut) || empresa.rut],
    ['RutEnvia', rutEnvia],
    ['RutReceptor', RUT_SII],
    ['FchResol', empresa.fchResol],
    ['NroResol', String(empresa.nroResol ?? 0)],
    ['TmstFirmaEnv', formatTimestamp(timestamp)]
  ];
  const caratula = tag('Caratula', tags(caratulaCampos) + Array.from(subtotales.entries()).map(([tipo, cantidad]) =>
    tag('SubTotDTE', tags([['TpoDTE', tipo], ['NroDTE', cantidad]]), null, { raw: true })
  ).join(''), { version: '1.0' }, { raw: true }).replaceAll('><', '>\n<');

  const setId = 'SetDoc';
  const setDte = `<SetDTE xmlns="${SII_NS}" xmlns:xsi="${XSI_NS}" ID="${setId}">\n`
    + `${caratula}\n${dtes.map(d => d.dteXml).join('\n')}\n</SetDTE>`;
  const canonicalSetDte = stripInheritedSiiNamespaces(setDte);
  const signature = signXml(canonicalSetDte, `#${setId}`, cert, {
    transformAlgorithm: C14N_ALGORITHM,
    namespaces: `xmlns:xsi="${XSI_NS}"`
  });

  const rootTag = boletas ? 'EnvioBOLETA' : 'EnvioDTE';
  const schema = boletas ? 'EnvioBOLETA_v11.xsd' : 'EnvioDTE_v10.xsd';
  const envio = `${XML_DECL}\n<${rootTag} xmlns="${SII_NS}" `
    + `xmlns:xsi="${XSI_NS}" `
    + `xsi:schemaLocation="http://www.sii.cl/SiiDte ${schema}" version="1.0">\n`
    + `${setDte}\n${signature}\n</${rootTag}>`;

  return { xml: envio, esBoleta: boletas };
};
