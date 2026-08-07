import {
  createProfileMockSnapshot,
  profileResponseMock,
  type ProfileMockScenario,
} from "@/mocks/data/profile"
import { waitForMockDelay } from "@/mocks/utils"
import { normalizeSkillIds, normalizeSkillName } from "@/models/profile-text"
import type {
  CareerProfileDto,
  CareerProfileSkillInputDto,
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  NewProfileSkillInput,
  ProfileSource,
  ResumeDocument,
  ResumeFile,
  ResumeImportApplication,
  ResumeImportDraft,
  ResumeParsingStatus,
  ResumeRecognition,
  ResumeUpdate,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"
import { ApiError } from "@/services/api"

function copy<T>(value: T): T {
  return structuredClone(value)
}

let mockSnapshot: JobProfileSnapshot = copy(profileResponseMock)
const retryableRecognitionFailures = new Set<string>()

type ResumeImportCandidate = Pick<
  ResumeImportDraft,
  | "education"
  | "projectExperiences"
  | "skills"
  | "summary"
  | "unresolvedItems"
  | "skippedItems"
  | "workExperiences"
>

type ResumeImportMockState = {
  candidate: ResumeImportCandidate
  document: ResumeDocument
  draft: ResumeImportDraft | null
  failuresRemaining: number
  isInitialImport: boolean
  parsing: ResumeParsingStatus
}

const resumeImportStates = new Map<string, ResumeImportMockState>()
const contractIds = new Map<string, string>()
let mockUuidSequence = 1
let mockTimestampSequence = 0

export function resetProfileMockState(scenario: ProfileMockScenario = "complete") {
  mockSnapshot = createProfileMockSnapshot(scenario)
  retryableRecognitionFailures.clear()
  resumeImportStates.clear()
  contractIds.clear()
  mockUuidSequence = 1
  mockTimestampSequence = 0
}

export function getProfileMockSnapshot(): JobProfileSnapshot {
  return copy(mockSnapshot)
}

function standardProfile(): JobProfile {
  const profile = copy(profileResponseMock.profile)
  if (!profile) throw new Error("The standard profile fixture is invalid.")
  return profile
}

function requireProfile(profileId: string) {
  const profile = mockSnapshot.profile
  if (!profile || profile.profileId !== profileId) throw new Error("Job profile was not found.")
  return profile
}

function setMockSnapshot(snapshot: JobProfileSnapshot) {
  mockSnapshot = copy(snapshot)
  return copy(mockSnapshot)
}

function createUploadedResume(input: ResumeUploadInput, id: string): ResumeFile {
  const file = input.file
  const text = input.text?.trim()
  if (!file && !text) throw new Error("A resume file or pasted resume text is required.")

  return {
    id,
    fileName: file?.name ?? "pasted-resume.txt",
    mimeType: file?.type || "text/plain",
    fileSize: file?.size ?? new Blob([text ?? ""]).size,
    uploadedAt: "2026-07-13T08:00:00.000Z",
    parsedAt: null,
    processingStatus: "uploaded",
    failureReason: null,
  }
}

function createEmptyProfile(resume: ResumeFile | null, status: JobProfile["status"]): JobProfile {
  const profile = standardProfile()
  return {
    ...profile,
    completeness: {
      percentage: 0,
      missingSections: [
        "education",
        "workExperience",
        "projectExperience",
        "skills",
        "credentials",
        "targetRoles",
      ],
    },
    credentials: [],
    education: [],
    matchingAnalysisStale: false,
    profileId: "profile_resume_import",
    projectExperiences: [],
    resume,
    skills: [],
    status,
    summary: null,
    targetRoles: [],
    updatedAt: resume?.uploadedAt ?? "2026-07-13T08:00:00.000Z",
    version: 1,
    workExperiences: [],
  }
}

function removeSource<T extends { source?: ProfileSource }>(item: T) {
  const { source: _source, ...businessFields } = item
  return businessFields
}

function applySources<T extends { id: string; source?: ProfileSource }>(
  currentItems: Array<T & { source: ProfileSource }>,
  submittedItems: T[],
) {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  return submittedItems.map((submittedItem) => {
    const currentItem = currentById.get(submittedItem.id)
    const businessFields = removeSource(submittedItem)
    if (!currentItem || submittedItem.id.startsWith("draft_")) {
      return { ...businessFields, source: "userAdded" as const }
    }
    const source: ProfileSource =
      JSON.stringify(removeSource(currentItem)) === JSON.stringify(businessFields)
        ? currentItem.source
        : "userEdited"
    return { ...businessFields, source }
  })
}

function applySavedSection(profile: JobProfile, input: SaveProfileSectionInput) {
  switch (input.section) {
    case "education":
      profile.education = applySources(profile.education, input.values)
      break
    case "skills":
      profile.skills = applySources(profile.skills, input.values)
      break
    case "credentials":
      profile.credentials = applySources(profile.credentials, input.values)
      break
    case "targetRoles":
      profile.targetRoles = applySources(profile.targetRoles, input.values)
  }
}

function createSkillId(profile: JobProfile, name: string) {
  const base = `skill_${
    normalizeSkillName(name)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom"
  }`
  let id = base
  let suffix = 2
  while (profile.skills.some((skill) => skill.id === id)) {
    id = `${base}_${suffix}`
    suffix += 1
  }
  return id
}

function persistDraftSkills(profile: JobProfile, skillsToCreate: NewProfileSkillInput[]) {
  const idsByName = new Map(
    profile.skills.map((skill) => [normalizeSkillName(skill.name), skill.id]),
  )
  const persistedIds = new Map<string, string>()
  for (const draftSkill of skillsToCreate) {
    const name = draftSkill.name.trim().replace(/\s+/g, " ")
    const normalizedName = normalizeSkillName(name)
    if (!normalizedName) continue
    let id = idsByName.get(normalizedName)
    if (!id) {
      id = createSkillId(profile, name)
      profile.skills.push({ id, name, source: "userAdded" })
      idsByName.set(normalizedName, id)
    }
    persistedIds.set(draftSkill.clientId, id)
  }
  return persistedIds
}

function replaceDraftSkillIds(skillIds: string[], persistedIds: Map<string, string>) {
  return normalizeSkillIds(
    skillIds.map((id) => {
      const persistedId = persistedIds.get(id)
      if (id.startsWith("draft_skill_") && !persistedId) {
        throw new Error("A selected draft skill is missing from this save request.")
      }
      return persistedId ?? id
    }),
  )
}

function applySkillLinkedSectionSave(
  profile: JobProfile,
  input: Extract<SaveProfileSectionInput, { section: "workExperience" | "projectExperience" }>,
) {
  const persistedIds = persistDraftSkills(profile, input.skillsToCreate)
  if (input.section === "workExperience") {
    profile.workExperiences = applySources(
      profile.workExperiences,
      input.values.map((item) => ({
        ...item,
        skillIds: replaceDraftSkillIds(item.skillIds, persistedIds),
      })),
    )
    return
  }
  profile.projectExperiences = applySources(
    profile.projectExperiences,
    input.values.map((item) => ({
      ...item,
      skillIds: replaceDraftSkillIds(item.skillIds, persistedIds),
    })),
  )
}

function recognizedProfile(): JobProfile {
  const profile = standardProfile()
  return {
    ...profile,
    credentials: profile.credentials.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
    })),
    education: profile.education.map((item) => ({ ...item, source: "resumeExtracted" as const })),
    projectExperiences: profile.projectExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
    })),
    skills: [
      ...profile.skills.map((item) => ({ ...item, source: "resumeExtracted" as const })),
      { id: "skill_accessibility", name: "Accessibility", source: "resumeExtracted" as const },
    ],
    workExperiences: profile.workExperiences.map((item) => ({
      ...item,
      source: "resumeExtracted" as const,
    })),
  }
}

