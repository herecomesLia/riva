import { useLayoutEffect, useRef, useState, type RefObject } from "react"

import { STAGE_WIDTH } from "./hero-config"
import type { Point } from "./hero-geometry"

type StageViewportState = {
  horizontalScale: number
  pointerPosition: Point | null
  ready: boolean
}

export type StageViewport = StageViewportState & {
  ref: RefObject<HTMLDivElement | null>
}

export function useStageViewport(): StageViewport {
  const ref = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<StageViewportState>({
    horizontalScale: 1,
    pointerPosition: null,
    ready: false,
  })
  const latestPointerRef = useRef<Point | null>(null)
  const frameRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current

    if (!element) {
      return
    }

    const stageElement: HTMLDivElement = element

    function measureViewport() {
      const rect = stageElement.getBoundingClientRect()

      if (rect.width <= 0) {
        return
      }

      const latestPointer = latestPointerRef.current
      const horizontalScale = Math.min(rect.width / STAGE_WIDTH, 1)
      const pointerPosition = latestPointer
        ? {
            x: latestPointer.x - rect.left,
            y: latestPointer.y - rect.top,
          }
        : null

      setViewport((currentViewport) => {
        const currentPointer = currentViewport.pointerPosition
        const pointerUnchanged =
          currentPointer === pointerPosition ||
          (currentPointer !== null &&
            pointerPosition !== null &&
            currentPointer.x === pointerPosition.x &&
            currentPointer.y === pointerPosition.y)

        if (
          currentViewport.ready &&
          currentViewport.horizontalScale === horizontalScale &&
          pointerUnchanged
        ) {
          return currentViewport
        }

        return {
          horizontalScale,
          pointerPosition,
          ready: true,
        }
      })
    }

    function flushViewport() {
      frameRef.current = null
      measureViewport()
    }

    function scheduleViewportUpdate() {
      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(flushViewport)
      }
    }

    function handlePointerMove(event: PointerEvent) {
      latestPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      }

      scheduleViewportUpdate()
    }

    function resetPointerPosition() {
      latestPointerRef.current = null
      setViewport((currentViewport) =>
        currentViewport.pointerPosition === null
          ? currentViewport
          : { ...currentViewport, pointerPosition: null },
      )
    }

    const observer = new ResizeObserver(scheduleViewportUpdate)

    observer.observe(stageElement)
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("resize", scheduleViewportUpdate)
    window.addEventListener("blur", resetPointerPosition)
    measureViewport()

    return () => {
      observer.disconnect()
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("resize", scheduleViewportUpdate)
      window.removeEventListener("blur", resetPointerPosition)
      latestPointerRef.current = null

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [])

  return { ...viewport, ref }
}
