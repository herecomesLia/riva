import type * as React from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div aria-busy="true" className={cn('animate-pulse rounded-riva-md bg-riva-surface-muted', className)} {...props} />
}

export { Skeleton }
