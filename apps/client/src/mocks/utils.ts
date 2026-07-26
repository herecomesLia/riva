export function waitForMockDelay(delayMs: number = 1000) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}
