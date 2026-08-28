import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const invalidateCobranzaGestion = (qc) => {
  qc.invalidateQueries({ queryKey: ['cobranza-gestion'] })
  qc.invalidateQueries({ queryKey: ['cobranza-alertas'] })
  qc.invalidateQueries({ queryKey: ['cobranza-cartola'] })
}

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

export const useCobranzaGestiones = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['cobranza-gestion', params],
    queryFn: () => api.get('/cobranza-historico/gestiones', { params }).then(r => r.data),
    placeholderData: { items: [] },
    staleTime: 30_000,
    ...options,
  })

export const useCobranzaAlertas = (options = {}) =>
  useQuery({
    queryKey: ['cobranza-alertas'],
    queryFn: () => api.get('/cobranza-historico/alertas').then(r => r.data),
    placeholderData: { items: [], counts: { preventiva: 0, alta: 0, critica: 0 } },
    staleTime: 30_000,
    ...options,
  })

export const useCrearCobranzaGestion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/cobranza-historico/gestiones', data).then(r => r.data),
    onSuccess: () => invalidateCobranzaGestion(qc),
  })
}

export const useActualizarCompromiso = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/cobranza-historico/compromisos/${id}`, data).then(r => r.data),
    onSuccess: () => invalidateCobranzaGestion(qc),
  })
}

export const useCartolaMovimientos = (params = {}, options = {}) =>
  useQuery({
    queryKey: ['cobranza-cartola', params],
    queryFn: () => api.get('/cobranza-historico/cartola', { params }).then(r => r.data),
    placeholderData: { items: [] },
    staleTime: 30_000,
    ...options,
  })

export const useImportarCartola = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: movimientos => api.post('/cobranza-historico/cartola/importar', { movimientos }).then(r => r.data),
    onSuccess: () => invalidateCobranzaGestion(qc),
  })
}

export const useConciliarCartola = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/cobranza-historico/cartola/${id}/conciliar`, data).then(r => r.data),
    onSuccess: () => invalidateCobranzaGestion(qc),
  })
}

export const useDescartarCartola = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/cobranza-historico/cartola/${id}/descartar`, data).then(r => r.data),
    onSuccess: () => invalidateCobranzaGestion(qc),
  })
}
