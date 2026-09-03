import type { CreateTargetRoleRequest } from "@/api/generated/models"

export const textRecognitionFixture = {
  title: "Senior Frontend Engineer",
  company: "ByteDance",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const imageRecognitionFixture = {
  title: "Frontend Engineer",
  company: "Riva Technology",
  recruitmentTrack: "experienced",
  location: "Shanghai",
} satisfies CreateTargetRoleRequest

export const urlRecognitionFixture = {
  title: "Product Manager",
  company: "Meituan",
  recruitmentTrack: "experienced",
  location: "Beijing",
} satisfies CreateTargetRoleRequest
