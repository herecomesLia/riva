import type { AuthSession, AuthUser } from "@/models/auth"

export const authUserMock: AuthUser = {
  avatarFallback: "R",
  displayName: "Riva User",
  id: "local:rivauser",
  username: "rivauser",
}

export const authSessionMock: AuthSession = {
  id: "local:rivauser:mock",
  signedInAt: "2026-07-09T00:00:00.000Z",
}
