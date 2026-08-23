import type { ResumeImportDraft } from "@/models/profile"
import { resumeImportDraftSchema } from "@/schemas/profile"

export type ResumeDraftStoryScenario =
  | "firstImport"
  | "explicitSummary"
  | "existingProfile"
  | "protected"
  | "skippedAndUnresolved"
  | "minimal"

const ids = {
  baseProfile: "10000000-0000-4000-8000-000000000001",
  education: "20000000-0000-4000-8000-000000000001",
  protectedSkill: "30000000-0000-4000-8000-000000000099",
  project: "40000000-0000-4000-8000-000000000001",
  resume: "50000000-0000-4000-8000-000000000001",
  skillReact: "30000000-0000-4000-8000-000000000001",
  skillTypeScript: "30000000-0000-4000-8000-000000000002",
  skillAccessibility: "30000000-0000-4000-8000-000000000003",
  work: "70000000-0000-4000-8000-000000000001",
} as const

const richDraft = {
  appliedAt: null,
  appliedProfileVersion: null,
  baseProfileId: null,
  baseProfileVersion: null,
  canApply: true,
  changeSummary: { changedItems: 0, missingItems: 0, newItems: 7 },
  createdAt: "2026-08-07T08:00:00+08:00",
  draftVersion: 1,
  education: [
    {
      degree: "Bachelor of Engineering",
      endDate: "2020-06",
      id: ids.education,
      isCurrent: false,
      major: "Computer Science",
      school: "Fudan University",
      startDate: "2016-09",
    },
  ],
  parsingResultVersion: 1,
  projectExperiences: [
    {
      achievements: ["Improved task completion by 24%."],
      endDate: null,
      id: ids.project,
      name: "Accessible Career Workspace",
      projectUrl: "https://example.com/career-workspace",
      responsibilities: ["Designed the profile review experience."],
      role: "Frontend Lead",
      skillIds: [ids.skillReact, ids.skillAccessibility],
      startDate: "2024-03",
    },
  ],
  protectedItems: [],
  resumeDocumentId: ids.resume,
  skippedItems: [],
  skills: [
    { id: ids.skillReact, name: "React" },
    { id: ids.skillTypeScript, name: "TypeScript" },
    { id: ids.skillAccessibility, name: "Web Accessibility" },
  ],
  status: "ready",
  summary: null,
  summaryAction: "none",
  unresolvedItems: [],
  updatedAt: "2026-08-07T08:01:00+08:00",
  workExperiences: [
    {
      achievements: ["Reduced profile editing errors by 35%."],
      company: "Riva Labs",
      employmentType: "fullTime",
      endDate: null,
      id: ids.work,
      isCurrent: true,
      location: "Shanghai",
      responsibilities: ["Built accessible profile and resume workflows."],
      skillIds: [ids.skillReact, ids.skillTypeScript],
      startDate: "2022-07",
      title: "Senior Frontend Engineer",
    },
  ],
}

export function createResumeDraftStoryFixture(
  scenario: ResumeDraftStoryScenario,
): ResumeImportDraft {
  if (scenario === "firstImport") {
    return resumeImportDraftSchema.parse(richDraft)
  }

  if (scenario === "minimal") {
    return resumeImportDraftSchema.parse({
      ...richDraft,
      changeSummary: { changedItems: 0, missingItems: 0, newItems: 0 },
      education: [],
      projectExperiences: [],
      skills: [],
      summary: null,
      summaryAction: "none",
      workExperiences: [],
    })
  }

  if (scenario === "explicitSummary") {
    return resumeImportDraftSchema.parse({
      ...richDraft,
      summary:
        "Frontend engineer focused on accessible product experiences and maintainable design systems.",
      summaryAction: "set",
    })
  }

  const existingDraft = {
    ...richDraft,
    baseProfileId: ids.baseProfile,
    baseProfileVersion: 4,
    changeSummary: { changedItems: 3, missingItems: 2, newItems: 2 },
    draftVersion: 2,
    summary:
      "Detected resume summary shown only as a reference because the current summary is protected.",
    summaryAction: "preserve",
  }

  if (scenario === "existingProfile") {
    return resumeImportDraftSchema.parse(existingDraft)
  }

  if (scenario === "protected") {
    return resumeImportDraftSchema.parse({
      ...existingDraft,
      protectedItems: [
        { itemId: ids.education, section: "education", source: "userEdited" },
        { itemId: ids.work, section: "workExperience", source: "userAdded" },
        { itemId: ids.project, section: "projectExperience", source: "userEdited" },
        { itemId: ids.protectedSkill, section: "skills", source: "userAdded" },
      ],
    })
  }

  return resumeImportDraftSchema.parse({
    ...existingDraft,
    skippedItems: [
      {
        reasons: [
          "start_date_missing",
          "start_date_precision_insufficient",
          "end_date_missing",
          "end_date_precision_insufficient",
          "current_status_unknown",
          "employment_type_unknown",
          "profile_schema_invalid",
        ],
        section: "workExperience",
        sourceIndex: 0,
      },
    ],
    unresolvedItems: [
      "Confirm whether the consulting engagement was full-time.",
      "Review <strong>unverified leadership scope</strong> before importing.",
    ],
  })
}
