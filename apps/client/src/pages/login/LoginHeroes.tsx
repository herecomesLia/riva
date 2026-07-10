import { useEffect, useRef, useState, type RefObject } from "react"
import { useRafState } from "react-use"

import { cn } from "@/lib/utils"
import { useLoginHeroesContext, type LoginHeroesState } from "@/pages/login/LoginHeroesContext"

type LoginHeroesProps = {
  className?: string
}

type LoginHeroesAction = "idle" | "peek" | "look-away"

type Point = {
  x: number
  y: number
}

type CharacterPosition = {
  bodySkew: number
  faceX: number
  faceY: number
}

type CharacterGeometry = {
  height: number
  left: number
  translateX?: number
  width: number
}

type FaceGeometry = {
  characterHeight: number
  characterLeft: number
  characterTranslateX?: number
  faceHeight: number
  faceLeft: number
  faceOffset: Point
  faceTop: number
  faceWidth: number
}

type EyeProps = {
  isBlinking?: boolean
  pupilOffset: Point
  pupilSize?: number
  size?: number
}

type PupilProps = {
  offset: Point
  size?: number
}

const HEROES_HEIGHT = 400

const ZERO_POINT = {
  x: 0,
  y: 0,
} satisfies Point

const DEFAULT_CHARACTER_POSITION = {
  bodySkew: 0,
  faceX: 0,
  faceY: 0,
} satisfies CharacterPosition

const characterColors = {
  black: "#2D2D2D",
  orange: "#FF9B6B",
  purple: "#6C3FF5",
  white: "#FFFFFF",
  yellow: "#E8D754",
} as const

function resolveHeroesAction({
  isPasswordEmpty,
  isPasswordVisible,
  isUsernameFocused,
}: LoginHeroesState): LoginHeroesAction {
  if (!isPasswordEmpty && isPasswordVisible) {
    return "look-away"
  }

  if (!isPasswordEmpty || isUsernameFocused) {
    return "peek"
  }

  return "idle"
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

/**
 * Tracks the pointer in the LoginHeroes root coordinate system.
 *
 * getBoundingClientRect() is intentionally called inside the event handler,
 * rather than during React rendering. useRafState limits React updates to
 * animation frames.
 */
function useHeroesPointerPosition(ref: RefObject<HTMLElement | null>) {
  const [pointerPosition, setPointerPosition] = useRafState<Point | null>(null)

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const element = ref.current

      if (!element) {
        return
      }

      const rect = element.getBoundingClientRect()

      setPointerPosition({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      })
    }

    function handleWindowBlur() {
      setPointerPosition(null)
    }

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    })
    window.addEventListener("blur", handleWindowBlur)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("blur", handleWindowBlur)
    }
  }, [ref, setPointerPosition])

  return pointerPosition
}

function useRandomBlink() {
  const [isBlinking, setIsBlinking] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function scheduleNextBlink() {
      timeoutRef.current = window.setTimeout(
        () => {
          if (cancelled) {
            return
          }

          setIsBlinking(true)

          timeoutRef.current = window.setTimeout(() => {
            if (cancelled) {
              return
            }

            setIsBlinking(false)
            scheduleNextBlink()
          }, 150)
        },
        Math.random() * 4000 + 3000,
      )
    }

    scheduleNextBlink()

    return () => {
      cancelled = true

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return isBlinking
}

function useMutualLook(enabled: boolean) {
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsLookingAtEachOther(false)
      return
    }

    setIsLookingAtEachOther(true)

    const timeoutId = window.setTimeout(() => {
      setIsLookingAtEachOther(false)
    }, 800)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [enabled])

  return isLookingAtEachOther
}

function usePasswordPeek(enabled: boolean) {
  const [isPeeking, setIsPeeking] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setIsPeeking(false)
      return
    }

    let cancelled = false
    let timeoutId: number | undefined

    function schedulePeek() {
      const delay = Math.random() * 3000 + 2000

      timeoutId = window.setTimeout(() => {
        if (cancelled) {
          return
        }

        setIsPeeking(true)

        timeoutId = window.setTimeout(() => {
          if (cancelled) {
            return
          }

          setIsPeeking(false)
          schedulePeek()
        }, 800)
      }, delay)
    }

    schedulePeek()

    return () => {
      cancelled = true

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [enabled])

  return isPeeking
}

