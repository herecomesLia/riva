import { request } from './http'
import type { AuthSession, CurrentUserResponse, LoginRequest } from '../types/auth'

export function login(requestBody: LoginRequest) {
  return request<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: requestBody,
  })
}

export function logout() {
  return request<{ success: true }>('/api/auth/logout', {
    method: 'POST',
  })
}

export function getCurrentUser() {
  return request<CurrentUserResponse>('/api/auth/me')
}
