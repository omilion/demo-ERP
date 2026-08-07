// Reenvio de DTE por correo al cliente: reusa el transporte SMTP crudo de
// stockCritico.mjs (ya probado en produccion) en vez de levantar un segundo
// stack de mailer. Por defecto apunta al mismo buzon que las alertas de
// stock critico (FACTURACION_SMTP_* cae a STOCK_CRITICO_SMTP_* si no esta
// seteado); se puede separar en un buzon propio via .env si hace falta.
import { sendSmtpMail, parseBool, splitRecipients } from '../jobs/stockCritico.mjs'

const DEFAULT_FROM = 'info@plastimar.cl'
const DEFAULT_FROM_NAME = 'Plastimar.cl'

export async function sendDteEmail({ to, subject, html, attachments = [], env = process.env, sender = sendSmtpMail }) {
  const recipients = splitRecipients(to)
  if (!recipients.length) throw new Error('El documento no tiene un correo de destinatario. Indica uno.')

  const enabled = parseBool(env.FACTURACION_EMAIL_ENABLED, env.NODE_ENV !== 'test')
  if (!enabled) return { sent: false, reason: 'email-deshabilitado', recipients }

  const port = Number(env.FACTURACION_SMTP_PORT || env.STOCK_CRITICO_SMTP_PORT || 25)
  const secure = parseBool(env.FACTURACION_SMTP_SECURE, parseBool(env.STOCK_CRITICO_SMTP_SECURE))
  const user = env.FACTURACION_SMTP_USER || env.STOCK_CRITICO_SMTP_USER
  const pass = env.FACTURACION_SMTP_PASS || env.STOCK_CRITICO_SMTP_PASS
  const hasAuth = Boolean(user && pass)
  const starttls = env.FACTURACION_SMTP_STARTTLS !== undefined
    ? parseBool(env.FACTURACION_SMTP_STARTTLS)
    : (env.STOCK_CRITICO_SMTP_STARTTLS !== undefined ? parseBool(env.STOCK_CRITICO_SMTP_STARTTLS) : (!secure && (port === 587 || hasAuth)))

  const result = await sender({
    host: env.FACTURACION_SMTP_HOST || env.STOCK_CRITICO_SMTP_HOST || 'localhost',
    port,
    secure,
    starttls,
    allowInsecureAuth: parseBool(env.FACTURACION_SMTP_ALLOW_INSECURE_AUTH, parseBool(env.STOCK_CRITICO_SMTP_ALLOW_INSECURE_AUTH)),
    user,
    pass,
    from: env.FACTURACION_EMAIL_FROM || env.STOCK_CRITICO_EMAIL_FROM || DEFAULT_FROM,
    fromName: env.FACTURACION_EMAIL_FROM_NAME || env.STOCK_CRITICO_EMAIL_FROM_NAME || DEFAULT_FROM_NAME,
    to: recipients,
    subject,
    html,
    attachments,
  })
  return { sent: true, recipients, result }
}

export function buildReenvioHtml({ empresa, doc, tipoNombre }) {
  const razonSocial = empresa?.razonSocial || 'Plastimar'
  return `<html><body style="font-family:Arial,sans-serif;color:#222">
<p>Estimado/a,</p>
<p>Adjuntamos el documento tributario electrónico <strong>${tipoNombre} N° ${doc.folio}</strong> emitido por ${razonSocial}.</p>
<p>Encontrará el PDF y el XML del documento adjuntos a este correo.</p>
<p style="color:#777;font-size:12px;margin-top:24px">Este correo fue generado automáticamente por el sistema de facturación de ${razonSocial}.</p>
</body></html>`
}
