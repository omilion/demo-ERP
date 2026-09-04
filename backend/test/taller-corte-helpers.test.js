import { describe, expect, it } from 'vitest'
import { buildProgressSummary, getCorteAdvanceBlocker, parseImageDataUrl } from '../src/routes/taller-corte/index.js'

describe('Taller de Corte helpers', () => {
  it('bloquea cualquier avance que supere el objetivo acumulado', () => {
    expect(getCorteAdvanceBlocker({ objetivo: 10, totalPrevio: 7, cantidad: 3 })).toBeNull()
    expect(getCorteAdvanceBlocker({ objetivo: 10, totalPrevio: 7, cantidad: 3.01 })).toMatch(/supera la cantidad objetivo/)
  })

  it('calcula avance acumulado y porcentaje sin superar 100%', () => {
    const item = { odtItem: { cantidad: 10 } }
    const result = buildProgressSummary(item, [
      { cantidadTerminada: 3 },
      { cantidadTerminada: 8 },
    ])

    expect(result.totalTerminado).toBe(11)
    expect(result.porcentaje).toBe(100)
    expect(result.restante).toBe(0)
  })

  it('valida evidencias como data URL de imagen', () => {
    const valid = parseImageDataUrl(`data:image/png;base64,${Buffer.from('foto').toString('base64')}`)
    const invalid = parseImageDataUrl('data:application/pdf;base64,ZmFrZQ==')

    expect(valid.error).toBeUndefined()
    expect(valid.mimeType).toBe('image/png')
    expect(invalid.error).toContain('imagen JPG')
  })
})
