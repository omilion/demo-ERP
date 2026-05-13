export function computeEstado(p) {
  if (p.stock === 0) return 'Sin stock'
  if (p.stock < p.stockCritico) return 'Crítico'
  return 'Normal'
}
