import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

afterEach(() => {
  cleanup()
})

describe('LoginPage', () => {
  it('shows validation errors before calling login', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()

    render(<LoginPage onLogin={onLogin} />)

    await user.click(screen.getByRole('button', { name: '登录并进入工作台' }))

    expect(await screen.findByText('请输入邮箱或手机号')).toBeInTheDocument()
    expect(screen.getByText('密码至少需要 6 位')).toBeInTheDocument()
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('shows the login failure from the local auth mock', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn()

    render(<LoginPage onLogin={onLogin} />)

    await user.type(screen.getByLabelText('邮箱或手机号'), 'fail@example.com')
    await user.type(screen.getByLabelText('密码'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: '登录并进入工作台' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码不正确')
    expect(onLogin).not.toHaveBeenCalled()
  })
})
