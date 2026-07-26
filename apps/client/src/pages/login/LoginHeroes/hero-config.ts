import type { Point } from "./hero-geometry"

export const STAGE_WIDTH = 550
export const STAGE_HEIGHT = 400

export const ZERO_POINT = {
  x: 0,
  y: 0,
} as const satisfies Point

export const characterColors = {
  black: "#2D2D2D",
  orange: "#FF9B6B",
  purple: "#6C3FF5",
  white: "#FFFFFF",
  yellow: "#E8D754",
} as const

export const stageLayout = {
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
