export type User = {
  id: string
  name: string
  email: string
  avatarInitial: string
  locale: string
  role: string
  currentTargetRole?: string
}

export type LoginCredentials = {
  account: string
  password: string
  remember: boolean
}

export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: User
}

export type CurrentUserResponse = {
  user: User
}
