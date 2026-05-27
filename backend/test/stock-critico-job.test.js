import net from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import {
  buildStockCriticoHtml,
  collectStockCritico,
  notifyStockCritico,
  sendSmtpMail,
  splitRecipients,
} from '../src/jobs/stockCritico.mjs'

function prismaMock({ productos = [], materiales = [] } = {}) {
  return {
    producto: {
      findMany: vi.fn().mockResolvedValue(productos),
    },
    bodegaTaller: {
      findMany: vi.fn().mockResolvedValue(materiales),
    },
  }
}

async function withFakeSmtpServer(onCommand) {
  const server = net.createServer(socket => {
    socket.write('220 fake-smtp\r\n')
    socket.on('data', chunk => {
      for (const line of chunk.toString('utf8').split(/\r?\n/).filter(Boolean)) {
        onCommand(line, socket)
      }
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    port: server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  }
}

describe('stockCritico job', () => {
  it('detecta productos inventariados y materiales de taller con stock bajo o igual al critico', async () => {
    const prisma = prismaMock({
      productos: [
        { id: 1, codigoInterno: 'INV-1', codigoBarra: 'B1', nombre: 'Inventariado bajo', stock: 2, stockCritico: 2, estadoInventario: 'Inventariado' },
        { id: 2, codigoInterno: 'INV-2', codigoBarra: 'B2', nombre: 'Inventariado ok', stock: 5, stockCritico: 2, estadoInventario: 'Inventariado' },
        { id: 3, codigoInterno: 'EXT-1', codigoBarra: 'B3', nombre: 'Externo bajo', stock: 0, stockCritico: 10, estadoInventario: 'Externo' },
        { id: 4, codigoInterno: 'INV-0', codigoBarra: 'B4', nombre: 'Inventariado cero', stock: 0, stockCritico: 0, estadoInventario: ' inventariado ' },
      ],
      materiales: [
        { id: 1, codigoInterno: 'MAT-1', codigoBarra: 'M1', nombre: 'Material bajo', stock: 1, stockCritico: 3, unidadMedida: 'mt' },
        { id: 2, codigoInterno: 'MAT-2', codigoBarra: 'M2', nombre: 'Material ok', stock: 7, stockCritico: 3, unidadMedida: 'un' },
      ],
    })

    const report = await collectStockCritico(prisma)

    expect(prisma.producto.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
    }))
    expect(report.productos.map(p => p.codigoInterno)).toEqual(['INV-1', 'INV-0'])
    expect(report.materiales.map(m => m.codigoInterno)).toEqual(['MAT-1'])
    expect(report.totales).toEqual({ productosCriticos: 2, materialesCriticos: 1, total: 3 })
  })

  it('construye el correo HTML con columnas legacy y escape de contenido', () => {
    const html = buildStockCriticoHtml({
      productos: [
        { codigoInterno: 'P-1', codigoBarra: 'CB-1', nombre: 'Producto <script>', stock: 1 },
      ],
      materiales: [
        { codigoInterno: 'M-1', codigoBarra: 'MB-1', nombre: 'Material', stock: 0, unidadMedida: 'mt' },
      ],
      totales: { productosCriticos: 1, materialesCriticos: 1, total: 2 },
    }, { date: new Date('2026-05-27T12:34:56.000Z') })

    expect(html).toContain('ACUSE STOCK CRITICO BODEGA PRODUCTOS (1)')
    expect(html).toContain('ACUSE STOCK CRITICO BODEGA TALLER (1)')
    expect(html).toContain('<strong>Cod Interno</strong>')
    expect(html).toContain('<strong>Cod Barra</strong>')
    expect(html).toContain('<strong>Medida</strong>')
    expect(html).toContain('Producto &lt;script&gt;')
    expect(html).not.toContain('Producto <script>')
  })

  it('no envia correo sin stock critico o sin destinatarios', async () => {
    const sender = vi.fn()
    const emptyResult = await notifyStockCritico({
      productos: [],
      materiales: [],
      totales: { productosCriticos: 0, materialesCriticos: 0, total: 0 },
    }, { env: { STOCK_CRITICO_EMAIL_TO: 'ops@test.local', NODE_ENV: 'production' }, sender })
    expect(emptyResult).toEqual({ sent: false, reason: 'sin-stock-critico' })

    const noRecipients = await notifyStockCritico({
      productos: [{ codigoInterno: 'P-1', nombre: 'Producto', stock: 1 }],
      materiales: [],
      totales: { productosCriticos: 1, materialesCriticos: 0, total: 1 },
    }, { env: { NODE_ENV: 'production' }, sender })
    expect(noRecipients).toEqual({ sent: false, reason: 'sin-destinatarios' })
    expect(sender).not.toHaveBeenCalled()
  })

  it('envia correo cuando hay stock critico, destinatarios y email habilitado', async () => {
    const sender = vi.fn().mockResolvedValue({ accepted: ['ops@test.local'] })
    const report = {
      productos: [{ codigoInterno: 'P-1', codigoBarra: 'CB', nombre: 'Producto', stock: 1 }],
      materiales: [],
      totales: { productosCriticos: 1, materialesCriticos: 0, total: 1 },
    }

    const result = await notifyStockCritico(report, {
      env: {
        NODE_ENV: 'production',
        STOCK_CRITICO_EMAIL_ENABLED: 'true',
        STOCK_CRITICO_EMAIL_TO: 'ops@test.local; jefe@test.local',
        STOCK_CRITICO_SMTP_HOST: 'smtp.test.local',
        STOCK_CRITICO_SMTP_PORT: '2525',
        STOCK_CRITICO_EMAIL_FROM: 'stock@test.local',
      },
      sender,
      date: new Date('2026-05-27T12:00:00.000Z'),
    })

    expect(result.sent).toBe(true)
    expect(result.recipients).toEqual(['ops@test.local', 'jefe@test.local'])
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.test.local',
      port: 2525,
      from: 'stock@test.local',
      to: ['ops@test.local', 'jefe@test.local'],
      subject: expect.stringContaining('Acuse stock critico'),
      html: expect.stringContaining('ACUSE STOCK CRITICO BODEGA PRODUCTOS'),
    }))
  })

  it('activa STARTTLS por defecto cuando SMTP autentica credenciales', async () => {
    const sender = vi.fn().mockResolvedValue({ accepted: ['ops@test.local'] })
    const report = {
      productos: [{ codigoInterno: 'P-1', codigoBarra: 'CB', nombre: 'Producto', stock: 1 }],
      materiales: [],
      totales: { productosCriticos: 1, materialesCriticos: 0, total: 1 },
    }

    await notifyStockCritico(report, {
      env: {
        NODE_ENV: 'production',
        STOCK_CRITICO_EMAIL_ENABLED: 'true',
        STOCK_CRITICO_EMAIL_TO: 'ops@test.local',
        STOCK_CRITICO_SMTP_HOST: 'smtp.test.local',
        STOCK_CRITICO_SMTP_PORT: '587',
        STOCK_CRITICO_SMTP_USER: 'usuario',
        STOCK_CRITICO_SMTP_PASS: 'secreto',
      },
      sender,
    })

    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      secure: false,
      starttls: true,
      allowInsecureAuth: false,
      user: 'usuario',
      pass: 'secreto',
    }))
  })

  it('bloquea autenticacion SMTP sin TLS salvo opt-in explicito', async () => {
    await expect(sendSmtpMail({
      host: 'smtp.test.local',
      port: 25,
      secure: false,
      starttls: false,
      user: 'usuario',
      pass: 'secreto',
      to: ['ops@test.local'],
      subject: 'Acuse stock critico',
      html: '<p>ok</p>',
    })).rejects.toThrow(/SMTP AUTH requiere TLS/)
  })

  it('no envia AUTH cuando STARTTLS es requerido pero el servidor no lo ofrece', async () => {
    const commands = []
    const smtp = await withFakeSmtpServer((line, socket) => {
      commands.push(line)
      if (line.startsWith('EHLO')) socket.write('250-fake-smtp\r\n250 AUTH LOGIN\r\n')
      else socket.write('250 ok\r\n')
    })

    try {
      await expect(sendSmtpMail({
        host: '127.0.0.1',
        port: smtp.port,
        secure: false,
        starttls: true,
        user: 'usuario',
        pass: 'secreto',
        to: ['ops@test.local'],
        subject: 'Acuse stock critico',
        html: '<p>ok</p>',
      })).rejects.toThrow(/STARTTLS no soportado/)
    } finally {
      await smtp.close()
    }

    expect(commands).toEqual(['EHLO 127.0.0.1'])
    expect(commands.some(command => command.startsWith('AUTH'))).toBe(false)
  })

  it('separa destinatarios por coma o punto y coma', () => {
    expect(splitRecipients('uno@test.local, dos@test.local; tres@test.local')).toEqual([
      'uno@test.local',
      'dos@test.local',
      'tres@test.local',
    ])
  })
})
