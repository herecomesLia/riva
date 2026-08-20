import { z } from "zod"

import type { InteractionLanguage } from "@/types/language"

export const practiceQuestionTypeSchema = z.enum([
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
])

export const practiceDifficultySchema = z.enum(["basic", "pressure"])
export const practiceQuestionSourceSchema = z.enum(["personalized", "saved", "history"])
export const practiceMaterialTypeSchema = z.enum(["projectExperience", "workExperience"])

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()
const dateTimeSchema = z.iso.datetime({ offset: true })
const interactionLanguageSchema: z.ZodType<InteractionLanguage> = z.enum(["zh-CN", "en"])

export const practiceMaterialReferenceSchema = z
  .object({
    id: uuidSchema,
    label: z.string(),
    reason: z.string(),
    type: practiceMaterialTypeSchema,
  })
  .strict()

export const practiceSessionSelectionSchema = z
  .object({
    difficulty: practiceDifficultySchema,
    prioritizeWeaknesses: z.boolean(),
    questionType: practiceQuestionTypeSchema,
    source: practiceQuestionSourceSchema,
    targetRoleId: uuidSchema,
  })
  .strict()

export const practiceSetupCapabilitiesResponseSchema = z
  .object({
    canPrioritizeWeaknesses: z.boolean(),
    historyQuestionCount: z.number().int().nonnegative(),
    questionSourceAvailability: z.array(
      z
        .object({
          difficulty: practiceDifficultySchema,
          historyQuestionCount: z.number().int().nonnegative(),
          questionType: practiceQuestionTypeSchema,
          savedQuestionCount: z.number().int().nonnegative(),
          targetRoleId: uuidSchema,
        })
        .strict(),
    ),
    savedQuestionCount: z.number().int().nonnegative(),
  })
  .strict()

export const practiceGuidanceNotRequestedSchema = z
  .object({
    content: z.null(),
    status: z.literal("notRequested"),
  })
  .strict()

export const practiceGuidanceRevealedSchema = z
  .object({
    content: z.array(z.string().min(1)).min(1),
    status: z.literal("revealed"),
  })
  .strict()

export const practiceGuidanceUnavailableSchema = z
  .object({
    content: z.null(),
    status: z.literal("unavailable"),
  })
  .strict()

export const practiceGuidanceSchema = z.discriminatedUnion("status", [
  practiceGuidanceNotRequestedSchema,
  practiceGuidanceRevealedSchema,
  practiceGuidanceUnavailableSchema,
])

export const practiceMainReferenceAnswerContentSchema = z
  .object({
    answer: z.string().min(1),
    commonMistakes: z.array(z.string().min(1)).min(1),
    generatedAt: dateTimeSchema,
    keyPoints: z.array(z.string().min(1)).min(2),
    kind: z.enum(["personalizedExample", "technicalReference"]),
  })
  .strict()

export const practiceFollowUpReferenceAnswerContentSchema = z
  .object({
    addressedGap: z.string().min(1),
    answer: z.string().min(1),
    commonMistakes: z.array(z.string().min(1)).min(1),
    generatedAt: dateTimeSchema,
    keyPoints: z.array(z.string().min(1)).min(2),
    kind: z.enum(["personalizedSupplement", "technicalReference"]),
  })
  .strict()

export const practiceReferenceAnswerNotRequestedSchema = z
  .object({
    content: z.null(),
    status: z.literal("notRequested"),
    viewedBeforeSubmission: z.literal(false),
  })
  .strict()

export const practiceReferenceAnswerGeneratingSchema = z
  .object({
    content: z.null(),
    status: z.literal("generating"),
    viewedBeforeSubmission: z.literal(false),
  })
  .strict()

export const practiceReferenceAnswerUnavailableSchema = z
  .object({
    content: z.null(),
    status: z.literal("unavailable"),
    viewedBeforeSubmission: z.literal(false),
  })
  .strict()

