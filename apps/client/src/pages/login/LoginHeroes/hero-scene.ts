import { stageLayout } from "./hero-config"
import {
  calculateCharacterPosition,
  calculateFeatureLook,
  calculateMouthLayout,
  calculatePairLayout,
  scaleBodyLayout,
  scaleX,
  type PairLayout,
  type Point,
  type ScaledBodyLayout,
} from "./hero-geometry"
import {
  resolveBlackMotion,
  resolveOrangeMotion,
  resolvePurpleMotion,
  resolveYellowMotion,
  type CharacterMotion,
  type LoginHeroesAction,
} from "./hero-motion"

export type CharacterBodyModel = {
  height: number
  layoutHeight: number
  left: number
  width: number
  zIndex: number
}

export type PairFaceModel = {
  gap: number
  left: number
  lookOffset: Point
  top: number
}

type CharacterScene = {
  body: CharacterBodyModel
  face: PairFaceModel
  motion: CharacterMotion
}

export type LoginHeroesScene = {
  black: CharacterScene
  orange: CharacterScene
  purple: CharacterScene
  yellow: CharacterScene & {
    mouth: {
      height: number
      left: number
      top: number
      width: number
    }
  }
}

export type CreateLoginHeroesSceneInput = {
  action: LoginHeroesAction
  horizontalScale: number
  isPurplePeeking: boolean
  isShowingMutualLook: boolean
  pointerPosition: Point | null
}

type CreateFaceInput = {
  body: ScaledBodyLayout
  featureHeight: number
  layout: PairLayout
  maxDistance: number
  motion: CharacterMotion
  top: number
}

export function createLoginHeroesScene({
  action,
  horizontalScale,
  isPurplePeeking,
  isShowingMutualLook,
  pointerPosition,
}: CreateLoginHeroesSceneInput): LoginHeroesScene {
  const purpleBody = scaleBodyLayout(stageLayout.purple.body, horizontalScale)
  const blackBody = scaleBodyLayout(stageLayout.black.body, horizontalScale)
  const orangeBody = scaleBodyLayout(stageLayout.orange.body, horizontalScale)
  const yellowBody = scaleBodyLayout(stageLayout.yellow.body, horizontalScale)
  const purpleHeight = action === "peek" ? 440 : purpleBody.height

  const purpleFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.purple.body.width,
    baseCenterX: stageLayout.purple.face.centerX,
    baseGap: stageLayout.purple.face.gap,
    bodyWidth: purpleBody.width,
    horizontalScale,
    itemSize: stageLayout.purple.eye.size,
  })
  const blackFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.black.body.width,
    baseCenterX: stageLayout.black.face.centerX,
    baseGap: stageLayout.black.face.gap,
    bodyWidth: blackBody.width,
    horizontalScale,
    itemSize: stageLayout.black.eye.size,
  })
  const orangeFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.orange.body.width,
    baseCenterX: stageLayout.orange.face.centerX,
    baseGap: stageLayout.orange.face.gap,
    bodyWidth: orangeBody.width,
    horizontalScale,
    itemSize: stageLayout.orange.pupil.size,
  })
  const yellowFaceLayout = calculatePairLayout({
    baseBodyWidth: stageLayout.yellow.body.width,
    baseCenterX: stageLayout.yellow.face.centerX,
    baseGap: stageLayout.yellow.face.gap,
    bodyWidth: yellowBody.width,
    horizontalScale,
    itemSize: stageLayout.yellow.pupil.size,
  })
  const yellowMouthLayout = calculateMouthLayout({
    baseBodyWidth: stageLayout.yellow.body.width,
    baseCenterX: stageLayout.yellow.mouth.centerX,
    baseWidth: stageLayout.yellow.mouth.width,
    bodyWidth: yellowBody.width,
    horizontalScale,
  })

  const purpleMotion = resolvePurpleMotion({
    action,
    horizontalScale,
    isMutualLook: isShowingMutualLook,
    isPeeking: isPurplePeeking,
    position: calculateCharacterPosition(pointerPosition, {
      height: purpleHeight,
      horizontalScale,
      left: purpleBody.left,
      translateX: action === "peek" ? scaleX(40, horizontalScale) : 0,
      width: purpleBody.width,
    }),
  })
  const blackMotion = resolveBlackMotion({
    action,
    horizontalScale,
    isMutualLook: isShowingMutualLook,
    position: calculateCharacterPosition(pointerPosition, {
      ...blackBody,
      horizontalScale,
      translateX: isShowingMutualLook ? scaleX(20, horizontalScale) : 0,
    }),
  })
  const orangeMotion = resolveOrangeMotion({
    action,
    horizontalScale,
    position: calculateCharacterPosition(pointerPosition, { ...orangeBody, horizontalScale }),
  })
  const yellowMotion = resolveYellowMotion({
    action,
    horizontalScale,
    position: calculateCharacterPosition(pointerPosition, { ...yellowBody, horizontalScale }),
  })

  const createFace = ({
    body,
    featureHeight,
    layout,
    maxDistance,
    motion,
    top,
  }: CreateFaceInput): PairFaceModel => ({
    gap: layout.gap,
    left: layout.left,
    lookOffset: calculateFeatureLook({
      bodyHeight: body.height,
      bodyLeft: body.left,
      bodyMotion: motion.body,
      bodyWidth: body.width,
      featureHeight,
      featureLeft: layout.left,
      featureMotion: motion.face,
      featureTop: top,
      featureWidth: layout.width,
      forcedLook: motion.forcedLook,
      maxDistance,
      pointerPosition,
    }),
    top,
  })

  return {
    purple: {
      body: { ...purpleBody, height: purpleHeight, layoutHeight: 440, zIndex: 1 },
      face: createFace({
        body: { ...purpleBody, height: purpleHeight },
        featureHeight: stageLayout.purple.eye.size,
        layout: purpleFaceLayout,
        maxDistance: stageLayout.purple.eye.maxDistance,
        motion: purpleMotion,
        top: stageLayout.purple.face.top,
      }),
      motion: purpleMotion,
    },
    black: {
      body: { ...blackBody, layoutHeight: blackBody.height, zIndex: 2 },
      face: createFace({
        body: blackBody,
        featureHeight: stageLayout.black.eye.size,
        layout: blackFaceLayout,
        maxDistance: stageLayout.black.eye.maxDistance,
        motion: blackMotion,
        top: stageLayout.black.face.top,
      }),
      motion: blackMotion,
    },
    orange: {
      body: { ...orangeBody, layoutHeight: orangeBody.height, zIndex: 3 },
      face: createFace({
        body: orangeBody,
        featureHeight: stageLayout.orange.pupil.size,
        layout: orangeFaceLayout,
        maxDistance: stageLayout.orange.pupil.maxDistance,
        motion: orangeMotion,
        top: stageLayout.orange.face.top,
      }),
      motion: orangeMotion,
    },
    yellow: {
      body: { ...yellowBody, layoutHeight: yellowBody.height, zIndex: 4 },
      face: createFace({
        body: yellowBody,
        featureHeight: stageLayout.yellow.pupil.size,
        layout: yellowFaceLayout,
        maxDistance: stageLayout.yellow.pupil.maxDistance,
        motion: yellowMotion,
        top: stageLayout.yellow.face.top,
      }),
      mouth: {
        height: stageLayout.yellow.mouth.height,
        left: yellowMouthLayout.left,
        top: stageLayout.yellow.mouth.top,
        width: yellowMouthLayout.width,
      },
      motion: yellowMotion,
    },
  }
}
