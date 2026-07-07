import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function NotFoundPage() {
  return (
    <main className="login-page" aria-labelledby="not-found-title">
      <Card className="mx-auto w-[min(92vw,520px)]">
        <CardHeader>
          <CardTitle id="not-found-title">页面不存在</CardTitle>
          <CardDescription>这个地址暂时没有对应页面。</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="inline-flex h-10 w-full items-center justify-center rounded-riva-md bg-riva-primary px-4 py-2 text-sm font-medium text-riva-primary-foreground shadow-riva-sm transition-colors hover:bg-riva-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-riva-ring focus-visible:ring-offset-2"
            to="/"
          >
            返回首页
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
