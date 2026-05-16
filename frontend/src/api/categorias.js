import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useCategorias = () =>
  useQuery({
    queryKey: ['categorias'],
    queryFn: () => api.get('/categorias').then(r => r.data),
    staleTime: 60_000,
  })
