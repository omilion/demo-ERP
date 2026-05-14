import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useDescuentos = () =>
  useQuery({
    queryKey: ['descuentos'],
    queryFn: () => api.get('/descuentos').then(r => r.data),
    staleTime: 60_000,
  })

export const useCreateDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tipo, valor }) => api.post(`/descuentos/${tipo}`, { valor }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos'] }),
  })
}

export const useDeleteDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tipo, id }) => api.delete(`/descuentos/${tipo}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos'] }),
  })
}
