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
  {
    name: 'proponer_accion_segura',
    description: 'Prepara una acción reversible para que el usuario la revise y confirme. Solo permite navegar a una ruta interna, mostrar una lista de verificación o preparar un borrador de texto. No ejecuta cambios de negocio.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['navegar', 'checklist', 'borrador'] },
        titulo: { type: 'string', description: 'Descripción breve y explícita de lo que se propone.' },
        ruta: { type: 'string', description: 'Ruta interna del ERP; requerida solo para navegar.' },
        contenido: { type: 'string', description: 'Checklist o borrador que se mostrará al usuario.' },
      },
      required: ['tipo', 'titulo'],
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
  if (name === 'proponer_accion_segura') {
    const tipo = ['navegar', 'checklist', 'borrador'].includes(input?.tipo) ? input.tipo : null
    const titulo = String(input?.titulo || '').trim().slice(0, 180)
    const ruta = String(input?.ruta || '').trim().slice(0, 240)
    const contenido = String(input?.contenido || '').trim().slice(0, 6000)
    if (!tipo || !titulo) return { error: 'La propuesta requiere tipo y título.' }
    if (tipo === 'navegar' && (!ruta.startsWith('/') || ruta.startsWith('//'))) {
      return { error: 'Solo se permiten rutas internas del ERP.' }
    }
    return {
      ok: true,
      actionProposal: {
        tipo,
        titulo,
        ruta: tipo === 'navegar' ? ruta : undefined,
        contenido: tipo !== 'navegar' ? contenido : undefined,
        requiresConfirmation: true,
      },
    }
  }
  return { error: `UI tool desconocida: ${name}` }
}
