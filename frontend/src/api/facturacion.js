import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from './client'

const cleanParams = (params = {}) => Object.fromEntries(
  Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '')
)

export const useDocumentos = (params = {}, options = {}) => {
  const queryParams = cleanParams(params)
  return useQuery({
    queryKey: ['facturacion', 'documentos', queryParams],
    queryFn: () => api.get('/facturacion/documentos', { params: queryParams }).then(r => r.data),
    staleTime: 30_000,
    ...options,
  })
}

export const useDocumento = (id) => useQuery({
  queryKey: ['facturacion', 'documentos', id],
  queryFn: () => api.get(`/facturacion/documentos/${id}`).then(r => r.data),
  enabled: !!id,
})

export const useDocumentosReferenciables = (params = {}, options = {}) => {
  const queryParams = cleanParams(params)
  return useQuery({
    queryKey: ['facturacion', 'documentos-referenciables', queryParams],
    queryFn: () => api.get('/facturacion/documentos-referenciables', { params: queryParams }).then(r => r.data),
    staleTime: 15_000,
    ...options,
  })
}

export const useCrearDocumento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.post('/facturacion/documentos', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}

export const useEmitirDocumento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/facturacion/documentos/${id}/emitir`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}

export const useReenviarDocumento = () => useMutation({
  mutationFn: ({ id, to }) => api.post(`/facturacion/documentos/${id}/reenviar`, to ? { to } : {}).then(r => r.data),
})

export const useEnviarDocumento = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/facturacion/documentos/${id}/enviar`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      qc.invalidateQueries({ queryKey: ['guias'] })
    },
  })
}

// Keeps the create + issue sequence atomic from the UI's perspective. A failed issue
// intentionally leaves the server-side document available as an error/borrador to retry.
export const useEmitirDte = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => {
      const documento = await api.post('/facturacion/documentos', data).then(r => r.data)
      const emitido = await api.post(`/facturacion/documentos/${documento.id}/emitir`).then(r => r.data)
      return { documento, emitido }
    },
    onSettled: (_, __, data) => {
      qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] })
      if (data.ordenId) qc.invalidateQueries({ queryKey: ['ventas', Number(data.ordenId)] })
      qc.invalidateQueries({ queryKey: ['ventas'] })
      if (data.guiaDespachoId) qc.invalidateQueries({ queryKey: ['guias'] })
    },
  })
}

export const descargarXmlDocumento = (id) => api.get(`/facturacion/documentos/${id}/xml`, { responseType: 'blob' })

export const useEmpresa = () => useQuery({
  queryKey: ['facturacion', 'empresa'],
  queryFn: () => api.get('/facturacion/empresa').then(r => r.data),
})

export const useUpdateEmpresa = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data) => api.put('/facturacion/empresa', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'empresa'] }),
  })
}

export const useUploadCertificado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) => api.post('/facturacion/empresa/certificado', formData).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'empresa'] }),
  })
}

export const useCafs = () => useQuery({
  queryKey: ['facturacion', 'cafs'],
  queryFn: () => api.get('/facturacion/cafs').then(r => r.data),
})

export const useUploadCaf = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (formData) => api.post('/facturacion/cafs', formData).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'cafs'] }),
  })
}

export const useDeleteCaf = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/facturacion/cafs/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'cafs'] }),
  })
}

export const useAjustarFolioCaf = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }) => api.post(`/facturacion/cafs/${id}/ajustar-folio`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'cafs'] }),
  })
}

export const useEnviarLote = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids) => api.post('/facturacion/enviar-lote', { ids }).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}

export const useConsultarEstado = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.get(`/facturacion/documentos/${id}/estado`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'documentos'] }),
  })
}

export const useDocumentosRecibidos = () => useQuery({
  queryKey: ['facturacion', 'recibidos'],
  queryFn: () => api.get('/facturacion/recibidos').then(r => r.data),
})

export const useSincronizarDocumentosRecibidos = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/facturacion/recibidos/sincronizar').then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['facturacion', 'recibidos'] }),
  })
}
