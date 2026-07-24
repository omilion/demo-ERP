import https from 'node:https'

const GMAIL_HOST = 'gmail.googleapis.com'
const TOKEN_HOST = 'oauth2.googleapis.com'

const request = (host, path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = https.request({ host, path, method, headers, timeout: 30_000 }, (res) => {
    const chunks = []
    res.on('data', chunk => chunks.push(chunk))
    res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf8') }))
  })
  req.on('timeout', () => req.destroy(new Error('Gmail API no respondió a tiempo.')))
  req.on('error', reject)
  if (body) req.write(body)
  req.end()
})

const gmailConfig = (env = process.env) => {
  const clientId = env.GMAIL_RECEPTOR_CLIENT_ID
  const clientSecret = env.GMAIL_RECEPTOR_CLIENT_SECRET
  const refreshToken = env.GMAIL_RECEPTOR_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Faltan GMAIL_RECEPTOR_CLIENT_ID, GMAIL_RECEPTOR_CLIENT_SECRET o GMAIL_RECEPTOR_REFRESH_TOKEN.')
  return { clientId, clientSecret, refreshToken }
}

const parseJson = (response, action) => {
  let data
  try { data = JSON.parse(response.body) } catch { throw new Error(`${action}: respuesta inválida de Google (HTTP ${response.statusCode}).`) }
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`${action}: Google respondió HTTP ${response.statusCode}${data?.error?.message ? ` — ${data.error.message}` : ''}.`)
  return data
}

export const decodeBase64Url = (value) => Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export const refreshGmailAccessToken = async (env = process.env) => {
  const { clientId, clientSecret, refreshToken } = gmailConfig(env)
  const body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }).toString()
  const response = await request(TOKEN_HOST, '/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }, body })
  const data = parseJson(response, 'No se pudo refrescar el token Gmail')
  if (!data.access_token) throw new Error('Google no devolvió access_token para Gmail.')
  return data.access_token
}

const gmailJson = async (path, accessToken) => {
  const response = await request(GMAIL_HOST, path, { headers: { Authorization: `Bearer ${accessToken}` } })
  return parseJson(response, 'Gmail API')
}

const header = (headers, name) => (headers || []).find(item => String(item.name).toLowerCase() === name.toLowerCase())?.value || ''
const xmlParts = (payload) => [payload, ...(payload?.parts || []).flatMap(xmlParts)].filter(part => part && (/\.xml$/i.test(part.filename || '') || /xml/i.test(part.mimeType || '')) && (part.body?.attachmentId || part.body?.data))

export const listGmailXmlAttachments = async ({ maxResults = 100, pageToken } = {}, env = process.env) => {
  const accessToken = await refreshGmailAccessToken(env)
  const params = new URLSearchParams({ q: 'has:attachment filename:xml', maxResults: String(Math.min(Math.max(Number(maxResults) || 100, 1), 500)) })
  if (pageToken) params.set('pageToken', pageToken)
  const listed = await gmailJson(`/gmail/v1/users/me/messages?${params}`, accessToken)
  const messages = await Promise.all((listed.messages || []).map(async ({ id, threadId }) => {
    const full = await gmailJson(`/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`, accessToken)
    return {
      id, threadId, internalDate: full.internalDate ? new Date(Number(full.internalDate)) : null,
      from: header(full.payload?.headers, 'From'), subject: header(full.payload?.headers, 'Subject'),
      attachments: xmlParts(full.payload).map((part, index) => ({ id: part.body?.attachmentId || `inline:${index}`, filename: part.filename || 'documento.xml', inlineData: part.body?.data || null })),
    }
  }))
  return { messages, nextPageToken: listed.nextPageToken || null, accessToken }
}

export const downloadGmailAttachment = async ({ messageId, attachmentId, inlineData, accessToken }) => {
  if (inlineData) return decodeBase64Url(inlineData)
  if (!attachmentId || String(attachmentId).startsWith('inline:')) throw new Error('El adjunto Gmail no tiene contenido descargable.')
  const data = await gmailJson(`/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`, accessToken)
  if (!data.data) throw new Error('Gmail no devolvió datos para el adjunto XML.')
  return decodeBase64Url(data.data)
}
