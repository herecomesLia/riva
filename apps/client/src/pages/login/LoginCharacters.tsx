import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

import { cn } from "@/lib/utils"

type CharacterPosition = {
  bodySkew: number
  faceX: number
  faceY: number
}

type LoginCharactersProps = {
  className?: string
  hasPassword: boolean
  isUsernameFocused: boolean
  showPassword: boolean
}

type MousePosition = {
  x: number
  y: number
}

type PasswordState = "empty" | "hidden" | "visible"

type GazeProps = {
  forcedLook?: MousePosition
  maxDistance?: number
  mousePosition: MousePosition | null
}

type EyeProps = GazeProps & {
  isBlinking?: boolean
  pupilSize?: number
  size?: number
}

type PupilProps = GazeProps & {
  size?: number
}

type PupilDotProps = {
  position: MousePosition
  size: number
}

type PurplePose = {
  bodySkew: number
  faceLeft: number
  faceTop: number
  faceTransform: string
  forcedLook?: MousePosition
  height: number
  left: number
  skew: number
}

type BlackPose = {
  faceLeft: number
  faceTop: number
  forcedLook?: MousePosition
  transform: string
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
const PURPLE_TRANSITION_DURATION = 700

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function calculateStageXScale(containerWidth: number) {
  return Math.min(Math.max(containerWidth, 0) / STAGE_WIDTH, 1)
}

function getPasswordState(hasPassword: boolean, showPassword: boolean): PasswordState {
  if (!hasPassword) {
    return "empty"
  }

  return showPassword ? "visible" : "hidden"
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

    function updateMousePosition() {
      frameRef.current = null
      setMousePosition(latestPositionRef.current)
    }

    function handleMouseMove(event: MouseEvent) {
      latestPositionRef.current = { x: event.clientX, y: event.clientY }

      if (frameRef.current === null) {
        frameRef.current = window.requestAnimationFrame(updateMousePosition)
      }
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
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
  forcedLook?: MousePosition,
) {
  if (forcedLook) {
    return forcedLook
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

function useStageLayout(containerRef: RefObject<HTMLDivElement | null>) {
  const [isVisible, setIsVisible] = useState(false)
  const [stageXScale, setStageXScale] = useState(1)

  useLayoutEffect(() => {
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
  }, [containerRef])

  return { isVisible, stageXScale }
}

function getPurplePose(
  passwordState: PasswordState,
  isUsernameFocused: boolean,
  isLookingAtEachOther: boolean,
  isPurplePeeking: boolean,
  position: CharacterPosition,
): PurplePose {
  const isVisiblePassword = passwordState === "visible"
  const isHiddenPassword = passwordState === "hidden"
  const isScriptedPose = isVisiblePassword || isLookingAtEachOther

  return {
    bodySkew: isVisiblePassword ? 0 : position.bodySkew,
    faceLeft: isVisiblePassword ? 20 : isLookingAtEachOther ? 55 : 45,
    faceTop: isVisiblePassword ? 35 : isLookingAtEachOther ? 65 : 40,
    faceTransform: isScriptedPose
      ? "translate(0px, 0px)"
      : `translate(${position.faceX}px, ${position.faceY}px)`,
    forcedLook: isVisiblePassword
      ? isPurplePeeking
        ? { x: 4, y: 5 }
        : { x: -4, y: -4 }
      : isLookingAtEachOther
        ? { x: 3, y: 4 }
        : undefined,
    height: isUsernameFocused || isHiddenPassword ? STAGE_HEIGHT : 400,
    left: isUsernameFocused || isHiddenPassword ? 110 : 70,
    skew: isVisiblePassword ? 0 : isUsernameFocused || isHiddenPassword ? -12 : 0,
  }
}

function getBlackPose(
  passwordState: PasswordState,
  isUsernameFocused: boolean,
  isLookingAtEachOther: boolean,
  position: CharacterPosition,
): BlackPose {
  if (passwordState === "visible") {
    return {
      faceLeft: 10,
      faceTop: 28,
      forcedLook: { x: -4, y: -4 },
      transform: "skewX(0deg)",
    }
  }

  if (isLookingAtEachOther) {
    return {
      faceLeft: 32,
      faceTop: 12,
      forcedLook: { x: 0, y: -4 },
      transform: `skewX(${position.bodySkew * 1.5 + 10}deg) translateX(20px)`,
    }
  }

  return {
    faceLeft: 26 + position.faceX,
    faceTop: 32 + position.faceY,
    transform: `skewX(${position.bodySkew * (isUsernameFocused || passwordState === "hidden" ? 1.5 : 1)}deg)`,
  }
}

const PupilDot = forwardRef<HTMLDivElement, PupilDotProps>(function PupilDot({ position, size }, ref) {
  return (
    <div
      ref={ref}
      className="rounded-full"
      style={{
        backgroundColor: characterColors.black,
        height: `${size}px`,
        transform: `translate(${position.x}px, ${position.y}px)`,
        transition: "transform 0.1s ease-out",
        width: `${size}px`,
      }}
    />
  )
})

function Pupil({ maxDistance = 5, mousePosition, size = 12, forcedLook }: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(pupilRef, mousePosition, maxDistance, forcedLook)

  return <PupilDot ref={pupilRef} position={pupilPosition} size={size} />
}

function Eye({
  isBlinking = false,
  maxDistance = 10,
  mousePosition,
  pupilSize = 16,
  size = 48,
  forcedLook,
}: EyeProps) {
  const eyeRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(eyeRef, mousePosition, maxDistance, forcedLook)

  return (
    <div
      ref={eyeRef}
      className="flex items-center justify-center overflow-hidden rounded-full transition-[height] duration-150"
      style={{
        backgroundColor: characterColors.white,
        height: isBlinking ? "2px" : `${size}px`,
        width: `${size}px`,
      }}
    >
      {!isBlinking && <PupilDot position={pupilPosition} size={pupilSize} />}
    </div>
  )
}

export function LoginCharacters({
  className,
  hasPassword,
  isUsernameFocused,
  showPassword,
}: LoginCharactersProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const purpleRef = useRef<HTMLDivElement>(null)
  const blackRef = useRef<HTMLDivElement>(null)
  const yellowRef = useRef<HTMLDivElement>(null)
  const orangeRef = useRef<HTMLDivElement>(null)
  const { isVisible, stageXScale } = useStageLayout(containerRef)
  const mousePosition = useMousePosition(isVisible)
  const isPurpleBlinking = useRandomBlink(isVisible)
  const isBlackBlinking = useRandomBlink(isVisible)
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
  const [isPurplePeeking, setIsPurplePeeking] = useState(false)
  const passwordState = getPasswordState(hasPassword, showPassword)
  const isVisiblePassword = passwordState === "visible"

  useLayoutEffect(() => {
    if (!isVisible || !isUsernameFocused) {
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
  }, [isUsernameFocused, isVisible])

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

  const purplePose = getPurplePose(
    passwordState,
    isUsernameFocused,
    isLookingAtEachOther,
    isPurplePeeking,
    calculatePosition(purpleRef, mousePosition),
  )
  const blackPose = getBlackPose(
    passwordState,
    isUsernameFocused,
    isLookingAtEachOther,
    calculatePosition(blackRef, mousePosition),
  )
  const yellowPosition = calculatePosition(yellowRef, mousePosition)
  const orangePosition = calculatePosition(orangeRef, mousePosition)
  const orangeHeadRadius = (ORANGE_WIDTH / 2) * stageXScale
  const yellowHeadRadius = (YELLOW_WIDTH / 2) * stageXScale

  return (
    <div
      ref={containerRef}
      aria-hidden
      data-testid="login-characters-shell"
      className={cn("relative w-[550px] max-w-full", className)}
      style={{
        height: `${STAGE_HEIGHT}px`,
      }}
    >
      <div
        className="absolute"
        data-testid="login-characters-stage"
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
          className="absolute bottom-0"
          data-character="purple"
          style={{
            height: `${purplePose.height}px`,
            left: `${purplePose.left}px`,
            transform: `skewX(${purplePose.skew}deg)`,
            transformOrigin: "bottom center",
            transition: `height ${PURPLE_TRANSITION_DURATION}ms ease-in-out, left ${PURPLE_TRANSITION_DURATION}ms ease-in-out, transform ${PURPLE_TRANSITION_DURATION}ms ease-in-out`,
            width: "180px",
            zIndex: 1,
          }}
        >
          <div
            className="absolute inset-0"
            data-part="body"
            style={{
              backgroundColor: characterColors.purple,
              borderRadius: "10px 10px 0 0",
              transform: `skewX(${purplePose.bodySkew}deg)`,
              transformOrigin: "bottom center",
              transition: "transform 0.1s ease-out",
            }}
          >
            <div
              className="absolute flex gap-8"
              data-part="face"
              style={{
                left: `${purplePose.faceLeft}px`,
                top: `${purplePose.faceTop}px`,
                transform: purplePose.faceTransform,
                transition: `left ${PURPLE_TRANSITION_DURATION}ms ease-in-out, top ${PURPLE_TRANSITION_DURATION}ms ease-in-out, transform ${PURPLE_TRANSITION_DURATION}ms ease-in-out`,
              }}
            >
              <Eye
                forcedLook={purplePose.forcedLook}
                isBlinking={isPurpleBlinking}
                maxDistance={5}
                mousePosition={mousePosition}
                pupilSize={7}
                size={18}
              />
              <Eye
                forcedLook={purplePose.forcedLook}
                isBlinking={isPurpleBlinking}
                maxDistance={5}
                mousePosition={mousePosition}
                pupilSize={7}
                size={18}
              />
            </div>
          </div>
        </div>

        <div
          ref={blackRef}
          className="absolute bottom-0 transition-transform duration-700 ease-in-out"
          data-character="black"
          style={{
            backgroundColor: characterColors.black,
            borderRadius: "8px 8px 0 0",
            height: "310px",
            left: "240px",
            transform: blackPose.transform,
            transformOrigin: "bottom center",
            width: "120px",
            zIndex: 2,
          }}
        >
          <div
            className="absolute flex gap-6 transition-[left,top] duration-700 ease-in-out"
            style={{
              left: `${blackPose.faceLeft}px`,
              top: `${blackPose.faceTop}px`,
            }}
          >
            <Eye
              forcedLook={blackPose.forcedLook}
              isBlinking={isBlackBlinking}
              maxDistance={4}
              mousePosition={mousePosition}
              pupilSize={6}
              size={16}
            />
            <Eye
              forcedLook={blackPose.forcedLook}
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
          className="absolute bottom-0 transition-transform duration-700 ease-in-out"
          data-character="orange"
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
            className="absolute flex gap-8 transition-[left,top] duration-200 ease-out"
            style={{
              left: isVisiblePassword ? "50px" : `${82 + orangePosition.faceX}px`,
              top: isVisiblePassword ? "85px" : `${90 + orangePosition.faceY}px`,
            }}
          >
            <Pupil
              forcedLook={isVisiblePassword ? { x: -5, y: -4 } : undefined}
              mousePosition={mousePosition}
            />
            <Pupil
              forcedLook={isVisiblePassword ? { x: -5, y: -4 } : undefined}
              mousePosition={mousePosition}
            />
          </div>
        </div>

        <div
          ref={yellowRef}
          className="absolute bottom-0 transition-transform duration-700 ease-in-out"
          data-character="yellow"
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
            className="absolute flex gap-6 transition-[left,top] duration-200 ease-out"
            style={{
              left: isVisiblePassword ? "20px" : `${52 + yellowPosition.faceX}px`,
              top: isVisiblePassword ? "35px" : `${40 + yellowPosition.faceY}px`,
            }}
          >
            <Pupil
              forcedLook={isVisiblePassword ? { x: -5, y: -4 } : undefined}
              mousePosition={mousePosition}
            />
            <Pupil
              forcedLook={isVisiblePassword ? { x: -5, y: -4 } : undefined}
              mousePosition={mousePosition}
            />
          </div>
          <div
            className="absolute h-1 w-20 rounded-full transition-[left,top] duration-200 ease-out"
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
