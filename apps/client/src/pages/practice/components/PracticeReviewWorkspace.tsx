import { useId, useLayoutEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { ReviewSession } from "@/models/practice-workflow"

import { CandidateMessage, CoachMessage } from "./PracticeConversationTimeline"
import { PracticeQuestionReview } from "./PracticeQuestionReview"

type Props = Pick<ReviewSession, "question" | "mainAnswer" | "followUps">
type View = "record" | "review"

export function PracticeReviewWorkspace(props: Props) {
  const { t } = useTranslation()
  const id = useId()
  const [view, setView] = useState<View>("record")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [navigation, setNavigation] = useState<{
    view: View
    index?: number
  } | null>(null)
  const reviewRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const pagePositions = useRef<Partial<Record<View, number>>>({})
  const questions = [
    { question: props.question, answer: props.mainAnswer.content },
    ...props.followUps.map((exchange) => ({
      question: exchange.question,
      answer: exchange.answer.content,
    })),
  ]

  function navigate(next: View, index?: number) {
    pagePositions.current[view] = window.scrollY
    if (next === "review" && index === undefined && pagePositions.current.review === undefined)
      index = selectedIndex
    if (index !== undefined) setSelectedIndex(index)
    setView(next)
    setNavigation({ view: next, index })
  }

  useLayoutEffect(() => {
    if (!navigation || !reviewRef.current || !toolbarRef.current) return
    const desktop = getComputedStyle(reviewRef.current).overflowY === "auto"
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth"
    if (navigation.index === undefined) {
      const position = pagePositions.current[navigation.view]
      if (!desktop && position !== undefined)
        window.scrollTo({ top: position, behavior: "instant" })
      return
    }
    const target = reviewRef.current.querySelector<HTMLElement>(
      `[data-review-index="${navigation.index}"]`,
    )
    if (!target) return
    if (desktop) {
      const pane = reviewRef.current
      pane.scrollTo({
        top: pane.scrollTop + target.getBoundingClientRect().top - pane.getBoundingClientRect().top,
        behavior,
      })
    } else {
      // Clear the app's h-16 topbar and the wrapping view toolbar.
      target.style.scrollMarginTop = `calc(5rem + ${toolbarRef.current.offsetHeight}px)`
      target.scrollIntoView({ block: "start", behavior })
      target.focus({ preventScroll: true })
    }
  }, [navigation])

  return (
    <section className="@container" data-testid="practice-review-workspace">
      <div
        ref={toolbarRef}
        className="sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-3 bg-background py-2 @4xl:hidden"
      >
        <div
          className="flex gap-1 rounded-lg bg-muted p-1 @4xl:hidden"
          role="group"
          aria-label={t("practice.questionReview.switchView")}
        >
          <Button
            className="min-h-11"
            variant={view === "record" ? "secondary" : "ghost"}
            aria-pressed={view === "record"}
            aria-controls={`${id}-record`}
            onClick={() => navigate("record")}
          >
            {t("practice.questionReview.recordTab")}
          </Button>
          <Button
            className="min-h-11"
            variant={view === "review" ? "secondary" : "ghost"}
            aria-pressed={view === "review"}
            aria-controls={`${id}-review`}
            onClick={() => navigate("review")}
          >
            {t("practice.questionReview.reviewTab")}
          </Button>
        </div>
      </div>
      <div className="grid gap-5 @4xl:h-[min(44rem,75dvh)] @4xl:grid-cols-2">
        <div
          id={`${id}-record`}
          className={cn("min-h-0 min-w-0 @4xl:block", view !== "record" && "hidden")}
        >
          <Card className="min-h-0 @4xl:h-full" data-testid="practice-conversation-timeline">
            <CardHeader className="shrink-0 border-b">
              <CardTitle>
                <h2>{t("practice.followUp.timelineTitle")}</h2>
              </CardTitle>
              <CardDescription>{t("practice.questionReview.selectHint")}</CardDescription>
            </CardHeader>
            <CardContent
              tabIndex={0}
              role="region"
              aria-label={t("practice.followUp.timelineTitle")}
              className="flex min-h-0 flex-col gap-4 @4xl:overflow-y-auto @4xl:[scrollbar-gutter:stable]"
            >
              {questions.map((entry, index) => (
                <div key={index} className="flex shrink-0 flex-col gap-4 p-4">
                  <CoachMessage
                    onReview={() => navigate("review", index)}
                    label={
                      index === 0
                        ? t("practice.followUp.mainQuestion")
                        : t("practice.questionReview.followUpNumber", { count: index })
                    }
                    text={entry.question.prompt}
                  />
                  <CandidateMessage
                    label={t("practice.followUpReview.yourAnswer")}
                    text={entry.answer}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
        <div
          id={`${id}-review`}
          className={cn("min-h-0 min-w-0 @4xl:block", view !== "review" && "hidden")}
        >
          <PracticeQuestionReview {...props} scrollRef={reviewRef} />
        </div>
      </div>
    </section>
  )
}
