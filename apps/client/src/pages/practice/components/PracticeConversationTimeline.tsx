import { useTranslation } from "react-i18next"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import type {
  ProcessingSession,
  PracticeFollowUp,
  PracticeAnswer,
  PracticeQuestion,
} from "@/models/practice-workflow"

type PracticeConversationTimelineProps = {
  question: PracticeQuestion
  mainAnswer: PracticeAnswer
  followUps: ProcessingSession["followUps"]
  currentFollowUp?: PracticeFollowUp
}

export function PracticeConversationTimeline({
  question,
  mainAnswer,
  followUps,
  currentFollowUp,
}: PracticeConversationTimelineProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0" data-testid="practice-conversation-timeline">
      <CardHeader>
        <CardTitle>{t("practice.followUp.timelineTitle")}</CardTitle>
        <CardDescription>{t("practice.followUp.timelineDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <CoachMessage label={t("practice.followUp.mainQuestion")} text={question.prompt} />
        <CandidateMessage label={t("practice.followUp.yourMainAnswer")} text={mainAnswer.content} />
        {followUps.map((exchange, index) => (
          <div className="flex flex-col gap-5" key={index}>
            <CoachMessage
              label={t("practice.followUp.followUpNumber", {
                count: index + 1,
              })}
              text={exchange.question.prompt}
            />
            <CandidateMessage
              label={t("practice.followUp.yourFollowUpAnswer", {
                count: index + 1,
              })}
              text={exchange.answer.content}
            />
          </div>
        ))}
        {currentFollowUp ? (
          <CoachMessage
            current
            label={t("practice.followUp.currentFollowUp", {
              count: followUps.length + 1,
            })}
            text={currentFollowUp.prompt}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}

export function CoachMessage({
  current = false,
  label,
  text,
  onReview,
}: {
  current?: boolean
  label: string
  text: string
  onReview?: () => void
}) {
  const { t } = useTranslation()
  return (
    <Message align="start" aria-current={current ? "step" : undefined}>
      <MessageContent>
        <MessageHeader>{label}</MessageHeader>
        <Bubble align="start" variant={current ? "tinted" : "muted"}>
          {onReview ? (
            <BubbleContent
              render={<button type="button" />}
              className="cursor-pointer text-left hover:bg-muted!"
              aria-label={t("practice.questionReview.viewQuestion", { question: text })}
              onClick={(event) => {
                const selection = window.getSelection()
                if (
                  selection &&
                  !selection.isCollapsed &&
                  event.currentTarget.contains(selection.anchorNode)
                )
                  return
                onReview()
              }}
            >
              {text}
            </BubbleContent>
          ) : (
            <BubbleContent>{text}</BubbleContent>
          )}
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function CandidateMessage({ label, text }: { label: string; text: string }) {
  return (
    <Message align="end">
      <MessageContent>
        <MessageHeader>{label}</MessageHeader>
        <Bubble align="end" variant="outline">
          <BubbleContent>{text}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}