export const practiceMainReferenceAnswerRevealedSchema = z
  .object({
    content: practiceMainReferenceAnswerContentSchema,
    status: z.literal("revealed"),
    viewedBeforeSubmission: z.boolean(),
  })
  .strict()

export const practiceFollowUpReferenceAnswerRevealedSchema = z
  .object({
    content: practiceFollowUpReferenceAnswerContentSchema,
    status: z.literal("revealed"),
    viewedBeforeSubmission: z.boolean(),
  })
  .strict()

export const practiceMainReferenceAnswerStateSchema = z.discriminatedUnion("status", [
  practiceReferenceAnswerNotRequestedSchema,
  practiceReferenceAnswerGeneratingSchema,
  practiceMainReferenceAnswerRevealedSchema,
  practiceReferenceAnswerUnavailableSchema,
])

export const practiceFollowUpReferenceAnswerStateSchema = z.discriminatedUnion("status", [
  practiceReferenceAnswerNotRequestedSchema,
  practiceReferenceAnswerGeneratingSchema,
  practiceFollowUpReferenceAnswerRevealedSchema,
  practiceReferenceAnswerUnavailableSchema,
])

export const practiceQuestionSchema = z
  .object({
    answerFramework: practiceGuidanceSchema,
    answerHints: practiceGuidanceSchema,
    assessedCapabilities: z.array(z.string()),
    difficulty: practiceDifficultySchema,
    id: uuidSchema,
    isMarkedWeak: z.boolean(),
    isSaved: z.boolean(),
    prompt: z.string(),
    questionType: practiceQuestionTypeSchema,
    recommendedMaterials: z.array(practiceMaterialReferenceSchema),
    referenceAnswer: practiceMainReferenceAnswerStateSchema,
  })
  .strict()

export const practiceAnswerSchema = z
  .object({
    id: uuidSchema,
    content: z.string(),
    createdAt: dateTimeSchema,
    order: z.number().int().positive(),
  })
  .strict()

export const practiceFollowUpQuestionSchema = z
  .object({
    id: uuidSchema,
    prompt: z.string(),
    createdAt: dateTimeSchema,
    order: z.number().int().min(1).max(2),
    answerHints: practiceGuidanceSchema,
    answerFramework: practiceGuidanceSchema,
    referenceAnswer: practiceFollowUpReferenceAnswerStateSchema,
  })
  .strict()

export const practiceAnsweredFollowUpExchangeSchema = z
  .object({
    status: z.literal("answered"),
    question: practiceFollowUpQuestionSchema,
    answer: practiceAnswerSchema,
  })
  .strict()
  .superRefine((exchange, context) => {
    if (exchange.answer.order !== exchange.question.order + 1) {
      context.addIssue({
        code: "custom",
        message: "answered follow-up exchange order is invalid",
        path: ["answer", "order"],
      })
    }
  })

export const practiceAwaitingFollowUpExchangeSchema = z
  .object({
    status: z.literal("awaitingAnswer"),
    question: practiceFollowUpQuestionSchema,
    answer: z.null(),
  })
  .strict()

function validateAnsweredExchangeOrders(
  exchanges: Array<z.infer<typeof practiceAnsweredFollowUpExchangeSchema>>,
  context: z.RefinementCtx,
) {
  const expectedOrders = exchanges.map((_, index) => index + 1)
  const actualOrders = exchanges.map((exchange) => exchange.question.order)
  if (actualOrders.some((order, index) => order !== expectedOrders[index])) {
    context.addIssue({
      code: "custom",
      message: "follow-up exchanges must be ordered and contiguous",
      path: [],
    })
  }
  if (new Set(exchanges.map((exchange) => exchange.question.id)).size !== exchanges.length) {
    context.addIssue({
      code: "custom",
      message: "follow-up question identities must be unique",
      path: [],
    })
  }
  if (new Set(exchanges.map((exchange) => exchange.answer.id)).size !== exchanges.length) {
    context.addIssue({
      code: "custom",
      message: "follow-up answer identities must be unique",
      path: [],
    })
  }
}

