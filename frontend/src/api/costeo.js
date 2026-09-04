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

// Cobertura de la carga de recetas. Las recetas entran por script -es una
// operación de una vez cada varios meses- pero el resultado tiene que verse:
// cuántos productos quedaron cubiertos y cuáles faltan, para completarlos con
// el editor que ya existe.
export const useCoberturaRecetas = () =>
  useQuery({
    queryKey: ['costeo', 'cobertura'],
    queryFn: () => api.get('/costeo/cobertura').then((r) => r.data),
  });

// Catalogo de procesos servido por el backend. El nombre del proceso cruza la
// tarifa con la receta: si cada pantalla ofrece su propia lista, un nombre que
// no coincide deja la mano de obra en cero sin avisar.
export const useProcesosCosteo = () =>
  useQuery({
    queryKey: ['costeo-procesos'],
    queryFn: () => api.get('/costeo/procesos').then((r) => r.data),
    staleTime: 5 * 60_000,
    placeholderData: [],
  });

// Desglose en vivo calculado por el servidor, con el mismo motor y los mismos
// precios que se aplican al guardar. El editor ya no calcula por su cuenta: eso
// hacia que el preview y el valor aplicado pudieran diferir.
export const useCosteoBorrador = (borrador, enabled = true) =>
  useQuery({
    queryKey: ['costeo-borrador', borrador],
    queryFn: () => api.post('/costeo/calcular', borrador).then((r) => r.data),
    enabled: Boolean(enabled && borrador),
    placeholderData: (previo) => previo,
    staleTime: 0,
  });
