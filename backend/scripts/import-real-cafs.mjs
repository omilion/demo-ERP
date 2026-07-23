// Instala el certificado digital real + importa CAFs reales descargados del
// SII. Corre EN el servidor (usa data/facturacion/ y el DATABASE_URL de ese
// entorno) para reusar exactamente el mismo motor que usa la app en vivo.
//
// Uso: cd backend && node scripts/import-real-cafs.mjs <carpeta-con-xml> <clave-certificado>
// La carpeta debe tener certificado.p12 (o .pfx) y los CAF .xml descargados del SII.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createFacturacionDb } from '../src/facturacion/db.js';
import { createFacturacionEngine } from '../src/facturacion/engine.js';
import { parseCaf } from '../src/facturacion/caf.js';
import { normalizeRut } from '../src/facturacion/xmlUtil.js';

const [, , inputDir, certPassword] = process.argv;
if (!inputDir || !certPassword) {
  console.error('Uso: node scripts/import-real-cafs.mjs <carpeta-con-xml-y-cert> <clave-certificado>');
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const db = createFacturacionDb(prisma);
  const dataDir = path.join(process.cwd(), 'data', 'facturacion');
  const engine = createFacturacionEngine({ db, dataDir });

  console.log(`DB: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);

  const certFile = fs.readdirSync(inputDir).find(f => /\.(p12|pfx)$/i.test(f));
  if (certFile) {
    console.log(`1) Instalando certificado: ${certFile}`);
    const certBuffer = fs.readFileSync(path.join(inputDir, certFile));
    const info = await engine.saveCert(certBuffer, certPassword);
    if (!info.valido) throw new Error(`Certificado invalido: ${info.error}`);
    console.log(`   OK. Titular: ${info.subject}`);
    console.log(`   Vigencia: ${info.validFrom} -> ${info.validTo}`);
  } else {
    console.log('1) Sin .p12/.pfx en la carpeta, se usa el certificado ya instalado.');
  }

  const empresa = await engine.getEmpresa();
  console.log(`2) Empresa configurada: ${empresa.rut} (${empresa.razonSocial}), ambiente=${empresa.ambiente}`);

  const xmlFiles = fs.readdirSync(inputDir).filter(f => f.toLowerCase().endsWith('.xml'));
  console.log(`3) Importando ${xmlFiles.length} CAF...`);
  const resumen = [];
  for (const file of xmlFiles) {
    const xml = fs.readFileSync(path.join(inputDir, file), 'latin1');
    try {
      const parsed = parseCaf(xml);
      if (empresa.rut && parsed.rutEmisor && normalizeRut(parsed.rutEmisor) !== normalizeRut(empresa.rut)) {
        throw new Error(`CAF pertenece a ${parsed.rutEmisor}, no a ${empresa.rut}`);
      }
      const existing = await prisma.factCaf.findFirst({
        where: { tipoDte: parsed.tipoDte, folioDesde: parsed.folioDesde, folioHasta: parsed.folioHasta, ambiente: empresa.ambiente },
      });
      if (existing) {
        console.log(`   SKIP ${file}: ya existe (tipo ${parsed.tipoDte}, rango ${parsed.folioDesde}-${parsed.folioHasta})`);
        continue;
      }
      const record = await prisma.factCaf.create({
        data: {
          tipoDte: parsed.tipoDte,
          folioDesde: parsed.folioDesde,
          folioHasta: parsed.folioHasta,
          siguienteFolio: parsed.folioDesde,
          fechaAutorizacion: parsed.fechaAutorizacion,
          ambiente: empresa.ambiente,
          xml,
        },
      });
      resumen.push({ file, tipoDte: record.tipoDte, rango: `${record.folioDesde}-${record.folioHasta}` });
      console.log(`   OK   ${file}: tipo ${record.tipoDte}, folios ${record.folioDesde}-${record.folioHasta}`);
    } catch (err) {
      console.log(`   ERR  ${file}: ${err.message}`);
    }
  }

  console.log('\n=== RESUMEN ===');
  console.log(`${resumen.length}/${xmlFiles.length} CAF importados.`);
  await prisma.$disconnect();
}

main().catch(err => { console.error(err); process.exit(1); });
