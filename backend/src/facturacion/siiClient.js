// Cliente de servicios del SII.
// - Facturas/notas/guías: SOAP (semilla/token) + upload multipart en maullin
//   (certificación) o palena (producción).
// - Boletas: API REST (apicert/api para auth, pangal/rahue para envío).
// Se usan requests https nativos: los servidores del SII tienen cadenas TLS
// antiguas y user-agents restringidos.

import https from 'node:https';
import { XML_DECL, tag } from './xmlUtil.js';
import { signXml } from './firma.js';

export const HOSTS = {
  certificacion: {
    soap: 'maullin.sii.cl',
    boletaApi: 'apicert.sii.cl',
    boletaEnvio: 'pangal.sii.cl'
  },
  produccion: {
    soap: 'palena.sii.cl',
    boletaApi: 'api.sii.cl',
    boletaEnvio: 'rahue.sii.cl'
  }
};

const USER_AGENT = 'Mozilla/4.0 (compatible; PROG 1.0; Plastimar ERP)';

const request = (options, body) => new Promise((resolve, reject) => {
  const req = https.request({
    rejectUnauthorized: false,
    timeout: 60000,
    ...options,
    headers: { 'User-Agent': USER_AGENT, ...options.headers }
  }, (res) => {
    const chunks = [];
    res.on('data', (chunk) => chunks.push(chunk));
    res.on('end', () => resolve({
      status: res.statusCode,
      headers: res.headers,
      body: Buffer.concat(chunks).toString('utf8'),
      bodyLatin1: Buffer.concat(chunks).toString('latin1')
    }));
  });
  req.on('error', reject);
  req.on('timeout', () => { req.destroy(new Error('Timeout consultando al SII.')); });
  if (body) req.write(body);
  req.end();
});

const soapEnvelope = (method, args = '', namespace = 'https://DefaultNamespace') =>
  '<?xml version="1.0" encoding="UTF-8"?>'
  + '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" '
  + 'xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
  + `<SOAP-ENV:Body><m:${method} xmlns:m="${namespace}" SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">${args}</m:${method}></SOAP-ENV:Body>`
  + '</SOAP-ENV:Envelope>';

