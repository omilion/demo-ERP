// Corre el Set de Pruebas OFICIAL del SII (RUT 76.354.051-0, atenciones
// 4964718/4964722/4964724 + Set Prueba Boleta Electronica) usando el
// certificado y CAF REALES ya instalados: emite y ENVIA de verdad a
// maullin.sii.cl (ambiente certificacion). No genera cert/CAF sinteticos
// (a diferencia de dev-set-pruebas-sii.mjs) — asume que ya estan cargados.
//
// Fuente de los casos: SIISetDePruebas763540510.txt + Set Prueba BE.txt
// (documentos oficiales entregados por el SII para esta postulacion).
//
// NO cubre Liquidacion Factura (43), Factura de Compra (46) ni los
// documentos de Exportacion (110/111/112): el motor (documento.js) todavia
// no construye esos schemas XML. Se listan al final como pendiente.
//
// Uso: cd backend && node scripts/run-real-set-pruebas.mjs

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFacturacionDb } from '../src/facturacion/db.js';
import { createFacturacionEngine } from '../src/facturacion/engine.js';
import { rutDv } from '../src/facturacion/xmlUtil.js';

const DATA_DIR = 'data/facturacion';
const RECEPTOR_GENERICO = {
  rut: `5555555-${rutDv('5555555')}`,
  razonSocial: 'CLIENTE PRUEBA SET SII',
  giro: 'PRUEBAS SET SII',
  direccion: 'CALLE FALSA 123',
  comuna: 'SANTIAGO',
  ciudad: 'SANTIAGO',
  email: 'prueba@plastimar.cl'
};
const RECEPTOR_BOLETA = { rut: '66666666-6', razonSocial: 'CONSUMIDOR FINAL' };
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const pctDescuento = (cantidad, precio, pct) => Math.round(cantidad * precio * pct / 100);

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const db = createFacturacionDb(prisma);
  const engine = createFacturacionEngine({ db, dataDir: DATA_DIR });

  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);
  const empresa = await engine.getEmpresa();
  console.log(`Empresa: ${empresa.rut} (${empresa.razonSocial}), ambiente=${empresa.ambiente}`);
  const cert = await engine.certInfo();
  if (!cert.valido) throw new Error(`Certificado no valido: ${cert.error || 'no cargado'}`);
  console.log(`Certificado OK: ${cert.subject}\n`);

  const emitidos = {};
  const resultados = [];

  async function crearEmitirEnviar({ key, tipoDte, receptor, items, referencias, extra }) {
    try {
      const doc = await db.documentos.create({ tipoDte, receptor: receptor || {}, items, referencias: referencias || [], extra: extra || {} });
      const emitido = await engine.emitir(doc.id);
      emitidos[key] = emitido;
      const envio = await engine.enviar([doc.id]);
      resultados.push({ key, ok: true, tipoDte: emitido.tipoDte, folio: emitido.folio, trackId: envio.trackId });
      console.log(`   OK  ${key.padEnd(10)} tipo ${emitido.tipoDte} folio ${emitido.folio} -> trackId ${envio.trackId}`);
    } catch (err) {
      resultados.push({ key, ok: false, error: err.message });
      console.log(`   ERR ${key.padEnd(10)} ${err.message}`);
    }
    await sleep(1500); // no saturar los servidores del SII
  }

  console.log('=== SET BASICO (atencion 4964718) ===');
  await crearEmitirEnviar({
    key: 'basico-1', tipoDte: 33, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Cajon AFECTO', cantidad: 128, precio: 1161 },
      { nombre: 'Relleno AFECTO', cantidad: 55, precio: 1875 }
    ]
  });
  await crearEmitirEnviar({
    key: 'basico-2', tipoDte: 33, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Pañuelo AFECTO', cantidad: 283, precio: 2292, descuentoMonto: pctDescuento(283, 2292, 4) },
      { nombre: 'ITEM 2 AFECTO', cantidad: 211, precio: 1354, descuentoMonto: pctDescuento(211, 1354, 7) }
    ]
  });
  await crearEmitirEnviar({
    key: 'basico-3', tipoDte: 33, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Pintura B&W AFECTO', cantidad: 26, precio: 2441 },
      { nombre: 'ITEM 2 AFECTO', cantidad: 157, precio: 3036 },
      { nombre: 'ITEM 3 SERVICIO EXENTO', cantidad: 1, precio: 34759, exento: true }
    ]
  });
  // DESCUENTO GLOBAL 8% del set (documento.js no implementa DscRcgGlobal):
  // aproximado como descuento de linea en los items afectos, igual que en
  // el dry-run con certificado sintetico.
  await crearEmitirEnviar({
    key: 'basico-4', tipoDte: 33, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'ITEM 1 AFECTO', cantidad: 112, precio: 2065, descuentoMonto: pctDescuento(112, 2065, 8) },
      { nombre: 'ITEM 2 AFECTO', cantidad: 48, precio: 1942, descuentoMonto: pctDescuento(48, 1942, 8) },
      { nombre: 'ITEM 3 SERVICIO EXENTO', cantidad: 2, precio: 6773, exento: true }
    ]
  });
  await crearEmitirEnviar({
    key: 'basico-5', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Cajon AFECTO', cantidad: 128, precio: 1161 },
      { nombre: 'Relleno AFECTO', cantidad: 55, precio: 1875 }
    ],
    referencias: emitidos['basico-1'] ? [{ docLocalId: emitidos['basico-1'].id, codRef: 2, razon: 'CORRIGE GIRO DEL RECEPTOR' }] : []
  });
  await crearEmitirEnviar({
    key: 'basico-6', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Pañuelo AFECTO', cantidad: 104, precio: 2292 },
      { nombre: 'ITEM 2 AFECTO', cantidad: 143, precio: 1354 }
    ],
    referencias: emitidos['basico-2'] ? [{ docLocalId: emitidos['basico-2'].id, codRef: 3, razon: 'DEVOLUCION DE MERCADERIAS' }] : []
  });
  await crearEmitirEnviar({
    key: 'basico-7', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Pintura B&W AFECTO', cantidad: 26, precio: 2441 },
      { nombre: 'ITEM 2 AFECTO', cantidad: 157, precio: 3036 },
      { nombre: 'ITEM 3 SERVICIO EXENTO', cantidad: 1, precio: 34759, exento: true }
    ],
    referencias: emitidos['basico-3'] ? [{ docLocalId: emitidos['basico-3'].id, codRef: 1, razon: 'ANULA FACTURA' }] : []
  });
  await crearEmitirEnviar({
    key: 'basico-8', tipoDte: 56, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'Cajon AFECTO', cantidad: 128, precio: 1161 },
      { nombre: 'Relleno AFECTO', cantidad: 55, precio: 1875 }
    ],
    referencias: emitidos['basico-5'] ? [{ docLocalId: emitidos['basico-5'].id, codRef: 1, razon: 'ANULA NOTA DE CREDITO ELECTRONICA' }] : []
  });

  console.log('\n=== SET GUIA DE DESPACHO (atencion 4964722) ===');
  await crearEmitirEnviar({
    key: 'guia-1', tipoDte: 52, receptor: {},
    items: [
      { nombre: 'ITEM 1', cantidad: 62, precio: 0 },
      { nombre: 'ITEM 2', cantidad: 74, precio: 0 },
      { nombre: 'ITEM 3', cantidad: 40, precio: 0 }
    ],
    extra: { indTraslado: 5 } // traslado interno: receptor = emisor (automatico en engine.js)
  });
  await crearEmitirEnviar({
    key: 'guia-2', tipoDte: 52, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'ITEM 1', cantidad: 150, precio: 3449 },
      { nombre: 'ITEM 2', cantidad: 280, precio: 1132 }
    ],
    extra: { indTraslado: 1, tipoDespacho: 2 } // venta, traslado por el emisor
  });
  await crearEmitirEnviar({
    key: 'guia-3', tipoDte: 52, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'ITEM 1', cantidad: 108, precio: 1344 },
      { nombre: 'ITEM 2', cantidad: 188, precio: 2737 }
    ],
    extra: { indTraslado: 1, tipoDespacho: 1 } // venta, traslado por el cliente
  });

  console.log('\n=== SET FACTURA EXENTA (atencion 4964724) ===');
  await crearEmitirEnviar({
    key: 'exenta-1', tipoDte: 34, receptor: RECEPTOR_GENERICO,
    items: [{ nombre: 'HORAS PROGRAMADOR', cantidad: 2, precio: 2357, unidad: 'Hora' }]
  });
  await crearEmitirEnviar({
    key: 'exenta-2', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [{ nombre: 'HORAS PROGRAMADOR', cantidad: 2, precio: 295, unidad: 'Hora' }],
    referencias: emitidos['exenta-1'] ? [{ docLocalId: emitidos['exenta-1'].id, codRef: 3, razon: 'MODIFICA MONTO' }] : []
  });
  await crearEmitirEnviar({
    key: 'exenta-3', tipoDte: 34, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'SERV CONSULTORIA FACT ELECTRONICA', cantidad: 1, precio: 171501 },
      { nombre: 'SERV CONSULTORIA GUIA DESPACHO ELECT', cantidad: 1, precio: 193117 }
    ]
  });
  await crearEmitirEnviar({
    key: 'exenta-4', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'SERV CONSULTORIA FACT ELECTRONICA', cantidad: 1, precio: 171501 },
      { nombre: 'SERV CONSULTORIA GUIA DESPACHO ELECT', cantidad: 1, precio: 193117 }
    ],
    referencias: emitidos['exenta-3'] ? [{ docLocalId: emitidos['exenta-3'].id, codRef: 2, razon: 'CORRIGE GIRO' }] : []
  });
  await crearEmitirEnviar({
    key: 'exenta-5', tipoDte: 56, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'SERV CONSULTORIA FACT ELECTRONICA', cantidad: 1, precio: 171501 },
      { nombre: 'SERV CONSULTORIA GUIA DESPACHO ELECT', cantidad: 1, precio: 193117 }
    ],
    referencias: emitidos['exenta-4'] ? [{ docLocalId: emitidos['exenta-4'].id, codRef: 1, razon: 'ANULA NOTA DE CREDITO ELECTRONICA' }] : []
  });
  await crearEmitirEnviar({
    key: 'exenta-6', tipoDte: 34, receptor: RECEPTOR_GENERICO,
    items: [
      { nombre: 'CAPACITACION USO CIGUEÑALES', cantidad: 1, precio: 269409 },
      { nombre: "CAPACITACION USO PLC's CNC", cantidad: 1, precio: 168542 }
    ]
  });
  // El SII referencia el caso 8 a la "nota de credito" del caso 6, pero el
  // caso 6 es la factura (inconsistencia del propio documento del SII) —
  // se referencia la factura directamente, igual en caso 7 y caso 8.
  await crearEmitirEnviar({
    key: 'exenta-7', tipoDte: 61, receptor: RECEPTOR_GENERICO,
    items: [{ nombre: 'CAPACITACION USO CIGUEÑALES', cantidad: 1, precio: 134704 }],
    referencias: emitidos['exenta-6'] ? [{ docLocalId: emitidos['exenta-6'].id, codRef: 3, razon: 'MODIFICA MONTO' }] : []
  });
  await crearEmitirEnviar({
    key: 'exenta-8', tipoDte: 56, receptor: RECEPTOR_GENERICO,
    items: [{ nombre: "CAPACITACION USO PLC's CNC", cantidad: 1, precio: 33708 }],
    referencias: emitidos['exenta-6'] ? [{ docLocalId: emitidos['exenta-6'].id, codRef: 3, razon: 'MODIFICA MONTO' }] : []
  });

  console.log('\n=== SET BOLETA ELECTRONICA (Set Prueba BE) ===');
  const boleta = (nombre, cantidad, precioConIva, exento = false, unidad = null) =>
    ({ nombre, cantidad, precio: exento ? precioConIva : Math.round(precioConIva / 1.19), exento, unidad });
  await crearEmitirEnviar({
    key: 'boleta-1', tipoDte: 39, receptor: RECEPTOR_BOLETA,
    items: [boleta('Cambio de aceite', 1, 19900), boleta('Alineacion y balanceo', 1, 9900)],
    referencias: [{ tipoDocRef: 'SET', razon: 'CASO-1' }]
  });
  await crearEmitirEnviar({
    key: 'boleta-2', tipoDte: 39, receptor: RECEPTOR_BOLETA,
    items: [boleta('Papel de regalo', 17, 120)],
    referencias: [{ tipoDocRef: 'SET', razon: 'CASO-2' }]
  });
  await crearEmitirEnviar({
    key: 'boleta-3', tipoDte: 39, receptor: RECEPTOR_BOLETA,
    items: [boleta('Sandwich', 2, 1500), boleta('Bebida', 2, 550)],
    referencias: [{ tipoDocRef: 'SET', razon: 'CASO-3' }]
  });
  await crearEmitirEnviar({
    key: 'boleta-4', tipoDte: 39, receptor: RECEPTOR_BOLETA,
    items: [boleta('item afecto 1', 8, 1590), boleta('item exento 2', 2, 1000, true)],
    referencias: [{ tipoDocRef: 'SET', razon: 'CASO-4' }]
  });
  await crearEmitirEnviar({
    key: 'boleta-5', tipoDte: 39, receptor: RECEPTOR_BOLETA,
    items: [boleta('Arroz', 5, 700, false, 'Kg')],
    referencias: [{ tipoDocRef: 'SET', razon: 'CASO-5' }]
  });

  console.log('\n=== RESUMEN ===');
  const ok = resultados.filter(r => r.ok).length;
  console.log(`${ok}/${resultados.length} documentos emitidos y enviados al SII.`);
  const fallidos = resultados.filter(r => !r.ok);
  if (fallidos.length) {
    console.log('Fallidos:');
    for (const f of fallidos) console.log(`  - ${f.key}: ${f.error}`);
  }
  console.log('\nRevisa el estado de aceptacion en Facturacion > Documentos Emitidos (o GET /documentos/:id/estado) en unos minutos.');
  console.log('\nPendiente (no soportado aun por el motor): Liquidacion Factura (43), Factura de Compra (46), Documentos de Exportacion (110/111/112).');

  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
