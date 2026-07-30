import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import type {
  CareerProfileDto,
  CareerProfilePutRequestDto,
  EducationExperience,
  WorkExperience,
} from "@/models/profile"
import {
  createManualJobProfile,
  getJobProfile,
  profileCapabilities,
  saveProfileSection,
} from "@/services/profile"
import { ApiError } from "@/services/api"

const profileId = "55555555-5555-4555-8555-555555555555"
const educationId = "11111111-1111-4111-8111-111111111111"
const workId = "22222222-2222-4222-8222-222222222222"
const projectId = "33333333-3333-4333-8333-333333333333"
const skillId = "44444444-4444-4444-8444-444444444444"

function createCareerProfile(version = 3): CareerProfileDto {
  return {
    education: [
      {
        degree: "Master",
        endDate: "2021-06",
        id: educationId,
        isCurrent: false,
        major: "Software Engineering",
        school: "Tongji University",
        source: "resumeExtracted",
        startDate: "2018-09",
      },
    ],
    profileId,
    projectExperiences: [
      {
        achievements: ["Released successfully"],
        endDate: null,
        id: projectId,
        name: "Career Profile",
        projectUrl: "https://example.com/profile",
        responsibilities: ["Designed the API"],
        role: "Developer",
        skillIds: [skillId],
        source: "userAdded",
        startDate: "2026-07",
      },
    ],
    skills: [{ id: skillId, name: "Python", source: "userAdded" }],
    summary: "Backend engineer",
    updatedAt: "2026-07-29T08:30:00Z",
    version,
    workExperiences: [
      {
        achievements: [],
        company: "Riva",
        employmentType: "fullTime",
        endDate: null,
        id: workId,
        isCurrent: true,
        location: "Shanghai",
        responsibilities: ["Build APIs"],
        skillIds: [skillId],
        source: "userEdited",
        startDate: "2021-07",
        title: "Backend Engineer",
      },
    ],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  })
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>, callIndex: number) {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body

  if (typeof body !== "string") {
    throw new TypeError("Expected a serialized JSON request body.")
  }

  return JSON.parse(body) as CareerProfilePutRequestDto
}

