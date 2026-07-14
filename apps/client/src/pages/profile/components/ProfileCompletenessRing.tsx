import { useTranslation } from "react-i18next"

const SEGMENT_COUNT = 10
const SEGMENT_SPAN = 100 / SEGMENT_COUNT
const SEGMENT_LENGTH = 7
const SEGMENT_GAP = SEGMENT_SPAN - SEGMENT_LENGTH
const DARKEST_PRIMARY_WEIGHT = 100
const LIGHTEST_PRIMARY_WEIGHT = 35

type ProfileCompletenessRingProps = {
  value: number
}

function getSegmentFill(percentage: number, index: number) {
  const segmentStart = index * SEGMENT_SPAN

  return Math.min(1, Math.max(0, (percentage - segmentStart) / SEGMENT_SPAN))
}

function getSegmentColorWeight(index: number) {
  const progress = SEGMENT_COUNT <= 1 ? 0 : index / (SEGMENT_COUNT - 1)

  return DARKEST_PRIMARY_WEIGHT - (DARKEST_PRIMARY_WEIGHT - LIGHTEST_PRIMARY_WEIGHT) * progress
}

export function ProfileCompletenessRing({ value }: ProfileCompletenessRingProps) {
  const { t } = useTranslation()
  const percentage = Math.min(100, Math.max(0, value))
  const displayPercentage = Math.round(percentage)

  return (
    <div
      aria-label={t("profile.completeness")}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={displayPercentage}
      className="relative size-24 shrink-0"
      role="progressbar"
    >
      <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 100 100">
        <circle
          className="text-muted"
          cx="50"
          cy="50"
          fill="none"
          pathLength="100"
          r="40"
          stroke="currentColor"
          strokeDasharray={`${SEGMENT_LENGTH} ${SEGMENT_GAP}`}
          strokeLinecap="butt"
          strokeWidth="10"
        />
        {Array.from({ length: SEGMENT_COUNT }, (_, index) => {
          const fill = getSegmentFill(percentage, index)

          if (fill <= 0) {
            return null
          }

          const visibleLength = SEGMENT_LENGTH * fill
          const primaryWeight = getSegmentColorWeight(index)

          return (
            <circle
              className="transition-[stroke-dasharray] duration-300 ease-out motion-reduce:transition-none"
              cx="50"
              cy="50"
              fill="none"
              key={index}
              pathLength="100"
              r="40"
              stroke="currentColor"
              strokeDasharray={`${visibleLength} ${100 - visibleLength}`}
              strokeDashoffset={-index * SEGMENT_SPAN}
              strokeLinecap="butt"
              strokeWidth="10"
              style={{
                color: `color-mix(in srgb, var(--primary) ${primaryWeight}%, var(--primary-foreground))`,
              }}
            />
          )
        })}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="font-heading text-xl font-semibold tracking-tight text-primary">
          {displayPercentage}%
        </span>
        <span className="w-16 whitespace-normal text-center text-[10px] leading-tight text-muted-foreground">
          {t("profile.completenessShort")}
        </span>
      </div>
    </div>
  )
}
