import type { Recommendation } from '../../types/dashboard'

type RecommendationPanelProps = {
  recommendations: Recommendation[]
}

export function RecommendationPanel({ recommendations }: RecommendationPanelProps) {
  return (
    <section className="panel" aria-labelledby="recommendation-title">
      <div className="panel__header">
        <div>
          <p className="eyebrow">下一步推荐</p>
          <h2 id="recommendation-title">今天最值得做的 3 件事</h2>
        </div>
      </div>
      {recommendations.length > 0 ? (
        <div className="recommendation-list">
          {recommendations.map((item, index) => (
            <article className="recommendation-item" key={item.id}>
              <span className="recommendation-item__index">{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.reason}</p>
              </div>
              <button className="button button--small" type="button">
                {item.actionLabel}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel__copy">暂无推荐任务，完成一次练习后会生成下一步建议。</p>
      )}
    </section>
  )
}
