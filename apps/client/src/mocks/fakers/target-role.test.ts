import { describe, expect, it } from "vitest"

import { createRoleFaker } from "@/mocks/fakers/target-role"
import {
  imageRoleFixture,
  jdFailInput,
  jdFailReason,
  matchResultFixture,
  parsedJdFixture,
  roleListFixture,
  targetRoleFixture,
  textRoleFixture,
  urlRoleFixture,
} from "@/mocks/fixtures/target-role"

describe("targetRoleFaker", () => {
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
      other: [],
    })
    expect(withUpdatedJd.jd).toMatchObject({
      responsibilities: targetRoleFixture.jd.responsibilities,
      hardSkills: targetRoleFixture.jd.hardSkills,
      softSkills: targetRoleFixture.jd.softSkills,
      preferredQualifications: targetRoleFixture.jd.preferredQualifications,
      businessDomains: targetRoleFixture.jd.businessDomains,
    })
  })

  it.each([
    ["text", { sourceType: "text" as const, text: "A job posting" }, textRoleFixture],
    [
      "image",
      { sourceType: "image" as const, images: [new File(["posting"], "posting.png")] },
      imageRoleFixture,
    ],
    ["url", { sourceType: "url" as const, url: "https://example.com/jobs/1" }, urlRoleFixture],
  ])(
    "recognizes a %s source into fixed create input without changing role state",
    async (_sourceType, input, fixture) => {
      const faker = createRoleFaker(roleListFixture)

      const recognized = await faker.recognize(input)
      const state = await faker.list()

      expect(recognized).toEqual(fixture)
      expect(state).toEqual(roleListFixture)
    },
  )

  it("advances a submitted JD task from running to an idempotent fixed success", async () => {
    const faker = createRoleFaker({ targetRoles: [], activeTargetRoleId: null })
    const role = await faker.create({ title: "Staff Platform Engineer" })

    await expect(faker.getJd(role)).resolves.toEqual({ status: "missing" })
    const parsing = await faker.parseJd(role.id, "JD text is not persisted.")
    expect(parsing).toEqual({ status: "parsing" })
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(role.jd)

    await expect(faker.getJd(role)).resolves.toEqual({ status: "parsing" })
    const ready = await faker.pollJd(role)
    expect(ready).toEqual({ status: "ready", result: parsedJdFixture })
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(role.jd)
    await expect(faker.getJd(role)).resolves.toEqual(ready)
  })

  it("advances the fixed failure input without replacing the saved structured JD", async () => {
    const faker = createRoleFaker(roleListFixture)
    const previousJobDescription = structuredClone(targetRoleFixture.jd)

    await expect(faker.parseJd(targetRoleFixture.id, jdFailInput)).resolves.toEqual({
      status: "parsing",
    })

    await expect(faker.getJd(targetRoleFixture)).resolves.toEqual({ status: "parsing" })
    const failed = await faker.pollJd(targetRoleFixture)
    expect(failed).toEqual({ status: "failed", reason: jdFailReason })
    expect(
      (await faker.list()).targetRoles.find(({ id }) => id === targetRoleFixture.id)?.jd,
    ).toEqual(previousJobDescription)
    await expect(faker.getJd(targetRoleFixture)).resolves.toEqual(failed)
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
    await faker.parseJd(role.id, "JD text")
    await faker.match(role.id)

    await faker.clear(role.id)

    await expect(faker.getJd(role)).resolves.toEqual({ status: "missing" })
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

    await faker.parseJd(targetRoleFixture.id, "Replacement JD")
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await faker.delete(targetRoleFixture.id)
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({ status: "none" })
  })
})
