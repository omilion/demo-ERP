// Catalogo unico de procesos de mano de obra.
//
// La tarifa y la receta se cruzan por la clave `tallerId_proceso` en
// minusculas: si el nombre del proceso se escribe libre, un "confeccion" con
// tilde frente a uno sin tilde no cruza con nada y el motor calcula esa hora en
// CERO, sin error visible. Por eso el nombre sale de esta lista y se normaliza
// igual en los dos lados.
export const PROCESOS_COSTEO = [
  { id: 'corte', label: 'Corte de espuma' },
  { id: 'confeccion', label: 'Confección' },
  { id: 'enfundado', label: 'Enfundado' },
  { id: 'armado', label: 'Armado / Esquelaje' },
  { id: 'tapizado', label: 'Tapizado' },
]

// Se sacan las tildes ademas de bajar a minusculas, de modo que "Confeccion"
// con tilde, sin tilde y en mayusculas resuelvan todas al mismo proceso en vez
// de crear tarifas paralelas que no cruzan con ninguna receta.
export function normalizarProceso(valor) {
  return String(valor ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function esProcesoValido(valor) {
  const normalizado = normalizarProceso(valor)
  return PROCESOS_COSTEO.some((proceso) => proceso.id === normalizado)
}

export const PROCESOS_VALIDOS_TEXTO = PROCESOS_COSTEO.map((proceso) => proceso.id).join(', ')
