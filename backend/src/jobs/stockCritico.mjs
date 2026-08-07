// Reporte de stock critico - ejecutable via cron del SO.
// Uso: npm run job:stock-critico
import 'dotenv/config'
import net from 'node:net'
import tls from 'node:tls'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const DEFAULT_FROM = 'info@plastimar.cl'
const DEFAULT_FROM_NAME = 'Plastimar.cl'
const CHILE_TZ = 'America/Santiago'

export function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return ['1', 'true', 'yes', 'si', 'on'].includes(String(value).trim().toLowerCase())
}

export function splitRecipients(value) {
  return String(value || '')
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean)
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function formatChileDate(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('es-CL', {
      timeZone: CHILE_TZ,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date).map(p => [p.type, p.value]),
  )
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`
}

function isInventariado(value) {
  return String(value || '').trim().toLowerCase() === 'inventariado'
}

function toNumber(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function isCritical(item) {
  return toNumber(item.stock) <= toNumber(item.stockCritico)
}

function sortByNombre(a, b) {
  return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
}

export async function collectStockCritico(prisma) {
  const [productos, materiales] = await Promise.all([
    prisma.producto.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigoInterno: true,
        codigoBarra: true,
        nombre: true,
        stock: true,
        stockCritico: true,
        estadoInventario: true,
        bodega: true,
      },
      orderBy: { nombre: 'asc' },
    }),
    prisma.bodegaTaller.findMany({
      where: { activo: true },
      select: {
        id: true,
        codigoInterno: true,
        codigoBarra: true,
        nombre: true,
        stock: true,
        stockCritico: true,
        unidadMedida: true,
      },
      orderBy: { nombre: 'asc' },
    }),
  ])

  const productosCriticos = productos
    .filter(p => isInventariado(p.estadoInventario) && isCritical(p))
    .sort(sortByNombre)
  const materialesCriticos = materiales
    .filter(isCritical)
    .sort(sortByNombre)

  return {
    productos: productosCriticos,
    materiales: materialesCriticos,
    totales: {
      productosCriticos: productosCriticos.length,
      materialesCriticos: materialesCriticos.length,
      total: productosCriticos.length + materialesCriticos.length,
    },
  }
}

function cell(value, attrs = '') {
  return `<td${attrs}>${escapeHtml(value)}</td>`
}

function stockCell(value) {
  return cell(value, " style=\"background:#FDAABB;text-align:center\"")
}

function table(headers, rows) {
  const head = headers.map(h => `<td align="center"><strong>${escapeHtml(h)}</strong></td>`).join('')
  const body = rows.join('')
  return `<table border="0" cellpadding="4" cellspacing="0">
  <tr bgcolor="#F7F7F7">${head}</tr>
  ${body}
</table>`
}

export function buildStockCriticoHtml(report, { date = new Date() } = {}) {
  const fecha = formatChileDate(date)
  let body = `<html>
<head>
<title>Stock Critico</title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body><div>Reportado desde Plastimar.cl Sistema de Gestion, con fecha ${escapeHtml(fecha)} / Solo productos Inventariados</div><br>`

  if (report.productos.length > 0) {
    body += `<br>
***************************************************************************************
<div><strong>ACUSE STOCK CRITICO BODEGA PRODUCTOS (${report.productos.length})</strong></div><br>`
    body += table(['Cod Interno', 'Cod Barra', 'Nombre', 'stock'], report.productos.map(p => `
  <tr bgcolor="#F7F7F7">
    ${cell(p.codigoInterno)}
    ${cell(p.codigoBarra)}
    ${cell(p.nombre)}
    ${stockCell(p.stock)}
  </tr>`))
    body += '<br><br>'
  }

  if (report.materiales.length > 0) {
    body += `<br>
***************************************************************************************
<div><strong>ACUSE STOCK CRITICO BODEGA TALLER (${report.materiales.length})</strong></div><br><br>`
    body += table(['Cod Interno', 'Cod Barra', 'Nombre', 'stock', 'Medida'], report.materiales.map(m => `
  <tr bgcolor="#F7F7F7">
    ${cell(m.codigoInterno)}
    ${cell(m.codigoBarra)}
    ${cell(m.nombre)}
    ${stockCell(m.stock)}
    ${cell(m.unidadMedida, " align=\"center\"")}
  </tr>`))
  }

  body += '</body></html>'
  return body
}

export function buildStockCriticoText(report) {
  const lines = [
    `Productos criticos: ${report.productos.length}`,
    `Materiales taller criticos: ${report.materiales.length}`,
  ]
  for (const p of report.productos) {
    lines.push(`[PROD] ${p.codigoInterno || '-'} ${p.nombre || '-'} stock=${p.stock} crit=${p.stockCritico}`)
  }
  for (const m of report.materiales) {
    lines.push(`[TALLER] ${m.codigoInterno || '-'} ${m.nombre || '-'} stock=${m.stock} crit=${m.stockCritico}`)
  }
  return lines.join('\n')
}

function encodeHeader(value) {
  const text = String(value ?? '')
  return /^[\x00-\x7F]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`
}

