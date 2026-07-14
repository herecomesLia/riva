import { useId } from "react"
import { useTranslation } from "react-i18next"

type ProfileCompletenessRingProps = {
  value: number
}

export function ProfileCompletenessRing({ value }: ProfileCompletenessRingProps) {
  const { t } = useTranslation()
  const rawId = useId()
  const maskId = `profile-completeness-${rawId.replaceAll(":", "")}`
  const percentage = Math.min(100, Math.max(0, value))
  const displayPercentage = Math.round(percentage)

  return (
    <div
      aria-label={t("profile.completeness")}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={displayPercentage}
      className="relative size-32 shrink-0"
      role="progressbar"
    >
      <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 100 100">
        <defs>
          <mask id={maskId}>
            <circle
              cx="50"
              cy="50"
              fill="none"
              pathLength="100"
              r="40"
              stroke="white"
              strokeDasharray="7 3"
              strokeLinecap="butt"
              strokeWidth="12"
            />
          </mask>
        </defs>

        <circle
          className="text-muted"
          cx="50"
          cy="50"
          fill="none"
          mask={`url(#${maskId})`}
          r="40"
          stroke="currentColor"
          strokeWidth="12"
        />
        <circle
          className="text-primary transition-[stroke-dasharray] duration-300 ease-out motion-reduce:transition-none"
          cx="50"
          cy="50"
          fill="none"
          mask={`url(#${maskId})`}
          pathLength="100"
          r="40"
          stroke="currentColor"
          strokeDasharray={`${percentage} ${100 - percentage}`}
          strokeLinecap="butt"
          strokeWidth="12"
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-heading text-2xl font-semibold tracking-tight text-primary">
          {displayPercentage}%
        </span>
        <span className="w-24 whitespace-normal text-center text-xs leading-tight text-muted-foreground">
          {t("profile.completenessShort")}
        </span>
      </div>
    </div>
  )
}
