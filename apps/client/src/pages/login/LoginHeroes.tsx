import { useEffect, useRef, useState, type RefObject } from "react"

import { cn } from "@/lib/utils"
import { useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"

type CharacterPosition = {
  bodySkew: number
  faceX: number
  faceY: number
}

type LoginHeroesProps = {
  className?: string
}

type EyeProps = {
  isBlinking?: boolean
  maxDistance?: number
  mousePosition: MousePosition
  pupilSize?: number
  size?: number
  forceLookX?: number
  forceLookY?: number
}

type PupilProps = {
  maxDistance?: number
  mousePosition: MousePosition
  size?: number
  forceLookX?: number
  forceLookY?: number
}

type MousePosition = {
  x: number
  y: number
}

const characterColors = {
  black: "#2D2D2D",
  orange: "#FF9B6B",
  purple: "#6C3FF5",
  white: "#FFFFFF",
  yellow: "#E8D754",
} as const

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function useMousePosition() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      setMousePosition({ x: event.clientX, y: event.clientY })
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
    }
  }, [])

  return mousePosition
}

function useRandomBlink() {
  const [isBlinking, setIsBlinking] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false

    function scheduleNextBlink() {
      timeoutRef.current = window.setTimeout(
        () => {
          if (cancelled) return

          setIsBlinking(true)

          timeoutRef.current = window.setTimeout(() => {
            if (cancelled) return

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
        if (cancelled) return

        setIsPeeking(true)

        timeoutId = window.setTimeout(() => {
          if (cancelled) return

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

function calculatePosition(ref: RefObject<HTMLDivElement | null>, mouseX: number, mouseY: number) {
  if (!ref.current) {
    return { bodySkew: 0, faceX: 0, faceY: 0 } satisfies CharacterPosition
  }

  const rect = ref.current.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 3
  const deltaX = mouseX - centerX
  const deltaY = mouseY - centerY

  return {
    bodySkew: clamp(-deltaX / 120, -6, 6),
    faceX: clamp(deltaX / 20, -15, 15),
    faceY: clamp(deltaY / 30, -10, 10),
  } satisfies CharacterPosition
}

function calculatePupilPosition(
  ref: RefObject<HTMLDivElement | null>,
  mouseX: number,
  mouseY: number,
  maxDistance: number,
  forceLookX?: number,
  forceLookY?: number,
) {
  if (!ref.current) {
    return { x: 0, y: 0 }
  }

  if (forceLookX !== undefined && forceLookY !== undefined) {
    return { x: forceLookX, y: forceLookY }
  }

  const rect = ref.current.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const deltaX = mouseX - centerX
  const deltaY = mouseY - centerY
  const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance)
  const angle = Math.atan2(deltaY, deltaX)

  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  }
}

function Pupil({ maxDistance = 5, mousePosition, size = 12, forceLookX, forceLookY }: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(
    pupilRef,
    mousePosition.x,
    mousePosition.y,
    maxDistance,
    forceLookX,
    forceLookY,
  )

  return (
    <div
      ref={pupilRef}
      className="rounded-full"
      style={{
        backgroundColor: characterColors.black,
        height: `${size}px`,
        transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
        transition: "transform 0.1s ease-out",
        width: `${size}px`,
      }}
    />
  )
}

function Eye({
  isBlinking = false,
  maxDistance = 10,
  mousePosition,
  pupilSize = 16,
  size = 48,
  forceLookX,
  forceLookY,
}: EyeProps) {
  const eyeRef = useRef<HTMLDivElement>(null)
  const pupilPosition = calculatePupilPosition(
    eyeRef,
    mousePosition.x,
    mousePosition.y,
    maxDistance,
    forceLookX,
    forceLookY,
  )

  return (
    <div
      ref={eyeRef}
      className="flex items-center justify-center overflow-hidden rounded-full transition-all duration-150"
      style={{
        backgroundColor: characterColors.white,
        height: isBlinking ? "2px" : `${size}px`,
        width: `${size}px`,
      }}
    >
      {!isBlinking && (
        <div
          className="rounded-full"
          style={{
            backgroundColor: characterColors.black,
            height: `${pupilSize}px`,
            transform: `translate(${pupilPosition.x}px, ${pupilPosition.y}px)`,
            transition: "transform 0.1s ease-out",
            width: `${pupilSize}px`,
          }}
        />
      )}
    </div>
  )
}

export function LoginHeroes({ className }: LoginHeroesProps) {
  const [{ isPasswordEmpty, isPasswordVisible, isUsernameFocused }] = useLoginHeroesContext()
  const mousePosition = useMousePosition()
  const purpleRef = useRef<HTMLDivElement>(null)
  const blackRef = useRef<HTMLDivElement>(null)
  const yellowRef = useRef<HTMLDivElement>(null)
  const orangeRef = useRef<HTMLDivElement>(null)
  const isPurpleBlinking = useRandomBlink()
  const isBlackBlinking = useRandomBlink()
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)

  const isHiddenPassword = !isPasswordEmpty && !isPasswordVisible
  const isVisiblePassword = !isPasswordEmpty && isPasswordVisible

  const isPurplePeeking = usePasswordPeek(isVisiblePassword)

  useEffect(() => {
    if (!isUsernameFocused) {
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
  }, [isUsernameFocused])

  const purplePosition = calculatePosition(purpleRef, mousePosition.x, mousePosition.y)
  const blackPosition = calculatePosition(blackRef, mousePosition.x, mousePosition.y)
  const yellowPosition = calculatePosition(yellowRef, mousePosition.x, mousePosition.y)
  const orangePosition = calculatePosition(orangeRef, mousePosition.x, mousePosition.y)

  return (
    <div aria-hidden className={cn("relative h-[400px] w-[550px] max-w-full", className)}>
      <div
        ref={purpleRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.purple,
          borderRadius: "10px 10px 0 0",
          height: isUsernameFocused || isHiddenPassword ? "440px" : "400px",
          left: "70px",
          transform: isVisiblePassword
            ? "skewX(0deg)"
            : isUsernameFocused || isHiddenPassword
              ? `skewX(${purplePosition.bodySkew - 12}deg) translateX(40px)`
              : `skewX(${purplePosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "180px",
          zIndex: 1,
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-700 ease-in-out"
          style={{
            left: isVisiblePassword
              ? "20px"
              : isLookingAtEachOther
                ? "55px"
                : `${45 + purplePosition.faceX}px`,
            top: isVisiblePassword
              ? "35px"
              : isLookingAtEachOther
                ? "65px"
                : `${40 + purplePosition.faceY}px`,
          }}
        >
          <Eye
            forceLookX={
              isVisiblePassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined
            }
            forceLookY={
              isVisiblePassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined
            }
            isBlinking={isPurpleBlinking}
            maxDistance={5}
            mousePosition={mousePosition}
            pupilSize={7}
            size={18}
          />
          <Eye
            forceLookX={
              isVisiblePassword ? (isPurplePeeking ? 4 : -4) : isLookingAtEachOther ? 3 : undefined
            }
            forceLookY={
              isVisiblePassword ? (isPurplePeeking ? 5 : -4) : isLookingAtEachOther ? 4 : undefined
            }
            isBlinking={isPurpleBlinking}
            maxDistance={5}
            mousePosition={mousePosition}
            pupilSize={7}
            size={18}
          />
        </div>
      </div>

      <div
        ref={blackRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.black,
          borderRadius: "8px 8px 0 0",
          height: "310px",
          left: "240px",
          transform: isVisiblePassword
            ? "skewX(0deg)"
            : isLookingAtEachOther
              ? `skewX(${blackPosition.bodySkew * 1.5 + 10}deg) translateX(20px)`
              : isUsernameFocused || isHiddenPassword
                ? `skewX(${blackPosition.bodySkew * 1.5}deg)`
                : `skewX(${blackPosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "120px",
          zIndex: 2,
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-700 ease-in-out"
          style={{
            left: isVisiblePassword
              ? "10px"
              : isLookingAtEachOther
                ? "32px"
                : `${26 + blackPosition.faceX}px`,
            top: isVisiblePassword
              ? "28px"
              : isLookingAtEachOther
                ? "12px"
                : `${32 + blackPosition.faceY}px`,
          }}
        >
          <Eye
            forceLookX={isVisiblePassword ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={isVisiblePassword ? -4 : isLookingAtEachOther ? -4 : undefined}
            isBlinking={isBlackBlinking}
            maxDistance={4}
            mousePosition={mousePosition}
            pupilSize={6}
            size={16}
          />
          <Eye
            forceLookX={isVisiblePassword ? -4 : isLookingAtEachOther ? 0 : undefined}
            forceLookY={isVisiblePassword ? -4 : isLookingAtEachOther ? -4 : undefined}
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
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.orange,
          borderRadius: "120px 120px 0 0",
          height: "200px",
          left: "0",
          transform: isVisiblePassword ? "skewX(0deg)" : `skewX(${orangePosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "240px",
          zIndex: 3,
        }}
      >
        <div
          className="absolute flex gap-8 transition-all duration-200 ease-out"
          style={{
            left: isVisiblePassword ? "50px" : `${82 + orangePosition.faceX}px`,
            top: isVisiblePassword ? "85px" : `${90 + orangePosition.faceY}px`,
          }}
        >
          <Pupil
            forceLookX={isVisiblePassword ? -5 : undefined}
            forceLookY={isVisiblePassword ? -4 : undefined}
            mousePosition={mousePosition}
          />
          <Pupil
            forceLookX={isVisiblePassword ? -5 : undefined}
            forceLookY={isVisiblePassword ? -4 : undefined}
            mousePosition={mousePosition}
          />
        </div>
      </div>

      <div
        ref={yellowRef}
        className="absolute bottom-0 transition-all duration-700 ease-in-out"
        style={{
          backgroundColor: characterColors.yellow,
          borderRadius: "70px 70px 0 0",
          height: "230px",
          left: "310px",
          transform: isVisiblePassword ? "skewX(0deg)" : `skewX(${yellowPosition.bodySkew}deg)`,
          transformOrigin: "bottom center",
          width: "140px",
          zIndex: 4,
        }}
      >
        <div
          className="absolute flex gap-6 transition-all duration-200 ease-out"
          style={{
            left: isVisiblePassword ? "20px" : `${52 + yellowPosition.faceX}px`,
            top: isVisiblePassword ? "35px" : `${40 + yellowPosition.faceY}px`,
          }}
        >
          <Pupil
            forceLookX={isVisiblePassword ? -5 : undefined}
            forceLookY={isVisiblePassword ? -4 : undefined}
            mousePosition={mousePosition}
          />
          <Pupil
            forceLookX={isVisiblePassword ? -5 : undefined}
            forceLookY={isVisiblePassword ? -4 : undefined}
            mousePosition={mousePosition}
          />
        </div>
        <div
          className="absolute h-1 w-20 rounded-full transition-all duration-200 ease-out"
          style={{
            backgroundColor: characterColors.black,
            left: isVisiblePassword ? "10px" : `${40 + yellowPosition.faceX}px`,
            top: isVisiblePassword ? "88px" : `${88 + yellowPosition.faceY}px`,
          }}
        />
      </div>
    </div>
  )
}
