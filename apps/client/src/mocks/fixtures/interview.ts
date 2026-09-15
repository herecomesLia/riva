import type {
  CandidateQuestionExchange,
  CompleteInterviewReview,
} from "@/models/interview-workflow"

const questionPrompt = "请结合一个真实经历，说明你如何分析问题、做出关键判断并推动结果落地。"
const followUpPrompt = "你如何确认最终结果主要来自你的关键行动，而不是其他同时发生的变化？"

export const interviewFixture = {
  sessionId: "interview-session",
  configuration: {
    roleId: "role_frontend",
    interviewType: "professional",
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
    content: questionPrompt,
  },
  followUp: {
    kind: "followUp",
    questionOrder: 1,
    content: followUpPrompt,
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
  review: {
    status: "complete",
    review: {
      overallScore: 82,
      overallPerformance: "回答能够清楚说明关键行动，可以进一步加强结果证据和结论边界。",
      dimensionScores: [
        { dimension: "relevance", score: 84, explanation: "回答基本围绕问题展开。" },
      ],
      mainStrengths: ["能够明确说明自己的关键行动。"],
      frequentIssues: ["结果验证依据还可以更具体。"],
      exposedWeaknesses: ["量化证据"],
      riskPoints: ["对其他影响因素说明不足。"],
      communicationSuggestions: ["先给结论，再补充关键过程。"],
      preparationSuggestions: ["准备一组能够量化结果的项目案例。"],
      nextTraining: {
        action: "targetedPractice",
        reason: "继续针对结果验证能力进行练习。",
        focusAreas: ["结果验证"],
      },
    },
    questionDetails: [
      {
        questionOrder: 1,
        prompt: questionPrompt,
        answer: null,
        performance: {
          score: 82,
          summary: "主回答结构清楚，但结果证据仍可加强。",
          strengths: ["关键行动明确。"],
          issues: ["结果证据偏少。"],
        },
        referenceAnswer: {
          status: "ready",
          content: {
            recommendedStructure: ["背景、判断、行动、结果"],
            keyPoints: ["突出个人关键决策"],
            exampleAnswer:
              "我先明确业务目标和约束，比较方案后推动小范围验证，再根据结果决定推广范围。",
            usageGuidance: "重点参考回答结构和证据组织方式。",
          },
        },
        followUps: [
          {
            prompt: followUpPrompt,
            answer: null,
            performance: {
              score: 80,
              summary: "能够意识到归因问题，可以进一步补充对照依据。",
              strengths: ["考虑了干扰因素。"],
              issues: ["缺少更明确的验证方法。"],
            },
            referenceAnswer: {
              status: "ready",
              content: {
                recommendedStructure: ["验证方法、证据、结论边界"],
                keyPoints: ["说明如何排除其他变量"],
                exampleAnswer:
                  "我会比较实验组与对照组，检查同期变化，并说明现有证据能够支持的结论范围。",
                usageGuidance: "重点关注结果归因方式。",
              },
            },
          },
        ],
      },
    ],
  } satisfies CompleteInterviewReview,
} as const
