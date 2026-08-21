import type { ReactNode } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export type InterviewReviewListCardProps = {
  icon: ReactNode
  items: string[]
  title: string
}

export function InterviewReviewListCard({ icon, items, title }: InterviewReviewListCardProps) {
  if (items.length === 0) return null

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="text-primary">{icon}</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="min-w-0">
        <ul className="flex min-w-0 flex-col gap-2 text-sm text-muted-foreground">
          {items.map((item) => (
            <li className="flex min-w-0 gap-2" key={item}>
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span className="min-w-0 flex-1 wrap-break-word">{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
