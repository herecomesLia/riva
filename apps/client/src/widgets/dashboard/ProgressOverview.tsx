import type { ProgressMetric } from '../../types/dashboard'

type ProgressOverviewProps = {
  metrics: ProgressMetric[]
}

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
  return (
    <section className="metric-grid" aria-label="准备进度概览">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.key}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.detail}</p>
        </article>
      ))}
    </section>
  )
}