const answeredFollowUpExchangesUpToOneSchema = z
  .array(practiceAnsweredFollowUpExchangeSchema)
  .max(1)
  .superRefine(validateAnsweredExchangeOrders)

const answeredFollowUpExchangesUpToTwoSchema = z
  .array(practiceAnsweredFollowUpExchangeSchema)
  .max(2)
  .superRefine(validateAnsweredExchangeOrders)

export const practiceCompletedFollowUpCompletionSchema = z.discriminatedUnion("reason", [
  z
    .object({
      status: z.literal("completed"),
      reason: z.literal("noFollowUpRequired"),
    })
    .strict(),
  z
    .object({
      status: z.literal("completed"),
      reason: z.literal("allAnswered"),
    })
    .strict(),
])

export const practiceEndedEarlyFollowUpCompletionSchema = z
  .object({
    status: z.literal("endedEarly"),
    unansweredQuestion: practiceFollowUpQuestionSchema,
  })
  .strict()

export const practiceFollowUpCompletionSchema = z.union([
  practiceCompletedFollowUpCompletionSchema,
  practiceEndedEarlyFollowUpCompletionSchema,
])

function validateFollowUpCompletionSnapshot(
  session: {
    followUpCompletion: z.infer<typeof practiceFollowUpCompletionSchema>
    followUpExchanges: Array<z.infer<typeof practiceAnsweredFollowUpExchangeSchema>>
  },
  context: z.RefinementCtx,
) {
  const completion = session.followUpCompletion
  if (completion.status === "endedEarly") {
    if (![0, 1].includes(session.followUpExchanges.length)) {
      context.addIssue({
        code: "custom",
        message: "ended-early completion must have zero or one exchange",
        path: ["followUpCompletion", "status"],
      })
    }
    if (completion.unansweredQuestion.order !== session.followUpExchanges.length + 1) {
      context.addIssue({
        code: "custom",
        message: "unanswered follow-up question order is invalid",
        path: ["followUpCompletion", "unansweredQuestion", "order"],
      })
    }
    if (
      session.followUpExchanges.some(
        (exchange) => exchange.question.id === completion.unansweredQuestion.id,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "unanswered follow-up question must not be answered",
        path: ["followUpCompletion", "unansweredQuestion", "id"],
      })
    }
    return
  }
  if (completion.reason === "noFollowUpRequired" && session.followUpExchanges.length) {
    context.addIssue({
      code: "custom",
      message: "no-follow-up completion must have no exchanges",
      path: ["followUpCompletion", "reason"],
    })
  }
  if (completion.reason === "allAnswered" && ![1, 2].includes(session.followUpExchanges.length)) {
    context.addIssue({
      code: "custom",
      message: "all-answered completion must have one or two exchanges",
      path: ["followUpCompletion", "reason"],
    })
  }
}

export const practiceEvaluationSchema = z
  .object({
    overallScore: z.number().int().min(0).max(100),
    dimensionScores: z
      .array(
        z
          .object({
            dimension: z.enum([
              "relevance",
              "structure",
              "specificity",
              "personalContribution",
              "resultsAndEvidence",
              "roleAlignment",
              "communication",
              "riskControl",
            ]),
            score: z.number().int().min(0).max(100),
            explanation: z.string(),
          })
          .strict(),
      )
      .min(4)
      .max(8),
    evaluatedAt: dateTimeSchema,
  })
  .strict()

const practiceRetryCurrentRecommendationSchema = z
  .object({
    action: z.literal("retryCurrent"),
    reason: z.string(),
  })
  .strict()

const practiceNextQuestionRecommendationSchema = z
  .object({
    action: z.literal("nextQuestion"),
    reason: z.string(),
    nextQuestion: z
      .object({
        questionType: practiceQuestionTypeSchema,
        difficulty: practiceDifficultySchema,
        focusAreas: z.array(z.string()).max(3),
      })
      .strict(),
  })
  .strict()