const soapCall = async (host, path, method, args, namespace) => {
  const body = soapEnvelope(method, args, namespace);
  const res = await request({
    host,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);
  if (res.status !== 200) throw new Error(`SII ${method} respondió HTTP ${res.status}.`);
  // La respuesta SOAP trae el XML interno escapado
  const inner = res.body
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
  return inner;
};

const extractTag = (xml, tagName) => {
  const match = String(xml).match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match ? match[1].trim() : null;
};

const numberTag = (xml, tagName) => {
  const value = extractTag(xml, tagName);
  return value === null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
};

export const parseEstadoEnvio = (xml) => ({
  estado: extractTag(xml, 'ESTADO'),
  glosa: extractTag(xml, 'GLOSA'),
  resumen: {
    tipoDte: numberTag(xml, 'TIPO_DOCTO'),
    informados: numberTag(xml, 'INFORMADOS'),
    aceptados: numberTag(xml, 'ACEPTADOS'),
    rechazados: numberTag(xml, 'RECHAZADOS'),
    reparos: numberTag(xml, 'REPAROS')
  },
  respuesta: xml
});

// --- Autenticación DTE (SOAP) ---

export const getSemilla = async (ambiente) => {
  const xml = await soapCall(HOSTS[ambiente].soap, '/DTEWS/CrSeed.jws', 'getSeed');
  const semilla = extractTag(xml, 'SEMILLA');
  if (!semilla) throw new Error(`No se pudo obtener semilla del SII: ${xml.slice(0, 300)}`);
  return semilla;
};

const buildTokenRequest = (semilla, cert) => {
  const doc = `<getToken><item><Semilla>${semilla}</Semilla></item></getToken>`;
  const signature = signXml(doc, '', cert);
  return `${XML_DECL}\n<getToken><item><Semilla>${semilla}</Semilla></item>${signature}</getToken>`;
};

export const getToken = async (ambiente, cert) => {
  const semilla = await getSemilla(ambiente);
  const firmado = buildTokenRequest(semilla, cert);
  const xml = await soapCall(
    HOSTS[ambiente].soap,
    '/DTEWS/GetTokenFromSeed.jws',
    'getToken',
    tag('pszXml', firmado)
  );
  const token = extractTag(xml, 'TOKEN');
  if (!token) {
    const glosa = extractTag(xml, 'GLOSA') || xml.slice(0, 300);
    throw new Error(`SII rechazó la autenticación: ${glosa}`);
  }
  return token;
};

// --- Upload EnvioDTE (multipart) ---

export const uploadEnvioDte = async ({ ambiente, token, rutEnvia, rutEmisor, filename, xmlLatin1 }) => {
  const host = HOSTS[ambiente].soap;
  const boundary = `----PlastimarERP${Date.now()}`;
  const [senderBody, senderDv] = rutEnvia.split('-');
  const [companyBody, companyDv] = rutEmisor.split('-');

  const field = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

  const parts = Buffer.concat([
    Buffer.from(
      field('rutSender', senderBody)
      + field('dvSender', senderDv)
      + field('rutCompany', companyBody)
      + field('dvCompany', companyDv)
      + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/xml\r\n\r\n`,
      'latin1'
    ),
    xmlLatin1,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1')
  ]);

  const res = await request({
    host,
    path: '/cgi_dte/UPL/DTEUpload',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': parts.length,
      Cookie: `TOKEN=${token}`
    }
  }, parts);

  const trackId = extractTag(res.body, 'TRACKID');
  const estado = extractTag(res.body, 'STATUS');
  if (!trackId) {
    const detalle = extractTag(res.body, 'DETAIL') || res.body.slice(0, 400);
    throw new Error(`El SII no aceptó el envío (STATUS=${estado ?? '?'}): ${detalle}`);
  }
  return { trackId, respuesta: res.body };
};

// --- Estado de envío DTE (SOAP) ---

export const consultarEstadoEnvio = async ({ ambiente, token, rutEmisor, trackId }) => {
  const [rutBody, rutDv] = rutEmisor.split('-');
  const xml = await soapCall(
    HOSTS[ambiente].soap,
    '/DTEWS/QueryEstUp.jws',
    'getEstUp',
    tag('Rut', rutBody) + tag('Dv', rutDv) + tag('TrackId', trackId) + tag('Token', token)
  );
  return parseEstadoEnvio(xml);
};

export const consultarEstadoDte = async ({
  ambiente,
  token,
  rutConsultante,
  rutEmisor,
  rutReceptor,
  tipoDte,
  folio,
  fechaEmision,
  monto
}) => {
  const [consultanteBody, consultanteDv] = rutConsultante.split('-');
  const [emisorBody, emisorDv] = rutEmisor.split('-');
  const [receptorBody, receptorDv] = rutReceptor.split('-');
  const fechaDdmmaaaa = String(fechaEmision).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3$2$1');
  const host = HOSTS[ambiente].soap;
  const args = [
    ['RutConsultante', consultanteBody],
    ['DvConsultante', consultanteDv],
    ['RutCompania', emisorBody],
    ['DvCompania', emisorDv],
    ['RutReceptor', receptorBody],
    ['DvReceptor', receptorDv],
    ['TipoDte', tipoDte],
    ['FolioDte', folio],
    ['FechaEmisionDte', fechaDdmmaaaa],
    ['MontoDte', monto],
    ['Token', token]
  ].map(([name, value]) => tag(name, value)).join('');
  const xml = await soapCall(
    host,
    '/DTEWS/QueryEstDte.jws',
    'getEstDte',
    args,
    `https://${host}/DTEWS/QueryEstDte.jws`
  );
  return {
    estado: extractTag(xml, 'ESTADO'),
    glosa: extractTag(xml, 'GLOSA_ESTADO') || extractTag(xml, 'GLOSA'),
    errorCodigo: extractTag(xml, 'ERR_CODE'),
    errorGlosa: extractTag(xml, 'GLOSA_ERR'),
    numeroAtencion: extractTag(xml, 'NUM_ATENCION'),
    respuesta: xml
  };
};

// --- Boletas: API REST ---

export const getTokenBoleta = async (ambiente, cert) => {
  const host = HOSTS[ambiente].boletaApi;
  const semillaRes = await request({ host, path: '/recursos/v1/boleta.electronica.semilla', method: 'GET' });
  const semilla = extractTag(semillaRes.body, 'SEMILLA');
  if (!semilla) throw new Error(`No se pudo obtener semilla de boletas: ${semillaRes.body.slice(0, 300)}`);

  const firmado = buildTokenRequest(semilla, cert);
  const tokenRes = await request({
    host,
    path: '/recursos/v1/boleta.electronica.token',
    method: 'POST',
    headers: { 'Content-Type': 'application/xml', Accept: 'application/xml' }
  }, Buffer.from(firmado, 'utf8'));
  const token = extractTag(tokenRes.body, 'TOKEN');
  if (!token) throw new Error(`SII rechazó autenticación de boletas: ${tokenRes.body.slice(0, 300)}`);
  return token;
};

export const uploadEnvioBoleta = async ({ ambiente, token, rutEnvia, rutEmisor, filename, xmlLatin1 }) => {
  const host = HOSTS[ambiente].boletaEnvio;
  const boundary = `----PlastimarERP${Date.now()}`;
  const [senderBody, senderDv] = rutEnvia.split('-');
  const [companyBody, companyDv] = rutEmisor.split('-');

  const field = (name, value) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;

  const parts = Buffer.concat([
    Buffer.from(
      field('rutSender', senderBody)
      + field('dvSender', senderDv)
      + field('rutCompany', companyBody)
      + field('dvCompany', companyDv)
      + `--${boundary}\r\nContent-Disposition: form-data; name="archivo"; filename="${filename}"\r\nContent-Type: text/xml\r\n\r\n`,
      'latin1'
    ),
    xmlLatin1,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1')
  ]);

  const res = await request({
    host,
    path: '/recursos/v1/boleta.electronica.envio',
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': parts.length,
      Cookie: `TOKEN=${token}`,
      Accept: 'application/json'
    }
  }, parts);

  let json = null;
  try { json = JSON.parse(res.body); } catch { /* noop */ }
  const trackId = json?.trackid ?? json?.trackId ?? extractTag(res.body, 'TRACKID');
  if (!trackId) throw new Error(`El SII no aceptó el envío de boletas (HTTP ${res.status}): ${res.body.slice(0, 400)}`);
  return { trackId: String(trackId), respuesta: res.body };
};

export const consultarEstadoBoleta = async ({ ambiente, token, rutEmisor, trackId }) => {
  const host = HOSTS[ambiente].boletaApi;
  const res = await request({
    host,
    path: `/recursos/v1/boleta.electronica.envio/${rutEmisor}-${trackId}`,
    method: 'GET',
    headers: { Cookie: `TOKEN=${token}`, Accept: 'application/json' }
  });
  let json = null;
  try { json = JSON.parse(res.body); } catch { /* texto plano */ }

  const estadistica = Array.isArray(json?.estadistica) && json.estadistica[0] ? json.estadistica[0] : null;
  const repRech = Array.isArray(json?.detalle_rep_rech) && json.detalle_rep_rech[0] ? json.detalle_rep_rech[0] : null;

  const estadoDte = repRech?.estado || null;
  const descripcionDte = repRech?.descripcion || null;
  const erroresDte = Array.isArray(repRech?.error)
    ? repRech.error.map(e => e.descripcion || e.detalle).filter(Boolean).join('; ')
    : null;

  const glosa = [
    descripcionDte,
    erroresDte,
    json?.glosa
  ].filter(Boolean).join(' — ') || (json?.estado === 'EPR' ? 'Envío Procesado por el SII' : json?.estado);

  return {
    estado: json?.estado ?? null,
    glosa,
    resumen: estadistica ? {
      tipoDte: estadistica.tipo,
      informados: estadistica.informados,
      aceptados: estadistica.aceptados,
      rechazados: estadistica.rechazados,
      reparos: estadistica.reparos
    } : null,
    detalleDte: repRech ? {
      estado: repRech.estado,
      glosa: descripcionDte,
      errorGlosa: erroresDte
    } : null,
    respuesta: res.body
  };
};
