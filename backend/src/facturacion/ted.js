// TED (Timbre Electrónico de Documentos): bloque firmado con la llave privada
// del CAF que viaja dentro de cada DTE y se imprime como código PDF417.
// La firma FRMT se calcula sobre los bytes ISO-8859-1 del elemento <DD> tal
// cual queda serializado (así lo verifican el SII y las apps de fiscalización).

import crypto from 'node:crypto';
import { tag, tags, formatMonto, formatTimestamp, sanitizeLatin1 } from './xmlUtil.js';

const truncate = (value, max) => sanitizeLatin1(value).slice(0, max);

export const buildTed = ({ rutEmisor, tipoDte, folio, fechaEmision, rutReceptor, razonReceptor, montoTotal, primerItem }, caf, timestamp = new Date()) => {
  const dd = tag('DD', [
    tags([
      ['RE', rutEmisor],
      ['TD', tipoDte],
      ['F', folio],
      ['FE', fechaEmision],
      ['RR', rutReceptor],
      ['RSR', truncate(razonReceptor, 40)],
      ['MNT', formatMonto(montoTotal)],
      ['IT1', truncate(primerItem, 40)]
    ]),
    caf.cafXml,
    tag('TSTED', formatTimestamp(timestamp))
  ].join(''), null, { raw: true });

  const frmt = crypto.createSign('RSA-SHA1')
    .update(Buffer.from(dd, 'latin1'))
    .sign(caf.privateKeyPem)
    .toString('base64');

  return `<TED version="1.0">${dd}<FRMT algoritmo="SHA1withRSA">${frmt}</FRMT></TED>`;
};
