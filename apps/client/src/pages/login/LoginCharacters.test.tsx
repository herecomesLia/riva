import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LoginCharacters } from "@/pages/login/LoginCharacters"

let resizeObserverCallback: ResizeObserverCallback | undefined
let observedElement: Element | undefined
let originalResizeObserver: typeof ResizeObserver | undefined
let resizeObserverDisconnect: (() => void) | undefined

class MockResizeObserver {
  disconnect = vi.fn()
  observe = vi.fn((element: Element) => {
    observedElement = element
  })
  unobserve = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback
    resizeObserverDisconnect = this.disconnect
  }
}

type RenderCharactersProps = Partial<Parameters<typeof LoginCharacters>[0]>

function renderCharacters(props: RenderCharactersProps = {}) {
  return render(<LoginCharacters hasPassword={false} isUsernameFocused={false} showPassword={false} {...props} />)
}

function getElement(container: HTMLElement, selector: string, description: string) {
  const element = container.querySelector<HTMLElement>(selector)

  if (!element) {
    throw new Error(`${description} was not rendered.`)
  }

  return element
}

function getShell(container: HTMLElement) {
  return getElement(container, '[data-testid="login-characters-shell"]', "LoginCharacters shell")
}

function getStage(container: HTMLElement) {
  return getElement(container, '[data-testid="login-characters-stage"]', "LoginCharacters stage")
}

function getPurpleCharacter(container: HTMLElement) {
  return getElement(container, '[data-character="purple"]', "Purple character")
}

function getPurpleBody(container: HTMLElement) {
  return getElement(getPurpleCharacter(container), '[data-part="body"]', "Purple character body")
}

function getPurpleFace(container: HTMLElement) {
  return getElement(getPurpleBody(container), '[data-part="face"]', "Purple character face")
}

function getOrangeCharacter(container: HTMLElement) {
  return getElement(container, '[data-character="orange"]', "Orange character")
}

function getYellowCharacter(container: HTMLElement) {
  return getElement(container, '[data-character="yellow"]', "Yellow character")
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
    resizeObserverDisconnect = undefined
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
    resizeObserverDisconnect = undefined
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
    const { container, rerender } = renderCharacters({ isUsernameFocused: true })

    resizeObservedElement(275)

    expect(getPurpleCharacter(container)).toHaveStyle({
      height: "440px",
      left: "110px",
      transform: "skewX(-12deg)",
    })

    rerender(<LoginCharacters hasPassword={false} isUsernameFocused={false} showPassword={false} />)

    expect(getPurpleCharacter(container)).toHaveStyle({
      height: "400px",
      left: "70px",
      transform: "skewX(0deg)",
    })
  })

  it("keeps purple layout, skew, and face movement on the same duration", () => {
    const { container } = renderCharacters()
    resizeObservedElement(275)

    expect(getPurpleCharacter(container)).toHaveStyle({
      transition: "height 700ms ease-in-out, left 700ms ease-in-out, transform 700ms ease-in-out",
    })

    expect(getPurpleFace(container)).toHaveStyle({
      transition: "left 700ms ease-in-out, top 700ms ease-in-out, transform 700ms ease-in-out",
    })
  })

  it("restores purple mouse following after the username-focus pose ends", () => {
    vi.useFakeTimers()
    const animationFrameCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    })

    try {
      const { container, rerender } = renderCharacters()
      resizeObservedElement(275)
      const purpleCharacter = getPurpleCharacter(container)
      vi.spyOn(purpleCharacter, "getBoundingClientRect").mockReturnValue({
        bottom: 300,
        height: 300,
        left: 0,
        right: 180,
        toJSON: () => ({}),
        top: 0,
        width: 180,
        x: 0,
        y: 0,
      })

      act(() => {
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 190, clientY: 160 }))
        animationFrameCallbacks.shift()?.(0)
      })

      expect(getPurpleFace(container)).toHaveStyle({ transform: "translate(5px, 2px)" })

      rerender(<LoginCharacters hasPassword={false} isUsernameFocused showPassword={false} />)

      expect(getPurpleFace(container)).toHaveStyle({
        left: "55px",
        top: "65px",
        transform: "translate(0px, 0px)",
        transition: "left 700ms ease-in-out, top 700ms ease-in-out, transform 700ms ease-in-out",
      })

      act(() => {
        vi.advanceTimersByTime(800)
      })

      expect(getPurpleFace(container)).toHaveStyle({
        left: "45px",
        top: "40px",
        transform: "translate(5px, 2px)",
      })
    } finally {
      requestAnimationFrameSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  it("keeps the purple scripted pose stable while the mouse moves", () => {
    const animationFrameCallbacks: FrameRequestCallback[] = []
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrameCallbacks.push(callback)
      return animationFrameCallbacks.length
    })

    try {
      const { container, rerender } = renderCharacters()
      resizeObservedElement(275)
      rerender(<LoginCharacters hasPassword={false} isUsernameFocused showPassword={false} />)

      expect(getPurpleCharacter(container)).toHaveStyle({ transform: "skewX(-12deg)" })

      act(() => {
        window.dispatchEvent(new MouseEvent("mousemove", { clientX: 720, clientY: 100 }))
        animationFrameCallbacks.shift()?.(0)
      })

      expect(getPurpleCharacter(container)).toHaveStyle({ transform: "skewX(-12deg)" })
      expect(getPurpleBody(container)).toHaveStyle({ transform: "skewX(-6deg)" })
    } finally {
      requestAnimationFrameSpy.mockRestore()
    }
  })

  it("does not collapse or start timers while the measured width is zero", () => {
    vi.useFakeTimers()
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")
    const { container, unmount } = renderCharacters({ hasPassword: true, showPassword: true })

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
      expect(vi.getTimerCount()).toBeGreaterThan(0)
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

  it("cleans observers, mouse listeners, and queued frames on unmount", () => {
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1)
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame")
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener")
    const { unmount } = renderCharacters()
    resizeObservedElement(275)

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100, clientY: 100 }))
    })

    unmount()

    expect(resizeObserverDisconnect).toHaveBeenCalledOnce()
    expect(removeEventListenerSpy).toHaveBeenCalledWith("mousemove", expect.any(Function))
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(1)
    requestAnimationFrameSpy.mockRestore()
    cancelAnimationFrameSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
  })
})
