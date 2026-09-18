import type {
  CompletedSession,
  PracticeEvaluation,
  PracticeFollowUp,
  PracticeQuestion,
  PracticeReview,
  PracticeSelection,
} from "@/models/practice-workflow"

export const practiceFixture = {
  // UI samples, intentionally independent of actions taken in the faker.
  completion: {
    questionsCompleted: 2,

    finalAttemptAverageScore: 78,
  } satisfies Omit<CompletedSession, "status" | "selection">,
  selection: {
    roleId: null,
    questionType: "project",
    difficulty: "basic",
  } satisfies PracticeSelection,
  question: {
    prompt: "请结合一个真实经历，说明你如何分析问题、做出关键判断、推动行动并验证最终结果。",
    criteria: [
      { dimension: "个人贡献", expectation: "说明你亲自采取的关键行动及其作用。" },
      { dimension: "结果与证据", expectation: "提供可验证的结果，并说明验证依据。" },
      { dimension: "技术决策", expectation: "说明方案取舍、关键判断及其依据。" },
    ],
    guidance: {
      hints: ["说明你的关键判断和验证依据。"],
      framework: ["背景、目标、行动与结果"],
    },
    referenceAnswer: "我先明确目标和约束，再用小范围验证选择方案，推动落地后对比结果并复盘。",
  } satisfies PracticeQuestion,
  followUp: {
    question: {
      prompt: "你如何验证结果来自你的关键行动，还有哪些因素可能影响结论？",
      guidance: {
        hints: ["说明对照证据和结论边界。"],
        framework: ["验证方法、证据与局限"],
      },
      referenceAnswer: "我会对比行动前后的结果，排查同期变化，并说明证据能支持的结论范围。",
    } satisfies PracticeFollowUp,
  },
  evaluation: {
    overallScore: 78,
    dimensionScores: [{ dimension: "relevance", score: 82, explanation: "回答基本围绕问题展开。" }],
  } satisfies PracticeEvaluation,
  review: {
    overallPerformance: "回答清楚地呈现了行动过程，可以进一步补充结果证据。",
    highlights: ["能够说明个人采取的关键行动。"],
    mainIssues: ["结果的验证依据不够具体。"],
    improvementSuggestions: ["补充一个可比较的结果指标。"],
  } satisfies PracticeReview,
}
