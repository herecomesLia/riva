import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { cn } from "@/lib/utils"

type CharacterPosition = {
  bodySkew: number
  faceX: number
  faceY: number
}

type LoginCharactersProps = {
  className?: string
  isTyping: boolean
  password: string
  showPassword: boolean
}

type EyeProps = {
  isBlinking?: boolean
  maxDistance?: number
  mousePosition: MousePosition | null
  pupilSize?: number
  size?: number
  forceLookX?: number
  forceLookY?: number
}

type PupilProps = {
  maxDistance?: number
  mousePosition: MousePosition | null
  size?: number
  forceLookX?: number
  forceLookY?: number
}

type MousePosition = {
  x: number
  y: number
}

const characterColors = {
  black: "#2D2D2D",
  orange: "#FF9B6B",
  purple: "#6C3FF5",
  white: "#FFFFFF",
  yellow: "#E8D754",
} as const

const STAGE_WIDTH = 550
const STAGE_HEIGHT = 440
const ORANGE_WIDTH = 240
const YELLOW_WIDTH = 140
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function calculateStageXScale(containerWidth: number) {
  return Math.min(Math.max(containerWidth, 0) / STAGE_WIDTH, 1)
}

function useMousePosition(enabled: boolean) {
  const frameRef = useRef<number | null>(null)
  const latestPositionRef = useRef<MousePosition | null>(null)
  const [mousePosition, setMousePosition] = useState<MousePosition | null>(null)

  useEffect(() => {
    if (!enabled) {
      setMousePosition(null)
      return undefined
    }

    const requestAnimationFrame = window.requestAnimationFrame as typeof window.requestAnimationFrame | undefined
    const cancelAnimationFrame = window.cancelAnimationFrame as typeof window.cancelAnimationFrame | undefined
    let scheduleFrame: (callback: FrameRequestCallback) => number
    let cancelFrame: (handle: number) => void

    if (requestAnimationFrame && cancelAnimationFrame) {
      scheduleFrame = requestAnimationFrame.bind(window)
      cancelFrame = cancelAnimationFrame.bind(window)
    } else {
      scheduleFrame = (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16)
      cancelFrame = window.clearTimeout.bind(window)
    }

    function updateMousePosition() {
      frameRef.current = null
      setMousePosition(latestPositionRef.current)
    }

    function handleMouseMove(event: MouseEvent) {
      latestPositionRef.current = { x: event.clientX, y: event.clientY }

      if (frameRef.current === null) {
        frameRef.current = scheduleFrame(updateMousePosition)
      }
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)

      if (frameRef.current !== null) {
        cancelFrame(frameRef.current)
        frameRef.current = null
      }

      latestPositionRef.current = null
    }
  }, [enabled])

  return mousePosition
}

function useRandomBlink(enabled: boolean) {
  const blinkTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const resetTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const [isBlinking, setIsBlinking] = useState(false)

  useEffect(() => {
    function clearAllTimers() {
      if (blinkTimeoutRef.current !== null) {
        window.clearTimeout(blinkTimeoutRef.current)
        blinkTimeoutRef.current = null
      }

      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current)
        resetTimeoutRef.current = null
      }
    }

    if (!enabled) {
      clearAllTimers()
      setIsBlinking(false)
      return undefined
    }

    function scheduleBlink() {
      blinkTimeoutRef.current = window.setTimeout(
        () => {
          blinkTimeoutRef.current = null
          setIsBlinking(true)
          resetTimeoutRef.current = window.setTimeout(() => {
            resetTimeoutRef.current = null
            setIsBlinking(false)
            scheduleBlink()
          }, 150)
        },
        Math.random() * 4000 + 3000,
      )
    }

    scheduleBlink()

    return () => {
      clearAllTimers()
    }
  }, [enabled])

  return isBlinking
}

function calculatePosition(ref: RefObject<HTMLDivElement | null>, mousePosition: MousePosition | null) {
  if (!ref.current || !mousePosition) {
    return { bodySkew: 0, faceX: 0, faceY: 0 } satisfies CharacterPosition
  }

  const rect = ref.current.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 3
  const deltaX = mousePosition.x - centerX
  const deltaY = mousePosition.y - centerY

  return {
    bodySkew: clamp(-deltaX / 120, -6, 6),
    faceX: clamp(deltaX / 20, -15, 15),
    faceY: clamp(deltaY / 30, -10, 10),
  } satisfies CharacterPosition
}