export const practiceRecommendationSchema = z.discriminatedUnion("action", [
  practiceRetryCurrentRecommendationSchema,
  practiceNextQuestionRecommendationSchema,
])

export const practiceReviewSchema = z
  .object({
    overallPerformance: z.string(),
    highlights: z.array(z.string()),
    mainIssues: z.array(z.string()),
    improvementSuggestions: z.array(z.string()),
    reusableAnswerStructure: z.array(z.string()),
    exposedWeaknesses: z.array(z.string()),
    recommendation: practiceRecommendationSchema,
  })
  .strict()

const practiceActiveSessionBaseSchema = z
  .object({
    attemptId: uuidSchema,
    attemptNumber: z.number().int().positive(),
    language: interactionLanguageSchema,
    selection: practiceSessionSelectionSchema,
    sessionId: uuidSchema,
    startedAt: dateTimeSchema,
    version: versionSchema,
  })
  .strict()

export const practiceGeneratingQuestionSchema = practiceActiveSessionBaseSchema
  .extend({ status: z.literal("generatingQuestion") })
  .strict()

export const practiceAnsweringSchema = practiceActiveSessionBaseSchema
  .extend({
    question: practiceQuestionSchema,
    status: z.literal("answering"),
  })
  .strict()

export const practiceGeneratingFollowUpSchema = practiceActiveSessionBaseSchema
  .extend({
    status: z.literal("generatingFollowUp"),
    question: practiceQuestionSchema,
    mainAnswer: practiceAnswerSchema,
    followUpExchanges: answeredFollowUpExchangesUpToOneSchema,
  })
  .strict()

export const practiceAnsweringFollowUpSchema = practiceActiveSessionBaseSchema
  .extend({
    status: z.literal("answeringFollowUp"),
    question: practiceQuestionSchema,
    mainAnswer: practiceAnswerSchema,
    followUpExchanges: answeredFollowUpExchangesUpToOneSchema,
    currentFollowUp: practiceAwaitingFollowUpExchangeSchema,
  })
  .strict()
  .superRefine((session, context) => {
    if (session.currentFollowUp.question.order !== session.followUpExchanges.length + 1) {
      context.addIssue({
        code: "custom",
        message: "current follow-up order is invalid",
        path: ["currentFollowUp", "question", "order"],
      })
    }
  })

export const practiceEvaluatingSchema = practiceActiveSessionBaseSchema
  .extend({
    status: z.literal("evaluating"),
    question: practiceQuestionSchema,
    mainAnswer: practiceAnswerSchema,
    followUpExchanges: answeredFollowUpExchangesUpToTwoSchema,
    followUpCompletion: practiceFollowUpCompletionSchema,
    submittedAt: dateTimeSchema,
  })
  .strict()
  .superRefine((session, context) => {
    validateFollowUpCompletionSnapshot(session, context)
  })

export const practiceReviewSessionSchema = practiceActiveSessionBaseSchema
  .extend({
    status: z.literal("review"),
    question: practiceQuestionSchema,
    mainAnswer: practiceAnswerSchema,
    followUpExchanges: answeredFollowUpExchangesUpToTwoSchema,
    followUpCompletion: practiceFollowUpCompletionSchema,
    evaluation: practiceEvaluationSchema,
    review: practiceReviewSchema,
  })
  .strict()
  .superRefine((session, context) => {
    validateFollowUpCompletionSnapshot(session, context)
  })

export const practiceActiveSessionResponseSchema = z.discriminatedUnion("status", [
  practiceGeneratingQuestionSchema,
  practiceAnsweringSchema,
  practiceGeneratingFollowUpSchema,
  practiceAnsweringFollowUpSchema,
  practiceEvaluatingSchema,
  practiceReviewSessionSchema,
])

