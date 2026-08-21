import { z } from "zod"

import type { InterviewPageResponse } from "@/models/interview"

const uuidSchema = z.uuid()
const versionSchema = z.number().int().positive()
const dateTimeSchema = z.iso.datetime({ offset: true })

export const interviewQuestionTypeSchema = z.enum([
  "selfIntroduction",
  "projectDeepDive",
  "roleCapability",
  "behavioral",
  "technicalOrBusiness",
  "resumeRisk",
  "motivation",
])
export const interviewRoundSchema = z.enum([
  "hr",
  "firstBusiness",
  "technical",
  "manager",
  "final",
  "comprehensive",
])
export const interviewDifficultySchema = z.enum(["basic", "pressure"])
export const interviewDurationMinutesSchema = z.union([z.literal(15), z.literal(30), z.literal(45)])
export const interactionLanguageSchema = z.enum(["zh-CN", "en"])

export const interviewConfigurationSchema = z
  .object({
    targetRoleId: uuidSchema,
    round: interviewRoundSchema,
    difficulty: interviewDifficultySchema,
    durationMinutes: interviewDurationMinutesSchema,
  })
  .strict()

export const interviewQuestionSchema = z
  .object({
    id: uuidSchema,
    prompt: z.string().trim().min(1).max(255),
    type: interviewQuestionTypeSchema,
    assessedCapabilities: z.array(z.string().trim().min(1).max(255)),
    order: z.number().int().positive(),
  })
  .strict()

const interviewAnswerSchema = z
  .object({
    id: uuidSchema,
    content: z.string().trim().min(1).max(20_000),
    submittedAt: dateTimeSchema,
  })
  .strict()

const interviewFollowUpQuestionSchema = z
  .object({
    id: uuidSchema,
    parentQuestionId: uuidSchema,
    prompt: z.string().trim().min(1).max(4_000),
    order: z.number().int().positive(),
    createdAt: dateTimeSchema,
  })
  .strict()

const interviewAnsweredFollowUpSchema = z
  .object({
    status: z.literal("answered"),
    question: interviewFollowUpQuestionSchema,
    answer: interviewAnswerSchema,
  })
  .strict()

const interviewCompletedQuestionSchema = z
  .object({
    question: interviewQuestionSchema,
    answer: interviewAnswerSchema,
    followUps: z.array(interviewAnsweredFollowUpSchema),
    completedAt: dateTimeSchema,
  })
  .strict()

const interviewCandidateQuestionSchema = z
  .object({
    id: uuidSchema,
    content: z.string().trim().min(1).max(4_000),
    submittedAt: dateTimeSchema,
  })
  .strict()

export const interviewCandidateQuestionExchangeSchema = z
  .object({
    question: interviewCandidateQuestionSchema,
    interviewerAnswer: z.string().trim().min(1).max(20_000),
    feedback: z
      .object({
        summary: z.string().trim().min(1).max(4_000),
        strengths: z.array(z.string().trim().min(1).max(4_000)),
        improvementSuggestions: z.array(z.string().trim().min(1).max(4_000)),
        suggestedAlternatives: z.array(z.string().trim().min(1).max(4_000)),
      })
      .strict(),
  })
  .strict()

const interviewProgressSchema = z
  .object({
    completedMainQuestions: z.number().int().nonnegative(),
    totalMainQuestions: z.number().int().positive().nullable(),
    planRevision: z.number().int().nonnegative(),
  })
  .strict()

const interviewSetupSchema = z
  .object({
    availability: z.discriminatedUnion("status", [
      z.object({ status: z.literal("available") }).strict(),
      z
        .object({
          status: z.literal("blocked"),
          reason: z.enum(["noTargetRoles", "profileIncomplete", "jobDescriptionMissing"]),
        })
        .strict(),
    ]),
    targetRoles: z.array(
      z
        .object({
          id: uuidSchema,
          title: z.string().trim().min(1).max(255),
          company: z.string().max(255).nullable(),
          supportedRounds: z.tuple([interviewRoundSchema]).rest(interviewRoundSchema),
        })
        .strict(),
    ),
    availableDifficulties: z.tuple([interviewDifficultySchema]).rest(interviewDifficultySchema),
    availableDurationMinutes: z
      .tuple([interviewDurationMinutesSchema])
      .rest(interviewDurationMinutesSchema),
    defaultConfiguration: interviewConfigurationSchema
      .extend({ targetRoleId: uuidSchema.nullable() })
      .strict(),
  })
  .strict()

