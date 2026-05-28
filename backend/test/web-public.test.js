import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

function tokenFor(app, role = 'admin') {
  return app.jwt.sign({
    id: 1,
    role,
    nombre: `Test ${role}`,
    permisosExtra: null,
    scope: 'erp',
    aud: 'plastimar:erp',
    tokenType: 'access',
  })
}

describe('SPR-47 web banners and users', () => {
  let app
  let token
  let uploadsRoot
  let previousUploadsDir
  const created = { banners: [], users: [] }

  beforeAll(async () => {
    previousUploadsDir = process.env.UPLOADS_DIR
    uploadsRoot = await mkdtemp(path.join(os.tmpdir(), 'plastimar-web-uploads-'))
    process.env.UPLOADS_DIR = uploadsRoot
    app = buildApp({ logger: false })
    await app.ready()
    token = tokenFor(app)
  })

  afterAll(async () => {
    await app.prisma.banner.deleteMany({ where: { id: { in: created.banners } } }).catch(() => {})
    await app.prisma.usuarioWeb.deleteMany({ where: { id: { in: created.users } } }).catch(() => {})
    await app.close()
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR
    else process.env.UPLOADS_DIR = previousUploadsDir
    await rm(uploadsRoot, { recursive: true, force: true })
  })

  it('validates banner links and accepts PNG/JPG uploads up to the legacy limit', async () => {
    const unsafe = await app.inject({
      method: 'POST',
      url: '/api/banners',
      headers: { authorization: `Bearer ${token}` },
      payload: { titulo: 'Banner inseguro', imagenUrl: 'javascript:alert(1)' },
    })
    expect(unsafe.statusCode).toBe(400)

    const upload = await app.inject({
      method: 'POST',
      url: '/api/banners/upload',
      headers: { authorization: `Bearer ${token}` },
      payload: { data: 'data:image/png;base64,iVBORw0KGgo=' },
    })
    expect(upload.statusCode).toBe(201)
    const { url } = JSON.parse(upload.body)
    expect(url).toMatch(/^\/uploads\/banners\//)

    const createBanner = await app.inject({
      method: 'POST',
      url: '/api/banners',
      headers: { authorization: `Bearer ${token}` },
      payload: { titulo: 'Banner QA', imagenUrl: url, link: '/catalogo', orden: 1 },
    })
    expect(createBanner.statusCode).toBe(201)
    const body = JSON.parse(createBanner.body)
    created.banners.push(body.id)
  })

  it('enforces email normalization and password minimum for public web users', async () => {
    const marker = `web-user-${Date.now()}@cliente.cl`
    const short = await app.inject({
      method: 'POST',
      url: '/api/usuarios-web/register',
      payload: { email: marker, nombre: 'Cliente Web', password: '123' },
    })
    expect(short.statusCode).toBe(400)

    const ok = await app.inject({
      method: 'POST',
      url: '/api/usuarios-web/register',
      payload: { email: marker.toUpperCase(), nombre: ' Cliente Web ', password: '12345678' },
    })
    expect(ok.statusCode).toBe(201)
    const body = JSON.parse(ok.body)
    created.users.push(body.id)
    expect(body.email).toBe(marker)
  })
})
