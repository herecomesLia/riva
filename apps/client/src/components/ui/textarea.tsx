import type * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'flex min-h-24 w-full rounded-riva-md border border-riva-border bg-riva-surface px-3 py-2 text-sm text-riva-foreground shadow-riva-sm transition-colors placeholder:text-riva-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-riva-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
