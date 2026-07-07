import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Alert, AlertDescription, AlertTitle } from './alert'
import { Badge } from './badge'
import { Card, CardContent, CardHeader, CardTitle } from './card'
import { Separator } from './separator'
import { Skeleton } from './skeleton'

describe('feedback and layout primitives', () => {
  it('renders Alert with alert semantics', () => {
    render(
      <Alert>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>Something needs attention.</AlertDescription>
      </Alert>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Something needs attention.')
  })

  it('renders Skeleton as busy content', () => {
    render(<Skeleton data-testid="loading-block" />)

    expect(screen.getByTestId('loading-block')).toHaveAttribute('aria-busy', 'true')
  })

  it('renders Card composition and Badge content', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge>Ready</Badge>
        </CardContent>
      </Card>,
    )

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
  })

  it('can render a semantic Separator when requested', () => {
    render(<Separator decorative={false} />)

    expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', 'horizontal')
  })
})
