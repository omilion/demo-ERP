import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const useTalleres = () =>
  useQuery({
    queryKey: ['talleres'],
    queryFn: () => api.get('/pasar-taller/talleres').then(r => r.data),
    staleTime: 300_000,
  })

export const usePasarTallerPendientes = ({ dias } = {}) =>
  useQuery({
    queryKey: ['pasar-taller', 'pendientes', dias || null],
    queryFn: () => api.get('/pasar-taller/pendientes', {
      params: { ...(dias ? { dias } : {}) },
    }).then(r => r.data),
    placeholderData: { items: [], total: 0, scanned: 0 },
  })

// Contador para el menu: sin un numero visible el item pasa desapercibido y las
// excepciones se descubren tarde. Se refresca cada pocos minutos, no en cada
// render, porque la consulta recorre las ventas activas del periodo.
export const useExcepcionesTallerCount = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: ['pasar-taller', 'pendientes', null],
    queryFn: () => api.get('/pasar-taller/pendientes').then(r => r.data),
    select: data => data?.total ?? 0,
    enabled,
    staleTime: 300_000,
    refetchOnWindowFocus: false,
    retry: false,
  })

export const usePasarTallerOrden = ({ ordenId, nInterno } = {}) =>
  useQuery({
    queryKey: ['pasar-taller', 'orden', ordenId || null, nInterno || null],
    queryFn: () => api.get('/pasar-taller/orden', {
      params: {
        ...(ordenId ? { ordenId } : {}),
        ...(nInterno ? { nInterno } : {}),
      },
    }).then(r => r.data),
    enabled: Boolean(ordenId || nInterno),
    placeholderData: { orden: null, odt: null, odts: [], items: [], talleres: [] },
  })

export const useEnviarTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/pasar-taller/enviar', data).then(r => r.data),
    onSuccess: (_, data) => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['pasar-taller'] })
      if (data?.odtId) qc.invalidateQueries({ queryKey: ['odts', Number(data.odtId)] })
      if (data?.ordenId) qc.invalidateQueries({ queryKey: ['ventas', Number(data.ordenId)] })
    },
  })
}

export const useEliminarItemTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/pasar-taller/items/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['odts'] })
      qc.invalidateQueries({ queryKey: ['pasar-taller'] })
    },
  })
}

export const useCreateTaller = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/pasar-taller/talleres', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['talleres'] }),
  })
}
