// Emite y envia una Factura Electronica de 60 lineas al SII en certificacion.
// Consume un folio real de certificacion. Se niega a ejecutar en produccion.
//
// Preflight: cd backend && node scripts/dev-test-60-items.mjs --preflight
// Envio:     cd backend && node scripts/dev-test-60-items.mjs --confirm

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFacturacionDb } from '../src/facturacion/db.js';
import { createFacturacionEngine } from '../src/facturacion/engine.js';
import { rutDv } from '../src/facturacion/xmlUtil.js';

const DATA_DIR = 'data/facturacion';
const POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5000;
const PREFLIGHT_ONLY = process.argv.includes('--preflight');
const CONFIRM_SEND = process.argv.includes('--confirm');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const receptor = {
  rut: `5555555-${rutDv('5555555')}`,
  razonSocial: 'CLIENTE PRUEBA LIMITE 60 SII',
  giro: 'PRUEBAS CERTIFICACION SII',
  direccion: 'CALLE PRUEBA 123',
  comuna: 'SANTIAGO',
  ciudad: 'SANTIAGO',
  email: 'prueba@plastimar.cl',
};

const items = Array.from({ length: 60 }, (_, index) => ({
  nombre: `PRUEBA LIMITE SII ITEM ${String(index + 1).padStart(2, '0')}`,
  descripcion: 'DOCUMENTO SIN VALIDEZ TRIBUTARIA - CERTIFICACION',
  cantidad: 1,
  precio: 100 + index,
  unidad: 'UN',
}));

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const db = createFacturacionDb(prisma);
  const engine = createFacturacionEngine({ db, dataDir: DATA_DIR });
  let documento;

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
    const cafs = await prisma.factCaf.findMany({
      where: { tipoDte: 33, ambiente: 'certificacion' },
      orderBy: { folioDesde: 'asc' },
      select: { id: true, folioDesde: true, folioHasta: true, siguienteFolio: true },
    });
    const cafDisponible = cafs.find(caf => caf.siguienteFolio <= caf.folioHasta);
    if (!cafDisponible) throw new Error('No hay CAF de tipo 33 con folios disponibles en certificacion.');

    console.log(`Empresa: ${empresa.rut} (${empresa.razonSocial}), ambiente=${empresa.ambiente}`);
    console.log(`CAF 33 disponible: id=${cafDisponible.id}, rango=${cafDisponible.folioDesde}-${cafDisponible.folioHasta}, siguiente=${cafDisponible.siguienteFolio}.`);
    if (PREFLIGHT_ONLY) {
      console.log('PREFLIGHT OK: no se creo documento ni se consumio folio.');
      return;
    }
    if (!CONFIRM_SEND) {
      throw new Error('Ejecucion bloqueada: usa --confirm para consumir un folio y enviar al SII.');
    }
    console.log(`Detalle preparado: ${items.length} lineas.`);

    documento = await db.documentos.create({ tipoDte: 33, receptor, items });
    const emitido = await engine.emitir(documento.id);
    console.log(`Emitido: documentoId=${emitido.id}, tipo=33, folio=${emitido.folio}, lineas=${emitido.items.length}.`);

    const envio = await engine.enviar([emitido.id]);
    console.log(`Enviado: trackId=${envio.trackId}.`);

    let consulta = null;
    for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
      await sleep(POLL_INTERVAL_MS);
      consulta = await engine.consultarEstado(emitido.id);
      const codigo = consulta.sii?.estado || 'sin-codigo';
      const glosa = consulta.sii?.glosa || '';
      console.log(`Consulta ${attempt}/${POLL_ATTEMPTS}: estado=${consulta.documento.estado}, codigo=${codigo}, glosa=${glosa}`);
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
    }));

    if (final.estado !== 'aceptado') {
      process.exitCode = 2;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error('ERROR ' + JSON.stringify({
    documentoId: error.documentoId || null,
    message: error.message,
  }));
  process.exitCode = 1;
});
