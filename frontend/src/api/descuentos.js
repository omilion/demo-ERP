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

export const useUpdateDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ tipo, id, valor }) => api.put(`/descuentos/${tipo}/${id}`, { valor }).then(r => r.data),
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

export const useReglasDescuento = (enabled = true) =>
  useQuery({
    queryKey: ['descuentos', 'reglas'],
    queryFn: () => api.get('/descuentos/reglas').then(r => r.data),
    enabled,
    retry: false,
    staleTime: 30_000,
  })

export const useCreateReglaDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/descuentos/reglas', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descuentos', 'reglas'] })
      qc.invalidateQueries({ queryKey: ['descuentos'] })
    },
  })
}

export const useUpdateReglaDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/descuentos/reglas/${id}`, data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descuentos', 'reglas'] })
      qc.invalidateQueries({ queryKey: ['descuentos'] })
    },
  })
}

export const useDeleteReglaDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/descuentos/reglas/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['descuentos', 'reglas'] })
      qc.invalidateQueries({ queryKey: ['descuentos'] })
    },
  })
}

export const useEvaluarDescuentos = () =>
  useMutation({
    mutationFn: (data) => api.post('/descuentos/evaluar', data).then(r => r.data),
    retry: false,
  })

export const useSolicitarDescuento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/descuentos/solicitudes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'solicitudes'] }),
  })
}

export const useSolicitudesDescuento = (enabled = true) =>
  useQuery({
    queryKey: ['descuentos', 'solicitudes'],
    queryFn: () => api.get('/descuentos/solicitudes').then(r => r.data),
    enabled,
    staleTime: 15_000,
  })

export const useAprobarDescuentoSolicitud = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/descuentos/solicitudes/${id}/aprobar`, { motivo }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'solicitudes'] }),
  })
}

export const useRechazarDescuentoSolicitud = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/descuentos/solicitudes/${id}/rechazar`, { motivo }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['descuentos', 'solicitudes'] }),
  })
}

export const useEvaluarDescuentoCotizacion = () =>
  useMutation({
    mutationFn: ({ id, data }) => api.post(`/cotizaciones/${id}/descuento/evaluar`, data).then(r => r.data),
    retry: false,
  })

export const useSolicitarDescuentoCotizacion = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.post(`/cotizaciones/${id}/descuento/solicitar`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['cotizaciones', vars.id] })
      qc.invalidateQueries({ queryKey: ['descuentos', 'solicitudes'] })
    },
  })
}
