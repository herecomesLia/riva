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

export const incompleteCareerProfileFixture = {
  ...careerProfileFixture,
  projects: [],
} satisfies CareerProfileResponse

export const resumeImportedCareerProfileFixture = {
  education: [
    {
      school: "Fudan University",
      degree: "Master of Engineering",
      major: "Software Engineering",
      startDate: "2020-09",
      endDate: "2023-06",
    },
  ],
  workExperiences: [
    {
      company: "Inclusive Products",
      title: "Product Engineer",
      employmentType: "full-time",
      location: "Remote",
      responsibilities: ["Build accessible web applications"],
      achievements: ["Improved keyboard and screen-reader support"],
      skills: ["TypeScript", "React", "Accessibility"],
      startDate: "2023-07",
      endDate: null,
    },
  ],
  projects: [
    {
      name: "Accessible Design System",
      role: "Maintainer",
      description: ["A reusable component library for inclusive products"],
      achievements: ["Adopted across three product teams"],
      techStack: ["TypeScript", "React"],
      url: "https://example.com/accessible-design-system",
      startDate: "2024-01",
      endDate: null,
    },
  ],
  skills: ["TypeScript", "React", "Accessibility", "Testing", "Design Systems"],
  createdAt: "2025-03-01T08:00:00Z",
  updatedAt: "2025-03-01T08:00:00Z",
} satisfies CareerProfileResponse
