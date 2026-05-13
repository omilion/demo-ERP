import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useCobranzaHistorico = (params = {}) =>
  useQuery({
    queryKey: ['cobranza-historico', params],
    queryFn: () => api.get('/cobranza-historico', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, stats: { cobrado: 0, pendiente: 0, n_canceladas: 0, n_pendientes: 0, n_nulas: 0 } },
    staleTime: 120_000,
  })

export const useCobranzaEjecutivas = () =>
  useQuery({
    queryKey: ['cobranza-historico', 'ejecutivas'],
    queryFn: () => api.get('/cobranza-historico/ejecutivas').then(r => r.data),
    staleTime: 300_000,
  })

export const useCobranzaMeses = () =>
  useQuery({
    queryKey: ['cobranza-historico', 'meses'],
    queryFn: () => api.get('/cobranza-historico/meses').then(r => r.data),
    staleTime: 300_000,
  })
