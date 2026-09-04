import type {
  CreateTargetRoleRequest,
  JobDescriptionResponse,
  TargetRoleListResponse,
  TargetRoleResponse,
} from "@/api/generated/models"

export const jobDescriptionParsingFailureInput = "__RIVA_MOCK_JD_PARSING_FAILURE__"

export const jobDescriptionParsingFailureReason =
  "We could not extract structured requirements from this JD."

export const textRecognitionFixture = {
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const imageRecognitionFixture = {
  title: "Frontend Engineer",
  company: "Riva Technology",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const urlRecognitionFixture = {
  title: "Product Manager",
  company: "Meituan",
  recruitmentTrack: "experienced",
  location: "Beijing",
} satisfies CreateTargetRoleRequest

export const parsedJobDescriptionFixture = {
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
    other: [],
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

export const targetRoleFixture = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
  isArchived: false,
  jd: parsedJobDescriptionFixture,
  createdAt: "2026-07-15T08:00:00Z",
  updatedAt: "2026-07-15T08:00:00Z",
} satisfies TargetRoleResponse

export const secondaryTargetRoleFixture = {
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
      other: [],
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

export const targetRoleListFixture = {
  targetRoles: [targetRoleFixture, secondaryTargetRoleFixture],
  activeTargetRoleId: targetRoleFixture.id,
} satisfies TargetRoleListResponse
