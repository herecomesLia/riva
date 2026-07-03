import { delay, http, HttpResponse } from 'msw'
import { mockSession, mockUser } from './data/auth.mock'
import { mockDashboardSummary, mockEmptyDashboardSummary } from './data/dashboard.mock'

const MOCK_DELAY_MS = 450

function ok<T>(data: T) {
  return HttpResponse.json({
    success: true,
    data,
    requestId: crypto.randomUUID(),
  })
}

function fail(message: string, code: string, status = 400) {
  return HttpResponse.json(
    {
      success: false,
      message,
      code,
      requestId: crypto.randomUUID(),
    },
    { status },
  )
}

function hasAuth(request: Request) {
  return request.headers.get('Authorization') === 'Bearer mock-access-token'
}

function isScenario(request: Request, scenario: string) {
  return new URL(request.url).searchParams.get('scenario') === scenario
}

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    const body = (await request.json()) as { account?: string; password?: string }

    if (body.account === 'fail@example.com' || body.password === 'wrong-password') {
      return fail('账号或密码不正确', 'AUTH_INVALID_CREDENTIALS', 401)
    }

    return ok(mockSession)
  }),

  http.post('/api/auth/logout', async () => {
    await delay(220)
    return ok({ success: true as const })
  }),

  http.get('/api/auth/me', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    if (!hasAuth(request)) {
      return fail('登录状态已失效，请重新登录', 'AUTH_UNAUTHORIZED', 401)
    }

    return ok({ user: mockUser })
  }),

  http.get('/api/dashboard/summary', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    if (!hasAuth(request)) {
      return fail('登录状态已失效，请重新登录', 'AUTH_UNAUTHORIZED', 401)
    }

    if (isScenario(request, 'error')) {
      return fail('Dashboard 数据暂时不可用', 'DASHBOARD_UNAVAILABLE', 503)
    }

    if (isScenario(request, 'empty')) {
      return ok(mockEmptyDashboardSummary)
    }

    return ok(mockDashboardSummary)
  }),

  http.get('/api/dashboard/recent-practice', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    if (!hasAuth(request)) {
      return fail('登录状态已失效，请重新登录', 'AUTH_UNAUTHORIZED', 401)
    }

    return ok({ items: mockDashboardSummary.recentPractice })
  }),

  http.get('/api/dashboard/recommendations', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    if (!hasAuth(request)) {
      return fail('登录状态已失效，请重新登录', 'AUTH_UNAUTHORIZED', 401)
    }

    return ok({ items: mockDashboardSummary.recommendations })
  }),

  http.get('/api/dashboard/current-role', async ({ request }) => {
    await delay(MOCK_DELAY_MS)

    if (!hasAuth(request)) {
      return fail('登录状态已失效，请重新登录', 'AUTH_UNAUTHORIZED', 401)
    }

    return ok({ role: mockDashboardSummary.currentRole })
  }),
]
