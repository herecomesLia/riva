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
} as const
