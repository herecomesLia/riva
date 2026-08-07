import type { ResumeImportDraft } from "@/models/profile"

export type ProfileResumeWorkflowMode = "initial" | "update"

export type ProfileResumeApplyConflict =
  "resume_import_profile_version_conflict" | "resume_import_draft_version_conflict"

export type ProfileResumeWorkflowState =
  | { status: "idle" }
  | { status: "uploading"; mode: ProfileResumeWorkflowMode }
  | {
      status: "parsing"
      mode: ProfileResumeWorkflowMode
      resumeId: string
      synchronizationError: boolean
      isRetrying: boolean
    }
  | {
      status: "failed"
      mode: ProfileResumeWorkflowMode
      resumeId: string
      failureReason: string | null
      canRetry: boolean
      isRetrying: boolean
    }
  | {
      status: "draftReady"
      mode: ProfileResumeWorkflowMode
      resumeId: string
      draft: ResumeImportDraft
      applyConflict: ProfileResumeApplyConflict | null
      applyError: boolean
    }
  | {
      status: "applying"
      mode: ProfileResumeWorkflowMode
      resumeId: string
      draft: ResumeImportDraft
    }
