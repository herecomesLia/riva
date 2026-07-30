import type { User } from "@/models/auth"

export const mockLoginCredentials = {
  password: "riva-demo",
  username: "rivauser",
} as const

export const userMock: User = {
  avatarFallback: "R",
  avatarUrl: null,
  displayName: "Riva User",
  id: "local:rivauser",
  username: "rivauser",
}