describe("profile service API", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("maps a missing profile envelope to the existing no-profile snapshot", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: null }))

    await expect(getJobProfile()).resolves.toEqual({
      matchingAnalysis: null,
      profile: null,
      recognition: null,
      resumeUpdate: null,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/profile")
  })

  it("maps the complete CareerProfile without inventing unsupported data", async () => {
    const careerProfile = createCareerProfile()
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: careerProfile }))

    const snapshot = await getJobProfile()

    expect(snapshot).toMatchObject({
      matchingAnalysis: null,
      profile: {
        completeness: { missingSections: [], percentage: 100 },
        credentials: [],
        matchingAnalysisStale: false,
        profileId,
        resume: null,
        summary: "Backend engineer",
        targetRoles: [],
        updatedAt: careerProfile.updatedAt,
        version: 3,
      },
      recognition: null,
      resumeUpdate: null,
    })
    expect(snapshot.profile?.education[0]?.source).toBe("resumeExtracted")
    expect(snapshot.profile?.workExperiences[0]?.source).toBe("userEdited")
    expect("source" in snapshot.profile!).toBe(false)
    expect(profileCapabilities).toEqual({
      credentials: false,
      matchingAnalysis: false,
      resumeImport: false,
      resumeRecognition: false,
      resumeUpdate: false,
      targetRoles: false,
    })
  })

  it("creates an empty manual profile with version null", async () => {
    const created = {
      ...createCareerProfile(1),
      education: [],
      projectExperiences: [],
      skills: [],
      summary: null,
      workExperiences: [],
    }
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: created }))

    const snapshot = await createManualJobProfile()

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/profile")
    expect(requestBody(fetchMock, 0)).toEqual({
      education: [],
      projectExperiences: [],
      skills: [],
      summary: null,
      version: null,
      workExperiences: [],
    })
    expect(snapshot.profile).toMatchObject({
      completeness: {
        missingSections: ["education", "workExperience", "projectExperience", "skills"],
        percentage: 0,
      },
      summary: null,
      version: 1,
    })
  })

  it("merges an edited section into a complete PUT and preserves summary and other sections", async () => {
    const current = createCareerProfile()
    const saved = createCareerProfile(4)
    saved.education[0] = { ...saved.education[0]!, school: "Updated University" }
    const education: EducationExperience[] = [
      {
        ...current.education[0]!,
        school: "Updated University",
      },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ profile: current }))
      .mockResolvedValueOnce(jsonResponse({ profile: saved }))

    const snapshot = await saveProfileSection({
      profileId,
      section: "education",
      values: education,
      version: 3,
    })
    const body = requestBody(fetchMock, 1)

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/profile", "/api/profile"])
    expect(body.education[0]?.school).toBe("Updated University")
    expect(body.workExperiences).toEqual(
      current.workExperiences.map(({ source: _source, ...item }) => item),
    )
    expect(body.projectExperiences).toEqual(
      current.projectExperiences.map(({ source: _source, ...item }) => item),
    )
    expect(body.skills).toEqual(current.skills.map(({ source: _source, ...item }) => item))
    expect(body.summary).toBe("Backend engineer")
    expect(body.version).toBe(3)
    expect(JSON.stringify(body)).not.toContain("source")
    expect(snapshot.profile?.version).toBe(4)
  })

  it("remaps draft record and skill UUIDs together", async () => {
    const current = createCareerProfile()
    const draftWorkUuid = "66666666-6666-4666-8666-666666666666"
    const draftSkillUuid = "77777777-7777-4777-8777-777777777777"
    const values: WorkExperience[] = [
      {
        achievements: [],
        company: "New Company",
        employmentType: "contract",
        endDate: "2026-07",
        id: `draft_${draftWorkUuid}`,
        isCurrent: false,
        location: null,
        responsibilities: ["Built a feature"],
        skillIds: [`draft_skill_${draftSkillUuid}`],
        source: "userAdded",
        startDate: "2026-06",
        title: "Consultant",
      },
    ]
    const saved = createCareerProfile(4)
    saved.skills.push({ id: draftSkillUuid, name: "TypeScript", source: "userAdded" })
    saved.workExperiences = [
      {
        ...values[0]!,
        id: draftWorkUuid,
        skillIds: [draftSkillUuid],
        startDate: values[0]!.startDate!,
      },
    ]
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ profile: current }))
      .mockResolvedValueOnce(jsonResponse({ profile: saved }))

    await saveProfileSection({
      profileId,
      section: "workExperience",
      skillsToCreate: [
        {
          clientId: `draft_skill_${draftSkillUuid}`,
          name: "TypeScript",
        },
      ],
      values,
      version: 3,
    })
    const body = requestBody(fetchMock, 1)

    expect(body.workExperiences[0]).toMatchObject({
      id: draftWorkUuid,
      skillIds: [draftSkillUuid],
    })
    expect(body.skills).toContainEqual({
      id: draftSkillUuid,
      name: "TypeScript",
    })
  })

  it("rejects arbitrary record IDs before sending a PUT", async () => {
    const current = createCareerProfile()
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: current }))

    await expect(
      saveProfileSection({
        profileId,
        section: "education",
        values: [{ ...current.education[0]!, id: "draft_not-a-uuid" }],
        version: 3,
      }),
    ).rejects.toBeInstanceOf(TypeError)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("preserves a structured server version conflict", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ profile: createCareerProfile() }))
      .mockResolvedValueOnce(jsonResponse({ error: "profile_version_conflict" }, 409))

    const error = await saveProfileSection({
      profileId,
      section: "skills",
      values: createCareerProfile().skills,
      version: 3,
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: "profile_version_conflict",
      status: 409,
    })
  })

  it("does not swallow authentication errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not_authenticated" }, 401))

    await expect(getJobProfile()).rejects.toMatchObject({
      code: "not_authenticated",
      status: 401,
    })
  })

  it("rejects invalid server responses", async () => {
    const invalid = createCareerProfile()
    invalid.profileId = "not-a-uuid"
    fetchMock.mockResolvedValueOnce(jsonResponse({ profile: invalid }))

    await expect(getJobProfile()).rejects.toBeInstanceOf(ZodError)
  })
})
