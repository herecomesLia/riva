import { useCallback, useEffect, useRef, useState } from "react"

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
  horizontalScale: number
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

type PairLayout = {
  gap: number
  left: number
  width: number
}

type MouthLayout = {
  left: number
  width: number
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

const HEROES_WIDTH = 550
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

const heroLayout = {
  purple: {
    body: {
      height: 400,
      left: 70,
      width: 180,
    },
    face: {
      centerX: 79,
      gap: 32,
      top: 40,
    },
    eye: {
      maxDistance: 5,
      pupilSize: 7,
      size: 18,
    },
  },
  black: {
    body: {
      height: 310,
      left: 240,
      width: 120,
    },
    face: {
      centerX: 54,
      gap: 24,
      top: 32,
    },
    eye: {
      maxDistance: 4,
      pupilSize: 6,
      size: 16,
    },
  },
  orange: {
    body: {
      height: 200,
      left: 0,
      width: 240,
    },
    face: {
      centerX: 110,
      gap: 32,
      top: 90,
    },
    pupil: {
      maxDistance: 5,
      size: 12,
    },
  },
  yellow: {
    body: {
      height: 230,
      left: 310,
      width: 140,
    },
    face: {
      centerX: 76,
      gap: 24,
      top: 40,
    },
    mouth: {
      centerX: 80,
      height: 4,
      top: 88,
      width: 80,
    },
    pupil: {
      maxDistance: 5,
      size: 12,
    },
  },
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

function scaleX(value: number, horizontalScale: number) {
  return value * horizontalScale
}

/**
 * Measures the current rendered width of an element.
 */
function useElementWidth(element: HTMLElement | null) {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (!element) {
      setWidth(0)
      return
    }

    function updateWidth(nextWidth: number) {
      setWidth((currentWidth) => {
        if (Math.abs(currentWidth - nextWidth) < 0.5) {
          return currentWidth
        }

        return nextWidth
      })
    }

    updateWidth(element.getBoundingClientRect().width)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (entry) {
        updateWidth(entry.contentRect.width)
      }
    })

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [element])

  return width
}

/**
 * Reads pointer and element geometry at most once per animation frame.
 */
function useHeroesPointerPosition(element: HTMLElement | null) {
  const [pointerPosition, setPointerPosition] = useState<Point | null>(null)

  const latestPointerRef = useRef<Point | null>(null)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    function flushPointerPosition() {
      frameRef.current = null

      const latestPointer = latestPointerRef.current

      if (!element || !latestPointer) {
        return
      }

      const rect = element.getBoundingClientRect()

      setPointerPosition({
        x: latestPointer.x - rect.left,
        y: latestPointer.y - rect.top,
      })
    }

    function handlePointerMove(event: PointerEvent) {
      latestPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      }

      if (frameRef.current !== null) {
        return
      }

      frameRef.current = window.requestAnimationFrame(flushPointerPosition)
    }

    function resetPointerPosition() {
      latestPointerRef.current = null

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }

      setPointerPosition(null)
    }

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    })
    window.addEventListener("blur", resetPointerPosition)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("blur", resetPointerPosition)

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [element])

  return pointerPosition
}

