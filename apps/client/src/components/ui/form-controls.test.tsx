import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Input } from './input'
import { Label } from './label'
import { Textarea } from './textarea'

describe('form controls', () => {
  it('connects Label and Input through the accessible name', () => {
    render(
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" />
      </div>,
    )

    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('type', 'email')
  })

  it('renders Textarea with placeholder text', () => {
    render(<Textarea placeholder="Write a note" />)

    expect(screen.getByPlaceholderText('Write a note')).toBeInTheDocument()
  })
})
