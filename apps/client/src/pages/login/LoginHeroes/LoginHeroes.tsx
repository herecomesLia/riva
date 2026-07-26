import { cn } from "@/lib/utils"
import { useLoginHeroesContext } from "@/pages/login/LoginHeroesContext"

import { CharacterBody } from "./CharacterBody"
import { FeatureMotion } from "./FeatureMotion"
import { characterColors, stageLayout } from "./hero-config"
import { resolveHeroesAction } from "./hero-motion"
import { createLoginHeroesScene } from "./hero-scene"
import { EyePair, Mouth, PupilPair } from "./HeroFace"
import { useHeroAnimations } from "./useHeroAnimations"
import { useStageViewport } from "./useStageViewport"

type LoginHeroesProps = {
  className?: string
}

export function LoginHeroes({ className }: LoginHeroesProps) {
  const [heroesState] = useLoginHeroesContext()
  const { horizontalScale, pointerPosition, ready, ref } = useStageViewport()
  const action = resolveHeroesAction(heroesState)
  const animations = useHeroAnimations({
    action,
    isUsernameFocused: heroesState.isUsernameFocused,
  })
  const scene = createLoginHeroesScene({
    action,
    horizontalScale,
    isPurplePeeking: animations.isPurplePeeking,
    isShowingMutualLook: animations.isShowingMutualLook,
    pointerPosition,
  })

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn("relative h-[400px] w-full max-w-[550px]", className)}
      style={{
        clipPath:
          "polygon(-100vw -100vh, calc(100% + 100vw) -100vh, calc(100% + 100vw) 100%, -100vw 100%)",
        visibility: ready ? undefined : "hidden",
      }}
    >
      <CharacterBody
        backgroundColor={characterColors.purple}
        bodyHeight={scene.purple.body.height}
        borderRadius="10px 10px 0 0"
        layoutHeight={scene.purple.body.layoutHeight}
        left={scene.purple.body.left}
        motion={scene.purple.motion.body}
        width={scene.purple.body.width}
        zIndex={scene.purple.body.zIndex}
      >
        <FeatureMotion
          motion={scene.purple.motion.face}
          pointerClassName="duration-200 ease-out"
          stateClassName="duration-500 ease-in-out"
          style={{ left: scene.purple.face.left, top: scene.purple.face.top }}
        >
          <EyePair
            gap={scene.purple.face.gap}
            isBlinking={animations.isPurpleBlinking}
            pupilOffset={scene.purple.face.lookOffset}
            pupilSize={stageLayout.purple.eye.pupilSize}
            size={stageLayout.purple.eye.size}
          />
        </FeatureMotion>
      </CharacterBody>

      <CharacterBody
        backgroundColor={characterColors.black}
        bodyHeight={scene.black.body.height}
        borderRadius="8px 8px 0 0"
        layoutHeight={scene.black.body.layoutHeight}
        left={scene.black.body.left}
        motion={scene.black.motion.body}
        width={scene.black.body.width}
        zIndex={scene.black.body.zIndex}
      >
        <FeatureMotion
          motion={scene.black.motion.face}
          pointerClassName="duration-200 ease-out"
          stateClassName="duration-500 ease-in-out"
          style={{ left: scene.black.face.left, top: scene.black.face.top }}
        >
          <EyePair
            gap={scene.black.face.gap}
            isBlinking={animations.isBlackBlinking}
            pupilOffset={scene.black.face.lookOffset}
            pupilSize={stageLayout.black.eye.pupilSize}
            size={stageLayout.black.eye.size}
          />
        </FeatureMotion>
      </CharacterBody>

      <CharacterBody
        backgroundColor={characterColors.orange}
        bodyHeight={scene.orange.body.height}
        borderRadius={`${scene.orange.body.width / 2}px ${scene.orange.body.width / 2}px 0 0`}
        layoutHeight={scene.orange.body.layoutHeight}
        left={scene.orange.body.left}
        motion={scene.orange.motion.body}
        width={scene.orange.body.width}
        zIndex={scene.orange.body.zIndex}
      >
        <FeatureMotion
          motion={scene.orange.motion.face}
          pointerClassName="duration-200 ease-out"
          stateClassName="duration-200 ease-out"
          style={{ left: scene.orange.face.left, top: scene.orange.face.top }}
        >
          <PupilPair
            gap={scene.orange.face.gap}
            offset={scene.orange.face.lookOffset}
            size={stageLayout.orange.pupil.size}
          />
        </FeatureMotion>
      </CharacterBody>

      <CharacterBody
        backgroundColor={characterColors.yellow}
        bodyHeight={scene.yellow.body.height}
        borderRadius={`${scene.yellow.body.width / 2}px ${scene.yellow.body.width / 2}px 0 0`}
        layoutHeight={scene.yellow.body.layoutHeight}
        left={scene.yellow.body.left}
        motion={scene.yellow.motion.body}
        width={scene.yellow.body.width}
        zIndex={scene.yellow.body.zIndex}
      >
        <FeatureMotion
          motion={scene.yellow.motion.face}
          pointerClassName="relative size-full duration-200 ease-out"
          stateClassName="inset-0 duration-200 ease-out"
        >
          <div
            className="absolute"
            style={{
              left: scene.yellow.face.left,
              top: scene.yellow.face.top,
            }}
          >
            <PupilPair
              gap={scene.yellow.face.gap}
              offset={scene.yellow.face.lookOffset}
              size={stageLayout.yellow.pupil.size}
            />
          </div>
          <Mouth {...scene.yellow.mouth} />
        </FeatureMotion>
      </CharacterBody>
    </div>
  )
}
