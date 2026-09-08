import axios from 'axios'
import { useAuthStore } from '../store/auth'

const api = axios.create({ baseURL: '/api', withCredentials: true })

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshPromise = null

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (
      error.response?.status !== 401 ||
      original.url === '/auth/login' ||
      original.url === '/auth/refresh' ||
      original._retry ||
      !useAuthStore.getState().token
    ) {
      return Promise.reject(error)
    }
    original._retry = true

    if (!refreshPromise) {
      refreshPromise = api.post('/auth/refresh')
        .then(({ data }) => {
          const newToken = data.accessToken
          useAuthStore.getState().setToken(newToken)
          return newToken
        })
        .catch((err) => {
          useAuthStore.getState().logout()
          throw err
        })
        .finally(() => {
          refreshPromise = null
        })
    }

    try {
      const newToken = await refreshPromise
      if (!newToken) return Promise.reject(error)
      original.headers.Authorization = `Bearer ${newToken}`
      return api(original)
    } catch (refreshErr) {
      return Promise.reject(refreshErr || error)
    }
  }
)

export default api
