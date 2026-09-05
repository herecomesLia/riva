import type { JobDescriptionAnalysis, MatchingAnalysisResult } from "@/models/roles"

type CreateJobDescriptionAnalysisFixtureInput = {
  analysisVersion?: number
  jobDescriptionVersion: number
  parsedAt: string
}

export function createJobDescriptionAnalysisFixture({
  analysisVersion = 1,
  jobDescriptionVersion,
  parsedAt,
}: CreateJobDescriptionAnalysisFixtureInput): JobDescriptionAnalysis {
  return {
    jobDescriptionVersion,
    analysisVersion,
    parsedAt,
    responsibilities: [
      "负责商家运营产品的前端架构与交付。",
      "与产品、设计和后端团队协作，推进复杂业务流程。",
    ],
    qualificationRequirements: {
      education: ["本科及以上"],
      graduationCohorts: [],
      majors: ["计算机或相关专业"],
      experience: ["五年以上前端工程经验"],
      languages: [],
      certifications: [],
      other: [],
    },
    requiredSkills: {
      programmingLanguages: ["TypeScript"],
      frameworksAndLibraries: ["React"],
      platforms: [],
      tools: [],
      conceptsAndMethods: ["前端架构", "性能优化"],
      databasesAndMiddleware: [],
      other: [],
    },
    preferredQualifications: ["有实验平台建设经验", "熟悉无障碍设计"],
    softSkills: ["技术领导力", "跨团队沟通"],
    businessDomains: ["商家运营", "电商平台"],
  }
}

export function createMatchingAnalysisResultFixture(): MatchingAnalysisResult {
  return {
    overallMatchScore: 78,
    coreRequirementsSummary:
      "Lead complex React product delivery with strong engineering judgment and measurable impact.",
    matchedCapabilities: ["React architecture", "TypeScript", "Design systems"],
    missingCapabilities: ["Large-scale experimentation"],
    underrepresentedCapabilities: ["Cross-functional technical leadership"],
    resumeHighlights: [
      "Led the merchant operations console from architecture through delivery.",
      "Improved Core Web Vitals pass rate from 71% to 94%.",
    ],
    resumeGaps: [
      "Describe experimentation design and decision-making with more concrete examples.",
    ],
    highRiskQuestions: [
      "How did you align partner teams when frontend architecture decisions affected delivery scope?",
      "Which experiment metrics did you use to decide whether a product change should ship?",
    ],
    preparationRecommendations: [
      "Prepare a STAR narrative about balancing delivery speed and frontend quality.",
      "Quantify the impact of technical leadership across partner teams.",
    ],
  }
}
