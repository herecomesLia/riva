export type AuthUser = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  avatarFallback: string
}

export type AuthSession = {
  id: string
  signedInAt: string
}
