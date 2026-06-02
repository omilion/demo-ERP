import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

// ── Trabajadores ──────────────────────────────────────────────────
export const useTrabajadores = (params = {}) =>
  useQuery({
    queryKey: ['rrhh', 'trabajadores', params],
    queryFn: () => api.get('/rrhh/trabajadores', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100 },
    staleTime: 60_000,
  })

export const useRrhhCargos = (params = {}) =>
  useQuery({
    queryKey: ['rrhh', 'cargos', params],
    queryFn: () => api.get('/rrhh/cargos', { params }).then(r => r.data),
    placeholderData: [],
    staleTime: 5 * 60_000,
  })

export const useRrhhOperativo = (params = {}) =>
  useQuery({
    queryKey: ['rrhh', 'operativo', params],
    queryFn: () => api.get('/rrhh/operativo', { params }).then(r => r.data),
    placeholderData: {
      totalActivos: 0,
      alertas: {},
      dotacionPorCargo: [],
      sinSueldo: [],
      sinCargo: [],
      sinFechaIngreso: [],
      contratosPorVencer: [],
      licenciasActivas: [],
      vacacionesProgramadas: [],
    },
    staleTime: 60_000,
  })

export const useTrabajador = (id) =>
  useQuery({
    queryKey: ['rrhh', 'trabajadores', id],
    queryFn: () => api.get(`/rrhh/trabajadores/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateTrabajador = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/rrhh/trabajadores', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores'] }),
  })
}

export const useUpdateTrabajador = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.put(`/rrhh/trabajadores/${id}`, data).then(r => r.data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores'] })
      qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores', id] })
    },
  })
}

export const useDeleteTrabajador = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/rrhh/trabajadores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores'] }),
  })
}

// ── Sub-recursos genéricos ───────────────────────────────────────
function makeSubResource(path) {
  const useCreate = () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ trabajadorId, ...data }) => api.post(`/rrhh/trabajadores/${trabajadorId}/${path}`, data).then(r => r.data),
      onSuccess: (_, { trabajadorId }) => qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores', trabajadorId] }),
    })
  }
  const useUpdate = () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: (payload) => {
        const { id, ...data } = payload
        delete data.trabajadorId
        return api.put(`/rrhh/${path}/${id}`, data).then(r => r.data)
      },
      onSuccess: (_, { trabajadorId }) => {
        if (trabajadorId) qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores', trabajadorId] })
      },
    })
  }
  const useDelete = () => {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: ({ id }) => api.delete(`/rrhh/${path}/${id}`),
      onSuccess: (_, { trabajadorId }) => {
        if (trabajadorId) qc.invalidateQueries({ queryKey: ['rrhh', 'trabajadores', trabajadorId] })
      },
    })
  }
  return { useCreate, useUpdate, useDelete }
}

export const contratos = makeSubResource('contratos')
export const liquidaciones = makeSubResource('liquidaciones')
export const anticipos = makeSubResource('anticipos')
export const licencias = makeSubResource('licencias')
export const vacaciones = makeSubResource('vacaciones')
export const epps = makeSubResource('epps')
export const hojasVida = makeSubResource('hojas-vida')
export const horasExtras = makeSubResource('horas-extras')
export const reglamentos = makeSubResource('reglamentos')

// ── Asistencias ──────────────────────────────────────────────────
export const useAsistencias = (params = {}) =>
  useQuery({
    queryKey: ['rrhh', 'asistencias', params],
    queryFn: () => api.get('/rrhh/asistencias', { params }).then(r => r.data),
    placeholderData: [],
  })

export const useCreateAsistencia = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/rrhh/asistencias', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rrhh', 'asistencias'] }),
  })
}

// ── Catálogos ────────────────────────────────────────────────────
export const useJornadas = () =>
  useQuery({ queryKey: ['rrhh', 'jornadas'], queryFn: () => api.get('/rrhh/jornadas').then(r => r.data), staleTime: 5 * 60_000 })

export const useTipoDias = () =>
  useQuery({ queryKey: ['rrhh', 'tipodias'], queryFn: () => api.get('/rrhh/tipodias').then(r => r.data), staleTime: 5 * 60_000 })

export const useResumenRRHH = (empresa) =>
  useQuery({
    queryKey: ['rrhh', 'resumen', empresa],
    queryFn: () => api.get('/rrhh/resumen', { params: empresa ? { empresa } : {} }).then(r => r.data),
    staleTime: 60_000,
  })

export const useLibrosRemuneracion = (params = {}) =>
  useQuery({
    queryKey: ['rrhh', 'libros', params],
    queryFn: () => api.get('/rrhh/libros-remuneracion', { params }).then(r => r.data),
    placeholderData: [],
  })
