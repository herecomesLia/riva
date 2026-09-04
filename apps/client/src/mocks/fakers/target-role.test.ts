import { describe, expect, it } from "vitest"

import { createTargetRoleFaker } from "@/mocks/fakers/target-role"
import {
  imageRecognitionFixture,
  jobDescriptionParsingFailureInput,
  jobDescriptionParsingFailureReason,
  matchResultFixture,
  parsedJobDescriptionFixture,
  targetRoleFixture,
  targetRoleListFixture,
  textRecognitionFixture,
  urlRecognitionFixture,
} from "@/mocks/fixtures/target-role"

describe("targetRoleFaker", () => {
  it("keeps CRUD and active-role lifecycle state consistent", async () => {
    const faker = createTargetRoleFaker({ targetRoles: [], activeTargetRoleId: null })

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
    const faker = createTargetRoleFaker(targetRoleListFixture)

    await faker.archive(targetRoleFixture.id)
    await expect(faker.setActive({ targetRoleId: targetRoleFixture.id })).rejects.toMatchObject({
      code: "resource.conflict",
    })

    const state = await faker.list()
    expect(state.activeTargetRoleId).toBeNull()
    expect(state.targetRoles.find(({ id }) => id === targetRoleFixture.id)?.isArchived).toBe(true)
  })

  it("patches role fields while replacing provided nested JD sections", async () => {
    const faker = createTargetRoleFaker(targetRoleListFixture)

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
    ["text", { sourceType: "text" as const, text: "A job posting" }, textRecognitionFixture],
    [
      "image",
      { sourceType: "image" as const, images: [new File(["posting"], "posting.png")] },
      imageRecognitionFixture,
    ],
    [
      "url",
      { sourceType: "url" as const, url: "https://example.com/jobs/1" },
      urlRecognitionFixture,
    ],
  ])(
    "recognizes a %s source into a listed role without changing the active role",
    async (_sourceType, input, fixture) => {
      const faker = createTargetRoleFaker(targetRoleListFixture)

      const recognized = await faker.recognize(input)
      const state = await faker.list()

      expect(recognized).toMatchObject(fixture)
      expect(state.targetRoles).toContainEqual(recognized)
      expect(state.activeTargetRoleId).toBe(targetRoleListFixture.activeTargetRoleId)
      await expect(faker.getJobDescriptionParsingStatus(recognized.id)).resolves.toEqual({
        status: "success",
        result: parsedJobDescriptionFixture,
      })
    },
  )

  it("advances a submitted JD task from running to an idempotent fixed success", async () => {
    const faker = createTargetRoleFaker({ targetRoles: [], activeTargetRoleId: null })
    const role = await faker.create({ title: "Staff Platform Engineer" })

    await expect(faker.getJobDescriptionParsingStatus(role.id)).resolves.toBeNull()
    const running = await faker.submitJobDescription(role.id, "JD text is not persisted.")
    expect(running).toEqual({ status: "running", result: parsedJobDescriptionFixture })
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(role.jd)

    const success = await faker.getJobDescriptionParsingStatus(role.id)
    expect(success).toEqual({ status: "success", result: parsedJobDescriptionFixture })
    expect((await faker.list()).targetRoles[0]?.jd).toEqual(parsedJobDescriptionFixture)
    await expect(faker.getJobDescriptionParsingStatus(role.id)).resolves.toEqual(success)
  })

  it("advances the fixed failure input without replacing the saved structured JD", async () => {
    const faker = createTargetRoleFaker(targetRoleListFixture)
    const previousJobDescription = structuredClone(targetRoleFixture.jd)

    await expect(
      faker.submitJobDescription(targetRoleFixture.id, jobDescriptionParsingFailureInput),
    ).resolves.toEqual({ status: "running", result: jobDescriptionParsingFailureReason })

    const failed = await faker.getJobDescriptionParsingStatus(targetRoleFixture.id)
    expect(failed).toEqual({ status: "failed", result: jobDescriptionParsingFailureReason })
    expect(
      (await faker.list()).targetRoles.find(({ id }) => id === targetRoleFixture.id)?.jd,
    ).toEqual(previousJobDescription)
    await expect(faker.getJobDescriptionParsingStatus(targetRoleFixture.id)).resolves.toEqual(
      failed,
    )
  })

  it("advances a match from running to an idempotent fixed success", async () => {
    const faker = createTargetRoleFaker(targetRoleListFixture)

    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toBeNull()
    await expect(faker.match(targetRoleFixture.id)).resolves.toEqual({
      status: "running",
      result: matchResultFixture,
    })

    const success = await faker.getMatch(targetRoleFixture.id)
    expect(success).toEqual({ status: "success", result: matchResultFixture })
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual(success)
  })

  it("keeps a successful match stale across JD changes until regeneration", async () => {
    const faker = createTargetRoleFaker(targetRoleListFixture)
    await faker.match(targetRoleFixture.id)
    await faker.getMatch(targetRoleFixture.id)

    await faker.updateJd(targetRoleFixture.id, { softSkills: ["Stakeholder management"] })
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await expect(faker.match(targetRoleFixture.id)).resolves.toEqual({
      status: "running",
      result: matchResultFixture,
    })
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "success",
      result: matchResultFixture,
    })

    await faker.submitJobDescription(targetRoleFixture.id, "Replacement JD")
    await expect(faker.getMatch(targetRoleFixture.id)).resolves.toEqual({
      status: "stale",
      result: matchResultFixture,
    })

    await faker.delete(targetRoleFixture.id)
    await expect(faker.getMatch(targetRoleFixture.id)).rejects.toMatchObject({
      code: "resource.not_found",
    })
  })
})