function mergeRecognizedItems<T extends { id: string; source: ProfileSource }>(
  currentItems: T[],
  recognizedItems: T[],
) {
  const recognizedById = new Map(recognizedItems.map((item) => [item.id, item]))
  const merged = currentItems.map((item) => {
    const recognized = recognizedById.get(item.id)
    return !recognized || item.source !== "resumeExtracted"
      ? item
      : { ...recognized, source: "resumeExtracted" as const }
  })
  for (const recognized of recognizedItems) {
    if (!currentItems.some((item) => item.id === recognized.id)) {
      merged.push({ ...recognized, source: "resumeExtracted" })
    }
  }
  return merged
}

function mergeRecognizedProfile(profile: JobProfile): JobProfile {
  const recognized = recognizedProfile()
  return {
    ...profile,
    credentials: mergeRecognizedItems(profile.credentials, recognized.credentials),
    education: mergeRecognizedItems(profile.education, recognized.education),
    projectExperiences: mergeRecognizedItems(
      profile.projectExperiences,
      recognized.projectExperiences,
    ),
    skills: mergeRecognizedItems(profile.skills, recognized.skills),
    workExperiences: mergeRecognizedItems(profile.workExperiences, recognized.workExperiences),
  }
}

const standardUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function nextContractUuid(): string {
  const suffix = mockUuidSequence.toString(16).padStart(12, "0")
  mockUuidSequence += 1
  return `00000000-0000-4000-8000-${suffix}`
}

function contractId(id: string): string {
  if (standardUuidPattern.test(id)) return id
  const existing = contractIds.get(id)
  if (existing) return existing
  const mapped = nextContractUuid()
  contractIds.set(id, mapped)
  return mapped
}

function nextMockTimestamp(): string {
  const timestamp = new Date(Date.UTC(2026, 6, 13, 9, 0, mockTimestampSequence)).toISOString()
  mockTimestampSequence += 1
  return timestamp
}