const sessionBaseSchema = z
  .object({
    sessionId: uuidSchema,
    language: interactionLanguageSchema,
    version: versionSchema,
    configuration: interviewConfigurationSchema,
    startedAt: dateTimeSchema,
    progress: interviewProgressSchema,
    completedQuestions: z.array(interviewCompletedQuestionSchema),
  })
  .strict()

export const interviewOpeningSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("opening"),
    openingMessage: z.string().trim().min(1).max(255),
  })
  .strict()

export const interviewGeneratingQuestionSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingQuestion"),
    generationStatus: z.enum(["generating", "failed"]),
  })
  .strict()

const awaitingQuestionSchema = z
  .object({
    status: z.literal("awaitingAnswer"),
    question: interviewQuestionSchema,
    answer: z.null(),
  })
  .strict()

export const interviewQuestionSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("question"),
    currentQuestion: awaitingQuestionSchema,
  })
  .strict()

const answeredQuestionSnapshotSchema = z
  .object({
    question: interviewQuestionSchema,
    answer: interviewAnswerSchema,
    answeredFollowUps: z.array(interviewAnsweredFollowUpSchema),
  })
  .strict()

export const interviewGeneratingTurnSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingTurn"),
    generationStatus: z.enum(["generating", "failed"]),
    currentQuestion: answeredQuestionSnapshotSchema,
  })
  .strict()

const awaitingFollowUpSchema = z
  .object({
    status: z.literal("awaitingAnswer"),
    question: interviewFollowUpQuestionSchema,
    answer: z.null(),
  })
  .strict()

export const interviewFollowUpSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("followUp"),
    currentQuestion: answeredQuestionSnapshotSchema,
    currentFollowUp: awaitingFollowUpSchema,
  })
  .strict()

export const interviewCandidateQuestionsSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("candidateQuestions"),
    prompt: z.string().trim().min(1).max(255),
    exchanges: z.array(interviewCandidateQuestionExchangeSchema),
  })
  .strict()

export const interviewGeneratingCandidateAnswerSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingCandidateAnswer"),
    generationStatus: z.enum(["generating", "failed"]),
    currentCandidateQuestion: interviewCandidateQuestionSchema,
    exchanges: z.array(interviewCandidateQuestionExchangeSchema),
  })
  .strict()

const interviewDimensionScoreSchema = z
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
    explanation: z.string().trim().min(1),
  })
  .strict()

const interviewQuestionReviewSchema = z
  .object({
    questionId: uuidSchema,
    score: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1),
    strengths: z.array(z.string().trim().min(1)),
    issues: z.array(z.string().trim().min(1)),
  })
  .strict()

const interviewFollowUpReviewSchema = z
  .object({
    followUpQuestionId: uuidSchema,
    score: z.number().int().min(0).max(100),
    summary: z.string().trim().min(1),
    strengths: z.array(z.string().trim().min(1)),
    issues: z.array(z.string().trim().min(1)),
  })
  .strict()

const interviewReferenceAnswerContentSchema = z
  .object({
    recommendedStructure: z.array(z.string().trim().min(1)),
    keyPoints: z.array(z.string().trim().min(1)),
    exampleAnswer: z.string().trim().min(1),
    usageGuidance: z.string().trim().min(1),
    generatedAt: dateTimeSchema,
  })
  .strict()

const interviewReferenceAnswerWireSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("ready"),
      content: interviewReferenceAnswerContentSchema,
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("generating"),
      content: z.null(),
      reason: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      content: z.null(),
      reason: z.literal("generationFailed"),
    })
    .strict(),
])

const interviewReferenceAnswerSchema = interviewReferenceAnswerWireSchema.transform(
  (referenceAnswer) => {
    if (referenceAnswer.status === "ready") {
      return {
        status: referenceAnswer.status,
        content: referenceAnswer.content,
      }
    }
    if (referenceAnswer.status === "unavailable") {
      return {
        status: referenceAnswer.status,
        reason: referenceAnswer.reason,
      }
    }
    return { status: referenceAnswer.status }
  },
)

const interviewFollowUpRecordSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("answered"),
      question: interviewFollowUpQuestionSchema,
      answer: interviewAnswerSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unanswered"),
      question: interviewFollowUpQuestionSchema,
      answer: z.null(),
    })
    .strict(),
])

const interviewQuestionRecordSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("answered"),
      question: interviewQuestionSchema,
      answer: interviewAnswerSchema,
      followUps: z.array(interviewFollowUpRecordSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal("unanswered"),
      question: interviewQuestionSchema,
      answer: z.null(),
      followUps: z.tuple([]),
    })
    .strict(),
])

export const interviewQuestionLearningDetailSchema = z
  .object({
    record: interviewQuestionRecordSchema,
    performance: interviewQuestionReviewSchema.nullable(),
    referenceAnswer: interviewReferenceAnswerSchema,
    followUps: z.array(
      z
        .object({
          record: interviewFollowUpRecordSchema,
          performance: interviewFollowUpReviewSchema.nullable(),
          referenceAnswer: interviewReferenceAnswerSchema,
        })
        .strict(),
    ),
  })
  .strict()

const interviewNarrativeSchema = z
  .object({
    overallPerformance: z.string().trim().min(1),
    questionReviews: z.array(interviewQuestionReviewSchema),
    mainStrengths: z.array(z.string().trim().min(1)),
    frequentIssues: z.array(z.string().trim().min(1)),
    exposedWeaknesses: z.array(z.string().trim().min(1)),
    riskPoints: z.array(z.string().trim().min(1)),
    communicationSuggestions: z.array(z.string().trim().min(1)),
    preparationSuggestions: z.array(z.string().trim().min(1)),
    generatedAt: dateTimeSchema,
  })
  .strict()

const interviewTrainingSuggestionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("targetedPractice"),
      reason: z.string().trim().min(1),
      focusAreas: z.array(z.string().trim().min(1)),
      questionType: interviewQuestionTypeSchema,
      difficulty: interviewDifficultySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("mockInterview"),
      reason: z.string().trim().min(1),
      focusAreas: z.array(z.string().trim().min(1)),
      round: interviewRoundSchema,
      difficulty: interviewDifficultySchema,
    })
    .strict(),
])

const interviewCompleteReviewSchema = interviewNarrativeSchema
  .extend({
    overallScore: z.number().int().min(0).max(100),
    dimensionScores: z.array(interviewDimensionScoreSchema),
    nextTraining: interviewTrainingSuggestionSchema,
  })
  .strict()

export const interviewSessionReviewSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("unavailable"),
      reason: z.literal("insufficientAnswers"),
    })
    .strict(),
  z
    .object({
      status: z.literal("partial"),
      review: interviewNarrativeSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("complete"),
      review: interviewCompleteReviewSchema,
    })
    .strict(),
])

export const interviewGeneratingReviewSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("generatingReview"),
    generationStatus: z.enum(["generating", "failed"]),
    completionReason: z.enum(["formalQuestionsCompleted", "userEndedEarly"]),
    candidateQuestionExchanges: z.array(interviewCandidateQuestionExchangeSchema),
  })
  .strict()

export const interviewCompletedSessionSchema = sessionBaseSchema
  .extend({
    status: z.literal("completed"),
    completionReason: z.enum(["formalQuestionsCompleted", "userEndedEarly"]),
    completedAt: dateTimeSchema,
    candidateQuestionExchanges: z.array(interviewCandidateQuestionExchangeSchema),
    review: interviewSessionReviewSchema,
    questionDetails: z.array(interviewQuestionLearningDetailSchema),
  })
  .strict()

export const interviewSessionSchema = z.discriminatedUnion("status", [
  interviewOpeningSessionSchema,
  interviewGeneratingQuestionSessionSchema,
  interviewQuestionSessionSchema,
  interviewGeneratingTurnSessionSchema,
  interviewFollowUpSessionSchema,
  interviewCandidateQuestionsSessionSchema,
  interviewGeneratingCandidateAnswerSessionSchema,
  interviewGeneratingReviewSessionSchema,
  interviewCompletedSessionSchema,
])

export const interviewPageResponseSchema: z.ZodType<
  Omit<InterviewPageResponse, "session"> & {
    session: z.infer<typeof interviewSessionSchema> | null
  }
> = z
  .object({
    setup: interviewSetupSchema,
    session: interviewSessionSchema.nullable(),
  })
  .strict()

export const getInterviewReviewResponseSchema = z
  .object({
    sessionId: uuidSchema,
    completionReason: z.enum(["formalQuestionsCompleted", "userEndedEarly"]),
    questionDetails: z.array(interviewQuestionLearningDetailSchema),
  })
  .and(interviewSessionReviewSchema)

export type InterviewPageWireResponse = z.infer<typeof interviewPageResponseSchema>
