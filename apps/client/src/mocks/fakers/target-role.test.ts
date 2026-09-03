import { describe, expect, it } from "vitest"

import { createTargetRoleFaker } from "@/mocks/fakers/target-role"
import { targetRoleFixture, targetRoleListFixture } from "@/mocks/fixtures/target-role"

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
})
