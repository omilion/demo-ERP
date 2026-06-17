// Herramientas de UI: el modelo las invoca para controlar la presentacion del
// chat (no consultan datos ni tocan disco). chat.js las intercepta y traduce a
// eventos SSE `ui` que el frontend aplica (p. ej. expandir a pantalla completa).

export const uiToolDefinitions = [
  {
    name: 'ajustar_pantalla',
    description: 'Ajusta el tamaño del panel del chat. Invócala al INICIO de tu respuesta cuando preveas que el resultado será extenso o tabular y conviene más espacio: tablas con varias columnas/filas, comparativas, listados largos o un documento. Usa modo "expandido" para esos casos y "compacto" para respuestas cortas conversacionales. No la llames si una respuesta breve es suficiente.',
    input_schema: {
      type: 'object',
      properties: {
        modo: {
          type: 'string',
          enum: ['expandido', 'compacto'],
          description: 'expandido = pantalla amplia; compacto = panel pequeño',
        },
      },
      required: ['modo'],
    },
  },
]

export const UI_TOOL_NAMES = new Set(uiToolDefinitions.map(t => t.name))

// Resultado trivial devuelto al modelo para que el loop de tool-use continúe.
export function runUiTool(name, input) {
  if (name === 'ajustar_pantalla') {
    const modo = input?.modo === 'expandido' ? 'expandido' : 'compacto'
    return { ok: true, modo }
  }
  return { error: `UI tool desconocida: ${name}` }
}
