// Utilidades XML para DTE SII.
// Los XML se generan directamente en forma canónica (C14N): entidades escapadas,
// sin tags autocerrados, atributos en el orden en que se declaran. Esto permite
// calcular digests/firmas sobre el string generado sin necesidad de un
// canonicalizador de terceros.

// Reemplazos de caracteres fuera de ISO-8859-1 que aparecen habitualmente al
// pegar texto (el SII exige ISO-8859-1 en los archivos DTE).
const NON_LATIN1_MAP = {
  '–': '-', '—': '-', '‘': "'", '’': "'",
  '“': '"', '”': '"', '…': '...', ' ': ' ',
  '•': '-', '€': 'EUR'
};

export const sanitizeLatin1 = (value) => {
  const text = String(value ?? '');
  let out = '';
  for (const ch of text) {
    if (ch === '\r') continue;
    const mapped = NON_LATIN1_MAP[ch];
    if (mapped !== undefined) { out += mapped; continue; }
    out += ch.codePointAt(0) <= 0xff ? ch : '?';
  }
  return out.trim();
};

// Escapes según C14N: texto escapa & < >, atributos escapan & < "
export const escapeText = (value) => sanitizeLatin1(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

export const escapeAttr = (value) => sanitizeLatin1(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/"/g, '&quot;');

// tag('Folio', 33) -> '<Folio>33</Folio>'
// tag('CAF', inner, { version: '1.0' }, { raw: true }) -> contenido sin escapar
export const tag = (name, content, attrs = null, opts = {}) => {
  const attrText = attrs
    ? Object.entries(attrs).map(([key, val]) => ` ${key}="${escapeAttr(val)}"`).join('')
    : '';
  if (content === null || content === undefined || content === '') {
    return `<${name}${attrText}></${name}>`;
  }
  const body = opts.raw ? String(content) : escapeText(content);
  return `<${name}${attrText}>${body}</${name}>`;
};

// Serializa una lista de pares [nombre, valor] omitiendo valores null/undefined.
// Mantiene el orden: los schemas del SII son secuencias estrictas.
export const tags = (pairs) => pairs
  .filter(([, value]) => value !== null && value !== undefined && value !== '')
  .map(([name, value, attrs, opts]) => tag(name, value, attrs, opts))
  .join('');

export const XML_DECL = '<?xml version="1.0" encoding="ISO-8859-1"?>';
export const SII_TIME_ZONE = 'America/Santiago';

export const toLatin1Buffer = (xmlString) => Buffer.from(xmlString, 'latin1');

// Formatos numéricos SII: montos enteros, cantidades hasta 6 decimales.
export const formatMonto = (value) => String(Math.round(Number(value) || 0));
export const formatQty = (value) => {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(6)));
};

const chileDateTimeParts = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha invalida para DTE: ${date}.`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SII_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
};

export const formatDate = (date = new Date()) => {
  // Una fecha tributaria sin hora ya representa un dia civil y no un instante:
  // conservarla evita moverla al dia anterior al interpretarla como UTC.
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const { year, month, day } = chileDateTimeParts(date);
  return `${year}-${month}-${day}`;
};

export const formatTimestamp = (date = new Date()) => {
  const { year, month, day, hour, minute, second } = chileDateTimeParts(date);
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
};

// RUT: normaliza a formato 'cuerpo-DV' y valida dígito verificador.
export const normalizeRut = (value) => {
  const clean = String(value || '').replace(/[.\s]/g, '').toUpperCase();
  const match = clean.match(/^(\d+)-?([\dK])$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
};

export const rutDv = (body) => {
  let sum = 0;
  let factor = 2;
  for (const digit of String(body).split('').reverse()) {
    sum += Number(digit) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const rest = 11 - (sum % 11);
  if (rest === 11) return '0';
  if (rest === 10) return 'K';
  return String(rest);
};

export const isValidRut = (value) => {
  const rut = normalizeRut(value);
  if (!rut) return false;
  const [body, dv] = rut.split('-');
  return rutDv(body) === dv;
};
