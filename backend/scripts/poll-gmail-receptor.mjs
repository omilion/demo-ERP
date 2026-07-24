import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { syncGmailReceptor } from '../src/facturacion/receptorDte.js'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })
try {
  const result = await syncGmailReceptor({ prisma })
  console.log(JSON.stringify({ created: result.created, skipped: result.skipped, errors: result.errors.length, nextPageToken: result.nextPageToken }, null, 2))
  if (result.errors.length) process.exitCode = 1
} finally { await prisma.$disconnect() }
