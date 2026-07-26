import { createInterviewFollowUpId, interviewQuestionCatalogs } from "./question-catalog"

export function findInterviewFollowUp(followUpId: string) {
  for (const [targetRoleId, catalog] of Object.entries(interviewQuestionCatalogs)) {
    for (const entry of [...catalog.hr, ...catalog.business, ...(catalog.technical ?? [])]) {
      for (const followUp of entry.followUps) {
        if (createInterviewFollowUpId(targetRoleId, entry.key, followUp.key) === followUpId) {
          return followUp
        }
      }
    }
  }
  return undefined
}
