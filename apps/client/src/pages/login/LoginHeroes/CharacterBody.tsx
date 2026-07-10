import type { CSSProperties, ReactNode } from "react"

import {
  createBodyStateTransform,
  createPointerSkewTransform,
  type BodyMotion,
} from "./hero-motion"

type CharacterBodyProps = {
  backgroundColor: string
  bodyHeight: number
  borderRadius: CSSProperties["borderRadius"]
  children: ReactNode
  layoutHeight: number
  left: number
  motion: BodyMotion
  width: number
  zIndex: number
}

export function CharacterBody({
  backgroundColor,
  bodyHeight,
  borderRadius,
  children,
  layoutHeight,
  left,
  motion,
  width,
  zIndex,
}: CharacterBodyProps) {
  return (
    <div
      className="absolute bottom-0"
      style={{
        height: layoutHeight,
        left,
        width,
        zIndex,
      }}
    >
      <div
        className="absolute bottom-0 left-0 w-full transition-[height,transform] duration-700 ease-in-out"
        style={{
          height: bodyHeight,
          transform: createBodyStateTransform(motion),
          transformOrigin: "bottom center",
        }}
      >
        <div
          className="absolute inset-0 overflow-hidden transition-transform duration-[600ms] ease-in-out"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor,
            borderRadius,
            transform: createPointerSkewTransform(motion),
            transformOrigin: "bottom center",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
