import type {
  CompletedInterviewQuestionResponse,
  InterviewCompletionReason,
  InterviewFollowUpReviewResponse,
  InterviewPartialReviewResponse,
  InterviewQuestionLearningDetailResponse,
  InterviewQuestionRecordResponse,
  InterviewQuestionReviewResponse,
  InterviewReferenceAnswerResponse,
  InterviewReviewResponse,
  InterviewSessionReviewResponse,
} from "@/models/interview"

import {
  getInterviewFollowUpReferenceAnswer,
  getInterviewQuestionReferenceAnswer,
} from "./reference-answer-catalog"
import {
  getInterviewFollowUpReviewTemplate,
  getInterviewQuestionReviewTemplate,
} from "./review-templates"

function createReferenceAnswer(questionId: string): InterviewReferenceAnswerResponse {
  const content =
    getInterviewQuestionReferenceAnswer(questionId) ??
    getInterviewFollowUpReferenceAnswer(questionId)
  return content === undefined
    ? { status: "unavailable", reason: "generationFailed" }
    : { status: "ready", content: structuredClone(content) }
}

function createFollowUpPerformance(followUpQuestionId: string): InterviewFollowUpReviewResponse {
  const template = getInterviewFollowUpReviewTemplate(followUpQuestionId)
  return {
    followUpQuestionId,
    ...structuredClone(template),
  }
}

function unique(items: readonly string[]) {
  return [...new Set(items)]
}

function createQuestionReviews(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
): InterviewQuestionReviewResponse[] {
  return completedQuestions.map(({ question }) => {
    const template = getInterviewQuestionReviewTemplate(question.id)
    return {
      questionId: question.id,
      score: template.score,
      summary: template.summary,
      strengths: structuredClone(template.strengths),
      issues: structuredClone(template.issues),
    }
  })
}

function createReviewNarrative(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
  mode: "partial" | "complete",
): InterviewPartialReviewResponse {
  const templates = completedQuestions.map(({ question }) =>
    getInterviewQuestionReviewTemplate(question.id),
  )
  return {
    overallPerformance:
      mode === "partial"
        ? `本次面试提前结束，以下结果仅基于已完成的 ${completedQuestions.length} 道正式问题，不能代表完整面试表现。`
        : `本次复盘基于已完成的 ${completedQuestions.length} 道正式问题，覆盖本场实际出现的问答内容。`,
    questionReviews: createQuestionReviews(completedQuestions),
    mainStrengths: unique(templates.flatMap(({ strengths }) => strengths)),
    frequentIssues: unique(templates.flatMap(({ issues }) => issues)),
    exposedWeaknesses: unique(templates.flatMap(({ weaknesses }) => weaknesses)),
    riskPoints: unique(templates.flatMap(({ risks }) => risks)),
    communicationSuggestions: unique(
      templates.flatMap(({ communicationSuggestions }) => communicationSuggestions),
    ),
    preparationSuggestions: unique(
      templates.flatMap(({ preparationSuggestions }) => preparationSuggestions),
    ),
    generatedAt: "2026-07-24T02:20:00.000Z",
  }
}

function createCompleteInterviewReview(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
): InterviewReviewResponse {
  const narrative = createReviewNarrative(completedQuestions, "complete")
  const averageScore = Math.round(
    narrative.questionReviews.reduce((total, { score }) => total + score, 0) /
      narrative.questionReviews.length,
  )
  const lowestQuestion = [...completedQuestions].sort(
    (left, right) =>
      getInterviewQuestionReviewTemplate(left.question.id).score -
      getInterviewQuestionReviewTemplate(right.question.id).score,
  )[0]!
  const lowestReview = getInterviewQuestionReviewTemplate(lowestQuestion.question.id)

  return {
    ...narrative,
    overallScore: averageScore,
    dimensionScores: [
      {
        dimension: "relevance",
        score: Math.min(100, averageScore + 3),
        explanation: "评分基于本场实际完成问题中的回答相关性。",
      },
      {
        dimension: "structure",
        score: Math.min(100, averageScore + 1),
        explanation: "评分基于本场实际完成回答的组织与表达结构。",
      },
      {
        dimension: "specificity",
        score: Math.max(0, averageScore - 3),
        explanation: "评分基于本场实际回答中事实、行动和结果的具体程度。",
      },
      {
        dimension: "personalContribution",
        score: Math.min(100, averageScore + 2),
        explanation: "评分基于本场实际回答对个人职责、判断和推动动作的呈现。",
      },
      {
        dimension: "resultsAndEvidence",
        score: Math.max(0, averageScore - 2),
        explanation: "评分基于本场实际回答对结果、指标和验证证据的说明。",
      },
      {
        dimension: "roleAlignment",
        score: Math.min(100, averageScore + 1),
        explanation: "评分基于本场实际问答体现的岗位理解与能力匹配程度。",
      },
      {
        dimension: "communication",
        score: averageScore,
        explanation: "评分基于本场正式问答中的整体沟通表现。",
      },
      {
        dimension: "riskControl",
        score: Math.max(0, averageScore - 1),
        explanation: "评分基于本场实际回答对约束、风险和应对措施的说明。",
      },
    ],
    nextTraining: {
      action: "targetedPractice",
      reason: `下一步建议围绕本场“${lowestQuestion.question.prompt}”中暴露的改进重点继续训练。`,
      focusAreas: structuredClone(lowestReview.issues),
      questionType: lowestQuestion.question.type,
      difficulty: "pressure",
    },
  }
}

export function createInterviewSessionReview(
  completedQuestions: readonly CompletedInterviewQuestionResponse[],
  completionReason: InterviewCompletionReason,
): InterviewSessionReviewResponse {
  if (completedQuestions.length === 0) {
    return { status: "unavailable", reason: "insufficientAnswers" }
  }
  if (completionReason === "userEndedEarly") {
    return {
      status: "partial",
      review: createReviewNarrative(completedQuestions, "partial"),
    }
  }
  return {
    status: "complete",
    review: createCompleteInterviewReview(completedQuestions),
  }
}

export function createInterviewQuestionDetails(
  records: readonly InterviewQuestionRecordResponse[],
  review: InterviewSessionReviewResponse,
): InterviewQuestionLearningDetailResponse[] {
  const questionReviews = review.status === "unavailable" ? [] : review.review.questionReviews

  return records.map((record) => ({
    record: structuredClone(record),
    performance:
      record.status === "answered"
        ? structuredClone(
            questionReviews.find(({ questionId }) => questionId === record.question.id) ?? null,
          )
        : null,
    referenceAnswer: createReferenceAnswer(record.question.id),
    followUps: record.followUps.map((followUp) => ({
      record: structuredClone(followUp),
      performance:
        followUp.status === "answered" ? createFollowUpPerformance(followUp.question.id) : null,
      referenceAnswer: createReferenceAnswer(followUp.question.id),
    })),
  }))
}
