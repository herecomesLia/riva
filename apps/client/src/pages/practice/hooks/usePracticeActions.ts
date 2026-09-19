import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { PracticeSession } from "@/models/practice-workflow"
import { practiceQueryKeys } from "../queries"
import * as api from "@/services/practices"
import type { PracticeInteractionResult } from "../practice-interaction"

type Action =
  | { type: "answer"; content: string }
  | {
      type: "skip" | "finish" | "restart" | "next" | "end" | "retryTask" | "abandon"
    }

export function usePracticeActions(
  session: PracticeSession | undefined,
  runAction: (operation: () => Promise<string | null | void>) => Promise<PracticeInteractionResult>,
  blocked: boolean,
  abandonBlocked: boolean,
) {
  const queryClient = useQueryClient()
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      const actionBlocked = action.type === "abandon" ? abandonBlocked : blocked
      if (
        actionBlocked ||
        !session ||
        session.status === "setup" ||
        session.status === "completed"
      ) {
        return Promise.resolve("ignored" as const)
      }
      const { practiceId, roundId } = session.context
      const result = await runAction(async () => {
        switch (action.type) {
          case "answer": {
            const question =
              session.status === "answering"
                ? session.question
                : session.status === "answeringFollowUp"
                  ? session.currentFollowUp
                  : null
            if (!question) throw new Error("Practice is not waiting for an answer.")
            await api.submitPracticeAnswer(practiceId, roundId, {
              questionId: question.id,
              content: action.content,
            })
            break
          }
          case "skip":
            await api.skipPracticeRound(practiceId, roundId)
            break
          case "finish":
            await api.finishPracticeRound(practiceId, roundId)
            break
          case "restart":
            await api.restartPracticeRound(practiceId, roundId)
            break
          case "next":
            await api.startNextPracticeRound(practiceId, roundId)
            break
          case "end":
            await api.endPracticeSession(practiceId, roundId)
            // Keep the ended detail visible although /active now returns 204.
            return practiceId
          case "abandon":
            await api.deletePractice(practiceId)
            return null
          case "retryTask": {
            const state = await api.getPracticeTaskState(practiceId, roundId)
            if (state.status === "failed") await api.retryPracticeTask(practiceId, roundId)
            break
          }
        }
      })
      if (result === "executed") {
        if (action.type === "end") {
          await queryClient.invalidateQueries({
            queryKey: practiceQueryKeys.active(),
            exact: true,
          })
        }
        if (action.type === "abandon") {
          queryClient.removeQueries({ queryKey: practiceQueryKeys.detail(practiceId) })
        }
      }
      return result
    },
  })
  const pending = (type: Action["type"]) => mutation.isPending && mutation.variables?.type === type
  const interactionLocked = blocked || mutation.isPending
  return {
    answeringActions: {
      onSubmitAnswer: (content: string) => mutation.mutateAsync({ type: "answer", content }),
      onSkip: () => mutation.mutateAsync({ type: "skip" }),
    },
    answeringPending: { interactionLocked, submitAnswer: pending("answer"), skip: pending("skip") },
    followUpActions: {
      onSubmitFollowUp: (content: string) => mutation.mutateAsync({ type: "answer", content }),
      onEndFollowUps: () => mutation.mutateAsync({ type: "finish" }),
    },
    followUpPending: { interactionLocked, submit: pending("answer"), end: pending("finish") },
    reviewActions: {
      onRetryCurrent: () => mutation.mutateAsync({ type: "restart" }),
      onNextQuestion: () => mutation.mutateAsync({ type: "next" }),
      onEndSession: () => mutation.mutateAsync({ type: "end" }),
    },
    reviewPending: {
      interactionLocked,
      retry: pending("restart"),
      next: pending("next"),
      end: pending("end"),
    },
    sessionActions: {
      onAbandon: () => mutation.mutateAsync({ type: "abandon" }),
    },
    sessionPending: {
      abandon: pending("abandon"),
      interactionLocked: abandonBlocked || mutation.isPending,
    },
    retryTask: () => mutation.mutate({ type: "retryTask" }),
    isTaskRetrying: pending("retryTask"),
  }
}
