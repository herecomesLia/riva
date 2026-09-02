import type { CareerProfileResponse } from "@/api/generated/models"

export const careerProfileFixture = {
  education: [
    {
      school: "Zhejiang University",
      degree: "Bachelor of Engineering",
      major: "Computer Science",
      startDate: "2016-09",
      endDate: "2020-06",
    },
  ],
  workExperiences: [
    {
      company: "Riva Labs",
      title: "Frontend Engineer",
      employmentType: "full-time",
      location: "Shanghai",
      responsibilities: ["Build reliable product experiences"],
      achievements: ["Improved the profile editing workflow"],
      skills: ["TypeScript", "React"],
      startDate: "2022-04",
      endDate: null,
    },
  ],
  projects: [
    {
      name: "Riva Interview Workspace",
      role: "Frontend Engineer",
      description: ["An interview preparation and training workspace"],
      achievements: ["Delivered the first profile workflow"],
      techStack: ["TypeScript", "React", "FastAPI"],
      url: "https://example.com/riva",
      startDate: "2023-01",
      endDate: null,
    },
  ],
  skills: ["TypeScript", "React", "FastAPI", "Python", "PostgreSQL"],
  createdAt: "2025-01-15T08:00:00Z",
  updatedAt: "2025-01-15T08:00:00Z",
} satisfies CareerProfileResponse
