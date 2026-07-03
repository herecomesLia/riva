import type { AuthSession } from '../types/auth'

const SESSION_STORAGE_KEY = 'riva.session'

export function getStoredSession(): AuthSession | null {
  const value = window.localStorage.getItem(SESSION_STORAGE_KEY)

  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as AuthSession
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function saveSession(session: AuthSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}

export function getAccessToken() {
  return getStoredSession()?.accessToken ?? null
}
