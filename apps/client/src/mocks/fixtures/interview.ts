import type { CandidateQuestionExchange } from "@/models/interview-workflow"

export const interviewFixture = {
  sessionId: "interview-session",
  configuration: {
    targetRoleId: "role_frontend",
    round: "technical",
    difficulty: "pressure",
    durationMinutes: 30,
  },
  openingMessage: "你好，我是本次模拟面试的面试官。接下来会进行正式问答。",
  progress: {
    completedMainQuestions: 0,
    totalMainQuestions: 1,
    planAdjusted: false,
  },
  question: {
    kind: "question",
    questionOrder: 1,
    content: "请结合一个真实经历，说明你如何分析问题、做出关键判断并推动结果落地。",
  },
  followUp: {
    kind: "followUp",
    questionOrder: 1,
    content: "你如何确认最终结果主要来自你的关键行动，而不是其他同时发生的变化？",
  },
  candidate: {
    prompt: "正式提问已经结束。现在请你以候选人身份向面试官提问。",
    interviewerAnswer:
      "这个岗位会长期与多个业务团队协作，入职后会先熟悉核心链路，再逐步承担跨团队项目。",
    feedback: {
      summary: "这个问题能够帮助你进一步了解岗位的实际工作方式。",
      suggestedAlternatives: ["这个岗位入职后的主要成功标准是什么？"],
    } satisfies CandidateQuestionExchange["feedback"],
  },
} as const