function useRandomBlink() {
  const [isBlinking, setIsBlinking] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined

    function scheduleNextBlink() {
      timeoutId = window.setTimeout(
        () => {
          if (cancelled) {
            return
          }

          setIsBlinking(true)

          timeoutId = window.setTimeout(() => {
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

      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId)
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
    let timeoutId: ReturnType<typeof window.setTimeout> | undefined

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
 * Calculates a responsive two-item layout.
 *
 * Item sizes stay unchanged so eyes and pupils remain circular. The gap and
 * group position shrink with the character body.
 */
function calculatePairLayout({
  baseBodyWidth,
  baseCenterX,
  baseGap,
  bodyWidth,
  horizontalScale,
  itemSize,
}: {
  baseBodyWidth: number
  baseCenterX: number
  baseGap: number
  bodyWidth: number
  horizontalScale: number
  itemSize: number
}): PairLayout {
  const maximumPadding = Math.max(0, (bodyWidth - itemSize * 2) / 2)

  const sidePadding = Math.min(clamp(8 * horizontalScale, 4, 8), maximumPadding)

  const availableGap = Math.max(0, bodyWidth - sidePadding * 2 - itemSize * 2)

  const gap = Math.min(baseGap, baseGap * horizontalScale, availableGap)

  const width = itemSize * 2 + gap

  const desiredCenter = bodyWidth * (baseCenterX / baseBodyWidth)

  const minimumLeft = sidePadding
  const maximumLeft = Math.max(minimumLeft, bodyWidth - sidePadding - width)

  return {
    gap,
    left: clamp(desiredCenter - width / 2, minimumLeft, maximumLeft),
    width,
  }
}

/**
 * Calculates a responsive mouth layout that never exceeds the body width.
 */
function calculateMouthLayout({
  baseBodyWidth,
  baseCenterX,
  baseWidth,
  bodyWidth,
  horizontalScale,
}: {
  baseBodyWidth: number
  baseCenterX: number
  baseWidth: number
  bodyWidth: number
  horizontalScale: number
}): MouthLayout {
  const sidePadding = Math.min(clamp(8 * horizontalScale, 4, 8), bodyWidth / 2)

  const maximumWidth = Math.max(0, bodyWidth - sidePadding * 2)

  const minimumWidth = Math.min(32, maximumWidth)

  const width = clamp(baseWidth * horizontalScale, minimumWidth, maximumWidth)

  const desiredCenter = bodyWidth * (baseCenterX / baseBodyWidth)

  const minimumLeft = sidePadding
  const maximumLeft = Math.max(minimumLeft, bodyWidth - sidePadding - width)

  return {
    left: clamp(desiredCenter - width / 2, minimumLeft, maximumLeft),
    width,
  }
}

function calculateCharacterPosition(
  pointerPosition: Point | null,
  { height, horizontalScale, left, translateX = 0, width }: CharacterGeometry,
): CharacterPosition {
  if (!pointerPosition) {
    return DEFAULT_CHARACTER_POSITION
  }

  const top = HEROES_HEIGHT - height
  const centerX = left + translateX + width / 2
  const centerY = top + height / 3

  const deltaX = pointerPosition.x - centerX
  const deltaY = pointerPosition.y - centerY

  const maximumFaceX = 15 * horizontalScale

  return {
    bodySkew: clamp(-deltaX / 120, -6, 6),
    faceX: clamp(deltaX / 20, -maximumFaceX, maximumFaceX),
    faceY: clamp(deltaY / 30, -10, 10),
  }
}

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

  const offsetScale = Math.min(distance, maxDistance) / distance

  return {
    x: deltaX * offsetScale,
    y: deltaY * offsetScale,
  }
}

function Pupil({ offset, size = 12 }: PupilProps) {
  return (
    <div
      className="rounded-full transition-transform duration-100 ease-out"
      style={{
        backgroundColor: characterColors.black,
        height: size,
        transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
        width: size,
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
        height: isBlinking ? 2 : size,
        width: size,
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full transition-transform duration-100 ease-out"
          style={{
            backgroundColor: characterColors.black,
            height: pupilSize,
            transform: `translate3d(${pupilOffset.x}px, ${pupilOffset.y}px, 0)`,
            width: pupilSize,
          }}
        />
      )}
    </div>
  )
}

export function LoginHeroes({ className }: LoginHeroesProps) {
  const [{ isPasswordEmpty, isPasswordVisible, isUsernameFocused }] = useLoginHeroesContext()

  const [heroesElement, setHeroesElement] = useState<HTMLDivElement | null>(null)

  const setHeroesRef = useCallback((element: HTMLDivElement | null) => {
    setHeroesElement(element)
  }, [])

  const measuredWidth = useElementWidth(heroesElement)

  const horizontalScale = measuredWidth > 0 ? Math.min(measuredWidth / HEROES_WIDTH, 1) : 1

  const pointerPosition = useHeroesPointerPosition(heroesElement)

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
   * Responsive body geometry
   */

  const purpleHeight = heroesAction === "peek" ? 440 : heroLayout.purple.body.height

  const purpleLeft = scaleX(heroLayout.purple.body.left, horizontalScale)

  const purpleWidth = scaleX(heroLayout.purple.body.width, horizontalScale)

  const purpleTranslateX = heroesAction === "peek" ? scaleX(40, horizontalScale) : 0

  const blackLeft = scaleX(heroLayout.black.body.left, horizontalScale)

  const blackWidth = scaleX(heroLayout.black.body.width, horizontalScale)

  const blackTranslateX = isShowingMutualLook ? scaleX(20, horizontalScale) : 0

  const orangeLeft = scaleX(heroLayout.orange.body.left, horizontalScale)

  const orangeWidth = scaleX(heroLayout.orange.body.width, horizontalScale)

  const yellowLeft = scaleX(heroLayout.yellow.body.left, horizontalScale)

  const yellowWidth = scaleX(heroLayout.yellow.body.width, horizontalScale)

  /*
   * Responsive face layouts
   */

  const purpleFaceLayout = calculatePairLayout({
    baseBodyWidth: heroLayout.purple.body.width,
    baseCenterX: heroLayout.purple.face.centerX,
    baseGap: heroLayout.purple.face.gap,
    bodyWidth: purpleWidth,
    horizontalScale,
    itemSize: heroLayout.purple.eye.size,
  })

  const blackFaceLayout = calculatePairLayout({
    baseBodyWidth: heroLayout.black.body.width,
    baseCenterX: heroLayout.black.face.centerX,
    baseGap: heroLayout.black.face.gap,
    bodyWidth: blackWidth,
    horizontalScale,
    itemSize: heroLayout.black.eye.size,
  })

  const orangeFaceLayout = calculatePairLayout({
    baseBodyWidth: heroLayout.orange.body.width,
    baseCenterX: heroLayout.orange.face.centerX,
    baseGap: heroLayout.orange.face.gap,
    bodyWidth: orangeWidth,
    horizontalScale,
    itemSize: heroLayout.orange.pupil.size,
  })

  const yellowFaceLayout = calculatePairLayout({
    baseBodyWidth: heroLayout.yellow.body.width,
    baseCenterX: heroLayout.yellow.face.centerX,
    baseGap: heroLayout.yellow.face.gap,
    bodyWidth: yellowWidth,
    horizontalScale,
    itemSize: heroLayout.yellow.pupil.size,
  })

  const yellowMouthLayout = calculateMouthLayout({
    baseBodyWidth: heroLayout.yellow.body.width,
    baseCenterX: heroLayout.yellow.mouth.centerX,
    baseWidth: heroLayout.yellow.mouth.width,
    bodyWidth: yellowWidth,
    horizontalScale,
  })

  /*
   * Pointer-driven body positions
   */

  const purplePosition = calculateCharacterPosition(pointerPosition, {
    height: purpleHeight,
    horizontalScale,
    left: purpleLeft,
    translateX: purpleTranslateX,
    width: purpleWidth,
  })

  const blackPosition = calculateCharacterPosition(pointerPosition, {
    height: heroLayout.black.body.height,
    horizontalScale,
    left: blackLeft,
    translateX: blackTranslateX,
    width: blackWidth,
  })

  const orangePosition = calculateCharacterPosition(pointerPosition, {
    height: heroLayout.orange.body.height,
    horizontalScale,
    left: orangeLeft,
    width: orangeWidth,
  })

  const yellowPosition = calculateCharacterPosition(pointerPosition, {
    height: heroLayout.yellow.body.height,
    horizontalScale,
    left: yellowLeft,
    width: yellowWidth,
  })

  /*
   * Face movement
   */

  const purpleFaceOffset: Point =
    heroesAction === "look-away"
      ? {
          x: scaleX(-25, horizontalScale),
          y: -5,
        }
      : isShowingMutualLook
        ? {
            x: scaleX(10, horizontalScale),
            y: 25,
          }
        : {
            x: purplePosition.faceX,
            y: purplePosition.faceY,
          }

  const blackFaceOffset: Point =
    heroesAction === "look-away"
      ? {
          x: scaleX(-16, horizontalScale),
          y: -4,
        }
      : isShowingMutualLook
        ? {
            x: scaleX(6, horizontalScale),
            y: -20,
          }
        : {
            x: blackPosition.faceX,
            y: blackPosition.faceY,
          }

  const orangeFaceOffset: Point =
    heroesAction === "look-away"
      ? {
          x: scaleX(-32, horizontalScale),
          y: -5,
        }
      : {
          x: orangePosition.faceX,
          y: orangePosition.faceY,
        }

  const yellowFaceOffset: Point =
    heroesAction === "look-away"
      ? {
          x: scaleX(-32, horizontalScale),
          y: -5,
        }
      : {
          x: yellowPosition.faceX,
          y: yellowPosition.faceY,
        }

  const yellowMouthOffset: Point =
    heroesAction === "look-away"
      ? {
          x: scaleX(-30, horizontalScale),
          y: 0,
        }
      : {
          x: yellowPosition.faceX,
          y: yellowPosition.faceY,
        }

  /*
   * Forced eye directions
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
   * Face centers and pupil offsets
   */

  const purpleFaceCenter = calculateFaceCenter({
    characterHeight: purpleHeight,
    characterLeft: purpleLeft,
    characterTranslateX: purpleTranslateX,
    faceHeight: heroLayout.purple.eye.size,
    faceLeft: purpleFaceLayout.left,
    faceOffset: purpleFaceOffset,
    faceTop: heroLayout.purple.face.top,
    faceWidth: purpleFaceLayout.width,
  })

  const blackFaceCenter = calculateFaceCenter({
    characterHeight: heroLayout.black.body.height,
    characterLeft: blackLeft,
    characterTranslateX: blackTranslateX,
    faceHeight: heroLayout.black.eye.size,
    faceLeft: blackFaceLayout.left,
    faceOffset: blackFaceOffset,
    faceTop: heroLayout.black.face.top,
    faceWidth: blackFaceLayout.width,
  })

  const orangeFaceCenter = calculateFaceCenter({
    characterHeight: heroLayout.orange.body.height,
    characterLeft: orangeLeft,
    faceHeight: heroLayout.orange.pupil.size,
    faceLeft: orangeFaceLayout.left,
    faceOffset: orangeFaceOffset,
    faceTop: heroLayout.orange.face.top,
    faceWidth: orangeFaceLayout.width,
  })

  const yellowFaceCenter = calculateFaceCenter({
    characterHeight: heroLayout.yellow.body.height,
    characterLeft: yellowLeft,
    faceHeight: heroLayout.yellow.pupil.size,
    faceLeft: yellowFaceLayout.left,
    faceOffset: yellowFaceOffset,
    faceTop: heroLayout.yellow.face.top,
    faceWidth: yellowFaceLayout.width,
  })

  const purpleLookOffset = calculateLookOffset(
    pointerPosition,
    purpleFaceCenter,
    heroLayout.purple.eye.maxDistance,
    purpleForcedLook,
  )

  const blackLookOffset = calculateLookOffset(
    pointerPosition,
    blackFaceCenter,
    heroLayout.black.eye.maxDistance,
    blackForcedLook,
  )

  const orangeLookOffset = calculateLookOffset(
    pointerPosition,
    orangeFaceCenter,
    heroLayout.orange.pupil.maxDistance,
    orangeForcedLook,
  )

  const yellowLookOffset = calculateLookOffset(
    pointerPosition,
    yellowFaceCenter,
    heroLayout.yellow.pupil.maxDistance,
    yellowForcedLook,
  )

  return (
    <div
      ref={setHeroesRef}
      aria-hidden
      className={cn("relative h-[400px] w-full max-w-[550px]", className)}
    >
      {/* Purple character layout wrapper */}
      <div
        className="absolute bottom-0"
        style={{
          height: 440,
          left: purpleLeft,
          width: purpleWidth,
          zIndex: 1,
        }}
      >
        <div
          className="absolute bottom-0 left-0 w-full overflow-hidden transition-[height,transform] duration-700 ease-in-out"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: characterColors.purple,
            borderRadius: "10px 10px 0 0",
            height: purpleHeight,
            transform:
              heroesAction === "look-away"
                ? "skewX(0deg) translate3d(0, 0, 0)"
                : heroesAction === "peek"
                  ? `skewX(${purplePosition.bodySkew - 12}deg) translate3d(${purpleTranslateX}px, 0, 0)`
                  : `skewX(${purplePosition.bodySkew}deg) translate3d(0, 0, 0)`,
            transformOrigin: "bottom center",
            willChange: "height, transform",
          }}
        >
          <div
            className="absolute flex transition-transform duration-700 ease-in-out"
            style={{
              gap: purpleFaceLayout.gap,
              left: purpleFaceLayout.left,
              top: heroLayout.purple.face.top,
              transform: `translate3d(${purpleFaceOffset.x}px, ${purpleFaceOffset.y}px, 0)`,
            }}
          >
            <Eye
              isBlinking={isPurpleBlinking}
              pupilOffset={purpleLookOffset}
              pupilSize={heroLayout.purple.eye.pupilSize}
              size={heroLayout.purple.eye.size}
            />

            <Eye
              isBlinking={isPurpleBlinking}
              pupilOffset={purpleLookOffset}
              pupilSize={heroLayout.purple.eye.pupilSize}
              size={heroLayout.purple.eye.size}
            />
          </div>
        </div>
      </div>

      {/* Black character layout wrapper */}
      <div
        className="absolute bottom-0"
        style={{
          height: heroLayout.black.body.height,
          left: blackLeft,
          width: blackWidth,
          zIndex: 2,
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-700 ease-in-out"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: characterColors.black,
            borderRadius: "8px 8px 0 0",
            transform:
              heroesAction === "look-away"
                ? "skewX(0deg) translate3d(0, 0, 0)"
                : isShowingMutualLook
                  ? `skewX(${blackPosition.bodySkew * 1.5 + 10}deg) translate3d(${blackTranslateX}px, 0, 0)`
                  : heroesAction === "peek"
                    ? `skewX(${blackPosition.bodySkew * 1.5}deg) translate3d(0, 0, 0)`
                    : `skewX(${blackPosition.bodySkew}deg) translate3d(0, 0, 0)`,
            transformOrigin: "bottom center",
            willChange: "transform",
          }}
        >
          <div
            className="absolute flex transition-transform duration-700 ease-in-out"
            style={{
              gap: blackFaceLayout.gap,
              left: blackFaceLayout.left,
              top: heroLayout.black.face.top,
              transform: `translate3d(${blackFaceOffset.x}px, ${blackFaceOffset.y}px, 0)`,
            }}
          >
            <Eye
              isBlinking={isBlackBlinking}
              pupilOffset={blackLookOffset}
              pupilSize={heroLayout.black.eye.pupilSize}
              size={heroLayout.black.eye.size}
            />

            <Eye
              isBlinking={isBlackBlinking}
              pupilOffset={blackLookOffset}
              pupilSize={heroLayout.black.eye.pupilSize}
              size={heroLayout.black.eye.size}
            />
          </div>
        </div>
      </div>

      {/* Orange character layout wrapper */}
      <div
        className="absolute bottom-0"
        style={{
          height: heroLayout.orange.body.height,
          left: orangeLeft,
          width: orangeWidth,
          zIndex: 3,
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-700 ease-in-out"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: characterColors.orange,
            borderRadius: `${orangeWidth / 2}px ${orangeWidth / 2}px 0 0`,
            transform:
              heroesAction === "look-away"
                ? "skewX(0deg) translate3d(0, 0, 0)"
                : `skewX(${orangePosition.bodySkew}deg) translate3d(0, 0, 0)`,
            transformOrigin: "bottom center",
            willChange: "transform",
          }}
        >
          <div
            className="absolute flex transition-transform duration-200 ease-out"
            style={{
              gap: orangeFaceLayout.gap,
              left: orangeFaceLayout.left,
              top: heroLayout.orange.face.top,
              transform: `translate3d(${orangeFaceOffset.x}px, ${orangeFaceOffset.y}px, 0)`,
            }}
          >
            <Pupil offset={orangeLookOffset} size={heroLayout.orange.pupil.size} />

            <Pupil offset={orangeLookOffset} size={heroLayout.orange.pupil.size} />
          </div>
        </div>
      </div>

      {/* Yellow character layout wrapper */}
      <div
        className="absolute bottom-0"
        style={{
          height: heroLayout.yellow.body.height,
          left: yellowLeft,
          width: yellowWidth,
          zIndex: 4,
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-700 ease-in-out"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: characterColors.yellow,
            borderRadius: `${yellowWidth / 2}px ${yellowWidth / 2}px 0 0`,
            transform:
              heroesAction === "look-away"
                ? "skewX(0deg) translate3d(0, 0, 0)"
                : `skewX(${yellowPosition.bodySkew}deg) translate3d(0, 0, 0)`,
            transformOrigin: "bottom center",
            willChange: "transform",
          }}
        >
          <div
            className="absolute flex transition-transform duration-200 ease-out"
            style={{
              gap: yellowFaceLayout.gap,
              left: yellowFaceLayout.left,
              top: heroLayout.yellow.face.top,
              transform: `translate3d(${yellowFaceOffset.x}px, ${yellowFaceOffset.y}px, 0)`,
            }}
          >
            <Pupil offset={yellowLookOffset} size={heroLayout.yellow.pupil.size} />

            <Pupil offset={yellowLookOffset} size={heroLayout.yellow.pupil.size} />
          </div>

          <div
            className="absolute rounded-full transition-transform duration-200 ease-out"
            style={{
              backgroundColor: characterColors.black,
              height: heroLayout.yellow.mouth.height,
              left: yellowMouthLayout.left,
              top: heroLayout.yellow.mouth.top,
              transform: `translate3d(${yellowMouthOffset.x}px, ${yellowMouthOffset.y}px, 0)`,
              width: yellowMouthLayout.width,
            }}
          />
        </div>
      </div>
    </div>
  )
}