function resumeImportError(code: string): never {
  const body = { error: code }
  throw new ApiError(409, code, body)
}

function requireResumeImportState(resumeId: string): ResumeImportMockState {
  const state = resumeImportStates.get(resumeId)
  if (!state) {
    const body = { error: "resume_document_not_found" }
    throw new ApiError(404, body.error, body)
  }
  return state
}

function toCareerProfile(profile: JobProfile | null): CareerProfileDto | null {
  if (!profile) return null
  return {
    education: profile.education.map(({ source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      source,
      startDate: item.startDate ?? "2000-01",
    })),
    profileId: contractId(profile.profileId),
    projectExperiences: profile.projectExperiences.map(({ source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      skillIds: item.skillIds.map(contractId),
      source,
      startDate: item.startDate ?? "2000-01",
    })),
    skills: profile.skills.map(({ source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      source,
    })),
    summary: profile.summary,
    updatedAt: profile.updatedAt,
    version: profile.version,
    workExperiences: profile.workExperiences.map(({ source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      skillIds: item.skillIds.map(contractId),
      source,
      startDate: item.startDate ?? "2000-01",
    })),
  }
}

function buildResumeCandidate(index: number): ResumeImportCandidate {
  const recognized = recognizedProfile()
  const skills: CareerProfileSkillInputDto[] = recognized.skills.map((item) => ({
    id: contractId(item.id),
    name: item.name,
  }))
  const extraSkillId = nextContractUuid()
  skills.push({ id: extraSkillId, name: `Resume Skill ${index}` })

  return {
    education: recognized.education.slice(0, 1).map(({ source: _source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      startDate: item.startDate ?? "2000-01",
    })),
    projectExperiences: recognized.projectExperiences.map(({ source: _source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      skillIds: item.skillIds.map(contractId),
      startDate: item.startDate ?? "2000-01",
    })),
    skills,
    skippedItems: [],
    summary: recognized.summary,
    unresolvedItems: [],
    workExperiences: recognized.workExperiences.map(({ source: _source, ...item }) => ({
      ...item,
      id: contractId(item.id),
      skillIds: item.skillIds.map(contractId),
      startDate: item.startDate ?? "2000-01",
      title: item.id === "work_orbit_2018" ? `Frontend Engineer ${index}` : item.title,
    })),
  }
}

function withoutSource<T extends { source: ProfileSource }>(item: T): Omit<T, "source"> {
  const { source: _source, ...value } = item
  return value
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizedSkillName(name: string): string {
  return normalizeSkillName(name)
}

function buildProtectedItems(
  profile: CareerProfileDto | null,
  candidate: ResumeImportCandidate,
): ResumeImportDraft["protectedItems"] {
  if (!profile) return []
  const protectedItems: ResumeImportDraft["protectedItems"] = []
  const sections = [
    ["education", profile.education, candidate.education],
    ["workExperience", profile.workExperiences, candidate.workExperiences],
    ["projectExperience", profile.projectExperiences, candidate.projectExperiences],
  ] as const
  for (const [section, currentItems, candidateItems] of sections) {
    const candidateIds = new Set(candidateItems.map((item) => item.id))
    for (const item of currentItems) {
      if (
        candidateIds.has(item.id) &&
        (item.source === "userEdited" || item.source === "userAdded")
      ) {
        protectedItems.push({ itemId: item.id, section, source: item.source })
      }
    }
  }
  const candidateSkillNames = new Set(
    candidate.skills.map((item) => normalizedSkillName(item.name)),
  )
  for (const skill of profile.skills) {
    if (
      candidateSkillNames.has(normalizedSkillName(skill.name)) &&
      (skill.source === "userEdited" || skill.source === "userAdded")
    ) {
      protectedItems.push({ itemId: skill.id, section: "skills", source: skill.source })
    }
  }
  return protectedItems
}

function buildChangeSummary(
  profile: CareerProfileDto | null,
  candidate: ResumeImportCandidate,
): ResumeImportDraft["changeSummary"] {
  if (!profile) {
    return {
      changedItems: 0,
      missingItems: 0,
      newItems:
        candidate.education.length +
        candidate.workExperiences.length +
        candidate.projectExperiences.length +
        candidate.skills.length,
    }
  }

  let newItems = 0
  let changedItems = 0
  let missingItems = 0
  const sections = [
    [profile.education, candidate.education],
    [profile.workExperiences, candidate.workExperiences],
    [profile.projectExperiences, candidate.projectExperiences],
  ] as const
  for (const [currentItems, candidateItems] of sections) {
    const currentById = new Map(currentItems.map((item) => [item.id, item]))
    const candidateIds = new Set(candidateItems.map((item) => item.id))
    for (const candidateItem of candidateItems) {
      const current = currentById.get(candidateItem.id)
      if (!current) newItems += 1
      else if (
        current.source === "resumeExtracted" &&
        !sameValue(withoutSource(current), candidateItem)
      ) {
        changedItems += 1
      }
    }
    missingItems += currentItems.filter(
      (item) => item.source === "resumeExtracted" && !candidateIds.has(item.id),
    ).length
  }

  const currentSkillsByName = new Map(
    profile.skills.map((item) => [normalizedSkillName(item.name), item]),
  )
  const candidateSkillNames = new Set<string>()
  for (const candidateSkill of candidate.skills) {
    const name = normalizedSkillName(candidateSkill.name)
    candidateSkillNames.add(name)
    const current = currentSkillsByName.get(name)
    if (!current) newItems += 1
    else if (current.source === "resumeExtracted" && current.name !== candidateSkill.name) {
      changedItems += 1
    }
  }
  missingItems += profile.skills.filter(
    (item) =>
      item.source === "resumeExtracted" && !candidateSkillNames.has(normalizedSkillName(item.name)),
  ).length
  return { changedItems, missingItems, newItems }
}

function buildResumeImportDraft(state: ResumeImportMockState): ResumeImportDraft {
  const profile = toCareerProfile(mockSnapshot.profile)
  const previous = state.draft
  const timestamp = nextMockTimestamp()
  const summaryAction =
    state.candidate.summary === null
      ? "none"
      : profile === null || profile.summary === null || !profile.summary.trim()
        ? "set"
        : "preserve"
  return {
    ...copy(state.candidate),
    appliedAt: null,
    appliedProfileVersion: null,
    baseProfileId: profile?.profileId ?? null,
    baseProfileVersion: profile?.version ?? null,
    canApply: true,
    changeSummary: buildChangeSummary(profile, state.candidate),
    createdAt: previous?.createdAt ?? timestamp,
    draftVersion: (previous?.draftVersion ?? 0) + 1,
    parsingResultVersion: state.parsing.resultVersion ?? 1,
    protectedItems: buildProtectedItems(profile, state.candidate),
    resumeDocumentId: state.document.id,
    sourceRunId: state.parsing.runId!,
    status: "ready",
    summaryAction,
    updatedAt: timestamp,
  }
}

function mergeSection<
  Input extends { id: string },
  Output extends Input & { source: ProfileSource },
>(currentItems: Output[], candidateItems: Input[]): Output[] {
  const currentById = new Map(currentItems.map((item) => [item.id, item]))
  const merged = copy(currentItems)
  for (const candidate of candidateItems) {
    const current = currentById.get(candidate.id)
    if (!current) {
      merged.push({ ...candidate, source: "resumeExtracted" } as Output)
    } else if (current.source === "resumeExtracted") {
      const index = merged.findIndex((item) => item.id === current.id)
      merged[index] = { ...candidate, source: "resumeExtracted" } as Output
    }
  }
  return merged
}

function mergeResumeCandidate(
  current: CareerProfileDto | null,
  candidate: ResumeImportCandidate,
): Omit<CareerProfileDto, "updatedAt" | "version"> {
  const profileId = current?.profileId ?? nextContractUuid()
  const currentSkills = copy(current?.skills ?? [])
  const currentSkillsByName = new Map(
    currentSkills.map((skill) => [normalizedSkillName(skill.name), skill]),
  )
  const persistedSkillIds = new Map<string, string>()
  for (const candidateSkill of candidate.skills) {
    const currentSkill = currentSkillsByName.get(normalizedSkillName(candidateSkill.name))
    if (currentSkill) {
      persistedSkillIds.set(candidateSkill.id, currentSkill.id)
      if (currentSkill.source === "resumeExtracted") currentSkill.name = candidateSkill.name
    } else {
      currentSkills.push({ ...candidateSkill, source: "resumeExtracted" })
      currentSkillsByName.set(normalizedSkillName(candidateSkill.name), currentSkills.at(-1)!)
      persistedSkillIds.set(candidateSkill.id, candidateSkill.id)
    }
  }
  const mapDraftSkillIds = (skillIds: string[]) =>
    skillIds.map((id) => {
      const persisted = persistedSkillIds.get(id)
      if (!persisted) resumeImportError("resume_import_apply_conflict")
      return persisted
    })
  const workExperiences = candidate.workExperiences.map((item) => ({
    ...item,
    skillIds: mapDraftSkillIds(item.skillIds),
  }))
  const projectExperiences = candidate.projectExperiences.map((item) => ({
    ...item,
    skillIds: mapDraftSkillIds(item.skillIds),
  }))

  return {
    education: mergeSection(current?.education ?? [], candidate.education),
    profileId,
    projectExperiences: mergeSection(current?.projectExperiences ?? [], projectExperiences),
    skills: currentSkills,
    summary:
      candidate.summary !== null && (current === null || current.summary === null)
        ? candidate.summary
        : (current?.summary ?? null),
    workExperiences: mergeSection(current?.workExperiences ?? [], workExperiences),
  }
}

function careerProfileBusinessValue(profile: CareerProfileDto | null): unknown {
  if (!profile) return null
  const { updatedAt: _updatedAt, version: _version, ...businessValue } = profile
  return businessValue
}

function setCareerProfile(profile: CareerProfileDto, state: ResumeImportMockState) {
  const current = mockSnapshot.profile
  const resume: ResumeFile = {
    failureReason: null,
    fileName: state.document.originalFilename ?? "pasted-resume.txt",
    fileSize: state.document.byteSize,
    id: state.document.id,
    mimeType: state.document.mediaType,
    parsedAt: state.document.extractedAt,
    processingStatus: "succeeded",
    uploadedAt: state.document.uploadedAt,
  }
  const presentSections = [
    profile.education.length > 0,
    profile.workExperiences.length > 0,
    profile.projectExperiences.length > 0,
    profile.skills.length > 0,
  ].filter(Boolean).length
  const next: JobProfile = {
    ...(current ?? createEmptyProfile(resume, "active")),
    completeness: {
      missingSections: [],
      percentage: Math.round((presentSections / 4) * 100),
    },
    education: copy(profile.education),
    matchingAnalysisStale: false,
    profileId: profile.profileId,
    projectExperiences: copy(profile.projectExperiences),
    resume,
    skills: copy(profile.skills),
    status: "active",
    summary: profile.summary,
    updatedAt: profile.updatedAt,
    version: profile.version,
    workExperiences: copy(profile.workExperiences),
  }
  setMockSnapshot({ ...mockSnapshot, matchingAnalysis: null, profile: next })
}

function notStartedParsing(resumeDocumentId: string): ResumeParsingStatus {
  return {
    attemptCount: 0,
    canRetry: false,
    createdAt: null,
    draftStatus: null,
    draftVersion: null,
    errorCode: null,
    failureReason: null,
    finishedAt: null,
    maxAttempts: null,
    resultVersion: null,
    resumeDocumentId,
    runId: null,
    startedAt: null,
    status: "notStarted",
  }
}

function startParsingRun(state: ResumeImportMockState): ResumeParsingStatus {
  const timestamp = nextMockTimestamp()
  state.document = {
    ...state.document,
    extractedAt: timestamp,
    extractionStatus: "succeeded",
  }
  state.parsing = {
    attemptCount: state.parsing.attemptCount + 1,
    canRetry: false,
    createdAt: timestamp,
    draftStatus: null,
    draftVersion: null,
    errorCode: null,
    failureReason: null,
    finishedAt: null,
    maxAttempts: 3,
    resultVersion: null,
    resumeDocumentId: state.document.id,
    runId: nextContractUuid(),
    startedAt: timestamp,
    status: "running",
  }
  return copy(state.parsing)
}

export async function uploadResume(input: ResumeUploadInput): Promise<ResumeDocument> {
  await waitForMockDelay()
  const hasFile = input.file !== undefined
  const hasText = input.text !== undefined
  if (hasFile === hasText || (input.text !== undefined && !input.text.trim())) {
    throw new TypeError("Exactly one non-empty resume file or text value is required.")
  }
  const index = resumeImportStates.size + 1
  const timestamp = nextMockTimestamp()
  const document: ResumeDocument = {
    byteSize: Math.max(1, input.file?.size ?? new Blob([input.text!]).size),
    extractedAt: null,
    extractionStatus: "pending",
    failureReason: null,
    id: nextContractUuid(),
    mediaType: input.file?.type || "text/plain",
    originalFilename: input.file?.name ?? null,
    sourceType: input.file ? "file" : "pastedText",
    uploadedAt: timestamp,
  }
  const name = input.file?.name.toLowerCase() ?? input.text!.toLowerCase()
  resumeImportStates.set(document.id, {
    candidate: buildResumeCandidate(index),
    document,
    draft: null,
    failuresRemaining: name.includes("unreadable") || name.includes("retryable") ? 1 : 0,
    isInitialImport: mockSnapshot.profile === null,
    parsing: notStartedParsing(document.id),
  })
  return copy(document)
}

export async function startResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  await waitForMockDelay()
  const state = requireResumeImportState(resumeId)
  if (state.parsing.status === "failed") resumeImportError("resume_parsing_retry_required")
  if (state.parsing.status !== "notStarted") return copy(state.parsing)
  return startParsingRun(state)
}

