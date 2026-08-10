import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTallerCorteConfig = () => useQuery({
  queryKey: ['taller-corte', 'config'],
  queryFn: () => api.get('/taller-corte/config').then(r => r.data),
  staleTime: 5 * 60_000,
})

export const useTallerCorteItems = (params = {}) => useQuery({
  queryKey: ['taller-corte', 'items', params],
  queryFn: () => api.get('/taller-corte/items', { params }).then(r => r.data),
  placeholderData: { items: [], taller: null },
  staleTime: 15_000,
})

function invalidate(qc) {
  qc.invalidateQueries({ queryKey: ['taller-corte'] })
  qc.invalidateQueries({ queryKey: ['odts'] })
}

export const useRegistrarTallerCorteAvance = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tallerItemId, data }) => api.post(`/taller-corte/items/${tallerItemId}/avances`, data).then(r => r.data),
    onSuccess: () => invalidate(qc),
  })
}

export const useSubirTallerCorteEvidencia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tallerItemId, data, nombreArchivo }) => api.post(`/taller-corte/items/${tallerItemId}/evidencias`, { data, nombreArchivo }).then(r => r.data),
    onSuccess: () => invalidate(qc),
  })
}