function createSmtpReader(socket) {
  let buffer = ''
  const waiters = []
  function onData(chunk) {
    buffer += chunk.toString('utf8')
    pump()
  }
  function onError(err) {
    while (waiters.length) waiters.shift().reject(err)
  }
  function onClose() {
    while (waiters.length) waiters.shift().reject(new Error('Conexion SMTP cerrada antes de completar la respuesta'))
  }
  socket.on('data', onData)
  socket.on('error', onError)
  socket.on('close', onClose)
  function extractResponse() {
    const lines = buffer.split(/\r?\n/)
    if (!buffer.endsWith('\n')) lines.pop()
    if (!lines.length) return null
    let end = -1
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\d{3} /.test(lines[i])) {
        end = i
        break
      }
    }
    if (end === -1) return null
    const response = lines.slice(0, end + 1).join('\n')
    buffer = lines.slice(end + 1).join('\n')
    if (buffer) buffer += '\n'
    return response
  }
  function pump() {
    while (waiters.length) {
      const response = extractResponse()
      if (!response) break
      waiters.shift().resolve(response)
    }
  }
  const readResponse = function readResponse() {
    const response = extractResponse()
    if (response) return Promise.resolve(response)
    return new Promise((resolve, reject) => {
      waiters.push({ resolve, reject })
    })
  }
  readResponse.close = () => {
    socket.off('data', onData)
    socket.off('error', onError)
    socket.off('close', onClose)
  }
  return readResponse
}

function assertSmtpCode(response, expected, command) {
  const code = Number(String(response).slice(0, 3))
  const ok = Array.isArray(expected) ? expected.includes(code) : code === expected
  if (!ok) throw new Error(`SMTP ${command} fallo: ${String(response).trim()}`)
}

function writeSmtp(socket, line) {
  socket.write(`${line}\r\n`)
}

async function smtpCommand(socket, readResponse, command, expected) {
  writeSmtp(socket, command)
  const response = await readResponse()
  assertSmtpCode(response, expected, command.split(' ')[0])
  return response
}

function smtpSupportsCapability(response, capability) {
  const wanted = String(capability).trim().toUpperCase()
  return String(response)
    .split(/\r?\n/)
    .some(line => String(line).slice(4).trim().toUpperCase() === wanted)
}

async function upgradeSmtpToTls(socket, { host, timeoutMs }) {
  socket.setTimeout(0)
  const secureSocket = tls.connect({ socket, servername: host, timeout: timeoutMs })
  await new Promise((resolve, reject) => {
    function onSecure() {
      secureSocket.off('error', onError)
      resolve()
    }
    function onError(err) {
      secureSocket.off('secureConnect', onSecure)
      reject(err)
    }
    secureSocket.once('secureConnect', onSecure)
    secureSocket.once('error', onError)
  })
  secureSocket.setTimeout(timeoutMs, () => secureSocket.destroy(new Error('Timeout SMTP TLS')))
  return secureSocket
}

function dotStuff(body) {
  return String(body).replace(/^\./gm, '..')
}

// Base64 no produce '\r'/'\n' propios: se corta cada 76 caracteres solo por
// convencion MIME (RFC 2045), no hace falta re-aplicar dotStuff sobre esto.
function wrapBase64(base64) {
  return base64.replace(/.{76}/g, line => `${line}\r\n`)
}

// attachments: [{ filename, content: Buffer, contentType }]. Sin adjuntos se
// arma el mismo mensaje text/html de siempre (stock critico); con adjuntos
// se envuelve todo en multipart/mixed (reenvio de DTE con PDF/XML).
function buildEmailBody({ html, attachments = [] }) {
  if (!attachments.length) {
    return { contentTypeHeader: 'Content-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit', body: html }
  }
  const boundary = `----plastimar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  const lines = [
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
  ]
  for (const attachment of attachments) {
    const filename = encodeHeader(attachment.filename || 'adjunto')
    lines.push(
      '',
      `--${boundary}`,
      `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      wrapBase64(Buffer.from(attachment.content).toString('base64')),
    )
  }
  lines.push('', `--${boundary}--`)
  return { contentTypeHeader: `Content-Type: multipart/mixed; boundary="${boundary}"`, body: lines.join('\r\n') }
}

