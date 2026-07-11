import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import ResizeObserver from "resize-observer-polyfill"
import { afterEach, beforeEach, vi } from "vitest"

import { defaultLanguage } from "@/i18n/resources"

const localStorageMock = (() => {
  let storage = new Map<string, string>()

  return {
    clear() {
      storage = new Map()
    },
    getItem(key: string) {
      return storage.get(key) ?? null
    },
    key(index: number) {
      return Array.from(storage.keys())[index] ?? null
    },
    get length() {
      return storage.size
    },
    removeItem(key: string) {
      storage.delete(key)
    },
    setItem(key: string, value: string) {
      storage.set(key, value)
    },
  }
})()

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
})

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
})

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: ResizeObserver,
})

const matchMediaMock = vi.fn()
const scrollToMock = vi.fn()

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: matchMediaMock,
})

Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value: scrollToMock,
})

function resetBrowserMocks() {
  matchMediaMock.mockReset()
  matchMediaMock.mockImplementation((query: string) => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: false,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(),
  }))
  scrollToMock.mockReset()
}

beforeEach(async () => {
  const { i18n } = await import("@/i18n/i18n")

  resetBrowserMocks()
  window.localStorage.clear()
  window.localStorage.setItem("i18nextLng", defaultLanguage)
  await i18n.changeLanguage(defaultLanguage)
  document.documentElement.lang = defaultLanguage
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
