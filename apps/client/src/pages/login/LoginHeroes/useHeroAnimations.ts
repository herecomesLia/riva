import { useEffect, useState } from "react"

import type { LoginHeroesAction } from "./hero-motion"

type UseHeroAnimationsInput = {
  action: LoginHeroesAction
  isUsernameFocused: boolean
}

type HeroAnimationState = {
  isBlackBlinking: boolean
  isPurpleBlinking: boolean
  isPurplePeeking: boolean
  isShowingMutualLook: boolean
}

function useRandomBlink() {
  const [isBlinking, setIsBlinking] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timeoutId: number | undefined

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

export function useHeroAnimations({
  action,
  isUsernameFocused,
}: UseHeroAnimationsInput): HeroAnimationState {
  const isPurpleBlinking = useRandomBlink()
  const isBlackBlinking = useRandomBlink()
  const isLookingAtEachOther = useMutualLook(isUsernameFocused)
  const isPurplePeeking = usePasswordPeek(action === "look-away")

  return {
    isBlackBlinking,
    isPurpleBlinking,
    isPurplePeeking,
    isShowingMutualLook: action === "peek" && isLookingAtEachOther,
  }
}
