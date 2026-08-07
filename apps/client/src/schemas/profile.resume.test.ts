import { describe, expect, it } from "vitest"
import { ZodError } from "zod"

import {
  resumeDocumentSchema,
  resumeImportDraftSchema,
  resumeParsingStatusSchema,
} from "@/schemas/profile"

const resumeId = "11111111-1111-4111-8111-111111111111"
const runId = "22222222-2222-4222-8222-222222222222"
const skillId = "33333333-3333-4333-8333-333333333333"
const timestamp = "2026-08-06T12:00:00Z"

function documentPayload(
  status: "pending" | "succeeded" | "failed" = "pending",
): Record<string, unknown> {
  return {
    byteSize: 10,
    extractedAt: status === "pending" ? null : timestamp,
    extractionStatus: status,
    failureReason: status === "failed" ? "The text layer is unavailable." : null,
    id: resumeId,
    mediaType: "application/pdf",
    originalFilename: "resume.pdf",
    sourceType: "file",
    uploadedAt: timestamp,
  }
}

function parsingPayload(
  status: "notStarted" | "queued" | "running" | "succeeded" | "failed" = "notStarted",
): Record<string, unknown> {
  const active = status !== "notStarted"
  const terminal = status === "succeeded" || status === "failed"

  return {
    attemptCount: status === "notStarted" || status === "queued" ? 0 : 1,
    canRetry: status === "failed",
    createdAt: active ? timestamp : null,
    draftStatus: status === "succeeded" ? "ready" : null,
    draftVersion: status === "succeeded" ? 1 : null,
    errorCode: status === "failed" ? "resume_parsing_unavailable" : null,
    failureReason: status === "failed" ? "The provider is unavailable." : null,
    finishedAt: terminal ? timestamp : null,
    maxAttempts: active ? 3 : null,
    resultVersion: status === "succeeded" ? 1 : null,
    resumeDocumentId: resumeId,
    runId: active ? runId : null,
    startedAt: status === "running" || terminal ? timestamp : null,
    status,
  }
}

function draftPayload(
  status: "ready" | "applied" | "superseded" = "ready",
): Record<string, unknown> {
  return {
    appliedAt: status === "applied" ? timestamp : null,
    appliedProfileVersion: status === "applied" ? 2 : null,
    baseProfileId: null,
    baseProfileVersion: null,
    canApply: status === "ready",
    changeSummary: { changedItems: 0, missingItems: 0, newItems: 1 },
    createdAt: timestamp,
    draftVersion: 1,
    education: [],
    parsingResultVersion: 1,
    projectExperiences: [],
    protectedItems: [],
    resumeDocumentId: resumeId,
    skippedItems: [],
    skills: [{ id: skillId, name: "TypeScript" }],
    sourceRunId: runId,
    status,
    summary: "Resume summary",
    summaryAction: "set",
    unresolvedItems: [],
    updatedAt: timestamp,
    workExperiences: [],
  }
}

describe("resume response schemas", () => {
  it.each(["pending", "succeeded", "failed"] as const)(
    "accepts the %s ResumeDocument status",
    (status) => {
      expect(resumeDocumentSchema.parse(documentPayload(status)).extractionStatus).toBe(status)
    },
  )

  it.each([
    { ...documentPayload("succeeded"), extractedAt: null },
    { ...documentPayload("failed"), failureReason: null },
    { ...documentPayload("pending"), extra: true },
    { ...documentPayload("pending"), id: "resume_1" },
    { ...documentPayload("pending"), uploadedAt: "2026-08-06T12:00:00" },
  ])("rejects malformed ResumeDocument responses", (payload) => {
    expect(() => resumeDocumentSchema.parse(payload)).toThrow(ZodError)
  })

  it.each(["notStarted", "queued", "running", "succeeded", "failed"] as const)(
    "accepts the %s parsing lifecycle state",
    (status) => {
      expect(resumeParsingStatusSchema.parse(parsingPayload(status)).status).toBe(status)
    },
  )

  it.each([
    { ...parsingPayload("queued"), resultVersion: 1 },
    { ...parsingPayload("running"), startedAt: null },
    { ...parsingPayload("succeeded"), resultVersion: null },
    { ...parsingPayload("failed"), canRetry: false },
    { ...parsingPayload("failed"), draftVersion: 1 },
    { ...parsingPayload("running"), resumeDocumentId: "resume_1" },
    { ...parsingPayload("running"), createdAt: "2026-08-06T12:00:00" },
  ])("rejects invalid parsing lifecycle invariants", (payload) => {
    expect(() => resumeParsingStatusSchema.parse(payload)).toThrow(ZodError)
  })

  it.each(["ready", "applied", "superseded"] as const)("accepts a %s import draft", (status) => {
    expect(resumeImportDraftSchema.parse(draftPayload(status)).status).toBe(status)
  })

  it.each([
    { ...draftPayload("ready"), canApply: false },
    { ...draftPayload("applied"), appliedAt: null },
    { ...draftPayload("superseded"), appliedProfileVersion: 2 },
    { ...draftPayload("ready"), baseProfileId: resumeId },
    { ...draftPayload("ready"), updatedAt: "2026-08-06T11:59:59Z" },
    {
      ...draftPayload("ready"),
      skills: [{ id: skillId, name: "TypeScript" }],
      workExperiences: [
        {
          achievements: [],
          company: "Riva",
          employmentType: "fullTime",
          endDate: null,
          id: "44444444-4444-4444-8444-444444444444",
          isCurrent: true,
          location: null,
          responsibilities: [],
          skillIds: ["55555555-5555-4555-8555-555555555555"],
          startDate: "2024-01",
          title: "Engineer",
        },
      ],
    },
    {
      ...draftPayload("ready"),
      extra: "must be rejected",
    },
  ])("rejects invalid import draft contents or state", (payload) => {
    expect(() => resumeImportDraftSchema.parse(payload)).toThrow(ZodError)
  })
})
