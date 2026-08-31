import path from 'path'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') })

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const USUARIOS_OFICIALES = [
  // ── AREA COMERCIAL (REQUERIDO POR PLASTIMAR) ─────────────────────────
  {
    email: 'laura.navarro@plastimar.cl',
    nombre: 'Laura Navarro',
    role: 'admin',
    cargo: 'Gerencia Comercial',
    rut: '10861138-0',
    permisoDescuentos: true,
    permisosExtra: null,
  },
  {
    email: 'paulina.chinchon@plastimar.cl',
    nombre: 'Paulina Chinchón',
    role: 'coordinador_comercial',
    cargo: 'Coordinadora Comercial',
    rut: '17209937-7',
    permisoDescuentos: true,
    permisosExtra: null,
  },
  {
    email: 'anny.torrealba@plastimar.cl',
    nombre: 'Anny Torrealba',
    role: 'vendedor',
    cargo: 'Ejecutiva Mercado Público',
    codigoVendedor: '1050',
    rut: '25395100-6',
    permisoDescuentos: false,
    permisosExtra: null,
  },
  {
    email: 'cinthia.palacios@plastimar.cl',
    nombre: 'Cinthia Palacios',
    role: 'vendedor',
    cargo: 'Ejecutiva Mercado Público y Privados',
    codigoVendedor: '1092',
    rut: '14561044-6',
    permisoDescuentos: false,
    permisosExtra: { 'ordenes-compra': ['read', 'write'] },
  },
  {
    email: 'jonathan.martinez@plastimar.cl',
    nombre: 'Jonathan Martínez',
    role: 'vendedor',
    cargo: 'Ejecutivo de Prospección y Mercado Público',
    codigoVendedor: '1128',
    rut: '17888679-3',
    permisoDescuentos: false,
    permisosExtra: null,
  },

  // ── GERENCIA GENERAL & OPERACIONES ────────────────────────────────────
  {
    email: 'diego.espinoza@plastimar.cl',
    nombre: 'Diego Espinoza',
    role: 'admin',
    cargo: 'Gerencia General',
    permisoDescuentos: true,
    permisosExtra: null,
  },
  {
    email: 'marcela.lacourt@plastimar.cl',
    nombre: 'Marcela Lacourt',
    role: 'cajero',
    cargo: 'Finanzas y RRHH',
    permisoDescuentos: false,
    permisosExtra: { rrhh: ['read', 'write'] },
  },
  {
    email: 'daniela.reyes@plastimar.cl',
    nombre: 'Daniela Reyes',
    role: 'bodeguero',
    cargo: 'Facturación y Despacho',
    codigoVendedor: '1175',
    rut: '17665413-1',
    permisoDescuentos: false,
    permisosExtra: { 'facturacion.emitir': ['read', 'write'], 'despacho.guias': ['read', 'write'] },
  },
  {
    email: 'dyan.cortes@plastimar.cl',
    nombre: 'Dyan Cortés',
    role: 'bodeguero',
    cargo: 'Coordinador de bodega y espuma',
    permisoDescuentos: false,
    permisosExtra: { 'taller.gestion': ['read', 'write'], 'ventas.taller': ['write'], 'bodega.compras': ['read', 'write'] },
  },
  {
    email: 'diego.avila@plastimar.cl',
    nombre: 'Diego Ávila',
    role: 'bodeguero',
    cargo: 'Encargado de bodega e inventario',
    codigoVendedor: '1088',
    rut: '14688402-6',
    permisoDescuentos: false,
    permisosExtra: { 'bodega.movimientos': ['read', 'write'], 'ventas.entregas': ['write'] },
  },
  {
    email: 'zalma.lobos@plastimar.cl',
    nombre: 'Zalma Lobos',
    role: 'taller',
    cargo: 'Supervisora de confección',
    permisoDescuentos: false,
    permisosExtra: { 'taller.gestion': ['read', 'write'], 'taller.cerrar': ['read', 'write'] },
  },
  {
    email: 'jenifer.breidenbach@plastimar.cl',
    nombre: 'Jenifer Breidenbach',
    role: 'taller_operario',
    cargo: 'Cortadora',
    permisoDescuentos: false,
    permisosExtra: null,
  },
  {
    email: 'mercedes.rodriguez@plastimar.cl',
    nombre: 'Mercedes Rodríguez',
    role: 'taller_operario',
    cargo: 'Cortadora',
    permisoDescuentos: false,
    permisosExtra: null,
  },
  {
    email: 'sebastian.mella@plastimar.cl',
    nombre: 'Sebastián Mella',
    role: 'taller',
    cargo: 'Encargado de Espuma',
    permisoDescuentos: false,
    permisosExtra: { 'taller.materiales': ['read', 'write'], 'bodega.movimientos': ['read', 'write'], despacho: ['read'] },
  },
]

