import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useCotizaciones = (params = {}) =>
  useQuery({
    queryKey: ['cotizaciones', params],
    queryFn: () => api.get('/cotizaciones', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useCotizacion = (id) =>
  useQuery({
    queryKey: ['cotizaciones', id],
    queryFn: () => api.get(`/cotizaciones/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/cotizaciones', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
  })
}

export const useUpdateCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/cotizaciones/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
  })
}

export const useReportesLicitaciones = (params = {}) =>
  useQuery({
    queryKey: ['cotizaciones-reportes', params],
    queryFn: () => api.get('/cotizaciones/reportes', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useDeleteCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/cotizaciones/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cotizaciones'] }),
  })
}
