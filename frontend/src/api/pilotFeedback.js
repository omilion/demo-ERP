import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

export const usePilotFeedbackConfig = () => useQuery({
  queryKey: ['pilot-feedback', 'config'],
  queryFn: () => api.get('/feedback/config').then(r => r.data),
  staleTime: 60_000,
  retry: false,
})

export const useCreatePilotFeedback = () => useMutation({
  mutationFn: payload => api.post('/feedback', payload).then(r => r.data),
})

export const usePilotFeedback = filters => useQuery({
  queryKey: ['pilot-feedback', filters],
  queryFn: () => api.get('/feedback', { params: filters }).then(r => r.data),
  staleTime: 15_000,
})

export const useUpdatePilotFeedback = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...payload }) => api.patch(`/feedback/${id}`, payload).then(r => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pilot-feedback'] }),
  })
}

export const getPilotFeedbackCapture = id => api.get(`/feedback/${id}/captura`, { responseType: 'blob' }).then(r => r.data)
