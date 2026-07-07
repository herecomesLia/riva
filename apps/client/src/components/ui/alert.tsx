import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const alertVariants = cva('relative w-full rounded-riva-lg border p-4 text-sm [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg~*]:pl-7', {
  variants: {
    variant: {
      default: 'border-riva-border bg-riva-surface text-riva-foreground',
      destructive: 'border-riva-danger/40 bg-riva-danger/10 text-riva-danger',
      warning: 'border-riva-warning/40 bg-riva-warning-soft text-riva-warning',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type AlertProps = React.ComponentProps<'div'> & VariantProps<typeof alertVariants>

function Alert({ className, variant, role = 'alert', ...props }: AlertProps) {
  return <div role={role} className={cn(alertVariants({ variant, className }))} {...props} />
}

function AlertTitle({ className, ...props }: React.ComponentProps<'h5'>) {
  return <h5 className={cn('mb-1 font-medium leading-none tracking-normal', className)} {...props} />
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('text-sm leading-relaxed [&_p]:leading-relaxed', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription }
