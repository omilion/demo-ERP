// Genera los libros IECV del Set de Pruebas y, sólo con --send, los transmite
// al SII. Por defecto no hace llamadas externas: deja XML firmados para
// revisión manual, evitando un envío tributario accidental.
//
// Uso (VPS):
//   node scripts/run-real-libros.mjs --period=2026-07
//   node scripts/run-real-libros.mjs --period=2026-07 --send

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFacturacionDb } from '../src/facturacion/db.js';
import { createFacturacionEngine } from '../src/facturacion/engine.js';
import { loadCertificate } from '../src/facturacion/firma.js';
import { buildLibroCompraVenta, COMPRAS_SET_PLASTIMAR } from '../src/facturacion/libros.js';
import { normalizeRut, toLatin1Buffer } from '../src/facturacion/xmlUtil.js';
import { getToken, uploadLibroCompraVenta } from '../src/facturacion/siiClient.js';

const DATA_DIR = 'data/facturacion';
const args = process.argv.slice(2);
const periodArg = args.find(arg => arg.startsWith('--period='));
const periodo = periodArg ? periodArg.slice('--period='.length) : new Date().toISOString().slice(0, 7);
const send = args.includes('--send');

if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
  throw new Error('El período debe tener formato YYYY-MM (por ejemplo, --period=2026-07).');
}

const detalleVenta = (doc) => ({
  tpoDoc: doc.tipoDte,
  folio: doc.folio,
  fecha: doc.fechaEmision,
  rut: doc.receptor?.rut,
  razonSocial: doc.receptor?.razonSocial,
  exento: Number(doc.totales?.exento || 0),
  neto: Number(doc.totales?.neto || 0),
  iva: Number(doc.totales?.iva || 0),
  total: Number(doc.totales?.total || 0),
  anulado: false
});

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const db = createFacturacionDb(prisma);
  const engine = createFacturacionEngine({ db, dataDir: DATA_DIR });

  try {
    const empresa = await engine.requireEmpresa();
    const certInfo = await engine.certInfo();
    if (!certInfo.valido) throw new Error(`Certificado no disponible: ${certInfo.error || 'no cargado'}.`);
    const cert = loadCertificate(path.join(DATA_DIR, 'certificado.p12'), empresa.certPass);
    const rutEnvia = normalizeRut(empresa.rutEnvia || cert.rutTitular);
    const rutEmisor = normalizeRut(empresa.rut);
    if (!rutEnvia || !rutEmisor) throw new Error('RUT de emisor o firmante inválido.');

    // Excluye borradores, emitidos locales, errores y folios huérfanos. Los
    // documentos aún "enviado" se incluyen porque el SII puede procesarlos
    // mientras se arma el libro del set.
    const documentos = await prisma.factDocumento.findMany({
      where: { estado: { in: ['enviado', 'aceptado'] }, fechaEmision: { startsWith: periodo } },
      orderBy: [{ tipoDte: 'asc' }, { folio: 'asc' }]
    });
    if (!documentos.length) {
      throw new Error(`No hay documentos enviados/aceptados para ${periodo}. Indica el período del Set de Pruebas.`);
    }
    if (documentos.some(doc => !doc.folio || !doc.fechaEmision || !doc.receptor?.rut || !doc.receptor?.razonSocial)) {
      throw new Error('Hay documentos del período sin folio, fecha o receptor; revisa sus datos antes de generar el libro.');
    }

    const ventas = documentos.map(detalleVenta);
    const compras = COMPRAS_SET_PLASTIMAR.map(doc => ({ ...doc, fecha: `${periodo}-01` }));
    const ventaXml = buildLibroCompraVenta({ empresa, cert, rutEnvia, periodo, tipoOperacion: 'VENTA', folioNotificacion: '4964719', detalles: ventas });
    const compraXml = buildLibroCompraVenta({ empresa, cert, rutEnvia, periodo, tipoOperacion: 'COMPRA', folioNotificacion: '4964720', detalles: compras });

    const outputDir = path.join(DATA_DIR, 'libros');
    fs.mkdirSync(outputDir, { recursive: true });
    const ventaPath = path.join(outputDir, `LibroVentas_${periodo}_4964719.xml`);
    const compraPath = path.join(outputDir, `LibroCompras_${periodo}_4964720.xml`);
    fs.writeFileSync(ventaPath, toLatin1Buffer(ventaXml));
    fs.writeFileSync(compraPath, toLatin1Buffer(compraXml));

    console.log(`Libro de ventas: ${ventas.length} documentos -> ${ventaPath}`);
    console.log(`Libro de compras: ${compras.length} documentos -> ${compraPath}`);
    if (!send) {
      console.log('No se envió nada al SII. Revisa los XML y vuelve a ejecutar con --send para transmitirlos.');
      return;
    }

    const token = await getToken(empresa.ambiente, cert);
    for (const [nombre, filename, xml] of [
      ['ventas', path.basename(ventaPath), ventaXml],
      ['compras', path.basename(compraPath), compraXml]
    ]) {
      const result = await uploadLibroCompraVenta({
        ambiente: empresa.ambiente, token, rutEnvia, rutEmisor, filename, xmlLatin1: toLatin1Buffer(xml)
      });
      console.log(`SII recibió libro de ${nombre}; trackId=${result.trackId}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
