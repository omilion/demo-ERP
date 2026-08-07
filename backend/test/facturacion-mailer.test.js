import net from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { sendSmtpMail } from '../src/jobs/stockCritico.mjs'
import { sendDteEmail, buildReenvioHtml } from '../src/facturacion/mailer.js'

// Fake SMTP server que entiende el ciclo minimo (EHLO/MAIL FROM/RCPT
// TO/DATA/QUIT) y junta el cuerpo completo del DATA (headers + multipart)
// para poder inspeccionar el MIME armado por sendSmtpMail con adjuntos.
async function withFakeSmtpServer() {
  const state = { commands: [], dataLines: [], inData: false }
  const server = net.createServer(socket => {
    socket.write('220 fake-smtp\r\n')
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let idx
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        if (state.inData) {
          if (line === '.') { state.inData = false; socket.write('250 ok body\r\n'); continue }
          state.dataLines.push(line)
          continue
        }
        state.commands.push(line)
        if (line.startsWith('EHLO')) socket.write('250-fake-smtp\r\n250 OK\r\n')
        else if (line.startsWith('MAIL FROM')) socket.write('250 ok from\r\n')
        else if (line.startsWith('RCPT TO')) socket.write('250 ok rcpt\r\n')
        else if (line === 'DATA') { state.inData = true; socket.write('354 go\r\n') }
        else if (line.startsWith('QUIT')) socket.write('221 bye\r\n')
        else socket.write('250 ok\r\n')
      }
    })
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { port: server.address().port, state, close: () => new Promise(resolve => server.close(resolve)) }
}

describe('sendSmtpMail con adjuntos', () => {
  it('arma un mensaje multipart/mixed con PDF y XML en base64', async () => {
    const smtp = await withFakeSmtpServer()
    const pdfContent = Buffer.from('PDF-CONTENIDO-FALSO')
    const xmlContent = Buffer.from('<Documento>x</Documento>')
    try {
      const result = await sendSmtpMail({
        host: '127.0.0.1',
        port: smtp.port,
        to: ['cliente@test.local'],
        subject: 'Factura Electrónica N° 1',
        html: '<p>Adjunto la factura.</p>',
        attachments: [
          { filename: 'DTE_T33_F1.pdf', content: pdfContent, contentType: 'application/pdf' },
          { filename: 'DTE_T33_F1.xml', content: xmlContent, contentType: 'application/xml' },
        ],
      })
      expect(result).toEqual({ accepted: ['cliente@test.local'] })

      const body = smtp.state.dataLines.join('\r\n')
      expect(body).toMatch(/Content-Type: multipart\/mixed; boundary="[^"]+"/)
      expect(body).toContain('Content-Type: application/pdf; name="DTE_T33_F1.pdf"')
      expect(body).toContain('Content-Disposition: attachment; filename="DTE_T33_F1.pdf"')
      expect(body).toContain('Content-Type: application/xml; name="DTE_T33_F1.xml"')
      expect(body).toContain(pdfContent.toString('base64'))
      expect(body).toContain(xmlContent.toString('base64'))
      expect(body).toContain('<p>Adjunto la factura.</p>')
    } finally {
      await smtp.close()
    }
  })

  it('sin adjuntos sigue mandando el mismo text/html de siempre (compatibilidad con stock critico)', async () => {
    const smtp = await withFakeSmtpServer()
    try {
      await sendSmtpMail({
        host: '127.0.0.1',
        port: smtp.port,
        to: ['ops@test.local'],
        subject: 'Acuse stock critico',
        html: '<p>ok</p>',
      })
      const body = smtp.state.dataLines.join('\r\n')
      expect(body).toContain('Content-Type: text/html; charset=UTF-8')
      expect(body).not.toContain('multipart/mixed')
    } finally {
      await smtp.close()
    }
  })
})

describe('facturacion/mailer sendDteEmail', () => {
  it('no envia por defecto en entorno de test (mismo comportamiento que stock critico)', async () => {
    const sender = vi.fn()
    const result = await sendDteEmail({ to: 'cliente@test.local', subject: 'x', html: '<p>x</p>', env: { NODE_ENV: 'test' }, sender })
    expect(result).toEqual({ sent: false, reason: 'email-deshabilitado', recipients: ['cliente@test.local'] })
    expect(sender).not.toHaveBeenCalled()
  })

  it('falla si no hay destinatario', async () => {
    await expect(sendDteEmail({ to: '', subject: 'x', html: '<p>x</p>', env: {} })).rejects.toThrow(/correo de destinatario/)
  })

  it('usa FACTURACION_SMTP_* cuando esta seteado', async () => {
    const sender = vi.fn().mockResolvedValue({ accepted: ['cliente@test.local'] })
    const result = await sendDteEmail({
      to: 'cliente@test.local',
      subject: 'Factura Electrónica N° 1',
      html: '<p>hola</p>',
      attachments: [{ filename: 'a.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }],
      env: {
        NODE_ENV: 'production',
        FACTURACION_EMAIL_ENABLED: 'true',
        STOCK_CRITICO_SMTP_HOST: 'smtp.fallback.local',
        FACTURACION_SMTP_HOST: 'smtp.facturacion.local',
        FACTURACION_SMTP_PORT: '2525',
        FACTURACION_EMAIL_FROM: 'facturacion@plastimar.cl',
      },
      sender,
    })
    expect(result.sent).toBe(true)
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.facturacion.local',
      port: 2525,
      from: 'facturacion@plastimar.cl',
      to: ['cliente@test.local'],
      attachments: [expect.objectContaining({ filename: 'a.pdf' })],
    }))
  })

  it('cae a STOCK_CRITICO_SMTP_HOST cuando no hay FACTURACION_SMTP_HOST propio', async () => {
    const sender = vi.fn().mockResolvedValue({ accepted: ['cliente@test.local'] })
    await sendDteEmail({
      to: 'cliente@test.local',
      subject: 'x',
      html: '<p>x</p>',
      env: { NODE_ENV: 'production', FACTURACION_EMAIL_ENABLED: 'true', STOCK_CRITICO_SMTP_HOST: 'smtp.fallback.local' },
      sender,
    })
    expect(sender).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.fallback.local', from: 'info@plastimar.cl' }))
  })
})

describe('buildReenvioHtml', () => {
  it('incluye el tipo de documento, folio y razon social de la empresa', () => {
    const html = buildReenvioHtml({ empresa: { razonSocial: 'PLASTIMAR LIMITADA' }, doc: { folio: 123 }, tipoNombre: 'Factura Electrónica' })
    expect(html).toContain('Factura Electrónica N° 123')
    expect(html).toContain('PLASTIMAR LIMITADA')
  })
})
