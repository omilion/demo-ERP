import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useStockIngresos = (params = {}) =>
  useQuery({
    queryKey: ['stock-ingresos', params],
    queryFn: () => api.get('/stock-ingresos', { params }).then(r => r.data),
    placeholderData: { items: [], total: 0, limit: 100, stats: { montoTotal: 0, pendientesStock: 0 } },
    staleTime: 60_000,
  })

export const useAplicarStock = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pagoId) => api.post(`/stock-ingresos/aplicar/${pagoId}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-ingresos'] })
      qc.invalidateQueries({ queryKey: ['productos'] })
    },
  })
}

export const stockIngresosExportUrl = (params = {}) => {
  const qs = new URLSearchParams({ ...params, onlyBodega: 'true' })
  return `/pagos-proveedores/export${qs.toString() ? `?${qs.toString()}` : ''}`
}

export const downloadStockIngresosCsv = async (params = {}, filename = 'facturas_bodega.csv') => {
  const res = await api.get(stockIngresosExportUrl(params), { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
