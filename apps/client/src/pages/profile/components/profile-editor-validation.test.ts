import { describe, expect, it } from "vitest"

import { educationItemSchema, projectItemSchema, workItemSchema } from "./ProfileSectionEditor"
import { skillSchema } from "./SkillsEditor"

const schemas: Array<[string, any, Record<string, unknown>]> = [
  [
    "education",
    educationItemSchema,
    {
      degree: "",
      clientId: "education_1",
      major: "",
      school: "Riva University",
    },
  ],
  [
    "work experience",
    workItemSchema,
    {
      achievements: [],
      company: "Riva",
      endDate: "",
      employmentType: "full-time",
      clientId: "work_1",
      location: "",
      responsibilities: [],
      skills: [],
      title: "Engineer",
    },
  ],
  [
    "project experience",
    projectItemSchema,
    {
      achievements: [],
      clientId: "project_1",
      name: "Riva project",
      url: "",
      description: [],
      role: "",
      techStack: [],
    },
  ],
]

function dateFields(
  overrides: Partial<{ endDate: string; isCurrent: boolean; startDate: string }> = {},
) {
  return {
    endDate: "2024-06",
    isCurrent: false,
    startDate: "2024-01",
    ...overrides,
  }
}

describe("experience date schemas", () => {
  it.each(schemas)("skips date-range validation for a current %s", (_, schema, values) => {
    expect(
      schema.safeParse({ ...values, ...dateFields({ endDate: "2023-12", isCurrent: true }) })
        .success,
    ).toBe(true)
  })

  it.each(schemas)("requires an end date for a non-current %s", (_, schema, values) => {
    const result = schema.safeParse({ ...values, ...dateFields({ endDate: "" }) })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "required", path: ["endDate"] }),
        ]),
      )
    }
  })

  it.each(schemas)(
    "rejects an end date before the start date for a non-current %s",
    (_, schema, values) => {
      const result = schema.safeParse({
        ...values,
        ...dateFields({ endDate: "2023-12" }),
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ message: "dateRange", path: ["endDate"] }),
          ]),
        )
      }
    },
  )
})

describe("work experience schema", () => {
  it("keeps structured arrays and trims duplicate items before saving", () => {
    const result = workItemSchema.safeParse({
      achievements: ["  Improved performance  ", "Improved performance"],
      company: "Riva",
      endDate: "",
      employmentType: "full-time",
      clientId: "work_1",
      isCurrent: true,
      location: "",
      responsibilities: ["  Built the platform  ", "Built the platform"],
      skills: ["React", "react"],
      startDate: "2024-01",
      title: "Engineer",
    })

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          achievements: ["Improved performance"],
          responsibilities: ["Built the platform"],
          skills: ["React"],
        }),
        success: true,
      }),
    )
  })

  it("removes blank bullet items before saving", () => {
    const result = workItemSchema.safeParse({
      achievements: [],
      company: "Riva",
      endDate: "",
      employmentType: "",
      clientId: "work_1",
      isCurrent: true,
      location: "",
      responsibilities: ["   "],
      skills: [],
      startDate: "2024-01",
      title: "Engineer",
    })

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ responsibilities: [] }),
        success: true,
      }),
    )
  })
})

describe("project experience schema", () => {
  it("keeps structured project content and normalizes its independent technology stack", () => {
    const result = projectItemSchema.safeParse({
      achievements: ["  Improved project adoption  ", "Improved project adoption"],
      endDate: "",
      clientId: "project_1",
      isCurrent: true,
      name: "Riva project",
      url: "https://riva.example.com",
      description: ["  Built the project workspace  ", "Built the project workspace", "  "],
      role: "",
      techStack: [" React ", "react", "TypeScript"],
      startDate: "2024-01",
    })

    expect(result).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          achievements: ["Improved project adoption"],
          description: ["Built the project workspace"],
          techStack: ["React", "TypeScript"],
        }),
        success: true,
      }),
    )
  })
})

describe("skill schema", () => {
  it("requires and trims a skill name", () => {
    const result = skillSchema.safeParse({
      clientId: "skill_react",
      name: "  React  ",
    })

    expect(result).toEqual({ success: true, data: { clientId: "skill_react", name: "React" } })
  })

  it("rejects an empty skill name", () => {
    expect(skillSchema.safeParse({ clientId: "skill_react", name: "   " }).success).toBe(false)
  })
})
