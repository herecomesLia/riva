import { practiceFixture } from "@/mocks/fixtures/practice"
import type {
  ActiveSelection,
  AnsweringFollowUpSession,
  AnsweringSession,
  CompletedSession,
  ProcessingSession,
  PracticeData,
  PracticeFollowUp,
  PracticeQuestion,
  PracticeSession,
  PracticeSetupContext,
  ReviewSession,
} from "@/models/practice-workflow"

const defaultSetupContext: PracticeSetupContext = {
  roles: [
    {
      id: "role_frontend_bytedance",
      title: "Senior Frontend Engineer",
      company: "ByteDance",
      supportedQuestionTypes: [
        "project",
        "behavioral",
        "business_understanding",
        "motivation",
        "technical_basics",
      ],
    },
    {
      id: "role_product_manager_meituan",
      title: "Product Manager",
      company: "Meituan",
      // Static coverage for changing roles with an unsupported selected question type.
      supportedQuestionTypes: ["project", "behavioral", "business_understanding", "motivation"],
    },
  ],
  availableDifficulties: ["basic", "hard"],
}

const selection: ActiveSelection = {
  ...practiceFixture.selection,
  roleId: "role_frontend_bytedance",
}

function question(overrides: Partial<PracticeQuestion> = {}): PracticeQuestion {
  return { ...structuredClone(practiceFixture.question), ...overrides }
}

function data(session: PracticeSession, setupContext = defaultSetupContext): PracticeData {
  return { setupContext: structuredClone(setupContext), session }
}

const answering: AnsweringSession = {
  status: "answering",
  selection,
  question: question(),
}
const firstFollowUp: AnsweringFollowUpSession = {
  status: "answeringFollowUp",
  selection,
  question: question(),
  mainAnswer: { content: "我明确了目标和约束，比较方案后推动落地，并用结果验证判断。" },
  followUps: [],
  currentFollowUp: practiceFixture.followUp.question,
}
// Only the second prompt/answer differs, to exercise multi-turn timeline layout.
const secondFollowUp: PracticeFollowUp = {
  ...practiceFixture.followUp.question,
  prompt: "如果验证结果不符合预期，你会如何调整行动？",
}
const answeredFollowUp = {
  question: practiceFixture.followUp.question,
  answer: { content: "我对比了行动前后的指标，并排查同期变化带来的影响。" },
}
const followUp: AnsweringFollowUpSession = {
  ...firstFollowUp,
  followUps: [answeredFollowUp],
  currentFollowUp: secondFollowUp,
}
const processing: ProcessingSession = {
  status: "processing",
  selection,
  question: question(),
  mainAnswer: firstFollowUp.mainAnswer,
  followUps: [
    answeredFollowUp,
    { question: secondFollowUp, answer: { content: "我会缩小验证范围，重新检查假设并调整方案。" } },
  ],
}
function review(overrides: Partial<ReviewSession> = {}): ReviewSession {
  return {
    ...structuredClone(processing),
    status: "review",
    evaluation: structuredClone(practiceFixture.evaluation),
    review: structuredClone(practiceFixture.review),
    ...overrides,
  }
}

const completed: CompletedSession = {
  status: "completed",
  selection,
  ...practiceFixture.completion,
  questionsCompleted: 1,

  finalAttemptAverageScore: 85,
}

// Default scenes reuse the runtime sample; overrides exist only for visible UI variants.
const scenarios = {
  setupReady: data({ status: "setup", selection }),
  noRoles: data(
    { status: "setup", selection: practiceFixture.selection },
    { ...defaultSetupContext, roles: [] },
  ),

  generatingQuestion: data({ status: "generatingQuestion", selection }),
  answeringQuestion: data(answering),

  answeringFirstFollowUp: data(firstFollowUp),
  answeringSingleFollowUp: data({
    ...firstFollowUp,
    selection: { ...selection, questionType: "behavioral" },
  }),
  answeringFollowUp: data(followUp),
  processingNoFollowUp: data({
    ...processing,
    selection: { ...selection, questionType: "motivation" },
    followUps: [],
  }),
  processingFollowUpEndedEarly: data({
    ...processing,
    followUps: [answeredFollowUp],
  }),
  processingAnswer: data(processing),

  reviewBalanced: data(review()),
  reviewHighScore: data(
    review({
      evaluation: { ...practiceFixture.evaluation, overallScore: 94 },
    }),
  ),
  reviewLowScore: data(
    review({
      evaluation: { ...practiceFixture.evaluation, overallScore: 58 },
    }),
  ),
  reviewLongContent: data(
    review({
      review: {
        ...practiceFixture.review,
        overallPerformance:
          "回答能够从业务影响切入，逐步说明问题定位、方案设计、跨团队推动和结果验证，整体叙述具有较好的完整性。当前最需要继续加强的是把每一次关键判断和自己的具体动作建立更直接的对应关系，并明确说明灰度阶段观察了哪些指标、如何设置告警阈值、什么情况下启动回滚，以及这些机制如何帮助团队在控制发布风险的同时验证收益。",
        improvementSuggestions: [
          "将推动过程拆成发现分歧、澄清约束、提出可验证方案和促成决策四个连续动作，并分别说明你提供了什么信息、影响了哪位协作方以及最终形成了什么共识。",
          "把结果验证补充为优化前基线、实验组与对照组差异、持续观察周期、异常告警阈值和回滚条件，避免只用一个上线后的最终指标概括全部验证过程。",
        ],
      },
    }),
  ),

  reviewMotivation: data(
    review({
      selection: { ...selection, questionType: "motivation" },
      followUps: [],
    }),
  ),
  reviewFollowUpEndedEarly: data(
    review({
      followUps: [
        {
          ...answeredFollowUp,
          question: {
            ...answeredFollowUp.question,
            referenceAnswer: practiceFixture.followUp.question.referenceAnswer,
          },
        },
      ],
    }),
  ),
  completedSession: data(completed),
  retryingCurrentQuestion: data(answering),
  generatingNextQuestion: data({ status: "generatingQuestion", selection }),
} satisfies Record<string, PracticeData>

export type PracticeScenario = keyof typeof scenarios

export function createPracticeScenario(scenario: PracticeScenario = "setupReady"): PracticeData {
  return structuredClone(scenarios[scenario])
}
