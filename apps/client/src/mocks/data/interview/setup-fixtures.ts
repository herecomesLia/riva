import type {
  InterviewCandidateQuestionExchangeResponse,
  InterviewSetupResponse,
} from "@/models/interview"
import type { JobProfileSnapshot } from "@/models/profile"
import type { RolesPageResponse } from "@/models/roles"

import { profileResponseMock } from "../profile"
import { createRolesMockResponse } from "../roles"
import { supportedInterviewRoundsByTargetRoleId } from "./question-catalog"

export const interviewSetupConfigurationMock = {
  availableDifficulties: ["basic", "pressure"],
  availableDurationMinutes: [15, 30, 45],
  defaultRound: "technical",
  defaultDifficulty: "pressure",
  defaultDurationMinutes: 30,
  supportedRoundsByTargetRoleId: supportedInterviewRoundsByTargetRoleId,
} as const

export function createInterviewSetupResponseMock(
  rolesResponse: RolesPageResponse,
  profileSnapshot: JobProfileSnapshot,
): InterviewSetupResponse {
  const domainRoles = rolesResponse.roles.filter(({ status }) => status !== "archived")
  const trainableRoles = domainRoles.filter(
    ({ id, jobDescription }) =>
      id in interviewSetupConfigurationMock.supportedRoundsByTargetRoleId &&
      jobDescription.status === "ready",
  )
  const currentTrainableRole = trainableRoles.find(({ id }) => id === rolesResponse.currentRoleId)
  const defaultRole = currentTrainableRole ?? trainableRoles[0]
  const targetRoles = trainableRoles.map(({ company, id, title }) => ({
    id,
    title,
    company,
    supportedRounds: [
      ...interviewSetupConfigurationMock.supportedRoundsByTargetRoleId[
        id as keyof typeof interviewSetupConfigurationMock.supportedRoundsByTargetRoleId
      ],
    ] as InterviewSetupResponse["targetRoles"][number]["supportedRounds"],
  }))
  const defaultInterviewRole = targetRoles.find(({ id }) => id === defaultRole?.id)
  const defaultRound = defaultInterviewRole?.supportedRounds.includes(
    interviewSetupConfigurationMock.defaultRound,
  )
    ? interviewSetupConfigurationMock.defaultRound
    : (defaultInterviewRole?.supportedRounds[0] ?? interviewSetupConfigurationMock.defaultRound)
  const profileComplete =
    profileSnapshot.profile?.status === "active" &&
    profileSnapshot.profile.completeness.percentage === 100
  const availability: InterviewSetupResponse["availability"] =
    !profileComplete && domainRoles.length > 0
      ? { status: "blocked", reason: "profileIncomplete" }
      : domainRoles.length > 0 && targetRoles.length === 0
        ? { status: "blocked", reason: "jobDescriptionMissing" }
        : { status: "available" }

  return structuredClone({
    availability,
    availableDifficulties: [...interviewSetupConfigurationMock.availableDifficulties],
    availableDurationMinutes: [...interviewSetupConfigurationMock.availableDurationMinutes],
    targetRoles,
    defaultConfiguration: {
      targetRoleId: defaultRole?.id ?? null,
      round: defaultRound,
      difficulty: interviewSetupConfigurationMock.defaultDifficulty,
      durationMinutes: interviewSetupConfigurationMock.defaultDurationMinutes,
    },
  })
}

export const interviewSetupResponseMock = createInterviewSetupResponseMock(
  createRolesMockResponse("multipleRoles"),
  profileResponseMock,
)

export const interviewOpeningMessageMock =
  "你好，我是本次模拟面试的面试官。接下来会围绕岗位经历、项目能力和求职动机连续提问，请尽量像正式面试一样作答。"

export const candidateQuestionsPromptMock = "正式提问已经结束。现在请你以候选人身份向面试官提问。"

export function createCandidateQuestionExchange(
  content: string,
  order: number,
): InterviewCandidateQuestionExchangeResponse {
  return {
    question: {
      id: `candidate-question-${order}`,
      content,
      submittedAt: `2026-07-24T02:${String(10 + order).padStart(2, "0")}:00.000Z`,
    },
    interviewerAnswer:
      "这个岗位会与推荐、搜索和交易团队长期协作。入职后的首要目标是熟悉核心链路，并逐步承担跨团队技术项目。",
    feedback: {
      summary: "问题聚焦岗位协作和入职目标，能够帮助候选人判断实际工作边界。",
      strengths: ["关注真实职责", "体现长期投入意愿"],
      improvementSuggestions: ["可以进一步询问前六个月的具体成功标准"],
      suggestedAlternatives: ["这个岗位入职六个月后，团队通常用哪些结果判断工作是否达到预期？"],
    },
  }
}
