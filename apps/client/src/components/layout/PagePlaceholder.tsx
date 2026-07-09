import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

type PagePlaceholderProps = {
  badge: string
  description: string
  title: string
}

export function PagePlaceholder({ badge, description, title }: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Badge className="w-fit" variant="outline">
          {badge}
        </Badge>
        <h1 className="font-heading text-2xl font-medium">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
          <Skeleton className="h-10 w-2/3" />
        </CardContent>
      </Card>
    </div>
  )
}
