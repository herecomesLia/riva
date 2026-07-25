import { trainingRecordDetailsMock } from "@/mocks/data/training-records"
import { deriveDashboardTrainingData } from "@/mocks/derivations/dashboard-training"
import type { DashboardResponse } from "@/models/dashboard"

const training = deriveDashboardTrainingData(trainingRecordDetailsMock)

export const dashboardResponseMock: DashboardResponse = {
  currentRole: {
    id: "role_frontend_bytedance",
    title: "Frontend Engineer",
    company: "ByteDance",
    recruitmentType: "experienced",
    location: "Shanghai",
    experienceYears: {
      min: 3,
      max: 5,
    },
    profileCompleted: true,
    jobDescriptionAdded: false,
  },
  recommendation: training.recommendation,
  metrics: {
    roleFit: {
      currentValue: 76,
      previousValue: null,
    },
    ...training.metrics,
  },
  performanceTrend: training.performanceTrend,
  weaknesses: training.weaknesses,
}