export async function getResumeParsingStatus(resumeId: string): Promise<ResumeParsingStatus> {
  await waitForMockDelay()
  const state = requireResumeImportState(resumeId)
  if (state.parsing.status !== "running" && state.parsing.status !== "queued") {
    return copy(state.parsing)
  }
  const timestamp = nextMockTimestamp()
  if (state.failuresRemaining > 0) {
    state.failuresRemaining -= 1
    state.parsing = {
      ...state.parsing,
      canRetry: true,
      errorCode: "resume_parsing_unavailable",
      failureReason: "The resume parsing service temporarily failed.",
      finishedAt: timestamp,
      status: "failed",
    }
    return copy(state.parsing)
  }
  const resultVersion = (state.parsing.resultVersion ?? 0) + 1
  state.parsing = {
    ...state.parsing,
    canRetry: false,
    errorCode: null,
    failureReason: null,
    finishedAt: timestamp,
    resultVersion,
    status: "succeeded",
  }
  state.draft = buildResumeImportDraft(state)
  state.parsing = {
    ...state.parsing,
    draftStatus: state.draft.status,
    draftVersion: state.draft.draftVersion,
  }
  return copy(state.parsing)
}

export async function retryResumeParsing(resumeId: string): Promise<ResumeParsingStatus> {
  await waitForMockDelay()
  const state = requireResumeImportState(resumeId)
  if (state.parsing.status === "succeeded") {
    resumeImportError("resume_parsing_retry_not_allowed")
  }
  if (state.parsing.status === "running" || state.parsing.status === "queued") {
    return copy(state.parsing)
  }
  if (state.parsing.status !== "failed") return startParsingRun(state)
  if (state.draft?.status === "ready") {
    state.draft = { ...state.draft, canApply: false, status: "superseded" }
  }
  return startParsingRun(state)
}

