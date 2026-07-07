import type * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-riva-md border border-riva-border bg-riva-surface px-3 py-2 text-sm text-riva-foreground shadow-riva-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-riva-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-riva-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
