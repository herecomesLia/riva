import { useTranslation } from "react-i18next"

import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import type {
  AnsweredPracticeFollowUpExchange,
  AwaitingPracticeFollowUpExchange,
  PracticeAnswer,
  PracticeFollowUpCompletion,
  PracticeQuestionCard,
} from "@/models/practice"

type PracticeConversationTimelineProps = {
  question: PracticeQuestionCard
  mainAnswer: PracticeAnswer
  followUpExchanges: AnsweredPracticeFollowUpExchange[]
  currentFollowUp?: AwaitingPracticeFollowUpExchange
  followUpCompletion?: PracticeFollowUpCompletion
}

export function PracticeConversationTimeline({
  question,
  mainAnswer,
  followUpExchanges,
  currentFollowUp,
  followUpCompletion,
}: PracticeConversationTimelineProps) {
  const { t } = useTranslation()

  return (
    <Card data-testid="practice-conversation-timeline">
      <CardHeader>
        <CardTitle>{t("practice.followUp.timelineTitle")}</CardTitle>
        <CardDescription>{t("practice.followUp.timelineDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <CoachMessage label={t("practice.followUp.mainQuestion")} text={question.prompt} />
        <CandidateMessage label={t("practice.followUp.yourMainAnswer")} text={mainAnswer.content} />
        {followUpExchanges.map((exchange) => (
          <div className="flex flex-col gap-5" key={exchange.question.id}>
            <CoachMessage
              label={t("practice.followUp.followUpNumber", {
                count: exchange.question.order,
              })}
              text={exchange.question.prompt}
            />
            <CandidateMessage
              label={t("practice.followUp.yourFollowUpAnswer", {
                count: exchange.question.order,
              })}
              text={exchange.answer.content}
            />
          </div>
        ))}
        {currentFollowUp ? (
          <CoachMessage
            current
            label={t("practice.followUp.currentFollowUp", {
              count: currentFollowUp.question.order,
            })}
            text={currentFollowUp.question.prompt}
          />
        ) : null}
        {followUpCompletion?.status === "endedEarly" ? (
          <>
            <CoachMessage
              incomplete
              label={t("practice.followUp.unansweredFollowUp", {
                count: followUpCompletion.unansweredQuestion.order,
              })}
              text={followUpCompletion.unansweredQuestion.prompt}
            />
            <p
              className="text-sm text-muted-foreground"
              data-testid="practice-follow-up-incomplete"
            >
              {t("practice.followUp.endedEarly")}
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CoachMessage({
  current = false,
  incomplete = false,
  label,
  text,
}: {
  current?: boolean
  incomplete?: boolean
  label: string
  text: string
}) {
  return (
    <Message align="start" aria-current={current ? "step" : undefined}>
      <MessageContent>
        <MessageHeader>{label}</MessageHeader>
        <Bubble align="start" variant={current ? "tinted" : incomplete ? "secondary" : "muted"}>
          <BubbleContent>{text}</BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

function CandidateMessage({ label, text }: { label: string; text: string }) {
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
