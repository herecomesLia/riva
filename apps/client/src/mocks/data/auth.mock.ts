import type { AuthSession, User } from '../../types/auth'

export const mockUser: User = {
  id: 'user_001',
  name: 'Liang',
  email: 'liang@example.com',
  avatarInitial: 'L',
  locale: 'zh-CN',
  role: '求职者',
  currentTargetRole: '产品经理 · Riva AI',
}

export const mockSession: AuthSession = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresAt: '2026-07-03T12:00:00Z',
  user: mockUser,
}