export const practiceUnfinishedAttemptSchema = z
  .object({
    attemptId: uuidSchema,
    attemptNumber: z.number().int().positive(),
    question: practiceQuestionSchema,
    selection: practiceSessionSelectionSchema,
  })
  .strict()

const practiceCompletedSessionBaseSchema = z
  .object({
    attemptId: uuidSchema,
    attemptNumber: z.number().int().positive(),
    completedAt: dateTimeSchema,
    finalAttemptAverageScore: z.number().int().min(0).max(100),
    language: interactionLanguageSchema,
    markedWeakQuestionCount: z.number().int().nonnegative(),
    questionsCompleted: z.number().int().nonnegative(),
    retryCount: z.number().int().nonnegative(),
    savedQuestionCount: z.number().int().nonnegative(),
    selection: practiceSessionSelectionSchema,
    sessionId: uuidSchema,
    startedAt: dateTimeSchema,
    status: z.literal("completed"),
    version: versionSchema,
  })
  .strict()

function validateCompletedSummaryCounts(
  session: {
    markedWeakQuestionCount: number
    questionsCompleted: number
    savedQuestionCount: number
  },
  context: z.RefinementCtx,
) {
  if (session.savedQuestionCount > session.questionsCompleted) {
    context.addIssue({
      code: "custom",
      message: "saved question count exceeds completed questions",
      path: ["savedQuestionCount"],
    })
  }
  if (session.markedWeakQuestionCount > session.questionsCompleted) {
    context.addIssue({
      code: "custom",
      message: "marked-weak question count exceeds completed questions",
      path: ["markedWeakQuestionCount"],
    })
  }
}

export const practiceCompletedReviewSessionSchema = practiceCompletedSessionBaseSchema
  .extend({
    completionReason: z.literal("reviewCompleted"),
    nextStepSuggestion: z.string().min(1),
    unfinishedAttempt: z.null(),
  })
  .strict()
  .superRefine((session, context) => {
    validateCompletedSummaryCounts(session, context)
    if (session.questionsCompleted < 1) {
      context.addIssue({
        code: "custom",
        message: "review-completed session must have completed questions",
        path: ["questionsCompleted"],
      })
    }
  })

export const practiceCompletedEarlySessionSchema = practiceCompletedSessionBaseSchema
  .extend({
    completionReason: z.literal("userEndedEarly"),
    nextStepSuggestion: z.string().min(1).nullable(),
    unfinishedAttempt: practiceUnfinishedAttemptSchema,
  })
  .strict()
  .superRefine((session, context) => {
    validateCompletedSummaryCounts(session, context)
    if (session.attemptId !== session.unfinishedAttempt.attemptId) {
      context.addIssue({
        code: "custom",
        message: "completed attempt identity must match unfinished attempt",
        path: ["attemptId"],
      })
    }
    if (session.attemptNumber !== session.unfinishedAttempt.attemptNumber) {
      context.addIssue({
        code: "custom",
        message: "completed attempt number must match unfinished attempt",
        path: ["attemptNumber"],
      })
    }
    const selection = session.selection
    const unfinishedSelection = session.unfinishedAttempt.selection
    if (
      selection.targetRoleId !== unfinishedSelection.targetRoleId ||
      selection.questionType !== unfinishedSelection.questionType ||
      selection.difficulty !== unfinishedSelection.difficulty ||
      selection.source !== unfinishedSelection.source ||
      selection.prioritizeWeaknesses !== unfinishedSelection.prioritizeWeaknesses
    ) {
      context.addIssue({
        code: "custom",
        message: "completed selection must match unfinished attempt selection",
        path: ["selection"],
      })
    }
    if (session.questionsCompleted === 0 && session.nextStepSuggestion !== null) {
      context.addIssue({
        code: "custom",
        message: "a session with no completed questions cannot have a suggestion",
        path: ["nextStepSuggestion"],
      })
    }
    if (session.questionsCompleted > 0 && session.nextStepSuggestion === null) {
      context.addIssue({
        code: "custom",
        message: "a session with completed questions must have a suggestion",
        path: ["nextStepSuggestion"],
      })
    }
  })

