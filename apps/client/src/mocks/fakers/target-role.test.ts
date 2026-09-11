import { afterEach, describe, expect, it, vi } from "vitest"

import { createRoleFaker } from "@/mocks/fakers/target-role"
import {
  jdFailInput,
  jdFailReason,
  matchResultFixture,
  extractedJdFixture,
  roleListFixture,
  targetRoleFixture,
  textRoleFixture,
} from "@/mocks/fixtures/target-role"

describe("targetRoleFaker", () => {
  afterEach(() => vi.restoreAllMocks())
  it("keeps CRUD and active-role lifecycle state consistent", async () => {
    const faker = createRoleFaker({ targetRoles: [], activeTargetRoleId: null })

    const created = await faker.create({ title: "Staff Platform Engineer" })
    let state = await faker.list()
    expect(state.targetRoles[0]).toEqual(created)
    expect(state.activeTargetRoleId).toBeNull()

    await faker.setActive({ targetRoleId: created.id })
    await expect(faker.archive(created.id)).resolves.toMatchObject({ isArchived: true })
    expect((await faker.list()).activeTargetRoleId).toBeNull()

    await expect(faker.restore(created.id)).resolves.toMatchObject({ isArchived: false })
    await faker.setActive({ targetRoleId: created.id })
    await faker.delete(created.id)

    state = await faker.list()
    expect(state.targetRoles).not.toContainEqual(expect.objectContaining({ id: created.id }))
    expect(state.activeTargetRoleId).toBeNull()
  })

  it("rejects activation of an archived role without changing active state", async () => {
    const faker = createRoleFaker(roleListFixture)

    await faker.archive(targetRoleFixture.id)
    await expect(faker.setActive({ targetRoleId: targetRoleFixture.id })).rejects.toMatchObject({
      code: "resource.conflict",
    })

    const state = await faker.list()
    expect(state.activeTargetRoleId).toBeNull()
    expect(state.targetRoles.find(({ id }) => id === targetRoleFixture.id)?.isArchived).toBe(true)
  })

  it("patches role fields while replacing provided nested JD sections", async () => {
    const faker = createRoleFaker(roleListFixture)

    const updated = await faker.update(targetRoleFixture.id, { company: null })
    expect(updated).toMatchObject({
      company: null,
      location: targetRoleFixture.location,
      recruitmentTrack: targetRoleFixture.recruitmentTrack,
      title: targetRoleFixture.title,
    })

    const withUpdatedJd = await faker.updateJd(targetRoleFixture.id, {
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
      responsibilities: targetRoleFixture.jd.responsibilities,
      hardSkills: targetRoleFixture.jd.hardSkills,
      softSkills: targetRoleFixture.jd.softSkills,
      preferredQualifications: targetRoleFixture.jd.preferredQualifications,
      businessDomains: targetRoleFixture.jd.businessDomains,
    })
  })

  it("recognizes and creates a role with mock JD content", async () => {
    const faker = createRoleFaker(roleListFixture)
    const role = await faker.recognizeRole({ sourceType: "text", text: "Job posting" })
    expect(role).toMatchObject({ ...textRoleFixture, jd: extractedJdFixture })
    expect((await faker.list()).targetRoles).toContainEqual(role)
  })

  it("advances extraction by elapsed time and preserves JD when aborted", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createRoleFaker({ targetRoles: [], activeTargetRoleId: null })
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
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(role.jd)
    await faker.extractJd(role.id, { text: "Replacement JD" })
    now.mockReturnValue(3500)
    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(extractedJdFixture)
    await expect(faker.retryJdExtraction(role.id)).rejects.toMatchObject({
      code: "resource.conflict",
    })
  })

  it("keeps failure stable until retry or manual update", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    const faker = createRoleFaker(roleListFixture)
    await faker.extractJd(targetRoleFixture.id, { text: jdFailInput })
    now.mockReturnValue(2500)
    const failed = { status: "failed", error: { code: "invalid_output", message: jdFailReason } }
    await expect(faker.getJdExtractionState(targetRoleFixture.id)).resolves.toEqual(failed)
    await expect(faker.getJdExtractionState(targetRoleFixture.id)).resolves.toEqual(failed)
    expect(
      (await faker.list()).targetRoles.find(({ id }) => id === targetRoleFixture.id)?.jd,
    ).toEqual(targetRoleFixture.jd)
    await expect(faker.abortJdExtraction(targetRoleFixture.id)).rejects.toMatchObject({
      code: "resource.conflict",
    })
    await faker.retryJdExtraction(targetRoleFixture.id)
    await expect(faker.getJdExtractionState(targetRoleFixture.id)).resolves.toEqual({
      status: "queued",
      error: null,
    })
    now.mockReturnValue(5000)
    await expect(faker.getJdExtractionState(targetRoleFixture.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    await faker.extractJd(targetRoleFixture.id, { text: jdFailInput })
    now.mockReturnValue(7500)
    await faker.updateJd(targetRoleFixture.id, { softSkills: ["Manual correction"] })
    await expect(faker.getJdExtractionState(targetRoleFixture.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
  })

  it("advances a match from running to an idempotent fixed success", async () => {
    const faker = createRoleFaker(roleListFixture)

    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({ status: "none" })
    await expect(faker.match(targetRoleFixture.id)).resolves.toEqual({
      status: "generating",
    })

    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({ status: "generating" })
    const success = await faker.pollMatch(targetRoleFixture.id)
    expect(success).toEqual({ status: "current", result: matchResultFixture })
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual(success)
  })

  it("clears workflow state without deleting the formal role", async () => {
    const faker = createRoleFaker({ targetRoles: [], activeTargetRoleId: null })
    const role = await faker.create({ title: "Staff Platform Engineer" })
    await faker.extractJd(role.id, { text: "JD text" })
    await faker.match(role.id)

    await faker.clear(role.id)

    await expect(faker.getJdExtractionState(role.id)).resolves.toEqual({
      status: "idle",
      error: null,
    })
    await expect(faker.getMatch(role.id)).resolves.toEqual({ status: "none" })
    expect((await faker.list()).targetRoles).toContainEqual(role)
  })

  it("keeps a successful match stale across JD changes until regeneration", async () => {
    const faker = createRoleFaker(roleListFixture)
    await faker.match(targetRoleFixture.id)
    await faker.pollMatch(targetRoleFixture.id)

    await faker.updateJd(targetRoleFixture.id, { softSkills: ["Stakeholder management"] })
    await faker.staleMatch(targetRoleFixture.id)
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await expect(faker.match(targetRoleFixture.id)).resolves.toEqual({
      status: "generating",
    })
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "generating",
    })
    await expect(faker.pollMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "current",
      result: matchResultFixture,
    })

    await faker.extractJd(targetRoleFixture.id, { text: "Replacement JD" })
    await faker.staleMatch(targetRoleFixture.id)
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await faker.delete(targetRoleFixture.id)
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({ status: "none" })
  })
})
