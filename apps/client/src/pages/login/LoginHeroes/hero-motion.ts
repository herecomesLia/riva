import type { LoginHeroesState } from "@/pages/login/LoginHeroesContext"

import { ZERO_POINT } from "./hero-config"
import type { CharacterPosition, Point } from "./hero-geometry"
import { scaleX } from "./hero-geometry"

export type LoginHeroesAction = "idle" | "peek" | "look-away"

export type OffsetMotion = {
  pointer: Point
  state: Point
}

export type BodyMotion = {
  pointerSkewX: number
  stateSkewX: number
  translateX: number
}

export type CharacterMotion = {
  body: BodyMotion
  face: OffsetMotion
  forcedLook?: Point
}

export function createOffsetMotion(
  state: Point = ZERO_POINT,
  pointer: Point = ZERO_POINT,
): OffsetMotion {
  return { pointer, state }
}

export function resolveHeroesAction({
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

export function resolvePurpleMotion({
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
      body: { pointerSkewX: 0, stateSkewX: 0, translateX: 0 },
      face: createOffsetMotion({ x: scaleX(-25, horizontalScale), y: -5 }),
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
        face: createOffsetMotion({ x: scaleX(10, horizontalScale), y: 25 }),
        forcedLook: { x: 3, y: 4 },
      }
    }

    return {
      body: {
        pointerSkewX: position.bodySkew,
        stateSkewX: -12,
        translateX: scaleX(40, horizontalScale),
      },
      face: createOffsetMotion(ZERO_POINT, { x: position.faceX, y: position.faceY }),
    }
  }

  return {
    body: { pointerSkewX: position.bodySkew, stateSkewX: 0, translateX: 0 },
    face: createOffsetMotion(ZERO_POINT, { x: position.faceX, y: position.faceY }),
  }
}

export function resolveBlackMotion({
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
      body: { pointerSkewX: 0, stateSkewX: 0, translateX: 0 },
      face: createOffsetMotion({ x: scaleX(-16, horizontalScale), y: -4 }),
      forcedLook: { x: -4, y: -4 },
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
        face: createOffsetMotion({ x: scaleX(6, horizontalScale), y: -20 }),
        forcedLook: { x: 0, y: -4 },
      }
    }

    return {
      body: { pointerSkewX: position.bodySkew * 1.5, stateSkewX: 0, translateX: 0 },
      face: createOffsetMotion(ZERO_POINT, { x: position.faceX, y: position.faceY }),
    }
  }

  return {
    body: { pointerSkewX: position.bodySkew, stateSkewX: 0, translateX: 0 },
    face: createOffsetMotion(ZERO_POINT, { x: position.faceX, y: position.faceY }),
  }
}

export function resolveOrangeMotion({
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
      body: { pointerSkewX: 0, stateSkewX: 0, translateX: 0 },
      face: createOffsetMotion({ x: scaleX(-32, horizontalScale), y: -5 }),
      forcedLook: { x: -5, y: -4 },
    }
  }

  return {
    body: { pointerSkewX: position.bodySkew, stateSkewX: 0, translateX: 0 },
    face: createOffsetMotion(ZERO_POINT, { x: position.faceX, y: position.faceY }),
  }
}

export function resolveYellowMotion(input: {
  action: LoginHeroesAction
  horizontalScale: number
  position: CharacterPosition
}): CharacterMotion {
  return resolveOrangeMotion(input)
}

export function createBodyStateTransform(motion: BodyMotion) {
  return [`translate3d(${motion.translateX}px, 0, 0)`, `skewX(${motion.stateSkewX}deg)`].join(" ")
}

export function createPointerSkewTransform(motion: BodyMotion) {
  return `skewX(${motion.pointerSkewX}deg)`
}

export function createOffsetTransform(offset: Point) {
  return `translate3d(${offset.x}px, ${offset.y}px, 0)`
}
