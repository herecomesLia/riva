import { findInterviewFollowUp } from "./follow-up-catalog"
import { findInterviewQuestion } from "./question-catalog"

export function getInterviewQuestionReferenceAnswer(questionId: string) {
  return structuredClone(findInterviewQuestion(questionId)?.referenceAnswer)
}

export function getInterviewFollowUpReferenceAnswer(followUpId: string) {
  return structuredClone(findInterviewFollowUp(followUpId)?.referenceAnswer)
}
