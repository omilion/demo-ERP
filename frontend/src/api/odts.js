import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useOdts = (params = {}) =>
  useQuery({
    queryKey: ['odts', params],
    queryFn: () => api.get('/odts', { params }).then(r => r.data),
    staleTime: 30_000,
    placeholderData: { items: [], total: 0, limit: 100 },
  })

export const useOdtKanban = (params = {}, enabled = true) =>
  useQuery({
    queryKey: ['odts', 'kanban', params],
    queryFn: () => api.get('/odts/kanban', { params }).then(r => r.data),
    enabled,
    staleTime: 30_000,
    placeholderData: { items: [], total: 0, limit: 1000, stats: {}, estados: [] },
  })

export const useOdtOperarios = (params = {}) =>
  useQuery({
    queryKey: ['odts', 'operarios', params],
    queryFn: () => api.get('/odts/meta/operarios', { params }).then(r => r.data),
    placeholderData: { items: [], estados: [] },
    staleTime: 5 * 60_000,
  })

export const useOdtCargaOperarios = () =>
  useQuery({
    queryKey: ['odts', 'carga-operarios'],
    queryFn: () => api.get('/odts/meta/carga-operarios').then(r => r.data),
    placeholderData: { items: [], estados: [] },
    staleTime: 60_000,
  })

export const useOdtProductividad = (params = {}) =>
  useQuery({
    queryKey: ['odts', 'productividad', params],
    queryFn: () => api.get('/odts/meta/productividad', { params }).then(r => r.data),
    placeholderData: { items: [], totalOdts: 0, limit: 500 },
    staleTime: 60_000,
  })

export const useOdt = (id) =>
  useQuery({
    queryKey: ['odts', id],
    queryFn: () => api.get(`/odts/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/odts', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useUpdateOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/odts/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useDeleteOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/odts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['odts'] }),
  })
}

export const useOdtEstado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => api.put(`/odts/${id}`, { estado }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['odts', 'kanban'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useCerrarOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado = 'Terminada', razon }) => api.post(`/odts/${id}/cerrar`, { estado, razon }).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['odts', Number(id)] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useAnularOdt = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, razon }) => api.post(`/odts/${id}/anular`, { razon }).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['odts', Number(id)] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export const useOdtItemTallerEstado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, itemId, tallerItemId, estado, operarioResponsableId, obs }) =>
      api.put(`/odts/${odtId}/items/${itemId}/talleres/${tallerItemId}/estado`, { estado, operarioResponsableId, obs }).then(r => r.data),
    onSuccess: (_, { odtId }) => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['odts', odtId] })
    },
  })
}

export const useOdtTallerEstadoMasivo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, tallerId, estado }) =>
      api.post(`/odts/${odtId}/talleres/${tallerId}/estado`, { estado }).then(r => r.data),
    onSuccess: (_, { odtId }) => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['odts', odtId] })
    },
  })
}

export const useCreateOdtConsumo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, data }) => api.post(`/odts/${odtId}/consumos`, data).then(r => r.data),
    onSuccess: (_, { odtId }) => {
      const id = Number(odtId)
      qc.invalidateQueries({ queryKey: ['odts'] })
      if (id) qc.invalidateQueries({ queryKey: ['odts', id] })
      if (id) qc.invalidateQueries({ queryKey: ['odts', id, 'materiales'] })
      qc.invalidateQueries({ queryKey: ['historial-materiales'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
      qc.invalidateQueries({ queryKey: ['bodega-taller'] })
      qc.invalidateQueries({ queryKey: ['telas'] })
    },
  })
}

export const useOdtMateriales = (odtId) =>
  useQuery({
    queryKey: ['odts', odtId, 'materiales'],
    queryFn: () => api.get(`/odts/${odtId}/materiales`).then(r => r.data),
    enabled: !!odtId,
    placeholderData: { items: [], total: 0 },
    staleTime: 30_000,
  })

export const useDeleteOdtMaterial = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, materialId }) => api.delete(`/odts/${odtId}/materiales/${materialId}`).then(r => r.data),
    onSuccess: (_, { odtId }) => {
      qc.invalidateQueries({ queryKey: ['odts', odtId, 'materiales'] })
      qc.invalidateQueries({ queryKey: ['historial-materiales'] })
    },
  })
}

export const useAddBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, texto }) => api.post(`/odts/${odtId}/bitacora`, { texto }).then(r => r.data),
    onSuccess: (_, { odtId }) => qc.invalidateQueries({ queryKey: ['odts', odtId] }),
  })
}

export const useDeleteBitacora = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ odtId, entryId }) => api.delete(`/odts/${odtId}/bitacora/${entryId}`),
    onSuccess: (_, { odtId }) => qc.invalidateQueries({ queryKey: ['odts', odtId] }),
  })
}

export const useOdtTallerItems = (tallerKind) =>
  useQuery({
    queryKey: ['odts', 'taller-items', tallerKind],
    queryFn: () => api.get('/odts/taller-items', { params: { tallerKind } }).then(r => r.data),
    enabled: !!tallerKind,
  })
