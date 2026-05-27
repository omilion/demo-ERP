import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app.js'

process.env.JWT_ACCESS_SECRET ||= 'test-access-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret'

describe('SPR-25 uploads static assets', () => {
  let app
  let root
  let previousUploadsDir

  beforeAll(async () => {
    previousUploadsDir = process.env.UPLOADS_DIR
    root = await mkdtemp(path.join(os.tmpdir(), 'plastimar-uploads-'))
    await mkdir(path.join(root, 'fotos_chicas'), { recursive: true })
    await writeFile(path.join(root, 'fotos_chicas', 'demo.txt'), 'demo asset')
    process.env.UPLOADS_DIR = root
    app = buildApp({ logger: false })
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    if (previousUploadsDir === undefined) delete process.env.UPLOADS_DIR
    else process.env.UPLOADS_DIR = previousUploadsDir
    await rm(root, { recursive: true, force: true })
  })

  it('serves migrated product assets from /uploads without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/fotos_chicas/demo.txt' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('demo asset')
  })

  it('does not allow path traversal outside uploads root', async () => {
    const res = await app.inject({ method: 'GET', url: '/uploads/%2e%2e/secret.txt' })
    expect([403, 404]).toContain(res.statusCode)
  })
})
