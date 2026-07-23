// Genera los libros IECV del Set de Pruebas para carga manual en el portal
// SII. No transmite: no hay un contrato público de servicio web verificado
// para estos libros y no se debe reutilizar el endpoint de EnvioDTE. Guía
// SII: https://www.sii.cl/destacados/factura_electronica/guias_ayuda/como_generar_enviar_librocv.pdf
//
// Uso (VPS):
//   node scripts/run-real-libros.mjs --period=2026-07 --documentos=33:101,39:205

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

const DATA_DIR = 'data/facturacion';
const args = process.argv.slice(2);
const periodArg = args.find(arg => arg.startsWith('--period='));
const periodo = periodArg ? periodArg.slice('--period='.length) : new Date().toISOString().slice(0, 7);
const send = args.includes('--send');
const documentosArg = args.find(arg => arg.startsWith('--documentos='));

if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
  throw new Error('El período debe tener formato YYYY-MM (por ejemplo, --period=2026-07).');
}
if (send) {
  throw new Error('El envío automático de libros está deshabilitado. Genera los XML sin --send y cárgalos en el portal autenticado del SII tras validar el esquema y el set aplicable.');
}
if (!documentosArg) {
  throw new Error('Indica exactamente los documentos del Set con --documentos=tipo:folio,tipo:folio. No se incluyen automáticamente todos los DTE del período.');
}
const documentosSet = documentosArg.slice('--documentos='.length).split(',').filter(Boolean).map(value => {
  const [tipo, folio] = value.split(':').map(Number);
  if (!Number.isInteger(tipo) || !Number.isInteger(folio) || tipo <= 0 || folio <= 0) {
    throw new Error(`Documento inválido "${value}". Usa tipo:folio, por ejemplo 33:101.`);
  }
  return `${tipo}:${folio}`;
});

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
    const documentosPeriodo = await prisma.factDocumento.findMany({
      where: { estado: { in: ['enviado', 'aceptado'] }, fechaEmision: { startsWith: periodo } },
      orderBy: [{ tipoDte: 'asc' }, { folio: 'asc' }]
    });
    const documentos = documentosPeriodo.filter(doc => documentosSet.includes(`${doc.tipoDte}:${doc.folio}`));
    if (!documentos.length) {
      throw new Error(`No se encontraron documentos del Set enviados/aceptados para ${periodo}.`);
    }
    if (documentos.length !== new Set(documentosSet).size) {
      throw new Error('Falta al menos un documento solicitado o no está enviado/aceptado; no se generó un libro parcial.');
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
    console.log('No se envió nada al SII. Revisa y carga manualmente los XML en el portal autenticado del SII.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
