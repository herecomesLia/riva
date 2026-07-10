import { Input as InputPrimitive } from "@base-ui/react/input"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

type InputProps = React.ComponentProps<"input"> & {
  onPasswordVisibilityChange?: (visible: boolean) => void
  passwordToggle?: boolean
}

function Input({
  className,
  onPasswordVisibilityChange,
  type,
  passwordToggle = type === "password",
  ...props
}: InputProps) {
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false)
  const canTogglePassword = type === "password" && passwordToggle

  const input = (
    <InputPrimitive
      type={canTogglePassword && isPasswordVisible ? "text" : type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm [&::-ms-reveal]:hidden dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        canTogglePassword && "pr-10",
        className,
      )}
      {...props}
    />
  )

  if (!canTogglePassword) {
    return input
  }

  return (
    <div className="relative w-full" data-slot="password-input">
      {input}
      <button
        aria-label={isPasswordVisible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex px-3 items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        disabled={props.disabled}
        onClick={() => {
          const nextVisible = !isPasswordVisible
          setIsPasswordVisible(nextVisible)
          onPasswordVisibilityChange?.(nextVisible)
        }}
        type="button"
      >
        {isPasswordVisible ? (
          <EyeOffIcon aria-hidden className="h-4 w-4" />
        ) : (
          <EyeIcon aria-hidden className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}

export { Input }
