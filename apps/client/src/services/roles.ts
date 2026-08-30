import { env } from "@/app/env"
import * as rolesMockService from "@/mocks/services/roles"
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  CreateTargetRoleFromRecognitionInput,
  DeleteTargetRoleInput,
  GenerateOrRegenerateMatchingAnalysisInput,
  GetJobDescriptionParsingStatusInput,
  GetMatchingAnalysisStatusInput,
  RolesPageResponse,
  RecognizeTargetRoleInput,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartOrRetryJobDescriptionParsingInput,
  TargetRole,
  TargetRoleRecognitionResult,
  UpdateJobDescriptionAnalysisModuleInput,
  UpdateTargetRoleInput,
  UpdateTargetRolePreparationStatusInput,
} from "@/models/roles"

function realApiUnavailable(): never {
  throw new Error("Real target role API is not implemented.")
}

export function getRolesPage(): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.getRolesPage() : realApiUnavailable()
}

export function createTargetRole(input: CreateTargetRoleInput): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.createTargetRole(input) : realApiUnavailable()
}

export function recognizeTargetRole(
  input: RecognizeTargetRoleInput,
): Promise<TargetRoleRecognitionResult> {
  return env.mock ? rolesMockService.recognizeTargetRole(input) : realApiUnavailable()
}

export function createTargetRoleFromRecognition(
  input: CreateTargetRoleFromRecognitionInput,
): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.createTargetRoleFromRecognition(input) : realApiUnavailable()
}

export function updateTargetRole(input: UpdateTargetRoleInput): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.updateTargetRole(input) : realApiUnavailable()
}

export function setCurrentTargetRole(input: SetCurrentTargetRoleInput): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.setCurrentTargetRole(input) : realApiUnavailable()
}

export function updateRolePreparationStatus(
  input: UpdateTargetRolePreparationStatusInput,
): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.updateRolePreparationStatus(input) : realApiUnavailable()
}

export function archiveTargetRole(input: ArchiveTargetRoleInput): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.archiveTargetRole(input) : realApiUnavailable()
}

export function deleteTargetRole(input: DeleteTargetRoleInput): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.deleteTargetRole(input) : realApiUnavailable()
}

export function saveJobDescription(
  input: SaveTargetRoleJobDescriptionInput,
): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.saveJobDescription(input) : realApiUnavailable()
}

export function startJobDescriptionParsing(
  input: StartOrRetryJobDescriptionParsingInput,
): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.startJobDescriptionParsing(input) : realApiUnavailable()
}

export function getJobDescriptionParsingStatus(
  input: GetJobDescriptionParsingStatusInput,
): Promise<TargetRole> {
  return env.mock ? rolesMockService.getJobDescriptionParsingStatus(input) : realApiUnavailable()
}

export function generateMatchingAnalysis(
  input: GenerateOrRegenerateMatchingAnalysisInput,
): Promise<RolesPageResponse> {
  return env.mock ? rolesMockService.generateMatchingAnalysis(input) : realApiUnavailable()
}

export function getMatchingAnalysisStatus(
  input: GetMatchingAnalysisStatusInput,
): Promise<TargetRole> {
  return env.mock ? rolesMockService.getMatchingAnalysisStatus(input) : realApiUnavailable()
}

export function updateJobDescriptionAnalysisModule(
  input: UpdateJobDescriptionAnalysisModuleInput,
): Promise<RolesPageResponse> {
  return env.mock
    ? rolesMockService.updateJobDescriptionAnalysisModule(input)
    : realApiUnavailable()
}
