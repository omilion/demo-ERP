import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useCrm = (params = {}) =>
  useQuery({
    queryKey: ['crm', params],
    queryFn: () => api.get('/crm', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 500 },
    staleTime: 60_000,
  })

export const useCrmEjecutivas = (params = {}) =>
  useQuery({
    queryKey: ['crm', 'ejecutivas', params],
    queryFn: () => api.get('/crm/ejecutivas', { params }).then(r => r.data),
    staleTime: 300_000,
  })

export const useCrmPatch = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.patch(`/crm/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmCreate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: data => api.post('/crm', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmAsignarPendientes = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/crm/asignar-pendientes').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm'] }),
  })
}

export const useCrmOrdenLink = (id, enabled) =>
  useQuery({
    queryKey: ['crm', 'orden-link', id],
    queryFn: () => api.get(`/crm/${id}/orden`).then(r => r.data),
    enabled: !!id && enabled,
    staleTime: 60_000,
  })

export const useCrmConvertirCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/crm/${id}/convertir-cliente`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['crm'] })
    },
  })
}

export const useCrmPendientesHoy = (enabled = true) =>
  useQuery({
    queryKey: ['crm', 'pendientes-hoy'],
    queryFn: () => api.get('/crm/pendientes-hoy').then(r => r.data),
    staleTime: 30_000,
    enabled,
  })

export const useCrmMetricas = (params = {}) =>
  useQuery({
    queryKey: ['crm', 'metricas', params],
    queryFn: () => api.get('/crm/metricas', { params }).then(r => r.data),
    staleTime: 60_000,
  })

export const useCrmCatalogos = () =>
  useQuery({
    queryKey: ['crm', 'catalogos'],
    queryFn: () => api.get('/crm/catalogos').then(r => r.data),
    staleTime: 30 * 60_000,
  })

export const useCrmDetalle = (id, enabled = true) =>
  useQuery({
    queryKey: ['crm', 'detalle', id],
    queryFn: () => api.get(`/crm/${id}`).then(r => r.data),
    enabled: Boolean(id) && enabled,
  })

export const useCrmTransicion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/crm/${id}/transiciones`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['crm'] })
      qc.invalidateQueries({ queryKey: ['crm', 'detalle', variables.id] })
    },
  })
}

export const useUpdateCrmCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ crmId, ...data }) => api.put(`/crm/${crmId}/cotizacion`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['crm'] })
      qc.invalidateQueries({ queryKey: ['crm', 'detalle', variables.crmId] })
      qc.invalidateQueries({ queryKey: ['crm', 'cotizacion-versiones', variables.crmId] })
    },
  })
}

// CU-06: historial de la propuesta. La version vigente viene aparte de las
// archivadas, para poder compararlas.
export const useCrmCotizacionVersiones = crmId => useQuery({
  queryKey: ['crm', 'cotizacion-versiones', crmId],
  queryFn: () => api.get(`/crm/${crmId}/cotizacion/versiones`).then(r => r.data),
  enabled: Boolean(crmId),
  retry: false,
})

export const useRegistrarAceptacionCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ crmId, ...data }) => api.post(`/crm/${crmId}/cotizacion/aceptacion`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['crm', 'detalle', variables.crmId] })
      qc.invalidateQueries({ queryKey: ['crm', 'cotizacion-versiones', variables.crmId] })
    },
  })
}

export const useCrmGestionCreate = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/crm/${id}/gestiones`, data).then(r => r.data),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['crm'] })
      qc.invalidateQueries({ queryKey: ['crm', 'detalle', variables.id] })
    },
  })
}
