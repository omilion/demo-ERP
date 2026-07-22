import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from './client';

export const useTarifas = (params = {}) =>
  useQuery({
    queryKey: ['costeo-tarifas', params],
    queryFn: () => api.get('/costeo/tarifas', { params }).then((r) => r.data),
    staleTime: 30_000,
  });

export const useCreateTarifa = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/costeo/tarifas', data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costeo-tarifas'] }),
  });
};

export const useDeleteTarifa = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.delete(`/costeo/tarifas/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costeo-tarifas'] }),
  });
};

export const useRecetas = (params = {}) =>
  useQuery({
    queryKey: ['costeo-recetas', params],
    queryFn: () => api.get('/costeo/recetas', { params }).then((r) => r.data),
    staleTime: 30_000,
  });

export const useReceta = (productoId) =>
  useQuery({
    queryKey: ['costeo-receta', productoId],
    queryFn: () => api.get(`/costeo/recetas/${productoId}`).then((r) => r.data),
    enabled: !!productoId,
  });

export const useUpdateReceta = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productoId, data }) => api.put(`/costeo/recetas/${productoId}`, data).then((r) => r.data),
    onSuccess: (_, { productoId }) => {
      qc.invalidateQueries({ queryKey: ['costeo-receta', productoId] });
      qc.invalidateQueries({ queryKey: ['costeo-recetas'] });
    },
  });
};

export const useDeleteReceta = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productoId) => api.delete(`/costeo/recetas/${productoId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['costeo-recetas'] }),
  });
};

export const useCalcularCosteo = (productoId, enabled = false) =>
  useQuery({
    queryKey: ['costeo-calcular', productoId],
    queryFn: () => api.post(`/costeo/recetas/${productoId}/calcular`).then((r) => r.data),
    enabled: !!productoId && enabled,
  });

export const useAplicarCosteo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productoId) => api.post(`/costeo/recetas/${productoId}/aplicar`).then((r) => r.data),
    onSuccess: (_, productoId) => {
      qc.invalidateQueries({ queryKey: ['costeo-receta', productoId] });
      qc.invalidateQueries({ queryKey: ['costeo-recetas'] });
      qc.invalidateQueries({ queryKey: ['costeo-snapshots'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
  });
};

export const useSnapshots = (productoId) =>
  useQuery({
    queryKey: ['costeo-snapshots', productoId],
    queryFn: () => api.get('/costeo/snapshots', { params: { productoId } }).then((r) => r.data),
    enabled: !!productoId,
  });

export const useRecalcularMasivo = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.post('/costeo/recalcular-masivo', data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['costeo-recetas'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
  });
};

export const useMaterialesHistorialPrecios = (id) =>
  useQuery({
    queryKey: ['costeo-material-historial', id],
    queryFn: () => api.get(`/costeo/materiales/${id}/historial-precios`).then((r) => r.data),
    enabled: !!id,
  });
