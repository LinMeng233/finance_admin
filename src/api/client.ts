import axios, { type InternalAxiosRequestConfig } from 'axios'

export interface ApiResult<T> {
  code: number
  message: string
  data: T
  requestId: string
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
export const api = axios.create({ baseURL: apiBaseUrl, timeout: 10_000, withCredentials: true })
let refreshInFlight: Promise<string> | null = null

function csrfToken(): string | null {
  const stored = sessionStorage.getItem('csrfToken')
  if (stored) return stored
  const cookie = document.cookie.split('; ').find((part) => part.startsWith('financeCsrf='))
  return cookie ? decodeURIComponent(cookie.substring('financeCsrf='.length)) : null
}

async function renewAccessToken(): Promise<string> {
  const csrf = csrfToken()
  if (!csrf) throw new Error('CSRF token missing')
  const response = await axios.post<ApiResult<{ accessToken: string; csrfToken: string }>>(
    `${apiBaseUrl}/auth/refresh`,
    null,
    { headers: { 'X-CSRF-Token': csrf }, withCredentials: true, timeout: 10_000 },
  )
  const token = response.data.data.accessToken
  sessionStorage.setItem('accessToken', token)
  if (response.data.data.csrfToken)
    sessionStorage.setItem('csrfToken', response.data.data.csrfToken)
  return token
}

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    if (
      error.response?.status === 401 &&
      request &&
      request.url !== '/auth/login' &&
      !request._retry
    ) {
      request._retry = true
      try {
        refreshInFlight ??= renewAccessToken().finally(() => {
          refreshInFlight = null
        })
        request.headers.Authorization = `Bearer ${await refreshInFlight}`
        return api(request)
      } catch {
        sessionStorage.removeItem('accessToken')
        if (location.pathname !== '/login') location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)
