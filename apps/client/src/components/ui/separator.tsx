import type * as React from 'react'
import { cn } from '@/lib/utils'

type SeparatorProps = React.ComponentProps<'div'> & {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

function Separator({ className, orientation = 'horizontal', decorative = true, ...props }: SeparatorProps) {
  const semanticProps = decorative
    ? { role: 'none' }
    : { role: 'separator', 'aria-orientation': orientation }

  return (
    <div
      className={cn(
        'shrink-0 bg-riva-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...semanticProps}
      {...props}
    />
  )
}

export { Separator }