export async function getResumeImportDraft(resumeId: string): Promise<ResumeImportDraft> {
  await waitForMockDelay()
  const state = requireResumeImportState(resumeId)
  if (state.parsing.status !== "succeeded" || !state.draft) {
    resumeImportError("resume_import_draft_not_ready")
  }
  const profile = toCareerProfile(mockSnapshot.profile)
  const profileId = profile?.profileId ?? null
  const profileVersion = profile?.version ?? null
  const appliedIsCurrent =
    state.draft.status === "applied" &&
    state.draft.appliedProfileVersion === profileVersion &&
    (state.draft.baseProfileId === null || state.draft.baseProfileId === profileId)
  const readyIsCurrent =
    state.draft.status === "ready" &&
    state.draft.baseProfileId === profileId &&
    state.draft.baseProfileVersion === profileVersion
  if (!appliedIsCurrent && !readyIsCurrent) {
    state.draft = buildResumeImportDraft(state)
    state.parsing = {
      ...state.parsing,
      draftStatus: state.draft.status,
      draftVersion: state.draft.draftVersion,
    }
  }
  return copy(state.draft)
}

export async function applyResumeImportDraft(
  resumeId: string,
  draftVersion: number,
): Promise<ResumeImportApplication> {
  await waitForMockDelay()
  const state = requireResumeImportState(resumeId)
  if (state.parsing.status !== "succeeded" || !state.draft) {
    resumeImportError("resume_import_draft_not_ready")
  }
  const draft = state.draft
  if (draft.draftVersion !== draftVersion) {
    resumeImportError("resume_import_draft_version_conflict")
  }
  const current = toCareerProfile(mockSnapshot.profile)
  if (draft.status === "applied") {
    if (
      !current ||
      current.version !== draft.appliedProfileVersion ||
      (draft.baseProfileId !== null && current.profileId !== draft.baseProfileId)
    ) {
      resumeImportError("resume_import_apply_conflict")
    }
    return {
      draft: copy(draft),
      profile: copy(current),
      profileChanged: false,
      profileCreated: false,
    }
  }
  if (draft.status !== "ready") resumeImportError("resume_import_apply_conflict")
  if (
    draft.baseProfileId !== (current?.profileId ?? null) ||
    draft.baseProfileVersion !== (current?.version ?? null)
  ) {
    resumeImportError("resume_import_profile_version_conflict")
  }

  const merged = mergeResumeCandidate(current, state.candidate)
  const profileCreated = current === null
  const profileChanged = profileCreated || !sameValue(careerProfileBusinessValue(current), merged)
  const timestamp = nextMockTimestamp()
  const profile: CareerProfileDto = {
    ...merged,
    updatedAt: profileChanged ? timestamp : current!.updatedAt,
    version: profileCreated ? 1 : current!.version + (profileChanged ? 1 : 0),
  }
  if (profileChanged) setCareerProfile(profile, state)

  const appliedAt = nextMockTimestamp()
  state.draft = {
    ...draft,
    appliedAt,
    appliedProfileVersion: profile.version,
    canApply: false,
    status: "applied",
    updatedAt: appliedAt,
  }
  state.parsing = {
    ...state.parsing,
    draftStatus: "applied",
    draftVersion: state.draft.draftVersion,
  }
  if (profileChanged) {
    for (const [otherResumeId, otherState] of resumeImportStates) {
      if (otherResumeId !== resumeId && otherState.draft?.status === "ready") {
        otherState.draft = {
          ...otherState.draft,
          canApply: false,
          status: "superseded",
          updatedAt: appliedAt,
        }
        otherState.parsing = { ...otherState.parsing, draftStatus: "superseded" }
      }
    }
  }
  return {
    draft: copy(state.draft),
    profile: copy(profile),
    profileChanged,
    profileCreated,
  }
}

