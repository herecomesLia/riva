import type { ProfileContent } from "@/models/profile"

export type ProfileResumeWorkflowState =
  | { status: "idle" }
  | { status: "importing" }
  | { status: "preview"; content: ProfileContent; isSaving: boolean }
