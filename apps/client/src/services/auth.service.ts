import { mockSession, mockUser } from '../mocks/data/auth.mock'
import { MockStateError, waitForMockState } from '../mocks/runtime'
import { getAccessToken } from '../stores/session.store'
import type { AuthSession, LoginCredentials } from '../types/auth'

export async function login(credentials: LoginCredentials): Promise<AuthSession> {
  await waitForMockState()

  if (credentials.account === 'fail@example.com' || credentials.password === 'wrong-password') {
    throw new MockStateError('账号或密码不正确')
  }

  return mockSession
}

export async function logout(): Promise<void> {
  await waitForMockState(220)
}

export async function getCurrentUser() {
  await waitForMockState()

  if (getAccessToken() !== mockSession.accessToken) {
    throw new MockStateError('登录状态已失效，请重新登录')
  }

  return { user: mockUser }
}