function calculatePupilPosition(
  ref: RefObject<HTMLDivElement | null>,
  mousePosition: MousePosition | null,
  maxDistance: number,
  forceLookX?: number,
  forceLookY?: number,
) {
  if (forceLookX !== undefined && forceLookY !== undefined) {
    return { x: forceLookX, y: forceLookY }
  }

  if (!ref.current || !mousePosition) {
    return { x: 0, y: 0 }
  }

  const rect = ref.current.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const deltaX = mousePosition.x - centerX
  const deltaY = mousePosition.y - centerY
  const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance)
  const angle = Math.atan2(deltaY, deltaX)

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  }
}

function Pupil({
  maxDistance = 5,
  mousePosition,
  size = 12,
  forceLookX,
  forceLookY,
}: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(
    pupilRef,
    mousePosition,
    maxDistance,
    forceLookX,
    forceLookY,
  )

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        backgroundColor: characterColors.black,
        height: `${size}px`,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: "transform 0.1s ease-out",
        width: `${size}px`,
      }}
    />
  )
}

function Eye({
  isBlinking = false,
  maxDistance = 10,
  mousePosition,
  pupilSize = 16,
  size = 48,
  forceLookX,
  forceLookY,
}: EyeProps) {
  const eyeRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(
    eyeRef,
    mousePosition,
    maxDistance,
    forceLookX,
    forceLookY,
  )

  return (
    <div
      ref={eyeRef}
      className="flex items-center justify-center overflow-hidden rounded-full transition-all duration-150"
      style={{
        backgroundColor: characterColors.white,
        height: isBlinking ? "2px" : `${size}px`,
        width: `${size}px`,
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            backgroundColor: characterColors.black,
            height: `${pupilSize}px`,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: "transform 0.1s ease-out",
            width: `${pupilSize}px`,
          }}
        />
      )}
    </div>
  )
}

