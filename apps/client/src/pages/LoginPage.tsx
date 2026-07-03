import type { FormEvent } from 'react'

type LoginPageProps = {
  onLogin: () => void
}

const heroTags = ['求职档案', '目标岗位', '模拟面试']

export function LoginPage({ onLogin }: LoginPageProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onLogin()
  }

  return (
    <main className="login-page" aria-labelledby="login-title">
      <div className="login-shell">
        <section className="login-hero" aria-label="Riva 产品介绍">
          <div className="login-brand">
            <span className="brand__mark" aria-hidden="true">
              R
            </span>
            <div>
              <strong>Riva</strong>
              <span>AI 面试训练助理</span>
            </div>
          </div>

          <div className="login-hero__content">
            <p className="eyebrow">个人求职训练工作台</p>
            <h1>把每一次面试准备，变成可复盘的进步</h1>
            <p>登录后继续维护求职档案、目标岗位、题卡训练、模拟面试和复盘推荐。</p>
          </div>

          <div className="login-tag-list" aria-label="核心能力">
            {heroTags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card__header">
            <p className="eyebrow">欢迎回来</p>
            <h2 id="login-title">登录 Riva</h2>
            <p>使用你的账号继续训练，系统会同步最近的岗位、题卡和复盘记录。</p>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="form-field">
              <span>邮箱或手机号</span>
              <input
                autoComplete="username"
                name="account"
                placeholder="name@example.com"
                required
                type="text"
              />
            </label>

            <label className="form-field">
              <span>密码</span>
              <input
                autoComplete="current-password"
                minLength={6}
                name="password"
                placeholder="输入登录密码"
                required
                type="password"
              />
            </label>

            <div className="login-form__row">
              <label className="checkbox-field">
                <input name="remember" type="checkbox" />
                <span>保持登录</span>
              </label>
              <a href="#forgot-password">忘记密码？</a>
            </div>

            <button className="button button--primary button--full" type="submit">
              登录并进入工作台
            </button>
          </form>

          <p className="login-card__footer">
            还没有账号？<a href="#create-account">创建求职档案</a>
          </p>
        </section>
      </div>
    </main>
  )
}
