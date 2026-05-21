import { useQuery } from '@tanstack/react-query'
import api from './client'

const emptyList = { items: [], total: 0, limit: 100, stats: {} }

export function useReporteGerencialVentas(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-ventas', params],
    queryFn: () => api.get('/reportes/gerencial/ventas', { params }).then(r => r.data),
    enabled,
    placeholderData: { total: 0, count: 0, fuentes: {}, byPeriodo: {}, byCliente: {}, byVendedor: {}, byTipo: {} },
    staleTime: 60_000,
  })
}

export function useReporteGerencialCobranzaCaja(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-cobranza-caja', params],
    queryFn: () => api.get('/reportes/gerencial/cobranza-caja', { params }).then(r => r.data),
    enabled,
    placeholderData: { cuentasPorCobrar: { porCobrar: 0, cobrado: 0, count: 0, byEstado: {} }, caja: { ingresos: 0, egresos: 0, count: 0, byMedioPago: {} } },
    staleTime: 60_000,
  })
}

export function useReporteGerencialStock(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-stock', params],
    queryFn: () => api.get('/reportes/gerencial/stock', { params }).then(r => r.data),
    enabled,
    placeholderData: { stockCritico: { productos: [], materiales: [], totales: { productosCriticos: 0, materialesCriticos: 0 } }, movimientos: { total: 0 } },
    staleTime: 120_000,
  })
}

export function useReporteGerencialLicitaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-licitaciones', params],
    queryFn: () => api.get('/reportes/gerencial/licitaciones', { params }).then(r => r.data),
    enabled,
    placeholderData: { count: 0, byResultado: { ganada: { count: 0, total: 0 }, perdida: { count: 0, total: 0 }, pendiente: { count: 0, total: 0 } } },
    staleTime: 60_000,
  })
}

export function useReporteGerencialOperaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-operaciones', params],
    queryFn: () => api.get('/reportes/gerencial/operaciones', { params }).then(r => r.data),
    enabled,
    placeholderData: { taller: { pendientes: 0, byEstado: {} }, despachos: { pendientes: 0, vencidos: 0 } },
    staleTime: 60_000,
  })
}

export function useReporteVentas(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'ventas', params],
    queryFn: () => api.get('/ventas', { params }).then(r => r.data),
    enabled,
    placeholderData: emptyList,
    staleTime: 60_000,
  })
}

export function useReporteCaja(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'caja', params],
    queryFn: () => api.get('/caja/historico', { params }).then(r => r.data),
    enabled,
    placeholderData: { ...emptyList, stats: { totalIngresos: 0, totalEgresos: 0 } },
    staleTime: 60_000,
  })
}

export function useReporteCobranza(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'cobranza', params],
    queryFn: () => api.get('/cobranza-historico', { params }).then(r => r.data),
    enabled,
    placeholderData: { ...emptyList, stats: { cobrado: 0, pendiente: 0, n_canceladas: 0, n_pendientes: 0, n_nulas: 0 } },
    staleTime: 120_000,
  })
}

export function useReporteStockCritico(enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'stock-critico'],
    queryFn: () => api.get('/reportes/stock-critico').then(r => r.data),
    enabled,
    placeholderData: { productos: [], materiales: [], totales: { productosCriticos: 0, materialesCriticos: 0 } },
    staleTime: 120_000,
  })
}

export function useReporteLicitaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'licitaciones', params],
    queryFn: () => api.get('/cotizaciones/reportes', { params }).then(r => r.data),
    enabled,
    placeholderData: { items: [], total: 0, stats: { porEstado: {}, porCliente: {}, totalCotizado: 0, totalAdjudicado: 0 } },
    staleTime: 60_000,
  })
}

export function useReporteOdts(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'odts', params],
    queryFn: () => api.get('/odts', { params }).then(r => r.data),
    enabled,
    placeholderData: emptyList,
    staleTime: 60_000,
  })
}

export function useReporteDespachos(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'despachos', params],
    queryFn: () => api.get('/despachos', { params }).then(r => r.data),
    enabled,
    placeholderData: emptyList,
    staleTime: 60_000,
  })
}
