import { useQuery } from '@tanstack/react-query'
import api from './client'

export function useReporteGerencialFiltros(enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-v1-filtros'],
    queryFn: () => api.get('/reportes/gerencial/v1/filtros').then(r => r.data),
    enabled,
    staleTime: 300_000,
  })
}

export function useReporteComercialGerencial(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-v1-comercial', params],
    queryFn: () => api.get('/reportes/gerencial/v1/comercial', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteGerencialResumen(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-v1-resumen', params],
    queryFn: () => api.get('/reportes/gerencial/v1/resumen', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteGerencialVentas(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-ventas', params],
    queryFn: () => api.get('/reportes/gerencial/ventas', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteGerencialCobranzaCaja(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-cobranza-caja', params],
    queryFn: () => api.get('/reportes/gerencial/cobranza-caja', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteGerencialStock(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-stock', params],
    queryFn: () => api.get('/reportes/gerencial/stock', { params }).then(r => r.data),
    enabled,
    staleTime: 120_000,
  })
}

export function useReporteGerencialLicitaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-licitaciones', params],
    queryFn: () => api.get('/reportes/gerencial/licitaciones', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteGerencialOperaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'gerencial-operaciones', params],
    queryFn: () => api.get('/reportes/gerencial/operaciones', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteVentas(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'ventas', params],
    queryFn: () => api.get('/ventas', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteCaja(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'caja', params],
    queryFn: () => api.get('/caja/historico', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteCobranza(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'cobranza', params],
    queryFn: () => api.get('/cobranza-historico', { params }).then(r => r.data),
    enabled,
    staleTime: 120_000,
  })
}

export function useReporteStockCritico(enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'stock-critico'],
    queryFn: () => api.get('/reportes/stock-critico').then(r => r.data),
    enabled,
    staleTime: 120_000,
  })
}

export function useReporteLicitaciones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'licitaciones', params],
    queryFn: () => api.get('/cotizaciones/reportes', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteOdts(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'odts', params],
    queryFn: () => api.get('/odts', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteDespachos(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'despachos', params],
    queryFn: () => api.get('/despachos', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteComisiones(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'comisiones', params],
    queryFn: () => api.get('/reportes/comisiones', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}

export function useReporteMovimientosAnormales(params = {}, enabled = true) {
  return useQuery({
    queryKey: ['reportes-gerenciales', 'movimientos-anormales', params],
    queryFn: () => api.get('/reportes/movimientos-anormales', { params }).then(r => r.data),
    enabled,
    staleTime: 60_000,
  })
}
