// Prueba minima del sobre EnvioDTE contra el SII en certificacion.
// Consume un folio real solo con --confirm.
//
// Preflight: node scripts/dev-test-caratula-sii.mjs --preflight
// Envio:     node scripts/dev-test-caratula-sii.mjs --confirm

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFacturacionDb } from '../src/facturacion/db.js';
import { createFacturacionEngine } from '../src/facturacion/engine.js';
import { parseCaf } from '../src/facturacion/caf.js';
import { buildDocumento } from '../src/facturacion/documento.js';
import { buildDte, buildEnvio } from '../src/facturacion/envio.js';
import { assertXmlSignatures, loadCertificate } from '../src/facturacion/firma.js';
import { formatTimestamp, normalizeRut } from '../src/facturacion/xmlUtil.js';
import * as sii from '../src/facturacion/siiClient.js';

const DATA_DIR = process.env.FACTURACION_DATA_DIR || 'data/facturacion';
const PREFLIGHT_ONLY = process.argv.includes('--preflight');
const CONFIRM_SEND = process.argv.includes('--confirm');
const INSPECT_DOCUMENT_ID = Number(process.argv.find(arg => arg.startsWith('--inspect-document='))?.split('=')[1] || 0);
const SYNC_DOCUMENT_ID = Number(process.argv.find(arg => arg.startsWith('--sync-document='))?.split('=')[1] || 0);
const POLL_ATTEMPTS = 18;
const POLL_INTERVAL_MS = 5000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const b64url = value => String(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

const verifyTed = (dteXml, caf) => {
  const dd = dteXml.match(/<DD>[\s\S]*?<\/DD>/)?.[0];
  const frmt = dteXml.match(/<FRMT\b[^>]*>([^<]+)<\/FRMT>/)?.[1];
  const modulus = caf.cafXml.match(/<M>([^<]+)<\/M>/)?.[1];
  const exponent = caf.cafXml.match(/<E>([^<]+)<\/E>/)?.[1];
  if (!dd || !frmt || !modulus || !exponent) return false;
  const publicKey = crypto.createPublicKey({
    key: { kty: 'RSA', n: b64url(modulus), e: b64url(exponent) },
    format: 'jwk'
  });
  return crypto.verify('RSA-SHA1', Buffer.from(dd, 'latin1'), publicKey, Buffer.from(frmt, 'base64'));
};

const receptor = {
  // Receptor ficticio publicado en el XML de ejemplo oficial del SII.
  rut: '77777777-7',
  razonSocial: 'EMPRESA LTDA',
  giro: 'COMPUTACION',
  direccion: 'SAN DIEGO 2222',
  comuna: 'LA FLORIDA',
  ciudad: 'SANTIAGO',
};

const items = [{
  codigo: 'TEST-CARATULA',
  nombre: 'PRUEBA CARATULA Y FIRMA SII',
  descripcion: 'DOCUMENTO SIN VALIDEZ TRIBUTARIA - CERTIFICACION',
  cantidad: 1,
  precio: 1000,
  unidad: 'UN',
}];

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL })
  });
  const db = createFacturacionDb(prisma);
  const engine = createFacturacionEngine({ db, dataDir: DATA_DIR });

  try {
    const empresaConfigurada = await db.getEmpresa();
    if (empresaConfigurada.ambiente !== 'certificacion') {
      throw new Error(`Ejecucion bloqueada: ambiente=${empresaConfigurada.ambiente || 'sin configurar'}, se requiere certificacion explicita.`);
    }
    const empresa = await engine.getEmpresa();
    const certificado = await engine.certInfo();
    if (!certificado.valido) {
      throw new Error(`Certificado no valido: ${certificado.error || 'no cargado'}.`);
    }
    const cert = loadCertificate(path.join(DATA_DIR, 'certificado.p12'), empresa.certPass);
    const firmante = normalizeRut(empresa.rutEnvia || cert.rutTitular);

    if (SYNC_DOCUMENT_ID) {
      const sincronizado = await engine.consultarEstado(SYNC_DOCUMENT_ID);
      console.log('ESTADO SINCRONIZADO ' + JSON.stringify({
        documentoId: sincronizado.documento.id,
        folio: sincronizado.documento.folio,
        trackId: sincronizado.documento.trackId,
        estado: sincronizado.documento.estado,
        estadoDetalle: sincronizado.documento.estadoDetalle,
        sii: sincronizado.sii,
      }));
      return;
    }

    if (INSPECT_DOCUMENT_ID) {
      const doc = await db.documentos.get(INSPECT_DOCUMENT_ID);
      if (!doc?.folio || !doc?.fechaEmision || !doc?.receptor?.rut) {
        throw new Error(`Documento ${INSPECT_DOCUMENT_ID} sin datos suficientes para QueryEstDte.`);
      }
      const token = await sii.getToken(empresa.ambiente, cert);
      const resultadoDte = await sii.consultarEstadoDte({
        ambiente: empresa.ambiente,
        token,
        rutConsultante: firmante,
        rutEmisor: normalizeRut(empresa.rut),
        rutReceptor: normalizeRut(doc.receptor.rut),
        tipoDte: doc.tipoDte,
        folio: doc.folio,
        fechaEmision: doc.fechaEmision,
        monto: doc.totales?.total,
      });
      console.log('ESTADO DTE ' + JSON.stringify({
        documentoId: doc.id,
        folio: doc.folio,
        trackId: doc.trackId,
        ...resultadoDte,
      }));
      return;
    }

    const cafs = await prisma.factCaf.findMany({
      where: {
        tipoDte: 33,
        ambiente: 'certificacion',
        fechaAutorizacion: { gte: empresa.fchResol }
      },
      orderBy: [{ fechaAutorizacion: 'desc' }, { folioDesde: 'asc' }],
      select: {
        id: true,
        folioDesde: true,
        folioHasta: true,
        siguienteFolio: true,
        fechaAutorizacion: true,
        xml: true
      },
    });
    const cafDisponible = cafs.find(caf => caf.siguienteFolio <= caf.folioHasta);
    if (!cafDisponible) throw new Error('No hay CAF de tipo 33 con folios disponibles en certificacion.');

    console.log('PREFLIGHT ' + JSON.stringify({
      empresaRut: empresa.rut,
      ambiente: empresa.ambiente,
      rutEnvia: empresa.rutEnvia || certificado.rutTitular,
      certRutTitular: certificado.rutTitular,
      fchResol: empresa.fchResol,
      nroResol: empresa.nroResol,
      timestampSii: formatTimestamp(new Date()),
      caf: {
        id: cafDisponible.id,
        folioDesde: cafDisponible.folioDesde,
        folioHasta: cafDisponible.folioHasta,
        siguienteFolio: cafDisponible.siguienteFolio,
        fechaAutorizacion: cafDisponible.fechaAutorizacion,
      },
      lineas: items.length,
    }));

    const timestamp = new Date();
    const caf = parseCaf(cafDisponible.xml);
    const { documentoXml } = buildDocumento({
      empresa,
      receptor,
      doc: { tipoDte: 33, folio: cafDisponible.siguienteFolio, items },
      caf,
      timestamp
    });
    const dteXml = buildDte(documentoXml, cert);
    const { xml: envioXml } = buildEnvio({
      dtes: [{ tipoDte: 33, dteXml }],
      empresa,
      cert,
      rutEnvia: firmante,
      timestamp
    });
    const firmasXml = assertXmlSignatures(envioXml, cert.certPem);
    const documentoTieneNamespaceLocal = /<(?:Documento|Liquidacion|Exportaciones)\b[^>]*\sxmlns(?::|=)/.test(dteXml);
    if (!verifyTed(dteXml, caf)) throw new Error('Preflight invalido: la firma FRMT del TED no verifica.');
    if (documentoTieneNamespaceLocal) throw new Error('Preflight invalido: el elemento tributario tiene namespaces locales no presentes en el ejemplo oficial.');
    console.log('VALIDACION XML ' + JSON.stringify({
      folioProspectivo: cafDisponible.siguienteFolio,
      firmasXml,
      frmt: 'valido',
      documentoNamespaces: 'heredados-desde-DTE',
    }));
    if (process.env.PREFLIGHT_XML_PATH) {
      fs.writeFileSync(process.env.PREFLIGHT_XML_PATH, envioXml, 'latin1');
      console.log(`XML PREFLIGHT escrito en ${process.env.PREFLIGHT_XML_PATH}`);
    }

    if (PREFLIGHT_ONLY) {
      console.log('PREFLIGHT OK: no se creo documento ni se consumio folio.');
      return;
    }
    if (!CONFIRM_SEND) {
      throw new Error('Ejecucion bloqueada: usa --confirm para consumir un folio y enviar al SII.');
    }

    const documento = await db.documentos.create({ tipoDte: 33, receptor, items });
    const emitido = await engine.emitir(documento.id);
    console.log(`EMITIDO documentoId=${emitido.id} tipo=33 folio=${emitido.folio} lineas=${emitido.items.length}`);

    const envio = await engine.enviar([emitido.id]);
    console.log(`ENVIADO trackId=${envio.trackId}`);

    let consulta = null;
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      consulta = await engine.consultarEstado(emitido.id);
      console.log(`CONSULTA ${attempt}/${POLL_ATTEMPTS} estado=${consulta.documento.estado} codigo=${consulta.sii?.estado || ''} glosa=${consulta.sii?.glosa || ''}`);
      if (['aceptado', 'rechazado'].includes(consulta.documento.estado)) break;
    }

    const final = await db.documentos.get(emitido.id);
    console.log('RESULTADO ' + JSON.stringify({
      documentoId: final.id,
      tipoDte: final.tipoDte,
      folio: final.folio,
      lineas: final.items.length,
      trackId: final.trackId,
      estado: final.estado,
      estadoDetalle: final.estadoDetalle,
      siiCodigo: consulta?.sii?.estado || null,
      siiGlosa: consulta?.sii?.glosa || null,
      siiRespuesta: consulta?.sii?.respuesta || null,
    }));
    if (final.estado !== 'aceptado') process.exitCode = 2;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('ERROR ' + JSON.stringify({ message: error.message }));
  process.exitCode = 1;
});
