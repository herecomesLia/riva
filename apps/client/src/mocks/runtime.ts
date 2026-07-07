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
