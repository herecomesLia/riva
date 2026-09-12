import type {
  CreateRoleRequest,
  JobDescriptionResponse,
  RoleListResponse,
  RoleResponse,
} from "@/api/generated/models"
import type { MatchingAnalysisResult } from "@/mocks/models/role"

export const jdFailInput = "__RIVA_MOCK_JD_EXTRACTION_FAILURE__"

export const jdFailReason = "Unable to complete the task."

export const textRoleFixture = {
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateRoleRequest

export const imageRoleFixture = {
  title: "Frontend Engineer",
  company: "Riva Technology",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateRoleRequest

export const urlRoleFixture = {
  title: "Product Manager",
  company: "Meituan",
  recruitmentTrack: "experienced",
  location: "Beijing",
} satisfies CreateRoleRequest

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
  coreRequirements:
    "Lead complex React product delivery with strong engineering judgment and measurable impact.",
  resumeStrengths: [
    "React architecture experience aligns closely with the role's frontend delivery responsibilities.",
    "Production TypeScript experience meets the role's core programming language requirement.",
  ],
  resumeGaps: [
    "The resume provides insufficient evidence of accessibility practices required by the role.",
    "The resume does not demonstrate experience with large-scale SaaS products, a preferred qualification.",
  ],
  resumeOptimizationSuggestions: [
    "Describe any accessibility work actually performed on the merchant operations console, including validation methods and outcomes.",
    "Add verifiable user scale and architecture details to existing projects to clarify their relevance to large-scale SaaS delivery.",
  ],
  interviewPreparationSuggestions: [
    "Review accessibility principles and prepare to discuss how you would validate an accessible React experience.",
    "Prepare to explain frontend architecture trade-offs for large-scale SaaS products using your existing project experience.",
  ],
} satisfies MatchingAnalysisResult

export const roleFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
  isArchived: false,
  jd: extractedJdFixture,
  createdAt: "2026-07-15T08:00:00Z",
  updatedAt: "2026-07-15T08:00:00Z",
} satisfies RoleResponse

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
} satisfies RoleResponse

export const roleListFixture = {
  roles: [roleFixture, secondaryRoleFixture],
  activeRoleId: roleFixture.id,
} satisfies RoleListResponse
