import { useQuery } from '@tanstack/react-query'
import api from './client'

export const useDashboardStats = () =>
  useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => api.get('/dashboard/stats').then(r => r.data),
    staleTime: 60_000,
    refetchInterval: 120_000,
    placeholderData: {
      ventas: { noPagadas: 0, pendienteEntrega: 0 },
      odts: { pendientes: 0, enProceso: 0, urgentes: 0, total: 0 },
      talleres: [
        { tipo: 'Espumas',      activas: 0 },
        { tipo: 'Confecciones', activas: 0 },
        { tipo: 'Madera',       activas: 0 },
      ],
      stock: {},
      crm: { pendientes: 0, enGestion: 0, altaPrioridad: 0 },
      proveedores: { total: 0 },
      cobranzaHistorico: { cobrado: 0, pendientes: 0 },
    },
  })
