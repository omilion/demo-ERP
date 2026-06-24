import { useQuery } from '@tanstack/react-query'
import api from './client'

// Notificaciones calculadas al vuelo. Refresca cada 2 min y al abrir la campana.
export const useNotificaciones = () =>
  useQuery({
    queryKey: ['notificaciones'],
    queryFn: () => api.get('/notificaciones').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
  })
