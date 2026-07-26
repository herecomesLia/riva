import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useStageViewport } from "./useStageViewport"

let rect = { left: 100, top: 50, width: 550 }
let flushAnimationFrame = () => undefined

function StageViewportProbe() {
  const { horizontalScale, pointerPosition, ready, ref } = useStageViewport()

  return (
    <div ref={ref}>
      <output data-testid="viewport-state">
        {JSON.stringify({ horizontalScale, pointerPosition, ready })}
      </output>
    </div>
  )
}

function viewportState() {
  return JSON.parse(screen.getByTestId("viewport-state").textContent ?? "") as {
    horizontalScale: number
    pointerPosition: { x: number; y: number } | null
    ready: boolean
  }
}

describe("useStageViewport", () => {
  beforeEach(() => {
    rect = { left: 100, top: 50, width: 550 }
    let animationFrameCallback: FrameRequestCallback | undefined
    flushAnimationFrame = () => {
      const callback = animationFrameCallback
      animationFrameCallback = undefined
      callback?.(0)
    }
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrameCallback = callback
      return 1
    })
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn())
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      () =>
        ({
          ...rect,
          bottom: rect.top,
          height: 0,
          right: rect.left + rect.width,
          toJSON: () => ({}),
          x: rect.left,
          y: rect.top,
        }) as DOMRect,
    )
  })

  it("measures the stage before paint and exposes the horizontal scale", () => {
    rect = { left: 100, top: 50, width: 275 }

    render(<StageViewportProbe />)

    expect(viewportState()).toEqual({ horizontalScale: 0.5, pointerPosition: null, ready: true })
  })

  it("recomputes local pointer coordinates when the stage moves", async () => {
    render(<StageViewportProbe />)

    fireEvent.pointerMove(window, { clientX: 150, clientY: 90 })
    act(flushAnimationFrame)
    await waitFor(() => {
      expect(viewportState().pointerPosition).toEqual({ x: 50, y: 40 })
    })

    rect = { left: 120, top: 60, width: 550 }
    fireEvent.resize(window)
    act(flushAnimationFrame)

    await waitFor(() => {
      expect(viewportState().pointerPosition).toEqual({ x: 30, y: 30 })
    })
  })
})
