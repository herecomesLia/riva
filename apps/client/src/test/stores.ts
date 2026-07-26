import { act } from "@testing-library/react"

import { useAuthStore } from "@/stores/auth"
import { useLayoutStore } from "@/stores/layout"
import { usePreferencesStore } from "@/stores/preferences"

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
