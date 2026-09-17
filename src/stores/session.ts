import { defineStore } from 'pinia'
import { api, type ApiResult } from '@/api/client'

interface CurrentUser {
  id: string
  username: string
  role: 'SUPER_ADMIN' | 'ADMIN' | 'MEMBER'
  permissions: string[]
  mustChangePassword: boolean
}

interface LoginResponse {
  accessToken: string
  csrfToken: string
  expiresIn: number
  userId: string
  username: string
  roleCode: CurrentUser['role']
  mustChangePassword: boolean
  permissions: string[]
}

export const useSessionStore = defineStore('session', {
  state: () => ({ user: null as CurrentUser | null, loading: false }),
  getters: {
    authenticated: (state) => Boolean(state.user),
    can: (state) => (permission: string) =>
      state.user?.role === 'SUPER_ADMIN' || state.user?.permissions.includes(permission) === true,
  },
  actions: {
    async restore() {
      if (!sessionStorage.getItem('accessToken')) return
      const response =
        await api.get<ApiResult<Omit<LoginResponse, 'accessToken' | 'expiresIn'>>>(
          '/auth/getCurrentUser',
        )
      this.user = {
        id: response.data.data.userId,
        username: response.data.data.username,
        role: response.data.data.roleCode,
        permissions: response.data.data.permissions,
        mustChangePassword: response.data.data.mustChangePassword,
      }
    },
    async login(loginAccount: string, password: string) {
      this.loading = true
      try {
        const response = await api.post<ApiResult<LoginResponse>>('/auth/login', {
          loginAccount,
          password,
        })
        sessionStorage.setItem('accessToken', response.data.data.accessToken)
        sessionStorage.setItem('csrfToken', response.data.data.csrfToken)
        this.user = {
          id: response.data.data.userId,
          username: response.data.data.username,
          role: response.data.data.roleCode,
          permissions: response.data.data.permissions,
          mustChangePassword: response.data.data.mustChangePassword,
        }
      } finally {
        this.loading = false
      }
    },
    clear() {
      sessionStorage.removeItem('accessToken')
      sessionStorage.removeItem('csrfToken')
      this.user = null
    },
    async logout() {
      try {
        if (sessionStorage.getItem('accessToken')) {
          await api.post('/auth/logout')
        }
      } finally {
        this.clear()
      }
    },
  },
})
