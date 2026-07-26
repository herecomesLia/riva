import { findInterviewFollowUp } from "./follow-up-catalog"
import { findInterviewQuestion } from "./question-catalog"

export function getInterviewQuestionReviewTemplate(questionId: string) {
  const entry = findInterviewQuestion(questionId)
  if (entry === undefined) {
    throw new Error(`Missing interview review fixture for question ${questionId}.`)
  }
  return structuredClone(entry.review)
}

export function getInterviewFollowUpReviewTemplate(followUpId: string) {
  const entry = findInterviewFollowUp(followUpId)
  if (entry === undefined) {
    throw new Error(`Missing interview follow-up review fixture for ${followUpId}.`)
  }
  return structuredClone(entry.review)
}
