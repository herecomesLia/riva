import { STAGE_HEIGHT, ZERO_POINT } from "./hero-config"
import type { BodyMotion, OffsetMotion } from "./hero-motion"

export type Point = {
  x: number
  y: number
}

export type CharacterPosition = {
  bodySkew: number
  faceX: number
  faceY: number
}

export type CharacterGeometry = {
  height: number
  horizontalScale: number
  left: number
  translateX?: number
  width: number
}

export type PairLayout = {
  gap: number
  left: number
  width: number
}

export type MouthLayout = {
  left: number
  width: number
}

type BaseBodyLayout = {
  height: number
  left: number
  width: number
}

export type ScaledBodyLayout = {
  height: number
  left: number
  width: number
}

export type CharacterFeatureGeometry = {
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

type CalculateFeatureLookInput = CharacterFeatureGeometry & {
  forcedLook?: Point
  maxDistance: number
  pointerPosition: Point | null
}

const DEFAULT_CHARACTER_POSITION = {
  bodySkew: 0,
  faceX: 0,
  faceY: 0,
} satisfies CharacterPosition

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function scaleX(value: number, horizontalScale: number) {
  return value * horizontalScale
}

export function scaleBodyLayout(body: BaseBodyLayout, horizontalScale: number): ScaledBodyLayout {
  return {
    height: body.height,
    left: scaleX(body.left, horizontalScale),
    width: scaleX(body.width, horizontalScale),
  }
}

export function calculatePairLayout({
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

export function calculateMouthLayout({
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

export function calculateCharacterPosition(
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

export function applySkewX(point: Point, skewX: number, origin: Point): Point {
  if (skewX === 0) {
    return point
  }

  const shear = Math.tan((skewX * Math.PI) / 180)

  return {
    x: point.x + shear * (point.y - origin.y),
    y: point.y,
  }
}

export function transformCharacterPointToRoot({
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

export function calculateCharacterFeatureCenter({
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

export function calculateLookOffset(
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

export function calculateFeatureLook({
  pointerPosition,
  maxDistance,
  forcedLook,
  ...featureGeometry
}: CalculateFeatureLookInput): Point {
  const center = calculateCharacterFeatureCenter(featureGeometry)

  return calculateLookOffset(pointerPosition, center, maxDistance, forcedLook)
}
