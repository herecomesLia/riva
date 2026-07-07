import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type RoutePlaceholderPageProps = {
  description: string
  eyebrow: string
  title: string
}

export function RoutePlaceholderPage({ description, eyebrow, title }: RoutePlaceholderPageProps) {
  return (
    <div className="dashboard-page" aria-labelledby="route-placeholder-title">
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 id="route-placeholder-title">{title}</h1>
          <p className="dashboard-hero__copy">{description}</p>
        </div>
        <Badge variant="secondary">页面状态占位</Badge>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>模块入口已接入路由</CardTitle>
          <CardDescription>后续可以在这个页面内继续接入页面状态 mock 和真实交互。</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="panel__copy">当前改动只建立路由与布局结构，不预设接口路径、请求结构或路由 loader。</p>
        </CardContent>
      </Card>
    </div>
  )
}
