import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const env = readFileSync(resolve(__dirname, '../.env'), 'utf8')
  for (const line of env.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const targetId = 15609
  console.log(`Searching for ODT #${targetId}...`)
  const o = await prisma.odt.findUnique({
    where: { id: targetId }
  })
  
  if (o) {
    console.log(`Found ODT #${o.id}:`)
    console.log(`  ordenId in ODT: ${o.ordenId}`)
    console.log(`  clienteNombre in ODT: "${o.clienteNombre}"`)
    if (o.ordenId) {
      const ord = await prisma.orden.findFirst({
        where: { id: o.ordenId }
      })
      if (ord) {
        console.log(`  Found Orden by PK id: ${ord.id} (nInterno: ${ord.nInterno})`)
        console.log(`    clienteId in Orden: ${ord.clienteId}`)
        if (ord.clienteId) {
          const cli = await prisma.cliente.findUnique({
            where: { id: ord.clienteId }
          })
          if (cli) {
            console.log(`    Found Cliente directly by clienteId: "${cli.nombre}" (RUT: ${cli.rut})`)
          } else {
            console.log(`    NO Cliente found by ID ${ord.clienteId}`)
          }
        }
      } else {
        console.log(`  NO Orden found by PK id ${o.ordenId}`)
        // Let's search by nInterno!
        const ordByNInterno = await prisma.orden.findFirst({
          where: { nInterno: o.ordenId }
        })
        if (ordByNInterno) {
          console.log(`  Found Orden by nInterno ${o.ordenId}! (PK id: ${ordByNInterno.id})`)
          console.log(`    clienteId in Orden: ${ordByNInterno.clienteId}`)
          if (ordByNInterno.clienteId) {
            const cli = await prisma.cliente.findUnique({
              where: { id: ordByNInterno.clienteId }
            })
            if (cli) {
              console.log(`    Found Cliente directly by clienteId: "${cli.nombre}"`)
            } else {
              console.log(`    NO Cliente found by ID ${ordByNInterno.clienteId}`)
            }
          }
        }
      }
    }
  } else {
    console.log(`ODT #${targetId} not found in DB!`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
