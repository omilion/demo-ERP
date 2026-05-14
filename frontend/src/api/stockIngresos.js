import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useStockIngresos = (params = {}) =>
  useQuery({
    queryKey: ['stock-ingresos', params],
    queryFn: () => api.get('/stock-ingresos', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useAplicarStock = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pagoId) => api.post(`/stock-ingresos/aplicar/${pagoId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-ingresos'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}
