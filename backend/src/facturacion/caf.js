// Parser de archivos CAF (Código de Autorización de Folios) del SII.
// El CAF es un XML <AUTORIZACION> que contiene el rango de folios autorizado,
// la llave privada RSA con que se firma el TED y el bloque <CAF> que viaja
// dentro de cada timbre.

const extract = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`));
  return match ? match[1].trim() : null;
};

const extractRaw = (xml, tagName) => {
  const match = xml.match(new RegExp(`<${tagName}(?:\\s[^>]*)?>[\\s\\S]*?</${tagName}>`));
  return match ? match[0] : null;
};

export const parseCaf = (xmlString) => {
  const xml = String(xmlString || '');
  const cafBlock = extractRaw(xml, 'CAF');
  if (!cafBlock) throw new Error('El archivo no es un CAF válido: falta el elemento <CAF>.');

  const da = extract(cafBlock, 'DA');
  if (!da) throw new Error('CAF inválido: falta el elemento <DA>.');

  const rutEmisor = extract(da, 'RE');
  const razonSocial = extract(da, 'RS');
  const tipoDte = Number(extract(da, 'TD'));
  const rango = extract(da, 'RNG') || '';
  const folioDesde = Number(extract(rango, 'D'));
  const folioHasta = Number(extract(rango, 'H'));
  const fechaAutorizacion = extract(da, 'FA');
  const idk = extract(da, 'IDK');

  const privateKeyPem = extract(xml, 'RSASK');
  if (!privateKeyPem || !privateKeyPem.includes('PRIVATE KEY')) {
    throw new Error('CAF inválido: falta la llave privada <RSASK>.');
  }

  if (!Number.isFinite(tipoDte) || !Number.isFinite(folioDesde) || !Number.isFinite(folioHasta)) {
    throw new Error('CAF inválido: tipo de documento o rango de folios ilegible.');
  }

  return {
    rutEmisor,
    razonSocial,
    tipoDte,
    folioDesde,
    folioHasta,
    fechaAutorizacion,
    idk,
    privateKeyPem,
    // Bloque <CAF> textual: se incrusta tal cual dentro del TED. No se debe
    // reformatear porque su firma <FRMA> cubre los bytes originales.
    cafXml: cafBlock
  };
};
