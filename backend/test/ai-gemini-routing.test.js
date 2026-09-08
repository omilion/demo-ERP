import { describe, expect, it } from 'vitest'
import { AI_MODELS, buildSystemPrompt, modelForMode, selectAiMode } from '../src/routes/ai/llm.js'
import { runUiTool, UI_TOOL_NAMES } from '../src/routes/ai/ui-tools.js'
import { estimateCost } from '../src/routes/admin/ai-balance.js'

describe('enrutamiento de modelos Gemini', () => {
  it('usa Flash-Lite para ayuda documental simple', () => {
    const mode = selectAiMode({ user: { role: 'vendedor' }, messages: [{ role: 'user', content: '¿Cómo creo una venta?' }] })
    expect(mode).toBe('documental')
    expect(modelForMode(mode)).toBe('gemini-3.5-flash-lite')
  })

  it('usa Flash cuando existe contexto de pantalla', () => {
    const mode = selectAiMode({ user: { role: 'bodeguero' }, context: { route: '/bodega/123' } })
    expect(mode).toBe('contextual')
    expect(modelForMode(mode)).toBe('gemini-3.5-flash')
  })

  it('reserva 3.6 Flash para análisis gerencial de admin', () => {
    expect(selectAiMode({ user: { role: 'admin' }, messages: [{ role: 'user', content: 'Prepara un informe gerencial de margen' }] })).toBe('gerencial')
    expect(selectAiMode({ user: { role: 'vendedor' }, requestedMode: 'gerencial' })).toBe('documental')
    expect(AI_MODELS.gerencial).toBe('gemini-3.6-flash')
  })

  it('incluye contexto sin permitir ampliar permisos', () => {
    const prompt = buildSystemPrompt({ role: 'cajero', nombre: 'Caja' }, { route: '/caja', title: 'Caja diaria' }, 'contextual')
    expect(prompt).toContain('/caja')
    expect(prompt).toContain('No asumas datos')
  })
})

describe('acciones seguras del copiloto', () => {
  it('propone navegación interna con confirmación', () => {
    expect(UI_TOOL_NAMES.has('proponer_accion_segura')).toBe(true)
    const result = runUiTool('proponer_accion_segura', { tipo: 'navegar', titulo: 'Abrir bodega', ruta: '/bodega' })
    expect(result.actionProposal).toMatchObject({ tipo: 'navegar', ruta: '/bodega', requiresConfirmation: true })
  })

  it('rechaza URLs externas', () => {
    expect(runUiTool('proponer_accion_segura', { tipo: 'navegar', titulo: 'Salir', ruta: 'https://example.com' })).toHaveProperty('error')
  })
})

describe('costeo IA Balance', () => {
  it('estima tarifas estándar de los tres modelos', () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 }
    expect(estimateCost('gemini-3.5-flash-lite', usage)).toBeCloseTo(2.8)
    expect(estimateCost('gemini-3.5-flash', usage)).toBeCloseTo(10.5)
    expect(estimateCost('gemini-3.6-flash', usage)).toBeCloseTo(4.5)
  })
})
