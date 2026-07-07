import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders as a button with button type by default', () => {
    render(<Button>Continue</Button>)

    const button = screen.getByRole('button', { name: 'Continue' })

    expect(button).toHaveAttribute('type', 'button')
  })

  it('merges custom classes with variant classes', () => {
    render(<Button className="w-full">Save</Button>)

    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('w-full')
  })
})
