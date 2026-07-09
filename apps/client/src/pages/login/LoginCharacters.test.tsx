import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LoginCharacters } from "@/pages/login/LoginCharacters"

let resizeObserverCallback: ResizeObserverCallback | undefined
let observedElement: Element | undefined
let originalResizeObserver: typeof ResizeObserver | undefined

class MockResizeObserver {
  disconnect = vi.fn()
  observe = vi.fn((element: Element) => {
    observedElement = element
  })
  unobserve = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback
  }
}

type RenderCharactersProps = Partial<Parameters<typeof LoginCharacters>[0]>

function renderCharacters(props: RenderCharactersProps = {}) {
  return render(<LoginCharacters isTyping={false} password="" showPassword={false} {...props} />)
}

function getShell(container: HTMLElement) {
  const shell = container.firstElementChild

  if (!(shell instanceof HTMLElement)) {
    throw new Error("LoginCharacters shell was not rendered.")
  }

  return shell
}

function getStage(container: HTMLElement) {
  const stage = getShell(container).firstElementChild

  if (!(stage instanceof HTMLElement)) {
    throw new Error("LoginCharacters stage was not rendered.")
  }

  return stage
}

function getPurpleCharacter(container: HTMLElement) {
  const purpleCharacter = getStage(container).children[0]

  if (!(purpleCharacter instanceof HTMLElement)) {
    throw new Error("Purple character was not rendered.")
  }

  return purpleCharacter
}

function getOrangeCharacter(container: HTMLElement) {
  const orangeCharacter = getStage(container).children[2]

  if (!(orangeCharacter instanceof HTMLElement)) {
    throw new Error("Orange character was not rendered.")
  }

  return orangeCharacter
}

function getYellowCharacter(container: HTMLElement) {
  const yellowCharacter = getStage(container).children[3]

  if (!(yellowCharacter instanceof HTMLElement)) {
    throw new Error("Yellow character was not rendered.")
  }

  return yellowCharacter
}

function resizeObservedElement(width: number) {
  const callback = resizeObserverCallback

  if (!callback || !observedElement) {
    throw new Error("ResizeObserver was not initialized.")
  }

  act(() => {
    callback(
      [
        {
          contentRect: {
            width,
          },
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    )
  })
}

describe("LoginCharacters", () => {
  beforeEach(() => {
    resizeObserverCallback = undefined
    observedElement = undefined
    originalResizeObserver = window.ResizeObserver

    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      value: MockResizeObserver,
      writable: true,
    })
  })

  afterEach(() => {
    if (originalResizeObserver) {
      Object.defineProperty(window, "ResizeObserver", {
        configurable: true,
        value: originalResizeObserver,
        writable: true,
      })
    } else {
      Reflect.deleteProperty(window, "ResizeObserver")
    }

    resizeObserverCallback = undefined
    observedElement = undefined
    originalResizeObserver = undefined
  })

  it("scales the fixed stage horizontally while keeping the shell height stable", () => {
    const { container } = renderCharacters()

    resizeObservedElement(275)

    expect(getShell(container)).toHaveStyle({ height: "440px" })
    expect(getStage(container)).toHaveStyle({
      transform: "scaleX(0.5)",
      visibility: "visible",
    })
    expect(getOrangeCharacter(container).style.borderRadius).toBe("120px 120px 0 0 / 60px 60px 0 0")
    expect(getYellowCharacter(container).style.borderRadius).toBe("70px 70px 0 0 / 35px 35px 0 0")
  })

  it("caps the fixed stage scale at its logical size", () => {
    const { container } = renderCharacters()

    resizeObservedElement(700)

    expect(getShell(container)).toHaveStyle({ height: "440px" })
    expect(getStage(container)).toHaveStyle({ transform: "scaleX(1)" })
  })

  it("moves the purple character horizontally with left instead of translate", () => {
    const { container, rerender } = renderCharacters({ isTyping: true })

    resizeObservedElement(275)

    expect(getPurpleCharacter(container)).toHaveStyle({
      height: "440px",
      left: "110px",
      transform: "skewX(-12deg)",
    })

    rerender(<LoginCharacters isTyping={false} password="" showPassword={false} />)

    expect(getPurpleCharacter(container)).toHaveStyle({
      height: "400px",
      left: "70px",
      transform: "skewX(0deg)",
    })
  })

  it("does not collapse or start timers while the measured width is zero", () => {
    vi.useFakeTimers()
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")
    const { container, unmount } = renderCharacters({ password: "secret", showPassword: true })

    try {
      resizeObservedElement(0)

      expect(getShell(container)).toHaveStyle({ height: "440px" })
      expect(getStage(container)).toHaveStyle({
        transform: "scaleX(1)",
        visibility: "hidden",
      })
      expect(addEventListenerSpy).not.toHaveBeenCalledWith("mousemove", expect.any(Function))
      expect(vi.getTimerCount()).toBe(0)

      resizeObservedElement(275)

      expect(getStage(container)).toHaveStyle({
        transform: "scaleX(0.5)",
        visibility: "visible",
      })
      expect(addEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function))
      expect(vi.getTimerCount()).toBe(3)

      act(() => {
        vi.runOnlyPendingTimers()
      })

      expect(vi.getTimerCount()).toBe(3)
      unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      addEventListenerSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("throttles mouse movement updates with requestAnimationFrame", () => {
    const animationFrameCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    })

    try {
      renderCharacters()
      resizeObservedElement(275)

      act(() => {
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }))
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 120, clientY: 120 }))
      })

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1)

      act(() => {
        animationFrameCallbacks[0]?.(0)
      })
    } finally {
      requestAnimationFrameSpy.mockRestore()
    }
  })
})