// Mappings de cuentas legacy a correos oficiales
const LEGACY_EMAIL_MAP = {
  'legacy.laura@plastimar.cl': 'laura.navarro@plastimar.cl',
  'legacy.paulina.chinchon@plastimar.cl': 'paulina.chinchon@plastimar.cl',
  'legacy.anny@plastimar.cl': 'anny.torrealba@plastimar.cl',
  'legacy.cinthia@plastimar.cl': 'cinthia.palacios@plastimar.cl',
  'legacy.jonathan.martinez@plastimar.cl': 'jonathan.martinez@plastimar.cl',
}

async function main() {
  console.log('=== CONFIGURANDO USUARIOS OFICIALES PLASTIMAR ===\n')

  // 0. Limpiar codigoVendedor de cuentas legacy para evitar conflictos de UniqueConstraint
  await prisma.user.updateMany({
    where: { email: { startsWith: 'legacy.' } },
    data: { codigoVendedor: null },
  })

  // 1. Migrar cuentas legacy si existen
  for (const [legacyEmail, targetEmail] of Object.entries(LEGACY_EMAIL_MAP)) {
    const legacyUser = await prisma.user.findFirst({ where: { email: legacyEmail } })
    const targetUser = await prisma.user.findFirst({ where: { email: targetEmail } })

    if (legacyUser && !targetUser) {
      console.log(`Migrando cuenta legacy ${legacyEmail} -> ${targetEmail}`)
      await prisma.user.update({
        where: { id: legacyUser.id },
        data: { email: targetEmail },
      })
    } else if (legacyUser && targetUser) {
      console.log(`Fusionando/desactivando duplicado legacy ${legacyEmail} (ID ${legacyUser.id})`)
      // Transferir cartera si la cuenta legacy tenía registros vinculados
      await prisma.crmRegistro.updateMany({
        where: { vendedorId: legacyUser.id },
        data: { vendedorId: targetUser.id },
      })
      await prisma.user.update({
        where: { id: legacyUser.id },
        data: { activo: false },
      })
    }
  }

  // 2. Crear o actualizar usuarios oficiales
  for (const u of USUARIOS_OFICIALES) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } })
    if (existing) {
      console.log(`Actualizando ${u.nombre} (${u.email}) [ID ${existing.id}] -> Rol: ${u.role}, Cargo: ${u.cargo}`)
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          nombre: u.nombre,
          role: u.role,
          cargo: u.cargo,
          rut: u.rut || existing.rut,
          codigoVendedor: u.codigoVendedor || existing.codigoVendedor,
          permisoDescuentos: u.permisoDescuentos,
          permisosExtra: u.permisosExtra,
          activo: true,
        },
      })
    } else {
      console.log(`Creando ${u.nombre} (${u.email}) -> Rol: ${u.role}, Cargo: ${u.cargo}`)
      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash: '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password genérico restablecible
          nombre: u.nombre,
          role: u.role,
          cargo: u.cargo,
          rut: u.rut || null,
          codigoVendedor: u.codigoVendedor || null,
          permisoDescuentos: u.permisoDescuentos,
          permisosExtra: u.permisosExtra,
          activo: true,
        },
      })
    }
  }

  // 3. Desactivar cuentas legacy no oficiales para mantener limpia la vista de usuarios activos
  await prisma.user.updateMany({
    where: {
      email: { startsWith: 'legacy.' },
    },
    data: { activo: false },
  })

  // 4. Resumen final de usuarios activos
  const activos = await prisma.user.findMany({
    where: { activo: true },
    select: { id: true, email: true, nombre: true, role: true, cargo: true, codigoVendedor: true, permisosExtra: true },
    orderBy: { id: 'asc' },
  })

  console.log('\n=== ESTADO FINAL DE USUARIOS ACTIVOS EN EL SISTEMA ===')
  console.table(activos.map(u => ({
    ID: u.id,
    Nombre: u.nombre,
    Email: u.email,
    Nivel: u.role,
    Cargo: u.cargo || '—',
    CodVendedor: u.codigoVendedor || '—',
    PermisosExtra: u.permisosExtra ? Object.keys(u.permisosExtra).join(', ') : 'No',
  })))

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
