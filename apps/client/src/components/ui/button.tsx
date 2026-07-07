import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-riva-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-riva-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: 'bg-riva-primary text-riva-primary-foreground shadow-riva-sm hover:bg-riva-primary/90',
        destructive: 'bg-riva-danger text-white shadow-riva-sm hover:bg-riva-danger/90',
        outline:
          'border border-riva-border bg-riva-surface text-riva-foreground shadow-riva-sm hover:bg-riva-surface-muted',
        secondary: 'bg-riva-surface-muted text-riva-foreground hover:bg-riva-border',
        ghost: 'text-riva-foreground hover:bg-riva-surface-muted',
        link: 'h-auto p-0 text-riva-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-riva-sm px-3',
        lg: 'h-11 rounded-riva-lg px-6',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> & VariantProps<typeof buttonVariants>

function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props} />
}

export { Button }
