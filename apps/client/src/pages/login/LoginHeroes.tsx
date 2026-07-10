import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"

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

type StageViewportState = {
  horizontalScale: number
  pointerPosition: Point | null
  ready: boolean
}

type StageViewport = StageViewportState & {
  ref: RefObject<HTMLDivElement | null>
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

type PairLayout = {
  gap: number
  left: number
  width: number
}

type MouthLayout = {
  left: number
  width: number
}

type OffsetMotion = {
  pointer: Point
  state: Point
}

type BodyMotion = {
  pointerSkewX: number
  stateSkewX: number
  translateX: number
}

type CharacterMotion = {
  body: BodyMotion
  face: OffsetMotion
  forcedLook?: Point
}

type CharacterFeatureGeometry = {
  bodyHeight: number
  bodyLeft: number
  bodyMotion: BodyMotion
  bodyWidth: number
  featureHeight: number
  featureLeft: number
  featureMotion: OffsetMotion
  featureTop: number
  featureWidth: number
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

const STAGE_WIDTH = 550
const STAGE_HEIGHT = 400

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

const stageLayout = {
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

function createOffsetMotion(state: Point = ZERO_POINT, pointer: Point = ZERO_POINT): OffsetMotion {
  return {
    pointer,
    state,
  }
}

function useStageViewport(): StageViewport {
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

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    })
    window.addEventListener("blur", resetPointerPosition)
    measureViewport()

    return () => {
      observer.disconnect()
      window.removeEventListener("pointermove", handlePointerMove)
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

  const top = STAGE_HEIGHT - height
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

function applySkewX(point: Point, skewX: number, origin: Point): Point {
  if (skewX === 0) {
    return point
  }

  const radians = (skewX * Math.PI) / 180
  const shear = Math.tan(radians)

  return {
    x: point.x + shear * (point.y - origin.y),
    y: point.y,
  }
}

function transformCharacterPointToRoot({
  bodyHeight,
  bodyLeft,
  bodyMotion,
  bodyWidth,
  localPoint,
}: {
  bodyHeight: number
  bodyLeft: number
  bodyMotion: BodyMotion
  bodyWidth: number
  localPoint: Point
}): Point {
  const transformOrigin = {
    x: bodyWidth / 2,
    y: bodyHeight,
  }

  const pointerTransformedPoint = applySkewX(localPoint, bodyMotion.pointerSkewX, transformOrigin)

  const stateTransformedPoint = applySkewX(
    pointerTransformedPoint,
    bodyMotion.stateSkewX,
    transformOrigin,
  )

  return {
    x: bodyLeft + bodyMotion.translateX + stateTransformedPoint.x,
    y: STAGE_HEIGHT - bodyHeight + stateTransformedPoint.y,
  }
}

function calculateCharacterFeatureCenter({
  bodyHeight,
  bodyLeft,
  bodyMotion,
  bodyWidth,
  featureHeight,
  featureLeft,
  featureMotion,
  featureTop,
  featureWidth,
}: CharacterFeatureGeometry): Point {
  const localCenter = {
    x: featureLeft + featureWidth / 2 + featureMotion.state.x + featureMotion.pointer.x,
    y: featureTop + featureHeight / 2 + featureMotion.state.y + featureMotion.pointer.y,
  }

  return transformCharacterPointToRoot({
    bodyHeight,
    bodyLeft,
    bodyMotion,
    bodyWidth,
    localPoint: localCenter,
  })
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

function resolvePurpleMotion({
  action,
  horizontalScale,
  isMutualLook,
  isPeeking,
  position,
}: {
  action: LoginHeroesAction
  horizontalScale: number
  isMutualLook: boolean
  isPeeking: boolean
  position: CharacterPosition
}): CharacterMotion {
  if (action === "look-away") {
    return {
      body: {
        pointerSkewX: 0,
        stateSkewX: 0,
        translateX: 0,
      },
      face: createOffsetMotion({
        x: scaleX(-25, horizontalScale),
        y: -5,
      }),
      forcedLook: isPeeking ? { x: 4, y: 5 } : { x: -4, y: -4 },
    }
  }

  if (action === "peek") {
    if (isMutualLook) {
      return {
        body: {
          pointerSkewX: position.bodySkew,
          stateSkewX: -12,
          translateX: scaleX(40, horizontalScale),
        },
        face: createOffsetMotion({
          x: scaleX(10, horizontalScale),
          y: 25,
        }),
        forcedLook: {
          x: 3,
          y: 4,
        },
      }
    }

    return {
      body: {
        pointerSkewX: position.bodySkew,
        stateSkewX: -12,
        translateX: scaleX(40, horizontalScale),
      },
      face: createOffsetMotion(ZERO_POINT, {
        x: position.faceX,
        y: position.faceY,
      }),
    }
  }

  return {
    body: {
      pointerSkewX: position.bodySkew,
      stateSkewX: 0,
      translateX: 0,
    },
    face: createOffsetMotion(ZERO_POINT, {
      x: position.faceX,
      y: position.faceY,
    }),
  }
}

function resolveBlackMotion({
  action,
  horizontalScale,
  isMutualLook,
  position,
}: {
  action: LoginHeroesAction
  horizontalScale: number
  isMutualLook: boolean
  position: CharacterPosition
}): CharacterMotion {
  if (action === "look-away") {
    return {
      body: {
        pointerSkewX: 0,
        stateSkewX: 0,
        translateX: 0,
      },
      face: createOffsetMotion({
        x: scaleX(-16, horizontalScale),
        y: -4,
      }),
      forcedLook: {
        x: -4,
        y: -4,
      },
    }
  }

  if (action === "peek") {
    if (isMutualLook) {
      return {
        body: {
          pointerSkewX: position.bodySkew * 1.5,
          stateSkewX: 10,
          translateX: scaleX(20, horizontalScale),
        },
        face: createOffsetMotion({
          x: scaleX(6, horizontalScale),
          y: -20,
        }),
        forcedLook: {
          x: 0,
          y: -4,
        },
      }
    }

    return {
      body: {
        pointerSkewX: position.bodySkew * 1.5,
        stateSkewX: 0,
        translateX: 0,
      },
      face: createOffsetMotion(ZERO_POINT, {
        x: position.faceX,
        y: position.faceY,
      }),
    }
  }

  return {
    body: {
      pointerSkewX: position.bodySkew,
      stateSkewX: 0,
      translateX: 0,
    },
    face: createOffsetMotion(ZERO_POINT, {
      x: position.faceX,
      y: position.faceY,
    }),
  }
}

function resolveOrangeMotion({
  action,
  horizontalScale,
  position,
}: {
  action: LoginHeroesAction
  horizontalScale: number
  position: CharacterPosition
}): CharacterMotion {
  if (action === "look-away") {
    return {
      body: {
        pointerSkewX: 0,
        stateSkewX: 0,
        translateX: 0,
      },
      face: createOffsetMotion({
        x: scaleX(-32, horizontalScale),
        y: -5,
      }),
      forcedLook: {
        x: -5,
        y: -4,
      },
    }
  }

  return {
    body: {
      pointerSkewX: position.bodySkew,
      stateSkewX: 0,
      translateX: 0,
    },
    face: createOffsetMotion(ZERO_POINT, {
      x: position.faceX,
      y: position.faceY,
    }),
  }
}

function resolveYellowMotion({
  action,
  horizontalScale,
  position,
}: {
  action: LoginHeroesAction
  horizontalScale: number
  position: CharacterPosition
}): CharacterMotion {
  if (action === "look-away") {
    return {
      body: {
        pointerSkewX: 0,
        stateSkewX: 0,
        translateX: 0,
      },
      face: createOffsetMotion({
        x: scaleX(-32, horizontalScale),
        y: -5,
      }),
      forcedLook: {
        x: -5,
        y: -4,
      },
    }
  }

  return {
    body: {
      pointerSkewX: position.bodySkew,
      stateSkewX: 0,
      translateX: 0,
    },
    face: createOffsetMotion(ZERO_POINT, {
      x: position.faceX,
      y: position.faceY,
    }),
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
      className="flex items-center justify-center overflow-hidden rounded-full transition-[height] duration-150 ease-in-out"
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

  const { horizontalScale, pointerPosition, ready, ref: stageRef } = useStageViewport()

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

  const purpleHeight = heroesAction === "peek" ? 440 : stageLayout.purple.body.height

  const purpleLeft = scaleX(stageLayout.purple.body.left, horizontalScale)

  const purpleWidth = scaleX(stageLayout.purple.body.width, horizontalScale)

  const blackLeft = scaleX(stageLayout.black.body.left, horizontalScale)

  const blackWidth = scaleX(stageLayout.black.body.width, horizontalScale)

  const orangeLeft = scaleX(stageLayout.orange.body.left, horizontalScale)

  const orangeWidth = scaleX(stageLayout.orange.body.width, horizontalScale)

  const yellowLeft = scaleX(stageLayout.yellow.body.left, horizontalScale)

  const yellowWidth = scaleX(stageLayout.yellow.body.width, horizontalScale)

  const purpleFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.purple.body.width,
    baseCenterX: stageLayout.purple.face.centerX,
    baseGap: stageLayout.purple.face.gap,
    bodyWidth: purpleWidth,
    horizontalScale,
    itemSize: stageLayout.purple.eye.size,
  })

  const blackFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.black.body.width,
    baseCenterX: stageLayout.black.face.centerX,
    baseGap: stageLayout.black.face.gap,
    bodyWidth: blackWidth,
    horizontalScale,
    itemSize: stageLayout.black.eye.size,
  })

  const orangeFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.orange.body.width,
    baseCenterX: stageLayout.orange.face.centerX,
    baseGap: stageLayout.orange.face.gap,
    bodyWidth: orangeWidth,
    horizontalScale,
    itemSize: stageLayout.orange.pupil.size,
  })

  const yellowFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.yellow.body.width,
    baseCenterX: stageLayout.yellow.face.centerX,
    baseGap: stageLayout.yellow.face.gap,
    bodyWidth: yellowWidth,
    horizontalScale,
    itemSize: stageLayout.yellow.pupil.size,
  })

  const yellowMouthLayout = calculateMouthLayout({
    baseBodyWidth: stageLayout.yellow.body.width,
    baseCenterX: stageLayout.yellow.mouth.centerX,
    baseWidth: stageLayout.yellow.mouth.width,
    bodyWidth: yellowWidth,
    horizontalScale,
  })

  const purplePosition = calculateCharacterPosition(pointerPosition, {
    height: purpleHeight,
    horizontalScale,
    left: purpleLeft,
    translateX: heroesAction === "peek" ? scaleX(40, horizontalScale) : 0,
    width: purpleWidth,
  })

  const blackPosition = calculateCharacterPosition(pointerPosition, {
    height: stageLayout.black.body.height,
    horizontalScale,
    left: blackLeft,
    translateX: isShowingMutualLook ? scaleX(20, horizontalScale) : 0,
    width: blackWidth,
  })

  const orangePosition = calculateCharacterPosition(pointerPosition, {
    height: stageLayout.orange.body.height,
    horizontalScale,
    left: orangeLeft,
    width: orangeWidth,
  })

  const yellowPosition = calculateCharacterPosition(pointerPosition, {
    height: stageLayout.yellow.body.height,
    horizontalScale,
    left: yellowLeft,
    width: yellowWidth,
  })

  const purpleMotion = resolvePurpleMotion({
    action: heroesAction,
    horizontalScale,
    isMutualLook: isShowingMutualLook,
    isPeeking: isPurplePeeking,
    position: purplePosition,
  })

  const blackMotion = resolveBlackMotion({
    action: heroesAction,
    horizontalScale,
    isMutualLook: isShowingMutualLook,
    position: blackPosition,
  })

  const orangeMotion = resolveOrangeMotion({
    action: heroesAction,
    horizontalScale,
    position: orangePosition,
  })

  const yellowMotion = resolveYellowMotion({
    action: heroesAction,
    horizontalScale,
    position: yellowPosition,
  })

  const purpleFaceCenter = calculateCharacterFeatureCenter({
    bodyHeight: purpleHeight,
    bodyLeft: purpleLeft,
    bodyMotion: purpleMotion.body,
    bodyWidth: purpleWidth,
    featureHeight: stageLayout.purple.eye.size,
    featureLeft: purpleFaceLayout.left,
    featureMotion: purpleMotion.face,
    featureTop: stageLayout.purple.face.top,
    featureWidth: purpleFaceLayout.width,
  })

  const blackFaceCenter = calculateCharacterFeatureCenter({
    bodyHeight: stageLayout.black.body.height,
    bodyLeft: blackLeft,
    bodyMotion: blackMotion.body,
    bodyWidth: blackWidth,
    featureHeight: stageLayout.black.eye.size,
    featureLeft: blackFaceLayout.left,
    featureMotion: blackMotion.face,
    featureTop: stageLayout.black.face.top,
    featureWidth: blackFaceLayout.width,
  })

  const orangeFaceCenter = calculateCharacterFeatureCenter({
    bodyHeight: stageLayout.orange.body.height,
    bodyLeft: orangeLeft,
    bodyMotion: orangeMotion.body,
    bodyWidth: orangeWidth,
    featureHeight: stageLayout.orange.pupil.size,
    featureLeft: orangeFaceLayout.left,
    featureMotion: orangeMotion.face,
    featureTop: stageLayout.orange.face.top,
    featureWidth: orangeFaceLayout.width,
  })

  const yellowFaceCenter = calculateCharacterFeatureCenter({
    bodyHeight: stageLayout.yellow.body.height,
    bodyLeft: yellowLeft,
    bodyMotion: yellowMotion.body,
    bodyWidth: yellowWidth,
    featureHeight: stageLayout.yellow.pupil.size,
    featureLeft: yellowFaceLayout.left,
    featureMotion: yellowMotion.face,
    featureTop: stageLayout.yellow.face.top,
    featureWidth: yellowFaceLayout.width,
  })

  const purpleLookOffset = calculateLookOffset(
    pointerPosition,
    purpleFaceCenter,
    stageLayout.purple.eye.maxDistance,
    purpleMotion.forcedLook,
  )

  const blackLookOffset = calculateLookOffset(
    pointerPosition,
    blackFaceCenter,
    stageLayout.black.eye.maxDistance,
    blackMotion.forcedLook,
  )

  const orangeLookOffset = calculateLookOffset(
    pointerPosition,
    orangeFaceCenter,
    stageLayout.orange.pupil.maxDistance,
    orangeMotion.forcedLook,
  )

  const yellowLookOffset = calculateLookOffset(
    pointerPosition,
    yellowFaceCenter,
    stageLayout.yellow.pupil.maxDistance,
    yellowMotion.forcedLook,
  )

  return (
    <div
      ref={stageRef}
      aria-hidden
      className={cn("relative h-[400px] w-full max-w-[550px]", className)}
      style={{
        clipPath:
          "polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) 100%, -100vw 100%)",
        visibility: ready ? undefined : "hidden",
      }}
    >
      {/* Purple character layout */}
      <div
        className="absolute bottom-0"
        style={{
          height: 440,
          left: purpleLeft,
          width: purpleWidth,
          zIndex: 1,
        }}
      >
        {/* Body state layer */}
        <div
          className="absolute bottom-0 left-0 w-full transition-[height,transform] duration-700 ease-in-out"
          style={{
            height: purpleHeight,
            transform: [
              `translate3d(${purpleMotion.body.translateX}px, 0, 0)`,
              `skewX(${purpleMotion.body.stateSkewX}deg)`,
            ].join(" "),
            transformOrigin: "bottom center",
          }}
        >
          {/* Body pointer layer */}
          <div
            className="absolute inset-0 overflow-hidden transition-transform duration-[600ms] ease-in-out"
            style={{
              backfaceVisibility: "hidden",
              backgroundColor: characterColors.purple,
              borderRadius: "10px 10px 0 0",
              transform: `skewX(${purpleMotion.body.pointerSkewX}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            {/* Face state layer */}
            <div
              className="absolute transition-transform duration-500 ease-in-out"
              style={{
                left: purpleFaceLayout.left,
                top: stageLayout.purple.face.top,
                transform: `translate3d(${purpleMotion.face.state.x}px, ${purpleMotion.face.state.y}px, 0)`,
              }}
            >
              {/* Face pointer layer */}
              <div
                className="flex transition-transform duration-200 ease-out"
                style={{
                  gap: purpleFaceLayout.gap,
                  transform: `translate3d(${purpleMotion.face.pointer.x}px, ${purpleMotion.face.pointer.y}px, 0)`,
                }}
              >
                <Eye
                  isBlinking={isPurpleBlinking}
                  pupilOffset={purpleLookOffset}
                  pupilSize={stageLayout.purple.eye.pupilSize}
                  size={stageLayout.purple.eye.size}
                />

                <Eye
                  isBlinking={isPurpleBlinking}
                  pupilOffset={purpleLookOffset}
                  pupilSize={stageLayout.purple.eye.pupilSize}
                  size={stageLayout.purple.eye.size}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Black character layout */}
      <div
        className="absolute bottom-0"
        style={{
          height: stageLayout.black.body.height,
          left: blackLeft,
          width: blackWidth,
          zIndex: 2,
        }}
      >
        {/* Body state layer */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-in-out"
          style={{
            transform: [
              `translate3d(${blackMotion.body.translateX}px, 0, 0)`,
              `skewX(${blackMotion.body.stateSkewX}deg)`,
            ].join(" "),
            transformOrigin: "bottom center",
          }}
        >
          {/* Body pointer layer */}
          <div
            className="absolute inset-0 overflow-hidden transition-transform duration-[600ms] ease-in-out"
            style={{
              backfaceVisibility: "hidden",
              backgroundColor: characterColors.black,
              borderRadius: "8px 8px 0 0",
              transform: `skewX(${blackMotion.body.pointerSkewX}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            {/* Face state layer */}
            <div
              className="absolute transition-transform duration-500 ease-in-out"
              style={{
                left: blackFaceLayout.left,
                top: stageLayout.black.face.top,
                transform: `translate3d(${blackMotion.face.state.x}px, ${blackMotion.face.state.y}px, 0)`,
              }}
            >
              {/* Face pointer layer */}
              <div
                className="flex transition-transform duration-200 ease-out"
                style={{
                  gap: blackFaceLayout.gap,
                  transform: `translate3d(${blackMotion.face.pointer.x}px, ${blackMotion.face.pointer.y}px, 0)`,
                }}
              >
                <Eye
                  isBlinking={isBlackBlinking}
                  pupilOffset={blackLookOffset}
                  pupilSize={stageLayout.black.eye.pupilSize}
                  size={stageLayout.black.eye.size}
                />

                <Eye
                  isBlinking={isBlackBlinking}
                  pupilOffset={blackLookOffset}
                  pupilSize={stageLayout.black.eye.pupilSize}
                  size={stageLayout.black.eye.size}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Orange character layout */}
      <div
        className="absolute bottom-0"
        style={{
          height: stageLayout.orange.body.height,
          left: orangeLeft,
          width: orangeWidth,
          zIndex: 3,
        }}
      >
        {/* Body state layer */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-in-out"
          style={{
            transform: [
              `translate3d(${orangeMotion.body.translateX}px, 0, 0)`,
              `skewX(${orangeMotion.body.stateSkewX}deg)`,
            ].join(" "),
            transformOrigin: "bottom center",
          }}
        >
          {/* Body pointer layer */}
          <div
            className="absolute inset-0 overflow-hidden transition-transform duration-[600ms] ease-in-out"
            style={{
              backfaceVisibility: "hidden",
              backgroundColor: characterColors.orange,
              borderRadius: `${orangeWidth / 2}px ${orangeWidth / 2}px 0 0`,
              transform: `skewX(${orangeMotion.body.pointerSkewX}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            {/* Face state layer */}
            <div
              className="absolute transition-transform duration-200 ease-out"
              style={{
                left: orangeFaceLayout.left,
                top: stageLayout.orange.face.top,
                transform: `translate3d(${orangeMotion.face.state.x}px, ${orangeMotion.face.state.y}px, 0)`,
              }}
            >
              {/* Face pointer layer */}
              <div
                className="flex transition-transform duration-200 ease-out"
                style={{
                  gap: orangeFaceLayout.gap,
                  transform: `translate3d(${orangeMotion.face.pointer.x}px, ${orangeMotion.face.pointer.y}px, 0)`,
                }}
              >
                <Pupil offset={orangeLookOffset} size={stageLayout.orange.pupil.size} />

                <Pupil offset={orangeLookOffset} size={stageLayout.orange.pupil.size} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Yellow character layout */}
      <div
        className="absolute bottom-0"
        style={{
          height: stageLayout.yellow.body.height,
          left: yellowLeft,
          width: yellowWidth,
          zIndex: 4,
        }}
      >
        {/* Body state layer */}
        <div
          className="absolute inset-0 transition-transform duration-700 ease-in-out"
          style={{
            transform: [
              `translate3d(${yellowMotion.body.translateX}px, 0, 0)`,
              `skewX(${yellowMotion.body.stateSkewX}deg)`,
            ].join(" "),
            transformOrigin: "bottom center",
          }}
        >
          {/* Body pointer layer */}
          <div
            className="absolute inset-0 overflow-hidden transition-transform duration-[600ms] ease-in-out"
            style={{
              backfaceVisibility: "hidden",
              backgroundColor: characterColors.yellow,
              borderRadius: `${yellowWidth / 2}px ${yellowWidth / 2}px 0 0`,
              transform: `skewX(${yellowMotion.body.pointerSkewX}deg)`,
              transformOrigin: "bottom center",
            }}
          >
            {/* Face state layer */}
            <div
              className="absolute inset-0 transition-transform duration-200 ease-out"
              style={{
                transform: `translate3d(${yellowMotion.face.state.x}px, ${yellowMotion.face.state.y}px, 0)`,
              }}
            >
              {/* Face pointer layer */}
              <div
                className="absolute inset-0 transition-transform duration-200 ease-out"
                style={{
                  transform: `translate3d(${yellowMotion.face.pointer.x}px, ${yellowMotion.face.pointer.y}px, 0)`,
                }}
              >
                <div
                  className="absolute flex"
                  style={{
                    gap: yellowFaceLayout.gap,
                    left: yellowFaceLayout.left,
                    top: stageLayout.yellow.face.top,
                  }}
                >
                  <Pupil offset={yellowLookOffset} size={stageLayout.yellow.pupil.size} />

                  <Pupil offset={yellowLookOffset} size={stageLayout.yellow.pupil.size} />
                </div>

                <div
                  className="absolute rounded-full"
                  style={{
                    backgroundColor: characterColors.black,
                    height: stageLayout.yellow.mouth.height,
                    left: yellowMouthLayout.left,
                    top: stageLayout.yellow.mouth.top,
                    width: yellowMouthLayout.width,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
