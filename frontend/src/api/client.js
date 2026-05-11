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
    if (error.response?.status !== 401 || original.url === '/auth/login') {
      return Promise.reject(error)
    }

    if (!refreshPromise) {
      refreshPromise = api.post('/auth/refresh')
        .then(({ data }) => { useAuthStore.getState().setToken(data.accessToken) })
        .catch(() => { useAuthStore.getState().logout() })
        .finally(() => { refreshPromise = null })
    }

    try {
      await refreshPromise
      original.headers.Authorization = `Bearer ${useAuthStore.getState().token}`
      return api(original)
    } catch {
      return Promise.reject(error)
    }
  }
)

export default api
