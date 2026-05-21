import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useClientes = (params = {}) =>
  useQuery({
    queryKey: ['clientes', params],
    queryFn: () => api.get('/clientes', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const useCliente = (id) =>
  useQuery({
    queryKey: ['clientes', id],
    queryFn: () => api.get(`/clientes/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const useCreateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/clientes', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export const useUpdateCliente = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/clientes/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clientes'] }),
  })
}

export const useClienteSucursales = (clienteId) =>
  useQuery({
    queryKey: ['clientes', clienteId, 'sucursales'],
    queryFn: () => api.get(`/clientes/${clienteId}/sucursales`).then(r => r.data),
    enabled: !!clienteId,
    staleTime: 30_000,
  })

export const useCreateClienteSucursal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clienteId, data }) => api.post(`/clientes/${clienteId}/sucursales`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['clientes', Number(vars.clienteId)] })
      qc.invalidateQueries({ queryKey: ['clientes', vars.clienteId, 'sucursales'] })
    },
  })
}

export const useUpdateClienteSucursal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ clienteId, sucursalId, data }) => api.put(`/clientes/${clienteId}/sucursales/${sucursalId}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['clientes'] })
      qc.invalidateQueries({ queryKey: ['clientes', Number(vars.clienteId)] })
      qc.invalidateQueries({ queryKey: ['clientes', vars.clienteId, 'sucursales'] })
    },
  })
}
