export type User = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string
  avatarFallback: string
}

export type LoginCredentials = {
  username: string
  password: string
}
