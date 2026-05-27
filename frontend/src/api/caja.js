import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTurnoActivo = (enabled = true) =>
  useQuery({
    queryKey: ['caja', 'turno-activo'],
    queryFn: () => api.get('/caja/turno').then(r => r.data),
    staleTime: 10_000,
    enabled,
  })

export const useAbrirTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/caja/turno', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCerrarTurno = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const body = typeof payload === 'object' ? { obs: payload.obs, conteo: payload.conteo } : undefined
      return api.post(`/caja/turno/${id}/cerrar`, body).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useCajaHistorico = (params = {}) =>
  useQuery({
    queryKey: ['caja', 'historico', params],
    queryFn: () => api.get('/caja/historico', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, stats: { totalIngresos: 0, totalEgresos: 0 } },
    staleTime: 60_000,
  })

export const useCajaHistoricoYears = () =>
  useQuery({
    queryKey: ['caja', 'historico-years'],
    queryFn: () => api.get('/caja/historico/years').then(r => r.data),
    staleTime: 300_000,
  })

export const useCreateMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ turnoId, data }) =>
      api.post(`/caja/turno/${turnoId}/movimientos`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useRegistrarPagoCobranza = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ordenId, data }) =>
      api.post(`/caja/cobranza/orden/${ordenId}/pago`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
    },
  })
}

export const useCrearDocumentoVenta = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ordenId, data }) =>
      api.post(`/caja/cobranza/orden/${ordenId}/documento`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['caja'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['matriz-ventas'] })
    },
  })
}

export const useDeleteMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const data = typeof payload === 'object' ? { motivo: payload.motivo } : undefined
      return api.delete(`/caja/movimientos/${id}`, { data })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useReactivateMovimiento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload) => {
      const id = typeof payload === 'object' ? payload.id : payload
      const body = typeof payload === 'object' ? { motivo: payload.motivo } : undefined
      return api.patch(`/caja/movimientos/${id}/reactivar`, body).then(r => r.data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['caja'] }),
  })
}

export const useGastos = () =>
  useQuery({
    queryKey: ['gastos'],
    queryFn: () => api.get('/gastos').then(r => r.data),
    staleTime: 300_000,
  })

export const useCierreTurno = (turnoId) =>
  useQuery({
    queryKey: ['caja', 'cierre', turnoId],
    queryFn: () => api.get(`/caja/turno/${turnoId}/cierre`).then(r => r.data),
    enabled: !!turnoId,
  })
