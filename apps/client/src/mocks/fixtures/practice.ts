import type {
  PracticeQuestion,
  PracticeSelection,
  PracticeSession,
} from "@/models/practice-workflow"

export const practiceSelectionFixture = {
  targetRoleId: null,
  questionType: "projectDeepDive",
  difficulty: "basic",
  source: "personalized",
  prioritizeWeaknesses: false,
} satisfies PracticeSelection

export const practiceSetupFixture = {
  status: "setup",
  selection: practiceSelectionFixture,
} satisfies PracticeSession

export const practiceQuestionFixture = {
  id: "practice-question",
  prompt: "Tell me about a project where you solved a difficult engineering problem.",
  questionType: "projectDeepDive",
  difficulty: "basic",
  assessedCapabilities: ["Problem solving", "Technical judgment"],
  recommendedMaterials: ["Career profile projects"],
  hints: {
    status: "notRequested",
    content: null,
  },
  framework: {
    status: "notRequested",
    content: null,
  },
  referenceAnswer: {
    status: "notRequested",
    content: null,
    viewedBeforeSubmission: false,
  },
  isSaved: false,
  isWeak: false,
} satisfies PracticeQuestion
