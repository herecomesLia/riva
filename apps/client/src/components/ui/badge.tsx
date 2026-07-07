import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-riva-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-riva-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-riva-primary text-riva-primary-foreground',
        secondary: 'border-transparent bg-riva-surface-muted text-riva-foreground',
        destructive: 'border-transparent bg-riva-danger text-white',
        outline: 'border-riva-border text-riva-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = React.ComponentProps<'div'> & VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, className }))} {...props} />
}

export { Badge }
