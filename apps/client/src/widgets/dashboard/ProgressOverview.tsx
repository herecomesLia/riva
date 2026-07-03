const metrics = [
  { label: '简历完整度', value: '86%', detail: '项目经历还可补充结果数据' },
  { label: '岗位匹配度', value: '78%', detail: '业务理解与项目表达匹配较高' },
  { label: '本周练习', value: '4/6', detail: '还差 2 道题达成本周目标' },
  { label: '平均评分', value: '7.6', detail: '结构清晰度较上次提升 12%' },
]

export function ProgressOverview() {
  return (
    <section className="metric-grid" aria-label="准备进度概览">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <p>{metric.detail}</p>
        </article>
      ))}
    </section>
  )
}
