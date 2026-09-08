import { beforeAll, describe, expect, it, vi } from 'vitest'

const generateContent = vi.fn(async request => ({
  candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'consultar_documentacion', args: { tema: 'ventas' } } }] } }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 14 },
  request,
}))

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    constructor() { this.models = { generateContent } }
  },
}))

describe('adaptador del SDK Gemini', () => {
  beforeAll(() => { process.env.GEMINI_API_KEY = 'test-key' })

  it('traduce tools del ERP a function declarations y recupera llamadas', async () => {
    const { generateGeminiTurn } = await import('../src/routes/ai/llm.js')
    const turn = await generateGeminiTurn({
      model: 'gemini-3.5-flash-lite',
      system: 'Ayuda ERP',
      messages: [{ role: 'user', content: '¿Cómo vendo?' }],
      tools: [{ name: 'consultar_documentacion', description: 'Busca ayuda', input_schema: { type: 'object', properties: { tema: { type: 'string' } }, required: ['tema'] } }],
    })
    expect(turn.functionCalls).toEqual([{ name: 'consultar_documentacion', args: { tema: 'ventas' } }])
    expect(turn.usage).toMatchObject({ input_tokens: 10, output_tokens: 4 })
    expect(generateContent.mock.calls[0][0].config.tools[0].functionDeclarations[0].name).toBe('consultar_documentacion')
  })
})
