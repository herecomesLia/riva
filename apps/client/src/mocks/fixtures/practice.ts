import type {
  PracticeQuestionTurnResponse,
  PracticeResponse,
  PracticeResultResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import { toPracticeQuestion, toPracticeSession } from "@/models/practice-response"
import type { PracticeSelection } from "@/models/practice-workflow"

export const practiceQuestionFixture: PracticeQuestionTurnResponse = {
  id: "10000000-0000-4000-8000-000000000003",
  role: "assistant",

  content: "请结合一个真实经历，说明你如何分析问题、做出关键判断、推动行动并验证最终结果。",
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
}

export const practiceFollowUpFixture: PracticeQuestionTurnResponse = {
  id: "10000000-0000-4000-8000-000000000005",
  role: "assistant",

  content: "你如何验证结果来自你的关键行动，还有哪些因素可能影响结论？",
  guidance: {
    hints: ["说明对照证据和结论边界。"],
    framework: ["验证方法、证据与局限"],
  },
  referenceAnswer: "我会对比行动前后的结果，排查同期变化，并说明证据能支持的结论范围。",

  criteria: [],
}

export const practiceResultFixture: PracticeResultResponse = {
  score: 78,
  dimensionScores: {
    relevance: { score: 82, explanation: "回答基本围绕问题展开。" },
    structure: { score: 80, explanation: "背景、行动和结果的顺序清楚。" },
    specificity: { score: 82, explanation: "能够说明具体的实施行动。" },
    contribution: { score: 79, explanation: "说明了个人负责的关键行动。" },
    evidence: { score: 62, explanation: "提及结果，但缺少明确的对照证据。" },
    roleAlignment: { score: 83, explanation: "所述经历与岗位要求相关。" },
    communication: { score: 80, explanation: "文字表达清楚，信息衔接自然。" },
    riskAwareness: { score: 76, explanation: "考虑了约束，但风险边界还可展开。" },
  },
  summary: "回答清楚地呈现了行动过程，可以进一步补充结果证据。",
  strengths: ["能够说明个人采取的关键行动。"],
  issues: ["结果的验证依据不够具体。"],
  suggestions: ["补充一个可比较的结果指标。"],
}

export const practiceResponseFixture: PracticeResponse = {
  id: "10000000-0000-4000-8000-000000000001",
  role: {
    id: "10000000-0000-4000-8000-000000000010",
    title: "Senior Frontend Engineer",
    company: "ByteDance",
  },
  questionType: "project",
  difficulty: "basic",
  rounds: [
    {
      id: "10000000-0000-4000-8000-000000000002",
      sequence: 0,
      turns: [
        practiceQuestionFixture,
        {
          id: "10000000-0000-4000-8000-000000000004",
          role: "user",
          content: "我明确了目标和约束，比较方案后推动落地，并用结果验证判断。",
        },
        practiceFollowUpFixture,
        {
          id: "10000000-0000-4000-8000-000000000006",
          role: "user",
          content: "我对比了行动前后的指标，并排查同期变化带来的影响。",
        },
      ],
      result: practiceResultFixture,
    },
  ],
  createdAt: "2026-09-18T08:00:00Z",
  endedAt: null,
}

const review = toPracticeSession(practiceResponseFixture, { status: "idle", error: null })
if (review.status !== "review") throw new Error("Practice response fixture must contain a result.")

export const practiceTaskFailureInput = "__RIVA_MOCK_PRACTICE_TASK_FAILURE__"
export const practiceTaskFailureFixture: TaskFailureResponse = {
  status: "failed",
  error: { code: "llm_unavailable", message: "LLM service is temporarily unavailable." },
}

// Display samples for isolated component tests and stories. Runtime mocks use the API fixtures.
export const practiceFixture = {
  context: review.context,
  completion: { questionsCompleted: 1, finalAttemptAverageScore: practiceResultFixture.score },
  selection: {
    roleId: null,
    questionType: "project",
    difficulty: "basic",
  } satisfies PracticeSelection,
  question: toPracticeQuestion(practiceQuestionFixture),
  followUp: { question: toPracticeQuestion(practiceFollowUpFixture) },
  evaluation: review.evaluation,
  review: review.review,
}
