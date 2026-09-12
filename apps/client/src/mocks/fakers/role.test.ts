import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createRoleFaker } from "@/mocks/fakers/role"
import {
  jdFailInput,
  jdFailReason,
  matchResultFixture,
  extractedJdFixture,
  roleListFixture,
  roleFixture,
  textRoleFixture,
} from "@/mocks/fixtures/role"

const careerProfileApi = vi.hoisted(() => ({ getCareerProfile: vi.fn() }))
const rolesApi = vi.hoisted(() => ({
  listRoles: vi.fn(),
  getJdExtractionState: vi.fn(),
}))

vi.mock("@/api/generated/endpoints/roles/roles", () => ({
  getRolesApi: () => rolesApi,
}))
vi.mock("@/api/generated/endpoints/career-profile/career-profile", () => ({
  getCareerProfileApi: () => careerProfileApi,
}))

function createFaker(initial: Parameters<typeof createRoleFaker>[0]) {
  const faker = createRoleFaker(initial)
  vi.mocked(rolesApi.listRoles).mockImplementation(faker.list)
  vi.mocked(rolesApi.getJdExtractionState).mockImplementation(faker.getJdExtractionState)
  vi.mocked(careerProfileApi.getCareerProfile).mockResolvedValue(careerProfileFixture)
  return faker
}

