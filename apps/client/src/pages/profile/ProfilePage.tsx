import { useQuery } from "@tanstack/react-query"
import { CircleAlertIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getJobProfile } from "@/services/profile"

import { ProfileHeader } from "./ProfileHeader"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./ProfilePageStates"
import { ProfileResumeCard } from "./ProfileResumeCard"
import { ProfileSections } from "./ProfileSections"
import { ProfileSupportingInfo } from "./ProfileSupportingInfo"

export function ProfilePage() {
  const { t } = useTranslation()
  const profileQuery = useQuery({
    queryFn: getJobProfile,
    queryKey: ["profile"],
    retry: false,
  })

  if (profileQuery.isPending) {
    return <ProfileLoadingState />
  }

  if (profileQuery.isError) {
    return (
      <ProfileErrorState
        isRetrying={profileQuery.isFetching}
        onRetry={() => void profileQuery.refetch()}
      />
    )
  }

  const snapshot = profileQuery.data

  if (!snapshot?.profile) {
    return <ProfileEmptyState />
  }

  const { profile } = snapshot
  const processingStatus =
    profile.status === "uploadingResume" || profile.status === "parsingResume"
      ? profile.status
      : null
  const isProcessing = processingStatus !== null
  const isRecognitionFailure = profile.status === "recognitionFailed"
  const isAwaitingConfirmation = profile.status === "awaitingConfirmation"
  const hasPendingReview = profile.pendingReviewCount > 0

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader profile={profile} />

      {profile.matchingAnalysisStale && (
        <Alert data-testid="profile-matching-analysis-stale">
          <CircleAlertIcon />
          <AlertTitle>{t("profile.matchingAnalysis.staleTitle")}</AlertTitle>
          <AlertDescription>{t("profile.matchingAnalysis.staleDescription")}</AlertDescription>
        </Alert>
      )}

      <ProfileResumeCard
        profile={profile}
        recognition={snapshot.recognition}
        resumeUpdate={snapshot.resumeUpdate}
      />

      {processingStatus && <ProfileProcessingState status={processingStatus} />}
      {isRecognitionFailure && (
        <ProfileRecognitionFailureState
          failureReason={
            snapshot.recognition?.failureReason ?? profile.resume?.failureReason ?? null
          }
        />
      )}

      {isAwaitingConfirmation && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.awaitingConfirmation.description"
          titleKey="profile.lifecycle.awaitingConfirmation.title"
        />
      )}
      {!isAwaitingConfirmation && !isProcessing && !isRecognitionFailure && hasPendingReview && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.needsReview.description"
          titleKey="profile.lifecycle.needsReview.title"
        />
      )}

      {!isProcessing && !isRecognitionFailure && (
        <>
          <ProfileSections profile={profile} />
          <ProfileSupportingInfo profile={profile} />
        </>
      )}
    </div>
  )
}

function ProfileReviewNotice({
  descriptionKey,
  titleKey,
}: {
  descriptionKey: string
  titleKey: string
}) {
  const { t } = useTranslation()

  return (
    <Alert data-testid="profile-review-notice">
      <CircleAlertIcon />
      <AlertTitle>{t(titleKey)}</AlertTitle>
      <AlertDescription>{t(descriptionKey)}</AlertDescription>
    </Alert>
  )
}