export async function sendSmtpMail({
  host = 'localhost',
  port = 25,
  secure = false,
  user,
  pass,
  from = DEFAULT_FROM,
  fromName = DEFAULT_FROM_NAME,
  to = [],
  subject,
  html,
  attachments = [],
  timeoutMs = 15000,
  starttls = false,
  allowInsecureAuth = false,
}) {
  const recipients = Array.isArray(to) ? to : splitRecipients(to)
  if (!recipients.length) throw new Error('Sin destinatarios para correo de stock critico')
  const hasAuth = Boolean(user && pass)
  if (hasAuth && !secure && !starttls && !allowInsecureAuth) {
    throw new Error('SMTP AUTH requiere TLS directo, STARTTLS o STOCK_CRITICO_SMTP_ALLOW_INSECURE_AUTH=true')
  }

  let socket = secure
    ? tls.connect({ host, port: Number(port), servername: host, timeout: timeoutMs })
    : net.connect({ host, port: Number(port), timeout: timeoutMs })
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('Timeout SMTP')))
  let readResponse = createSmtpReader(socket)
  try {
    assertSmtpCode(await readResponse(), 220, 'connect')
    const ehlo = await smtpCommand(socket, readResponse, `EHLO ${host}`, [250])
    if (!secure && starttls) {
      if (!smtpSupportsCapability(ehlo, 'STARTTLS')) throw new Error('SMTP STARTTLS no soportado por el servidor')
      await smtpCommand(socket, readResponse, 'STARTTLS', 220)
      readResponse.close()
      socket = await upgradeSmtpToTls(socket, { host, timeoutMs })
      readResponse = createSmtpReader(socket)
      await smtpCommand(socket, readResponse, `EHLO ${host}`, [250])
    }
    if (hasAuth) {
      await smtpCommand(socket, readResponse, 'AUTH LOGIN', 334)
      await smtpCommand(socket, readResponse, Buffer.from(user).toString('base64'), 334)
      await smtpCommand(socket, readResponse, Buffer.from(pass).toString('base64'), 235)
    }
    await smtpCommand(socket, readResponse, `MAIL FROM:<${from}>`, 250)
    for (const recipient of recipients) {
      await smtpCommand(socket, readResponse, `RCPT TO:<${recipient}>`, [250, 251])
    }
    await smtpCommand(socket, readResponse, 'DATA', 354)
    const { contentTypeHeader, body } = buildEmailBody({ html, attachments })
    const message = [
      `From: ${encodeHeader(fromName)} <${from}>`,
      `To: ${recipients.join(', ')}`,
      `Subject: ${encodeHeader(subject)}`,
      'MIME-Version: 1.0',
      contentTypeHeader,
      '',
      dotStuff(body),
      '.',
      '',
    ].join('\r\n')
    socket.write(message)
    assertSmtpCode(await readResponse(), 250, 'DATA body')
    await smtpCommand(socket, readResponse, 'QUIT', 221).catch(() => {})
    return { accepted: recipients }
  } finally {
    readResponse.close()
    socket.end()
  }
}

export async function notifyStockCritico(report, {
  env = process.env,
  sender = sendSmtpMail,
  date = new Date(),
} = {}) {
  if (report.totales.total <= 0) return { sent: false, reason: 'sin-stock-critico' }

  const recipients = splitRecipients(env.STOCK_CRITICO_EMAIL_TO)
  if (!recipients.length) return { sent: false, reason: 'sin-destinatarios' }

  const enabled = parseBool(env.STOCK_CRITICO_EMAIL_ENABLED, env.NODE_ENV !== 'test')
  if (!enabled) return { sent: false, reason: 'email-deshabilitado', recipients }

  const subject = `Acuse stock critico ${formatChileDate(date)}`
  const html = buildStockCriticoHtml(report, { date })
  const port = Number(env.STOCK_CRITICO_SMTP_PORT || 25)
  const secure = parseBool(env.STOCK_CRITICO_SMTP_SECURE)
  const hasAuth = Boolean(env.STOCK_CRITICO_SMTP_USER && env.STOCK_CRITICO_SMTP_PASS)
  const starttls = parseBool(env.STOCK_CRITICO_SMTP_STARTTLS, !secure && (port === 587 || hasAuth))
  const result = await sender({
    host: env.STOCK_CRITICO_SMTP_HOST || 'localhost',
    port,
    secure,
    starttls,
    allowInsecureAuth: parseBool(env.STOCK_CRITICO_SMTP_ALLOW_INSECURE_AUTH),
    user: env.STOCK_CRITICO_SMTP_USER,
    pass: env.STOCK_CRITICO_SMTP_PASS,
    from: env.STOCK_CRITICO_EMAIL_FROM || DEFAULT_FROM,
    fromName: env.STOCK_CRITICO_EMAIL_FROM_NAME || DEFAULT_FROM_NAME,
    to: recipients,
    subject,
    html,
  })
  return { sent: true, recipients, result }
}

function createPrisma() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export async function runStockCriticoJob({
  prisma = createPrisma(),
  env = process.env,
  logger = console,
  date = new Date(),
  sender = sendSmtpMail,
  disconnect = true,
} = {}) {
  try {
    const report = await collectStockCritico(prisma)
    logger.log(`[stockCritico ${date.toISOString().slice(0, 10)}] productos criticos: ${report.productos.length} / materiales taller criticos: ${report.materiales.length}`)
    if (parseBool(env.STOCK_CRITICO_LOG_DETALLE)) logger.log(buildStockCriticoText(report))
    const email = await notifyStockCritico(report, { env, sender, date })
    logger.log(`[stockCritico] email: ${email.sent ? 'enviado' : email.reason}`)
    return { ...report, email }
  } finally {
    if (disconnect) await prisma.$disconnect()
  }
}

const executedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (executedPath === import.meta.url) {
  runStockCriticoJob()
    .then(r => {
      console.log('done', { productos: r.productos.length, materiales: r.materiales.length, email: r.email })
      process.exit(0)
    })
    .catch(e => {
      console.error(e)
      process.exit(1)
    })
}
