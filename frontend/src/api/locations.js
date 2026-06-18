import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useSucursales = () =>
  useQuery({
    queryKey: ['sucursales'],
    queryFn: () => api.get('/locations/sucursales').then(r => r.data),
    staleTime: 120_000,
  })

export const useRegiones = () =>
  useQuery({
    queryKey: ['regiones'],
    queryFn: () => api.get('/locations/regiones').then(r => r.data),
    staleTime: 600_000,
  })

// Comunas filtradas por region (codigoRegion). Sin region no consulta.
export const useComunas = (codigoRegion) =>
  useQuery({
    queryKey: ['comunas', codigoRegion],
    queryFn: () => api.get('/locations/comunas', { params: codigoRegion ? { codigoRegion } : {} }).then(r => r.data),
    enabled: codigoRegion != null && codigoRegion !== '',
    staleTime: 600_000,
  })
