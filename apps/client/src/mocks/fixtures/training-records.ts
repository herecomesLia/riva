import type {
  MockInterviewRecordDetailResponse,
  TargetedPracticeRecordDetailResponse,
  TrainingRecordQuestion,
  TrainingRecordReferenceAnswer,
} from "@/models/training-records"

type ReadyReferenceAnswer = Extract<TrainingRecordReferenceAnswer, { status: "ready" }>

const reference = {
  status: "ready",
  content: {
    recommendedStructure: ["先说明背景与目标"],
    keyPoints: ["突出个人判断和结果证据"],
    exampleAnswer: "我会先说明问题背景和目标，再解释关键判断与行动，最后用结果验证。",
    usageGuidance: "参考结构并结合自己的真实经历重新组织回答。",
    generatedAt: "2026-07-25T08:00:00.000Z",
  },
} satisfies ReadyReferenceAnswer

const question = {
  id: "practice-question",
  prompt: "请结合一个真实经历，说明你如何分析问题、做出判断并验证结果。",
  type: "projectDeepDive",
  order: 1,
  attemptNumber: 1,
  retryOfQuestionId: null,
  assessedCapabilities: ["结果验证"],
  isSaved: true,
  isMarkedWeak: true,
  answer: {
    id: "practice-answer",
    content: "我先明确目标和基线，再推动小范围实验，通过对照结果验证关键行动。",
    submittedAt: "2026-07-25T07:05:00.000Z",
  },
  evaluation: {
    overallScore: 84,
    dimensions: [
      { dimension: "resultsAndEvidence", score: 84, explanation: "能够用证据验证结果。" },
    ],
    evaluatedAt: "2026-07-25T07:10:00.000Z",
  },
  review: {
    summary: "关键行动清楚，可以进一步补充量化证据。",
    strengths: ["明确了个人贡献。"],
    issues: ["对照依据还不够具体。"],
    improvementSuggestions: ["补充实验前后的指标。"],
    reusableAnswerStructure: ["背景、判断、行动、结果"],
  },
  referenceAnswer: { status: "notRequested", content: null },
  followUps: [
    {
      id: "practice-follow-up",
      prompt: "你如何排除其他因素对结果的影响？",
      order: 1,
      askedAt: "2026-07-25T07:06:00.000Z",
      answer: {
        id: "practice-follow-up-answer",
        content: "我保持实验与对照组的其他条件一致，并比较同一时间段的指标。",
        submittedAt: "2026-07-25T07:08:00.000Z",
      },
      evaluation: {
        overallScore: 84,
        dimensions: [
          { dimension: "specificity", score: 84, explanation: "说明了具体的验证方法。" },
        ],
        evaluatedAt: "2026-07-25T07:10:00.000Z",
      },
      review: {
        summary: "验证思路明确。",
        strengths: ["考虑了干扰因素。"],
        issues: ["样本范围说明不足。"],
        improvementSuggestions: ["补充样本选择依据。"],
        reusableAnswerStructure: ["对照方法、证据、结论边界"],
      },
      referenceAnswer: reference,
    },
  ],
} satisfies TrainingRecordQuestion

export const trainingRecordsFixture = {
  practice: {
    id: "training-practice",
    kind: "targetedPractice",
    status: "completed",
    startedAt: "2026-07-25T07:00:00.000Z",
    endedAt: "2026-07-25T07:10:00.000Z",
    durationSeconds: 600,
    targetRole: {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Senior Frontend Engineer",
      company: "ByteDance",
    },
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 84,
    setup: {
      questionType: "projectDeepDive",
      difficulty: "pressure",
      source: "personalized",
      prioritizedWeaknesses: true,
    },
    questions: [question],
    exposedWeaknesses: ["结果证据"],
    recommendation: {
      action: "mockInterview",
      reason: "可以进一步在连续问答中验证表达稳定性。",
      round: "technical",
      difficulty: "pressure",
      focusAreas: ["结果证据"],
    },
  },
  interview: {
    id: "training-interview",
    kind: "mockInterview",
    status: "completed",
    startedAt: "2026-07-24T07:00:00.000Z",
    endedAt: "2026-07-24T07:30:00.000Z",
    durationSeconds: 1800,
    targetRole: {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Product Manager",
      company: "Meituan",
    },
    answeredQuestionCount: 1,
    totalQuestionCount: 1,
    overallScore: 82,
    completionReason: "formalQuestionsCompleted",
    setup: { round: "firstBusiness", difficulty: "pressure", plannedDurationMinutes: 30 },
    questions: [
      {
        ...structuredClone(question),
        id: "interview-question",
        type: "businessUnderstanding",
        answer: {
          ...question.answer,
          id: "interview-answer",
          submittedAt: "2026-07-24T07:05:00.000Z",
        },
        evaluation: {
          ...structuredClone(question.evaluation),
          overallScore: 82,
          evaluatedAt: "2026-07-24T07:30:00.000Z",
        },
        referenceAnswer: structuredClone(reference),
        followUps: [
          {
            ...structuredClone(question.followUps[0]),
            id: "interview-follow-up",
            askedAt: "2026-07-24T07:06:00.000Z",
            answer: {
              ...question.followUps[0].answer,
              id: "interview-follow-up-answer",
              submittedAt: "2026-07-24T07:08:00.000Z",
            },
            evaluation: {
              ...structuredClone(question.followUps[0].evaluation),
              evaluatedAt: "2026-07-24T07:30:00.000Z",
            },
          },
        ],
      },
    ],
    exposedWeaknesses: ["结果证据"],
    recommendation: {
      action: "targetedPractice",
      reason: "继续练习如何组织结果证据。",
      questionType: "businessUnderstanding",
      difficulty: "pressure",
      focusAreas: ["结果证据"],
    },
    overallReview: {
      status: "complete",
      content: {
        summary: "表达清楚，能够结合业务目标说明关键行动。",
        mainStrengths: ["能够明确解释判断依据。"],
        frequentIssues: ["量化证据仍可加强。"],
        riskPoints: ["结论边界说明不足。"],
        communicationSuggestions: ["先给结论，再补充证据。"],
        preparationSuggestions: ["准备一个包含对照指标的案例。"],
        generatedAt: "2026-07-25T08:00:00.000Z",
      },
    },
    candidateQuestionExchanges: [
      {
        id: "candidate-question",
        question: "这个岗位入职后的主要成功标准是什么？",
        interviewerAnswer: "先熟悉核心业务，再独立推动一个可以衡量结果的项目。",
        feedback: "问题有助于明确岗位预期。",
        submittedAt: "2026-07-24T07:25:00.000Z",
      },
    ],
  },
  reference,
} satisfies {
  practice: TargetedPracticeRecordDetailResponse
  interview: MockInterviewRecordDetailResponse
  reference: ReadyReferenceAnswer
}