export const practiceCompletedSessionResponseSchema = z.union([
  practiceCompletedReviewSessionSchema,
  practiceCompletedEarlySessionSchema,
])

export const practiceSessionResponseSchema = z.union([
  practiceActiveSessionResponseSchema,
  practiceCompletedSessionResponseSchema,
])

export const currentPracticeSessionResponseSchema = z
  .object({
    session: practiceActiveSessionResponseSchema.nullable(),
  })
  .strict()

export type PracticeMaterialReferenceWire = z.infer<typeof practiceMaterialReferenceSchema>
export type PracticeSessionSelectionWire = z.infer<typeof practiceSessionSelectionSchema>
export type PracticeSetupCapabilitiesResponseWire = z.infer<
  typeof practiceSetupCapabilitiesResponseSchema
>
export type PracticeMainReferenceAnswerContentWire = z.infer<
  typeof practiceMainReferenceAnswerContentSchema
>
export type PracticeFollowUpReferenceAnswerContentWire = z.infer<
  typeof practiceFollowUpReferenceAnswerContentSchema
>
export type PracticeMainReferenceAnswerStateWire = z.infer<
  typeof practiceMainReferenceAnswerStateSchema
>
export type PracticeFollowUpReferenceAnswerStateWire = z.infer<
  typeof practiceFollowUpReferenceAnswerStateSchema
>
export type PracticeQuestionWire = z.infer<typeof practiceQuestionSchema>
export type PracticeAnswerWire = z.infer<typeof practiceAnswerSchema>
export type PracticeFollowUpQuestionWire = z.infer<typeof practiceFollowUpQuestionSchema>
export type PracticeAnsweredFollowUpExchangeWire = z.infer<
  typeof practiceAnsweredFollowUpExchangeSchema
>
export type PracticeAwaitingFollowUpExchangeWire = z.infer<
  typeof practiceAwaitingFollowUpExchangeSchema
>
export type PracticeCompletedFollowUpCompletionWire = z.infer<
  typeof practiceCompletedFollowUpCompletionSchema
>
export type PracticeEndedEarlyFollowUpCompletionWire = z.infer<
  typeof practiceEndedEarlyFollowUpCompletionSchema
>
export type PracticeFollowUpCompletionWire = z.infer<typeof practiceFollowUpCompletionSchema>
export type PracticeEvaluationWire = z.infer<typeof practiceEvaluationSchema>
export type PracticeRecommendationWire = z.infer<typeof practiceRecommendationSchema>
export type PracticeReviewWire = z.infer<typeof practiceReviewSchema>
export type PracticeGeneratingQuestionWire = z.infer<typeof practiceGeneratingQuestionSchema>
export type PracticeAnsweringWire = z.infer<typeof practiceAnsweringSchema>
export type PracticeGeneratingFollowUpWire = z.infer<typeof practiceGeneratingFollowUpSchema>
export type PracticeAnsweringFollowUpWire = z.infer<typeof practiceAnsweringFollowUpSchema>
export type PracticeEvaluatingWire = z.infer<typeof practiceEvaluatingSchema>
export type PracticeReviewWireSession = z.infer<typeof practiceReviewSessionSchema>
export type PracticeActiveSessionWire = z.infer<typeof practiceActiveSessionResponseSchema>
export type PracticeUnfinishedAttemptWire = z.infer<typeof practiceUnfinishedAttemptSchema>
export type PracticeCompletedSessionWire = z.infer<typeof practiceCompletedSessionResponseSchema>
export type PracticeSessionResponseWire = z.infer<typeof practiceSessionResponseSchema>
export type CurrentPracticeSessionResponseWire = z.infer<
  typeof currentPracticeSessionResponseSchema
>