/**
 * Calculates character movement entirely from the root coordinate system.
 * This function does not read refs or DOM layout.
 */
function calculateCharacterPosition(
  pointerPosition: Point | null,
  { height, left, translateX = 0, width }: CharacterGeometry,
): CharacterPosition {
  if (!pointerPosition) {
    return DEFAULT_CHARACTER_POSITION
  }

  const top = HEROES_HEIGHT - height
  const centerX = left + translateX + width / 2
  const centerY = top + height / 3

  const deltaX = pointerPosition.x - centerX
  const deltaY = pointerPosition.y - centerY

  return {
    bodySkew: clamp(-deltaX / 120, -6, 6),
    faceX: clamp(deltaX / 20, -15, 15),
    faceY: clamp(deltaY / 30, -10, 10),
  }
}

/**
 * Calculates the approximate center of a face in the root coordinate system.
 *
 * The character body skew is deliberately excluded. Including it would require
 * reading the rendered transform matrix from the DOM and would recreate the
 * render-time measurement problem this refactor removes.
 */
function calculateFaceCenter({
  characterHeight,
  characterLeft,
  characterTranslateX = 0,
  faceHeight,
  faceLeft,
  faceOffset,
  faceTop,
  faceWidth,
}: FaceGeometry): Point {
  const characterTop = HEROES_HEIGHT - characterHeight

  return {
    x: characterLeft + characterTranslateX + faceLeft + faceOffset.x + faceWidth / 2,
    y: characterTop + faceTop + faceOffset.y + faceHeight / 2,
  }
}

/**
 * Calculates pupil movement without reading the eye or pupil DOM element.
 */
function calculateLookOffset(
  pointerPosition: Point | null,
  targetPosition: Point,
  maxDistance: number,
  forcedLook?: Point,
): Point {
  if (forcedLook) {
    return forcedLook
  }

  if (!pointerPosition) {
    return ZERO_POINT
  }

  const deltaX = pointerPosition.x - targetPosition.x
  const deltaY = pointerPosition.y - targetPosition.y
  const distance = Math.hypot(deltaX, deltaY)

  if (distance === 0) {
    return ZERO_POINT
  }

  const scale = Math.min(distance, maxDistance) / distance

  return {
    x: deltaX * scale,
    y: deltaY * scale,
  }
}

function Pupil({ offset, size = 12 }: PupilProps) {
  return (
    <div
      className="rounded-full transition-transform duration-100 ease-out"
      style={{
        backgroundColor: characterColors.black,
        height: `${size}px`,
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        width: `${size}px`,
      }}
    />
  )
}

function Eye({ isBlinking = false, pupilOffset, pupilSize = 16, size = 48 }: EyeProps) {
  return (
    <div
      className="flex items-center justify-center overflow-hidden rounded-full transition-[height] duration-150"
      style={{
        backgroundColor: characterColors.white,
        height: isBlinking ? "2px" : `${size}px`,
        width: `${size}px`,
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full transition-transform duration-100 ease-out"
          style={{
            backgroundColor: characterColors.black,
            height: `${pupilSize}px`,
            transform: `translate3d(${pupilOffset.x}px, ${pupilOffset.y}px, 0)`,
            width: `${pupilSize}px`,
          }}
        />
      )}
    </div>
  )
}

