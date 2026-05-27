import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const usePagosProveedores = (params = {}) =>
  useQuery({
    queryKey: ['pagos-proveedores', params],
    queryFn: () => api.get('/pagos-proveedores', { params }).then(r => r.data),
    staleTime: 30_000,
  })

export const usePagoProveedor = (id) =>
  useQuery({
    queryKey: ['pagos-proveedores', id],
    queryFn: () => api.get(`/pagos-proveedores/${id}`).then(r => r.data),
    enabled: !!id,
  })

export const exportPagosProveedoresUrl = (params = {}) => {
  const qs = new URLSearchParams(params)
  return `/pagos-proveedores/export${qs.toString() ? `?${qs.toString()}` : ''}`
}

export const downloadPagosProveedoresCsv = async (params = {}, filename = 'pagos_proveedores.csv') => {
  const res = await api.get(exportPagosProveedoresUrl(params), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const useCreatePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/pagos-proveedores', data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pagos-proveedores'] })
      qc.invalidateQueries({ queryKey: ['stock-ingresos'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const useUpdatePagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }) => api.put(`/pagos-proveedores/${id}`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pagos-proveedores'] })
      qc.invalidateQueries({ queryKey: ['pagos-proveedores', vars.id] })
    },
  })
}

export const useAnularPagoProveedor = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, motivo }) => api.post(`/pagos-proveedores/${id}/anular`, { motivo }).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['pagos-proveedores'] })
      qc.invalidateQueries({ queryKey: ['pagos-proveedores', vars.id] })
      qc.invalidateQueries({ queryKey: ['stock-ingresos'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}