describe("roleFaker", () => {
  afterEach(() => vi.restoreAllMocks())
  it("keeps CRUD and active-role lifecycle state consistent", async () => {
    const faker = createFaker({ roles: [], activeRoleId: null })

    const created = await faker.create({ title: "Staff Platform Engineer" })
    let state = await faker.list()
    expect(state.roles[0]).toEqual(created)
    expect(state.activeRoleId).toBeNull()

    await faker.setActive({ roleId: created.id })
    await expect(faker.archive(created.id)).resolves.toMatchObject({ isArchived: true })
    expect((await faker.list()).activeRoleId).toBeNull()

    await expect(faker.restore(created.id)).resolves.toMatchObject({ isArchived: false })
    await faker.setActive({ roleId: created.id })
    await faker.delete(created.id)

    state = await faker.list()
    expect(state.roles).not.toContainEqual(expect.objectContaining({ id: created.id }))
    expect(state.activeRoleId).toBeNull()
  })

  it("rejects activation of an archived role without changing active state", async () => {
    const faker = createFaker(roleListFixture)

    await faker.archive(roleFixture.id)
    await expect(faker.setActive({ roleId: roleFixture.id })).rejects.toMatchObject({
      code: "resource.conflict",
    })

    const state = await faker.list()
    expect(state.activeRoleId).toBeNull()
    expect(state.roles.find(({ id }) => id === roleFixture.id)?.isArchived).toBe(true)
  })

  it("patches role fields while replacing provided nested JD sections", async () => {
    const faker = createFaker(roleListFixture)

    const updated = await faker.update(roleFixture.id, { company: null })
    expect(updated).toMatchObject({
      company: null,
      location: roleFixture.location,
      recruitmentTrack: roleFixture.recruitmentTrack,
      title: roleFixture.title,
    })

    const withUpdatedJd = await faker.updateJd(roleFixture.id, {
      requirements: { experience: ["Three years"] },
    })
    expect(withUpdatedJd.jd.requirements).toEqual({
      education: [],
      graduationCohorts: [],
      majors: [],
      experience: ["Three years"],
      languages: [],
      certifications: [],
    })
    expect(withUpdatedJd.jd).toMatchObject({
      responsibilities: roleFixture.jd.responsibilities,
      hardSkills: roleFixture.jd.hardSkills,
      softSkills: roleFixture.jd.softSkills,
      preferredQualifications: roleFixture.jd.preferredQualifications,
      businessDomains: roleFixture.jd.businessDomains,
    })
  })

  it("recognizes and creates a role with mock JD content", async () => {
    const faker = createFaker(roleListFixture)
    const role = await faker.recognizeRole({ sourceType: "text", text: "Job posting" })
    expect(role).toMatchObject({ ...textRoleFixture, jd: extractedJdFixture })
    expect((await faker.list()).roles).toContainEqual(role)
  })

  it("advances extraction by elapsed time and preserves JD when aborted", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createFaker({ roles: [], activeRoleId: null })
    const role = await faker.create({ title: "Staff Platform Engineer" })
    await faker.extractJd(role.id, { text: "JD text" })
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "queued",
      error: null,
    })
    await expect(faker.updateJd(role.id, { responsibilities: [] })).rejects.toMatchObject({
      code: "resource.conflict",
    })
    now.mockReturnValue(500)
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "running",
      error: null,
    })
    await faker.abortJdExtraction(role.id)
    await faker.abortJdExtraction(role.id)
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "aborting",
      error: null,
    })
    now.mockReturnValue(1000)
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    expect((await faker.list()).roles[0]?.jd).toEqual(role.jd)
    await faker.extractJd(role.id, { text: "Replacement JD" })
    now.mockReturnValue(3500)
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    expect((await faker.list()).roles[0]?.jd).toEqual(extractedJdFixture)
    await expect(faker.retryJdExtraction(role.id)).rejects.toMatchObject({
      code: "resource.conflict",
    })
  })

  it("keeps failure stable until retry or manual update", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createFaker(roleListFixture)
    await faker.extractJd(roleFixture.id, { text: jdFailInput })
    now.mockReturnValue(2500)
    const failed = { status: "failed", error: { code: "invalid_output", message: jdFailReason } }
    await expect(faker.getJdExtractionState(roleFixture.id)).resolves.toEqual(failed)
    await expect(faker.getJdExtractionState(roleFixture.id)).resolves.toEqual(failed)
    expect((await faker.list()).roles.find(({ id }) => id === roleFixture.id)?.jd).toEqual(
      roleFixture.jd,
    )
    await expect(faker.abortJdExtraction(roleFixture.id)).rejects.toMatchObject({
      code: "resource.conflict",
    })
    await faker.retryJdExtraction(roleFixture.id)
    await expect(faker.getJdExtractionState(roleFixture.id)).resolves.toEqual({
      status: "queued",
      error: null,
    })
    now.mockReturnValue(5000)
    await expect(faker.getJdExtractionState(roleFixture.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    await faker.extractJd(roleFixture.id, { text: jdFailInput })
    now.mockReturnValue(7500)
    await faker.updateJd(roleFixture.id, { softSkills: ["Manual correction"] })
    await expect(faker.getJdExtractionState(roleFixture.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
  })

  it("advances a match from running to an idempotent fixed success", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createFaker(roleListFixture)

    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({ status: "none" })
    await expect(faker.match(roleFixture.id)).resolves.toEqual({
      status: "generating",
    })

    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({ status: "generating" })
    now.mockReturnValue(1000)
    const success = await faker.getMatch(roleFixture.id)
    expect(success).toEqual({ status: "current", result: matchResultFixture })
    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual(success)
  })

  it("clears workflow state without deleting the formal role", async () => {
    const faker = createFaker({ roles: [], activeRoleId: null })
    const role = await faker.create({ title: "Staff Platform Engineer" })
    await faker.extractJd(role.id, { text: "JD text" })
    await faker.match(role.id)

    await faker.clear(role.id)

    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    await expect(faker.getMatch(role.id)).resolves.toEqual({
      status: "blocked",
      reason: "jobDescriptionMissing",
    })
    expect((await faker.list()).roles).toContainEqual(role)
  })

  it("keeps a successful match stale across JD changes until regeneration", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createFaker(roleListFixture)
    await faker.match(roleFixture.id)
    now.mockReturnValue(1000)
    await faker.getMatch(roleFixture.id)

    await faker.updateJd(roleFixture.id, { softSkills: ["Stakeholder management"] })
    await faker.staleMatch(roleFixture.id)
    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await expect(faker.match(roleFixture.id)).resolves.toEqual({
      status: "generating",
    })
    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({
      status: "generating",
    })
    now.mockReturnValue(2000)
    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({
      status: "current",
      result: matchResultFixture,
    })

    await faker.extractJd(roleFixture.id, { text: "Replacement JD" })
    await faker.staleMatch(roleFixture.id)
    await expect(faker.getMatch(roleFixture.id)).resolves.toEqual({
      status: "blocked",
      reason: "jobDescriptionExtracting",
      result: matchResultFixture,
    })

    await faker.delete(roleFixture.id)
    await expect(faker.getMatch(roleFixture.id)).rejects.toMatchObject({
      code: "resource.not_found",
    })
  })
})