function staleMatchingAnalysis(
  matchingAnalysis: MatchingAnalysis | null,
  profile: JobProfile,
): MatchingAnalysis | null {
  if (!matchingAnalysis) return null
  if (matchingAnalysis.profileVersion >= profile.version) {
    throw new Error("A stale matching analysis must be older than the profile.")
  }
  return { ...matchingAnalysis, status: "stale" }
}

function recognitionFailureReason(resume: ResumeFile) {
  const fileName = resume.fileName.toLowerCase()
  if (fileName.includes("unreadable")) {
    return "The resume could not be recognized because its text layer is unavailable."
  }
  if (fileName.includes("retryable") && !retryableRecognitionFailures.has(resume.id)) {
    // Mock fixtures can model one transient backend failure before a retry succeeds.
    retryableRecognitionFailures.add(resume.id)
    return "The resume could not be recognized because the recognition service timed out."
  }
  return null
}

function completeInitialRecognition(profile: JobProfile, recognition: ResumeRecognition) {
  const failureReason = recognitionFailureReason(profile.resume!)
  if (failureReason) {
    const resume = { ...profile.resume!, failureReason, processingStatus: "failed" as const }
    const failedProfile = { ...profile, resume, status: "recognitionFailed" as const }
    return setMockSnapshot({
      ...mockSnapshot,
      profile: failedProfile,
      recognition: {
        ...recognition,
        completedAt: "2026-07-13T08:02:00.000Z",
        failureReason,
        processingStatus: "failed",
      },
    })
  }

  const parsedAt = "2026-07-13T08:02:00.000Z"
  const resume = { ...profile.resume!, parsedAt, processingStatus: "succeeded" as const }
  const completedProfile = mergeRecognizedProfile({
    ...profile,
    resume,
    status: "active",
    updatedAt: parsedAt,
    version: profile.version + 1,
  })
  return setMockSnapshot({
    matchingAnalysis: null,
    profile: completedProfile,
    recognition: { ...recognition, processingStatus: "succeeded", completedAt: parsedAt },
    resumeUpdate: null,
  })
}

function completeUpdatedRecognition(profile: JobProfile, resumeUpdate: ResumeUpdate) {
  const failureReason = recognitionFailureReason(resumeUpdate.resume)
  if (failureReason) {
    const failedUpdate = {
      ...resumeUpdate,
      failureReason,
      resume: { ...resumeUpdate.resume, failureReason, processingStatus: "failed" as const },
      status: "failed" as const,
    }
    return setMockSnapshot({
      ...mockSnapshot,
      profile: { ...profile, status: "active" },
      resumeUpdate: failedUpdate,
    })
  }

  const parsedAt = "2026-07-13T08:04:00.000Z"
  const resume = { ...resumeUpdate.resume, parsedAt, processingStatus: "succeeded" as const }
  const mergedProfile = mergeRecognizedProfile({
    ...profile,
    matchingAnalysisStale: false,
    resume,
    status: "active",
    updatedAt: parsedAt,
    version: profile.version + 1,
  })
  const matchingAnalysis = staleMatchingAnalysis(mockSnapshot.matchingAnalysis, mergedProfile)
  const completedProfile = { ...mergedProfile, matchingAnalysisStale: matchingAnalysis !== null }
  return setMockSnapshot({
    ...mockSnapshot,
    matchingAnalysis,
    profile: completedProfile,
    resumeUpdate: {
      ...resumeUpdate,
      changeSummary: { newItems: 1, changedItems: 2, missingItems: 1 },
      failureReason: null,
      resume,
      status: "succeeded",
    },
  })
}

export async function getJobProfile(): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  return copy(mockSnapshot)
}

export async function saveProfileSection(
  input: SaveProfileSectionInput,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(requireProfile(input.profileId))
  if (profile.version !== input.version) throw new Error("Job profile version is out of date.")
  if (input.section === "workExperience" || input.section === "projectExperience") {
    applySkillLinkedSectionSave(profile, input)
  } else {
    applySavedSection(profile, input)
  }
  profile.updatedAt = "2026-07-13T08:05:00.000Z"
  profile.version += 1
  const matchingAnalysis = staleMatchingAnalysis(mockSnapshot.matchingAnalysis, profile)
  profile.matchingAnalysisStale = matchingAnalysis !== null
  return setMockSnapshot({ ...mockSnapshot, matchingAnalysis, profile })
}

