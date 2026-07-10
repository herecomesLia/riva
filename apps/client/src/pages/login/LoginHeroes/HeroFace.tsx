import { characterColors } from "./hero-config"
import type { Point } from "./hero-geometry"
import { createOffsetTransform } from "./hero-motion"

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

type EyePairProps = EyeProps & {
  gap: number
}

type PupilPairProps = PupilProps & {
  gap: number
}

type MouthProps = {
  height: number
  left: number
  top: number
  width: number
}

export function Eye({ isBlinking = false, pupilOffset, pupilSize = 16, size = 48 }: EyeProps) {
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
            transform: createOffsetTransform(pupilOffset),
            width: pupilSize,
          }}
        />
      )}
    </div>
  )
}

export function Pupil({ offset, size = 12 }: PupilProps) {
  return (
    <div
      className="rounded-full transition-transform duration-100 ease-out"
      style={{
        backgroundColor: characterColors.black,
        height: size,
        transform: createOffsetTransform(offset),
        width: size,
      }}
    />
  )
}

export function EyePair({ gap, ...eyeProps }: EyePairProps) {
  return (
    <div className="flex" style={{ gap }}>
      <Eye {...eyeProps} />
      <Eye {...eyeProps} />
    </div>
  )
}

export function PupilPair({ gap, ...pupilProps }: PupilPairProps) {
  return (
    <div className="flex" style={{ gap }}>
      <Pupil {...pupilProps} />
      <Pupil {...pupilProps} />
    </div>
  )
}

export function Mouth({ height, left, top, width }: MouthProps) {
  return (
    <div
      className="absolute rounded-full"
      style={{
        backgroundColor: characterColors.black,
        height,
        left,
        top,
        width,
      }}
    />
  )
}
