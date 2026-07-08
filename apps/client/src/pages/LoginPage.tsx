import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/services/auth.service'
import type { AuthSession } from '@/types/auth'

type LoginPageProps = {
  onLogin: (session: AuthSession) => void
}

const loginSchema = z.object({
  account: z.string().trim().min(1, '请输入邮箱或手机号'),
  password: z.string().min(6, '密码至少需要 6 位'),
  remember: z.boolean(),
})

type LoginFormValues = z.infer<typeof loginSchema>

const heroItems = [
  { label: '档案完整度', value: '86%' },
  { label: '本周练习', value: '4/6' },
  { label: '平均评分', value: '7.6' },
]

const featureTags = ['简历档案', '岗位匹配', '题卡训练', '模拟面试']

export function LoginPage({ onLogin }: LoginPageProps) {
  const [loginError, setLoginError] = useState('')
  const [isLoginSuccess, setIsLoginSuccess] = useState(false)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<LoginFormValues>({
    defaultValues: {
      account: '',
      password: '',
      remember: true,
    },
  })

  async function handleLogin(values: LoginFormValues) {
    setLoginError('')
    setIsLoginSuccess(false)

    const result = loginSchema.safeParse(values)

    if (!result.success) {
      for (const issue of result.error.issues) {
        const fieldName = issue.path[0]

        if (fieldName === 'account' || fieldName === 'password' || fieldName === 'remember') {
          setError(fieldName, { message: issue.message, type: 'validate' })
        }
      }

      return
    }

    try {
      const session = await login(result.data)
      setIsLoginSuccess(true)
      onLogin(session)
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : '登录失败，请稍后重试')
    }
  }

  return (
    <main className="min-h-screen bg-riva-background text-riva-foreground" aria-labelledby="login-title">
      <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden overflow-hidden bg-riva-foreground text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgb(14_165_233_/_0.28),transparent_32rem),radial-gradient(circle_at_80%_10%,rgb(124_58_237_/_0.24),transparent_24rem)]" />
          <div className="relative z-10 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-riva-md bg-white text-lg font-black text-riva-primary">
              R
            </span>
            <div>
              <strong className="block text-lg leading-tight">Riva</strong>
              <span className="text-sm text-white/70">AI 面试训练助理</span>
            </div>
          </div>

          <div className="relative z-10 max-w-2xl space-y-8">
            <Badge className="border-white/20 bg-white/10 text-white">新版训练工作台</Badge>
            <div className="space-y-5">
              <h1 className="max-w-xl text-5xl font-semibold leading-tight tracking-normal">
                把每一次面试准备，变成可复盘的进步
              </h1>
              <p className="max-w-lg text-base leading-8 text-white/72">
                继续维护求职档案、目标岗位、题卡练习和模拟面试复盘，让下一场面试更有把握。
              </p>
            </div>
            <div className="grid max-w-lg grid-cols-3 gap-3">
              {heroItems.map((item) => (
                <div className="rounded-riva-lg border border-white/12 bg-white/10 p-4 shadow-riva-md" key={item.label}>
                  <strong className="block text-2xl">{item.value}</strong>
                  <span className="mt-1 block text-xs text-white/64">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative z-10 flex flex-wrap gap-2">
            {featureTags.map((tag) => (
              <span className="rounded-riva-sm border border-white/14 px-3 py-1 text-sm text-white/72" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-3 lg:hidden">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-riva-md bg-riva-primary text-base font-black text-riva-primary-foreground">
                  R
                </span>
                <div>
                  <strong className="block leading-tight">Riva</strong>
                  <span className="text-sm text-riva-muted">AI 面试训练助理</span>
                </div>
              </div>
              <p className="text-sm text-riva-muted">登录后继续你的求职训练进度。</p>
            </div>

            <Card className="border-riva-border bg-riva-surface/95 shadow-riva-lg">
              <CardHeader className="space-y-2">
                <Badge variant="secondary" className="w-fit">
                  欢迎回来
                </Badge>
                <CardTitle id="login-title" className="text-2xl">
                  登录 Riva
                </CardTitle>
                <CardDescription>使用账号进入工作台，继续管理档案、岗位和训练记录。</CardDescription>
              </CardHeader>

              <CardContent>
                <form className="space-y-5" noValidate onSubmit={handleSubmit(handleLogin)}>
                  <div className="space-y-2">
                    <Label htmlFor="account">邮箱或手机号</Label>
                    <Input
                      id="account"
                      autoComplete="username"
                      placeholder="name@example.com"
                      aria-invalid={Boolean(errors.account)}
                      aria-describedby={errors.account ? 'account-error' : undefined}
                      {...register('account')}
                    />
                    {errors.account ? (
                      <p className="text-sm text-riva-danger" id="account-error">
                        {errors.account.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">密码</Label>
                    <Input
                      id="password"
                      autoComplete="current-password"
                      placeholder="输入登录密码"
                      type="password"
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'password-error' : undefined}
                      {...register('password')}
                    />
                    {errors.password ? (
                      <p className="text-sm text-riva-danger" id="password-error">
                        {errors.password.message}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-4 text-sm">
                    <label className="flex items-center gap-2 text-riva-muted">
                      <input
                        className="size-4 rounded border-riva-border text-riva-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-riva-ring"
                        type="checkbox"
                        {...register('remember')}
                      />
                      <span>保持登录</span>
                    </label>
                    <a className="font-medium text-riva-primary hover:underline" href="#forgot-password">
                      忘记密码？
                    </a>
                  </div>

                  {loginError ? (
                    <Alert variant="destructive">
                      <AlertTitle>登录失败</AlertTitle>
                      <AlertDescription>{loginError}</AlertDescription>
                    </Alert>
                  ) : null}

                  {isLoginSuccess ? (
                    <Alert>
                      <AlertTitle>登录成功</AlertTitle>
                      <AlertDescription>正在进入工作台...</AlertDescription>
                    </Alert>
                  ) : null}

                  <Button className="w-full" type="submit" disabled={isSubmitting || isLoginSuccess}>
                    {isSubmitting ? '登录中...' : '登录并进入工作台'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  )
}
