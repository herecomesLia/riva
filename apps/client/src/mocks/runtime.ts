export type MockPageState = 'default' | 'empty' | 'error'

const DEFAULT_DELAY_MS = 450

export class MockStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MockStateError'
  }
}

export function waitForMockState(delayMs = DEFAULT_DELAY_MS) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}

export function getMockPageState(key: string): MockPageState {
  const searchParams = new URLSearchParams(window.location.search)
  const state = searchParams.get(`${key}State`)

  return state === 'empty' || state === 'error' ? state : 'default'
}
