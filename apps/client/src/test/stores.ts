import { act } from "@testing-library/react"

import { useLayoutStore } from "@/stores/layout"
import { usePreferencesStore } from "@/stores/preferences"

export function resetLayoutStore() {
  useLayoutStore.setState(useLayoutStore.getInitialState(), true)
}

export function resetPreferencesStore() {
  usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
}

export function resetStores() {
  act(() => {
    resetLayoutStore()
    resetPreferencesStore()
  })
}
