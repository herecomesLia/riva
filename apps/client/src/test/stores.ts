import { act } from "@testing-library/react"

import { useAuthStore } from "@/stores/auth.store"
import { useLayoutStore } from "@/stores/layout.store"
import { usePreferencesStore } from "@/stores/preferences.store"

export function resetAuthStore() {
  useAuthStore.setState(useAuthStore.getInitialState(), true)
}

export function resetLayoutStore() {
  useLayoutStore.setState(useLayoutStore.getInitialState(), true)
}

export function resetPreferencesStore() {
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
}

export function resetStores() {
  act(() => {
    resetAuthStore()
    resetLayoutStore()
    resetPreferencesStore()
  })
}
