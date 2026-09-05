import type {
  CompletedSession,
  FollowUpReferenceAnswer,
  PracticeEvaluation,
  PracticeFollowUp,
  PracticeQuestion,
  PracticeReferenceAnswer,
  PracticeReview,
  PracticeSelection,
} from "@/models/practice-workflow"

export const practiceFixture = {
  sessionId: "practice-session",
  attemptNumber: 1,
  // UI samples, intentionally independent of actions taken in the faker.
  completion: {
    reviewCompleted: {
      completionReason: "reviewCompleted",
      questionsCompleted: 2,
      retryCount: 1,
      savedQuestionCount: 1,
      weakQuestionCount: 1,
      finalAttemptAverageScore: 78,
      nextStepSuggestion: "继续练习，并优先补强复盘中暴露的薄弱能力。",
    },
    userEndedEarly: {
      completionReason: "userEndedEarly",
      questionsCompleted: 0,
      retryCount: 0,
      savedQuestionCount: 0,
      weakQuestionCount: 0,
      finalAttemptAverageScore: 0,
      nextStepSuggestion: "开始下一轮练习，完成一道题后查看复盘。",
    },
  } satisfies Record<
    CompletedSession["completionReason"],
    Omit<CompletedSession, "status" | "sessionId" | "selection">
  >,
  selection: {
    targetRoleId: null,
    questionType: "projectDeepDive",
    difficulty: "basic",
    source: "personalized",
    prioritizeWeaknesses: false,
  } satisfies PracticeSelection,
  question: {
    id: "practice-question",
    prompt: "请结合一个真实经历，说明你如何分析问题、做出关键判断、推动行动并验证最终结果。",
    assessedCapabilities: ["问题分析", "结果验证"],
    recommendedMaterials: ["一个由你推动解决问题的经历"],
    hints: { status: "notRequested", content: null },
    framework: { status: "notRequested", content: null },
    referenceAnswer: { status: "notRequested", content: null, viewedBeforeSubmission: false },
    isSaved: false,
    isWeak: false,
  } satisfies PracticeQuestion,
  questionHelp: {
    hints: ["说明你的关键判断和验证依据。"],
    framework: ["背景与目标", "行动与结果"],
    reference: {
      kind: "personalizedExample",
      answer: "我先明确目标和约束，再用小范围验证选择方案，推动落地后对比结果并复盘。",
      keyPoints: ["明确个人行动", "提供结果证据"],
      commonMistakes: ["只描述团队成果"],
    } satisfies PracticeReferenceAnswer,
  },
  followUp: {
    question: {
      id: "practice-follow-up",
      prompt: "你如何验证结果来自你的关键行动，还有哪些因素可能影响结论？",
      hints: { status: "notRequested", content: null },
      framework: { status: "notRequested", content: null },
      referenceAnswer: { status: "notRequested", content: null, viewedBeforeSubmission: false },
    } satisfies PracticeFollowUp,
    hints: ["说明对照证据和结论边界。"],
    framework: ["验证方法", "证据与局限"],
    reference: {
      kind: "personalizedSupplement",
      addressedGap: "结果归因证据不足。",
      answer: "我会对比行动前后的结果，排查同期变化，并说明证据能支持的结论范围。",
      keyPoints: ["排除干扰因素"],
      commonMistakes: ["把相关性当作因果"],
    } satisfies FollowUpReferenceAnswer,
  },
  evaluation: {
    overallScore: 78,
    dimensionScores: [
      { dimension: "relevance", score: 82, explanation: "回答基本围绕问题展开。" },
      { dimension: "specificity", score: 74, explanation: "关键行动较明确，量化证据仍可加强。" },
    ],
  } satisfies PracticeEvaluation,
  review: {
    overallPerformance: "回答清楚地呈现了行动过程，可以进一步补充结果证据。",
    highlights: ["能够说明个人采取的关键行动。"],
    mainIssues: ["结果的验证依据不够具体。"],
    improvementSuggestions: ["补充一个可比较的结果指标。"],
    reusableAnswerStructure: ["目标与关键行动", "结果证据与复盘"],
    exposedWeaknesses: ["量化证据"],
    recommendation: { action: "retryCurrent", reason: "结合复盘补充证据，再尝试一次。" },
  } satisfies PracticeReview,
}