export function LoginHeroes({ className }: LoginHeroesProps) {
  const [{ isPasswordEmpty, isPasswordVisible, isUsernameFocused }] = useLoginHeroesContext()

  const heroesRef = useRef<HTMLDivElement>(null)
  const pointerPosition = useHeroesPointerPosition(heroesRef)

  const heroesAction = resolveHeroesAction({
    isPasswordEmpty,
    isPasswordVisible,
    isUsernameFocused,
  })

  const isPurpleBlinking = useRandomBlink()
  const isBlackBlinking = useRandomBlink()

  const isLookingAtEachOther = useMutualLook(isUsernameFocused)
  const isPurplePeeking = usePasswordPeek(heroesAction === "look-away")

  const isShowingMutualLook = heroesAction === "peek" && isLookingAtEachOther

  /*
   * Character geometry
   */

  const purpleHeight = heroesAction === "peek" ? 440 : 400
  const purpleTranslateX = heroesAction === "peek" ? 40 : 0

  const blackTranslateX = isShowingMutualLook ? 20 : 0

  const purplePosition = calculateCharacterPosition(pointerPosition, {
    height: purpleHeight,
    left: 70,
    translateX: purpleTranslateX,
    width: 180,
  })

  const blackPosition = calculateCharacterPosition(pointerPosition, {
    height: 310,
    left: 240,
    translateX: blackTranslateX,
    width: 120,
  })

  const orangePosition = calculateCharacterPosition(pointerPosition, {
    height: 200,
    left: 0,
    width: 240,
  })

  const yellowPosition = calculateCharacterPosition(pointerPosition, {
    height: 230,
    left: 310,
    width: 140,
  })

  /*
   * Face movement
   *
   * Each face now has a fixed left/top anchor. Mouse and action movement is
   * represented only through translate3d().
   */

  const purpleFaceOffset: Point =
    heroesAction === "look-away"
      ? { x: -25, y: -5 }
      : isShowingMutualLook
        ? { x: 10, y: 25 }
        : {
            x: purplePosition.faceX,
            y: purplePosition.faceY,
          }

  const blackFaceOffset: Point =
    heroesAction === "look-away"
      ? { x: -16, y: -4 }
      : isShowingMutualLook
        ? { x: 6, y: -20 }
        : {
            x: blackPosition.faceX,
            y: blackPosition.faceY,
          }

  const orangeFaceOffset: Point =
    heroesAction === "look-away"
      ? { x: -32, y: -5 }
      : {
          x: orangePosition.faceX,
          y: orangePosition.faceY,
        }

  const yellowFaceOffset: Point =
    heroesAction === "look-away"
      ? { x: -32, y: -5 }
      : {
          x: yellowPosition.faceX,
          y: yellowPosition.faceY,
        }

  const yellowMouthOffset: Point =
    heroesAction === "look-away"
      ? { x: -30, y: 0 }
      : {
          x: yellowPosition.faceX,
          y: yellowPosition.faceY,
        }

  /*
   * Forced eye directions for special actions
   */

  const purpleForcedLook: Point | undefined =
    heroesAction === "look-away"
      ? isPurplePeeking
        ? { x: 4, y: 5 }
        : { x: -4, y: -4 }
      : isShowingMutualLook
        ? { x: 3, y: 4 }
        : undefined

  const blackForcedLook: Point | undefined =
    heroesAction === "look-away"
      ? { x: -4, y: -4 }
      : isShowingMutualLook
        ? { x: 0, y: -4 }
        : undefined

  const orangeForcedLook: Point | undefined =
    heroesAction === "look-away" ? { x: -5, y: -4 } : undefined

  const yellowForcedLook: Point | undefined =
    heroesAction === "look-away" ? { x: -5, y: -4 } : undefined

  /*
   * Face centers and pupil movement
   */

  const purpleFaceCenter = calculateFaceCenter({
    characterHeight: purpleHeight,
    characterLeft: 70,
    characterTranslateX: purpleTranslateX,
    faceHeight: 18,
    faceLeft: 45,
    faceOffset: purpleFaceOffset,
    faceTop: 40,
    faceWidth: 68,
  })

  const blackFaceCenter = calculateFaceCenter({
    characterHeight: 310,
    characterLeft: 240,
    characterTranslateX: blackTranslateX,
    faceHeight: 16,
    faceLeft: 26,
    faceOffset: blackFaceOffset,
    faceTop: 32,
    faceWidth: 56,
  })

  const orangeFaceCenter = calculateFaceCenter({
    characterHeight: 200,
    characterLeft: 0,
    faceHeight: 12,
    faceLeft: 82,
    faceOffset: orangeFaceOffset,
    faceTop: 90,
    faceWidth: 56,
  })

  const yellowFaceCenter = calculateFaceCenter({
    characterHeight: 230,
    characterLeft: 310,
    faceHeight: 12,
    faceLeft: 52,
    faceOffset: yellowFaceOffset,
    faceTop: 40,
    faceWidth: 48,
  })

  const purpleLookOffset = calculateLookOffset(
    pointerPosition,
    purpleFaceCenter,
    5,
    purpleForcedLook,
  )

  const blackLookOffset = calculateLookOffset(pointerPosition, blackFaceCenter, 4, blackForcedLook)

  const orangeLookOffset = calculateLookOffset(
    pointerPosition,
    orangeFaceCenter,
    5,
    orangeForcedLook,
  )

  const yellowLookOffset = calculateLookOffset(
    pointerPosition,
    yellowFaceCenter,
    5,
    yellowForcedLook,
  )

  return (
    <div
      ref={heroesRef}
      aria-hidden
      className={cn("relative h-[400px] w-[550px] max-w-full", className)}
    >
      {/* Purple character */}
      <div
        className="absolute bottom-0 transition-[height,transform] duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.purple,
          borderRadius: "10px 10px 0 0",
          height: `${purpleHeight}px`,
          left: "70px",
          transform:
            heroesAction === "look-away"
              ? "skewX(0deg)"
              : heroesAction === "peek"
                ? `skewX(${purplePosition.bodySkew - 12}deg) translateX(40px)`
                : `skewX(${purplePosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "180px",
          zIndex: 1,
        }}
      >
        <div
          className="absolute left-[45px] top-[40px] flex gap-8 transition-transform duration-700 ease-in-out"
          style={{
            transform: `translate3d(${purpleFaceOffset.x}px, ${purpleFaceOffset.y}px, 0)`,
          }}
        >
          <Eye
            isBlinking={isPurpleBlinking}
            pupilOffset={purpleLookOffset}
            pupilSize={7}
            size={18}
          />

          <Eye
            isBlinking={isPurpleBlinking}
            pupilOffset={purpleLookOffset}
            pupilSize={7}
            size={18}
          />
        </div>
      </div>

      {/* Black character */}
      <div
        className="absolute bottom-0 transition-transform duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.black,
          borderRadius: "8px 8px 0 0",
          height: "310px",
          left: "240px",
          transform:
            heroesAction === "look-away"
              ? "skewX(0deg)"
              : isShowingMutualLook
                ? `skewX(${blackPosition.bodySkew * 1.5 + 10}deg) translateX(20px)`
                : heroesAction === "peek"
                  ? `skewX(${blackPosition.bodySkew * 1.5}deg)`
                  : `skewX(${blackPosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "120px",
          zIndex: 2,
        }}
      >
        <div
          className="absolute left-[26px] top-[32px] flex gap-6 transition-transform duration-700 ease-in-out"
          style={{
            transform: `translate3d(${blackFaceOffset.x}px, ${blackFaceOffset.y}px, 0)`,
          }}
        >
          <Eye isBlinking={isBlackBlinking} pupilOffset={blackLookOffset} pupilSize={6} size={16} />

          <Eye isBlinking={isBlackBlinking} pupilOffset={blackLookOffset} pupilSize={6} size={16} />
        </div>
      </div>

      {/* Orange character */}
      <div
        className="absolute bottom-0 transition-transform duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.orange,
          borderRadius: "120px 120px 0 0",
          height: "200px",
          left: "0",
          transform:
            heroesAction === "look-away" ? "skewX(0deg)" : `skewX(${orangePosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "240px",
          zIndex: 3,
        }}
      >
        <div
          className="absolute left-[82px] top-[90px] flex gap-8 transition-transform duration-200 ease-out"
          style={{
            transform: `translate3d(${orangeFaceOffset.x}px, ${orangeFaceOffset.y}px, 0)`,
          }}
        >
          <Pupil offset={orangeLookOffset} />
          <Pupil offset={orangeLookOffset} />
        </div>
      </div>

      {/* Yellow character */}
      <div
        className="absolute bottom-0 transition-transform duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.yellow,
          borderRadius: "70px 70px 0 0",
          height: "230px",
          left: "310px",
          transform:
            heroesAction === "look-away" ? "skewX(0deg)" : `skewX(${yellowPosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "140px",
          zIndex: 4,
        }}
      >
        <div
          className="absolute left-[52px] top-[40px] flex gap-6 transition-transform duration-200 ease-out"
          style={{
            transform: `translate3d(${yellowFaceOffset.x}px, ${yellowFaceOffset.y}px, 0)`,
          }}
        >
          <Pupil offset={yellowLookOffset} />
          <Pupil offset={yellowLookOffset} />
        </div>

        <div
          className="absolute left-[40px] top-[88px] h-1 w-20 rounded-full transition-transform duration-200 ease-out"
          style={{
            backgroundColor: characterColors.black,
            transform: `translate3d(${yellowMouthOffset.x}px, ${yellowMouthOffset.y}px, 0)`,
          }}
        />
      </div>
    </div>
  )
}