export async function uploadInitialResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const resume = createUploadedResume(input, "resume_uploaded_initial")
  if (mockSnapshot.profile) {
    throw new Error("An existing profile must use the resume update workflow.")
  }
  const profile = createEmptyProfile(resume, "uploadingResume")
  return setMockSnapshot({
    matchingAnalysis: null,
    profile,
    recognition: {
      resumeId: resume.id,
      processingStatus: "uploaded",
      completedAt: null,
      failureReason: null,
    },
    resumeUpdate: null,
  })
}

export async function startInitialResumeRecognition(
  profileId: string,
  resumeId: string,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  if (profile.resume?.id !== resumeId) throw new Error("Resume was not found.")
  const recognition = mockSnapshot.recognition
  if (!recognition || recognition.resumeId !== resumeId)
    throw new Error("Resume recognition was not found.")
  if (recognition.processingStatus === "parsing" || recognition.processingStatus === "succeeded") {
    return copy(mockSnapshot)
  }
  if (recognition.processingStatus !== "uploaded" && recognition.processingStatus !== "failed") {
    return copy(mockSnapshot)
  }

  const resume = {
    ...profile.resume,
    failureReason: null,
    parsedAt: null,
    processingStatus: "parsing" as const,
  }
  return setMockSnapshot({
    ...mockSnapshot,
    profile: { ...profile, resume, status: "parsingResume" },
    recognition: {
      ...recognition,
      completedAt: null,
      failureReason: null,
      processingStatus: "parsing",
    },
  })
}

export async function getResumeRecognitionStatus(
  profileId: string,
  resumeId: string,
): Promise<ResumeRecognition> {
  await waitForMockDelay()
  const profile = requireProfile(profileId)
  const recognition = mockSnapshot.recognition
  if (!recognition || recognition.resumeId !== resumeId)
    throw new Error("Resume recognition was not found.")
  // Polling advances this mock job to simulate an asynchronous backend.
  if (recognition.processingStatus === "parsing") completeInitialRecognition(profile, recognition)
  return copy(mockSnapshot.recognition!)
}

export async function resetInitialResumeImport(
  profileId: string,
  _resumeId: string,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  requireProfile(profileId)
  return setMockSnapshot({
    profile: null,
    recognition: null,
    resumeUpdate: null,
    matchingAnalysis: null,
  })
}

export async function createManualJobProfile(): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  return setMockSnapshot({
    profile: createEmptyProfile(null, "active"),
    recognition: null,
    resumeUpdate: null,
    matchingAnalysis: null,
  })
}

export async function uploadUpdatedResume(input: ResumeUploadInput): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(mockSnapshot.profile)
  if (!profile) throw new Error("Job profile was not found.")
  const resume = createUploadedResume(input, "resume_uploaded_update")
  return setMockSnapshot({
    ...mockSnapshot,
    profile,
    resumeUpdate: {
      id: "resume_update_uploaded",
      createdAt: resume.uploadedAt,
      status: "uploading",
      resume,
      changeSummary: null,
      failureReason: null,
      preservesManualChanges: true,
    },
  })
}

export async function startUpdatedResumeRecognition(
  profileId: string,
  resumeUpdateId: string,
): Promise<JobProfileSnapshot> {
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  const resumeUpdate = mockSnapshot.resumeUpdate
  if (!resumeUpdate || resumeUpdate.id !== resumeUpdateId)
    throw new Error("Resume update was not found.")
  if (resumeUpdate.status !== "uploading") return copy(mockSnapshot)
  const parsingResume = { ...resumeUpdate.resume, processingStatus: "parsing" as const }
  return setMockSnapshot({
    ...mockSnapshot,
    profile,
    resumeUpdate: { ...resumeUpdate, resume: parsingResume, status: "parsing" },
  })
}

export async function getResumeUpdateStatus(
  profileId: string,
  resumeUpdateId: string,
): Promise<ResumeUpdate> {
  await waitForMockDelay()
  const profile = requireProfile(profileId)
  const resumeUpdate = mockSnapshot.resumeUpdate
  if (!resumeUpdate || resumeUpdate.id !== resumeUpdateId)
    throw new Error("Resume update was not found.")
  // Polling advances this mock job to simulate an asynchronous backend.
  if (resumeUpdate.status === "parsing") completeUpdatedRecognition(profile, resumeUpdate)
  return copy(mockSnapshot.resumeUpdate!)
}

export async function regenerateMatchingAnalysis(profileId: string): Promise<MatchingAnalysis> {
  await waitForMockDelay()
  const profile = copy(requireProfile(profileId))
  profile.matchingAnalysisStale = false
  const matchingAnalysis: MatchingAnalysis = {
    status: "current",
    profileVersion: profile.version,
    generatedAt: "2026-07-13T08:20:00.000Z",
    failureReason: null,
  }
  setMockSnapshot({ ...mockSnapshot, matchingAnalysis, profile })
  return copy(matchingAnalysis)
}