export function LoginCharacters({ className, isTyping, password, showPassword }: LoginCharactersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const purpleRef = useRef<HTMLDivElement>(null)
  const blackRef = useRef<HTMLDivElement>(null)
  const yellowRef = useRef<HTMLDivElement>(null)
  const orangeRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [stageXScale, setStageXScale] = useState(1)
  const mousePosition = useMousePosition(isVisible)
  const isPurpleBlinking = useRandomBlink(isVisible)
  const isBlackBlinking = useRandomBlink(isVisible)
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
  const [isPurplePeeking, setIsPurplePeeking] = useState(false)
  const hasPassword = password.length > 0
  const isHiddenPassword = hasPassword && !showPassword
  const isVisiblePassword = hasPassword && showPassword

  useIsomorphicLayoutEffect(() => {
    if (typeof window === "undefined") {
      return undefined
    }

    const container = containerRef.current

    if (!container) {
      return undefined
    }

    const measuredContainer = container

    function updateLayout(containerWidth?: number) {
      const nextContainerWidth = containerWidth ?? measuredContainer.getBoundingClientRect().width

      if (nextContainerWidth <= 0) {
        setIsVisible(false)
        return
      }

      setIsVisible(true)
      setStageXScale(calculateStageXScale(nextContainerWidth))
    }

    updateLayout()

    if (window.ResizeObserver) {
      const resizeObserver = new window.ResizeObserver((entries) => {
        updateLayout(entries[0]?.contentRect.width)
      })

      resizeObserver.observe(measuredContainer)

      return () => {
        resizeObserver.disconnect()
      }
    }

    function handleResize() {
      updateLayout()
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  useIsomorphicLayoutEffect(() => {
    if (!isVisible || !isTyping) {
      setIsLookingAtEachOther(false)
      return undefined
    }

    setIsLookingAtEachOther(true)

    const timeout = window.setTimeout(() => {
      setIsLookingAtEachOther(false)
    }, 800)

    return () => {
      window.clearTimeout(timeout)
    }
  }, [isTyping, isVisible])

  useEffect(() => {
    if (!isVisible || !isVisiblePassword) {
      setIsPurplePeeking(false)
      return undefined
    }

    let peekTimeout: ReturnType<typeof window.setTimeout> | undefined
    let resetTimeout: ReturnType<typeof window.setTimeout> | undefined

    function schedulePeek() {
      peekTimeout = window.setTimeout(
        () => {
          peekTimeout = undefined
          setIsPurplePeeking(true)
          resetTimeout = window.setTimeout(() => {
            resetTimeout = undefined
            setIsPurplePeeking(false)
            schedulePeek()
          }, 800)
        },
        Math.random() * 3000 + 2000,
      )
    }

    schedulePeek()

    return () => {
      if (peekTimeout !== undefined) {
        window.clearTimeout(peekTimeout)
      }

      if (resetTimeout !== undefined) {
        window.clearTimeout(resetTimeout)
      }
    }
  }, [isVisible, isVisiblePassword])

  const purplePosition = calculatePosition(purpleRef, mousePosition)
  const blackPosition = calculatePosition(blackRef, mousePosition)
  const yellowPosition = calculatePosition(yellowRef, mousePosition)
  const orangePosition = calculatePosition(orangeRef, mousePosition)
  const orangeHeadRadius = (ORANGE_WIDTH / 2) * stageXScale
  const yellowHeadRadius = (YELLOW_WIDTH / 2) * stageXScale

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={cn("relative w-[550px] max-w-full", className)}
      style={{
        height: `${STAGE_HEIGHT}px`,
      }}
    >
      <div
        className="absolute"
        style={{
          bottom: 0,
          height: `${STAGE_HEIGHT}px`,
          left: 0,
          transform: `scaleX(${stageXScale})`,
          transformOrigin: "bottom left",
          visibility: isVisible ? "visible" : "hidden",
          width: `${STAGE_WIDTH}px`,
        }}
      >
        <div
          ref={purpleRef}
          className="absolute bottom-0 transition-all duration-700 ease-in-out"
          style={{
            backgroundColor: characterColors.purple,
            borderRadius: "10px 10px 0 0",
            height: isTyping || isHiddenPassword ? "440px" : "400px",
            left: isTyping || isHiddenPassword ? "110px" : "70px",
            transform: isVisiblePassword
              ? "skewX(0deg)"
              : isTyping || isHiddenPassword
                ? `skewX(${purplePosition.bodySkew - 12}deg)`
                : `skewX(${purplePosition.bodySkew}deg)`,
            transformOrigin: "bottom center",
            width: "180px",
            zIndex: 1,
          }}
        >
          <div
            className="absolute flex gap-8 transition-all duration-700 ease-in-out"
            style={{
              left: isVisiblePassword
                ? "20px"
                : isLookingAtEachOther
                  ? "55px"
                  : `${45 + purplePosition.faceX}px`,
              top: isVisiblePassword
                ? "35px"
                : isLookingAtEachOther
                  ? "65px"
                  : `${40 + purplePosition.faceY}px`,
            }}
          >
            <Eye
              forceLookX={isVisiblePassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
              forceLookY={isVisiblePassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
              isBlinking={isPurpleBlinking}
              maxDistance={5}
              mousePosition={mousePosition}
              pupilSize={7}
              size={18}
            />
            <Eye
              forceLookX={isVisiblePassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined}
              forceLookY={isVisiblePassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined}
              isBlinking={isPurpleBlinking}
              maxDistance={5}
              mousePosition={mousePosition}
              pupilSize={7}
              size={18}
            />
          </div>
        </div>

        <div
          ref={blackRef}
          className="absolute bottom-0 transition-all duration-700 ease-in-out"
          style={{
            backgroundColor: characterColors.black,
            borderRadius: "8px 8px 0 0",
            height: "310px",
            left: "240px",
            transform: isVisiblePassword
              ? "skewX(0deg)"
              : isLookingAtEachOther
                ? `skewX(${blackPosition.bodySkew * 1.5 + 10}deg) translateX(20px)`
                : isTyping || isHiddenPassword
                  ? `skewX(${blackPosition.bodySkew * 1.5}deg)`
                  : `skewX(${blackPosition.bodySkew}deg)`,
            transformOrigin: "bottom center",
            width: "120px",
            zIndex: 2,
          }}
        >
          <div
            className="absolute flex gap-6 transition-all duration-700 ease-in-out"
            style={{
              left: isVisiblePassword
                ? "10px"
                : isLookingAtEachOther
                  ? "32px"
                  : `${26 + blackPosition.faceX}px`,
              top: isVisiblePassword
                ? "28px"
                : isLookingAtEachOther
                  ? "12px"
                  : `${32 + blackPosition.faceY}px`,
            }}
          >
            <Eye
              forceLookX={isVisiblePassword ? -4 : isLookingAtEachOther ? 0 : undefined}
              forceLookY={isVisiblePassword ? -4 : isLookingAtEachOther ? -4 : undefined}
              isBlinking={isBlackBlinking}
              maxDistance={4}
              mousePosition={mousePosition}
              pupilSize={6}
              size={16}
            />
            <Eye
              forceLookX={isVisiblePassword ? -4 : isLookingAtEachOther ? 0 : undefined}
              forceLookY={isVisiblePassword ? -4 : isLookingAtEachOther ? -4 : undefined}
              isBlinking={isBlackBlinking}
              maxDistance={4}
              mousePosition={mousePosition}
              pupilSize={6}
              size={16}
            />
          </div>
        </div>

        <div
          ref={orangeRef}
          className="absolute bottom-0 transition-all duration-700 ease-in-out"
          style={{
            backgroundColor: characterColors.orange,
            borderRadius: `${ORANGE_WIDTH / 2}px ${ORANGE_WIDTH / 2}px 0 0 / ${orangeHeadRadius}px ${orangeHeadRadius}px 0 0`,
            height: "200px",
            left: "0",
            transform: isVisiblePassword ? "skewX(0deg)" : `skewX(${orangePosition.bodySkew}deg)`,
            transformOrigin: "bottom center",
            width: `${ORANGE_WIDTH}px`,
            zIndex: 3,
          }}
        >
          <div
            className="absolute flex gap-8 transition-all duration-200 ease-out"
            style={{
              left: isVisiblePassword ? "50px" : `${82 + orangePosition.faceX}px`,
              top: isVisiblePassword ? "85px" : `${90 + orangePosition.faceY}px`,
            }}
          >
            <Pupil
              forceLookX={isVisiblePassword ? -5 : undefined}
              forceLookY={isVisiblePassword ? -4 : undefined}
              mousePosition={mousePosition}
            />
            <Pupil
              forceLookX={isVisiblePassword ? -5 : undefined}
              forceLookY={isVisiblePassword ? -4 : undefined}
              mousePosition={mousePosition}
            />
          </div>
        </div>

        <div
          ref={yellowRef}
          className="absolute bottom-0 transition-all duration-700 ease-in-out"
          style={{
            backgroundColor: characterColors.yellow,
            borderRadius: `${YELLOW_WIDTH / 2}px ${YELLOW_WIDTH / 2}px 0 0 / ${yellowHeadRadius}px ${yellowHeadRadius}px 0 0`,
            height: "230px",
            left: "310px",
            transform: isVisiblePassword ? "skewX(0deg)" : `skewX(${yellowPosition.bodySkew}deg)`,
            transformOrigin: "bottom center",
            width: `${YELLOW_WIDTH}px`,
            zIndex: 4,
          }}
        >
          <div
            className="absolute flex gap-6 transition-all duration-200 ease-out"
            style={{
              left: isVisiblePassword ? "20px" : `${52 + yellowPosition.faceX}px`,
              top: isVisiblePassword ? "35px" : `${40 + yellowPosition.faceY}px`,
            }}
          >
            <Pupil
              forceLookX={isVisiblePassword ? -5 : undefined}
              forceLookY={isVisiblePassword ? -4 : undefined}
              mousePosition={mousePosition}
            />
            <Pupil
              forceLookX={isVisiblePassword ? -5 : undefined}
              forceLookY={isVisiblePassword ? -4 : undefined}
              mousePosition={mousePosition}
            />
          </div>
          <div
            className="absolute h-1 w-20 rounded-full transition-all duration-200 ease-out"
            style={{
              backgroundColor: characterColors.black,
              left: isVisiblePassword ? "10px" : `${40 + yellowPosition.faceX}px`,
              top: isVisiblePassword ? "88px" : `${88 + yellowPosition.faceY}px`,
            }}
          />
        </div>
      </div>
    </div>
  )
}
