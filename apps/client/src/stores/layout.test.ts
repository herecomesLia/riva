import { beforeEach, describe, expect, it } from "vitest"

import { useLayoutStore } from "@/stores/layout"
import { resetStores } from "@/test/stores"

describe("layout store", () => {
  beforeEach(() => {
    resetStores()
  })

  it("sets and toggles sidebar open state", () => {
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true)

    useLayoutStore.getState().setSidebarOpen(false)
    expect(useLayoutStore.getState().isSidebarOpen).toBe(false)

    useLayoutStore.getState().toggleSidebar()
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true)
  })

  it("sets and toggles mobile navigation open state", () => {
    expect(useLayoutStore.getState().isMobileNavigationOpen).toBe(false)

    useLayoutStore.getState().setMobileNavigationOpen(true)
    expect(useLayoutStore.getState().isMobileNavigationOpen).toBe(true)

    useLayoutStore.getState().toggleMobileNavigation()
    expect(useLayoutStore.getState().isMobileNavigationOpen).toBe(false)
  })
})
