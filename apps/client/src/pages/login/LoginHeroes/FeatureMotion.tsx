import type { CSSProperties, ReactNode } from "react"

import { cn } from "@/lib/utils"

import { createOffsetTransform, type OffsetMotion } from "./hero-motion"

type FeatureMotionProps = {
  children: ReactNode
  motion: OffsetMotion
  pointerClassName?: string
  stateClassName?: string
  style?: Omit<CSSProperties, "transform">
}

export function FeatureMotion({
  children,
  motion,
  pointerClassName,
  stateClassName,
  style,
}: FeatureMotionProps) {
  return (
    <div
      className={cn("absolute transition-transform", stateClassName)}
      style={{
        ...style,
        transform: createOffsetTransform(motion.state),
      }}
    >
      <div
        className={cn("transition-transform", pointerClassName)}
        style={{ transform: createOffsetTransform(motion.pointer) }}
      >
        {children}
      </div>
    </div>
  )
}
