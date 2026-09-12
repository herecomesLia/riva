import type {
  CreateTargetRoleRequest,
  JobDescriptionResponse,
  TargetRoleListResponse,
  TargetRoleResponse,
} from "@/api/generated/models"
import type { MatchingAnalysisResult } from "@/mocks/models/role"

export const jdFailInput = "__RIVA_MOCK_JD_EXTRACTION_FAILURE__"

export const jdFailReason = "Unable to complete the task."

export const textRoleFixture = {
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const imageRoleFixture = {
  title: "Frontend Engineer",
  company: "Riva Technology",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const urlRoleFixture = {
  title: "Product Manager",
  company: "Meituan",
  recruitmentTrack: "experienced",
  location: "Beijing",
} satisfies CreateTargetRoleRequest

export const extractedJdFixture = {
  responsibilities: [
    "Lead frontend architecture for merchant operations products.",
    "Partner with product and design teams to deliver accessible experiences.",
  ],
  requirements: {
    education: ["Bachelor's degree or above."],
    graduationCohorts: [],
    majors: ["Computer Science or a related field."],
    experience: ["Five years of frontend engineering experience."],
    languages: ["Professional working proficiency in English."],
    certifications: [],
  },
  hardSkills: {
    programmingLanguages: ["TypeScript"],
    frameworksAndLibraries: ["React"],
    platforms: ["Web"],
    tools: ["Vite"],
    conceptsAndMethods: ["Frontend architecture", "Accessibility"],
    databasesAndMiddleware: [],
    other: [],
  },
  softSkills: ["Cross-functional collaboration", "Technical leadership"],
  preferredQualifications: ["Experience with large-scale SaaS products."],
  businessDomains: ["Merchant operations"],
} satisfies JobDescriptionResponse

export const matchResultFixture = {
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
  resumeGaps: ["Describe experimentation design and decision-making with more concrete examples."],
  highRiskQuestions: [
    "How did you align partner teams when frontend architecture decisions affected delivery scope?",
    "Which experiment metrics did you use to decide whether a product change should ship?",
  ],
  preparationRecommendations: [
    "Prepare a STAR narrative about balancing delivery speed and frontend quality.",
    "Quantify the impact of technical leadership across partner teams.",
  ],
} satisfies MatchingAnalysisResult

export const targetRoleFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
  isArchived: false,
  jd: extractedJdFixture,
  createdAt: "2026-07-15T08:00:00Z",
  updatedAt: "2026-07-15T08:00:00Z",
} satisfies TargetRoleResponse

export const secondaryRoleFixture = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Product Manager",
  company: "Meituan",
  recruitmentTrack: "experienced",
  location: "Beijing",
  isArchived: false,
  jd: {
    responsibilities: [],
    requirements: {
      education: [],
      graduationCohorts: [],
      majors: [],
      experience: [],
      languages: [],
      certifications: [],
    },
    hardSkills: {
      programmingLanguages: [],
      frameworksAndLibraries: [],
      platforms: [],
      tools: [],
      conceptsAndMethods: [],
      databasesAndMiddleware: [],
      other: [],
    },
    softSkills: [],
    preferredQualifications: [],
    businessDomains: [],
  },
  createdAt: "2026-07-01T08:00:00Z",
  updatedAt: "2026-07-01T08:00:00Z",
} satisfies TargetRoleResponse

export const roleListFixture = {
  targetRoles: [targetRoleFixture, secondaryRoleFixture],
  activeTargetRoleId: targetRoleFixture.id,
} satisfies TargetRoleListResponse
